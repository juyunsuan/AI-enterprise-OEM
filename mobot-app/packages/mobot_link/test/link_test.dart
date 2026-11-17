import 'dart:async';

import 'package:mobot_link/mobot_link.dart';
import 'package:test/test.dart';

import 'support.dart';

void main() {
  const heartbeatPath = '${MobotApi.channel}/heartbeat';
  const resultPath = '${MobotApi.channel}/result';

  late FakeTransport transport;
  late MobotApi api;
  late FakeAgent agent;
  late MemoryStore phone;
  late MobotStore store;
  late RecordingModelWriter writer;
  late MobotLink link;

  setUp(() {
    transport = FakeTransport();
    api = MobotApi(transport);
    agent = FakeAgent();
    phone = MemoryStore();
    store = MobotStore(secrets: phone, prefs: phone);
    writer = RecordingModelWriter();
    link = MobotLink(
      api: api,
      agent: agent,
      store: store,
      models: MobotModelSync(writer: writer, store: store),
      clientVersion: '1.1.0',
    );
    link.minRetryDelay = const Duration(milliseconds: 1);
  });

  tearDown(() async {
    await link.dispose();
    await agent.dispose();
  });

  /// 心跳应答：`heartbeatSeconds` 归零，测试里循环可以一拍接一拍地跑。
  void heartbeat(Object? Function(int call) answer) {
    var calls = 0;
    transport.handlers[heartbeatPath] = (call) => reply(call, {'heartbeatSeconds': 0, ...readMap(answer(++calls))});
  }

  Map<String, Object?> command(String code) => {
    'commandCode': code,
    'kind': 'prompt',
    'title': '对话指令',
    'instruction': '做点事',
  };

  Map<String, Object?>? resultOf(String code) {
    for (final call in transport.callsTo(resultPath).reversed) {
      if (call.body['commandCode'] == code) return call.body;
    }
    return null;
  }

  test('没有设备令牌时不启动，状态停在未配对', () async {
    expect(await link.start(), isFalse);
    expect(link.state.status, MobotLinkStatus.unpaired);
    expect(transport.callsTo(heartbeatPath), isEmpty);
  });

  test('带着令牌启动后上线，心跳只认设备令牌并带回积分', () async {
    await store.writeHostToken('mb_1');
    heartbeat(
      (_) => {
        'points': {'balance': 88},
      },
    );

    expect(await link.start(), isTrue);
    await waitUntil(() => link.state.isOnline, reason: '第一次心跳应答后应在线');

    expect(link.state.pointsBalance, 88);
    expect(link.state.queued, 0);
    final call = transport.callsTo(heartbeatPath).first;
    expect(call.hostToken, 'mb_1');
    expect(call.sessionToken, isNull, reason: '账号会话不参与心跳');
    expect(call.body['platform'], 'android');
    expect(call.body['clientVersion'], '1.1.0');
  });

  test('心跳领取的指令交给本机 Agent，跑完回执平台', () async {
    await store.writeHostToken('mb_1');
    heartbeat(
      (call) => call == 1
          ? {
              'commands': [command('c-1')],
            }
          : const {},
    );

    await link.start();
    await waitUntil(() => agent.sent.isNotEmpty, reason: '指令应下发到本机');
    expect(agent.sent.single.instruction, '做点事');

    agent.emit(const AgentSettled(text: '办好了'));
    await waitUntil(() => transport.callsTo(resultPath).isNotEmpty);

    final result = resultOf('c-1')!;
    expect(result['ok'], isTrue);
    expect(result['text'], '办好了');
    expect(link.state.reports.single.status, 'done');
    expect(link.state.runningTitle, isEmpty, reason: '跑完要把在跑标题清掉');
  });

  test('平台重复下发同一指令码时只执行一次', () async {
    await store.writeHostToken('mb_1');
    heartbeat(
      (_) => {
        'commands': [command('c-dup')],
      },
    );

    await link.start();
    await waitUntil(() => agent.sent.isNotEmpty);
    await waitUntil(() => transport.callsTo(heartbeatPath).length > 3, reason: '多跳几次心跳');

    expect(agent.sent.length, 1);
    expect(transport.callsTo(resultPath), isEmpty, reason: '还没结束，不该有回执');
  });

  test('一轮没结束前不开始下一轮', () async {
    await store.writeHostToken('mb_1');
    final gate = Completer<void>();
    agent.holdSend = gate;
    heartbeat(
      (call) => call == 1
          ? {
              'commands': [command('c-1'), command('c-2')],
            }
          : const {},
    );

    await link.start();
    await waitUntil(() => link.state.queued == 1, reason: '第二条在排队');
    expect(agent.sent, isEmpty, reason: '第一条还堵在发送上');

    gate.complete();
    agent.holdSend = null;
    await waitUntil(() => agent.sent.length == 1);
    agent.emit(const AgentSettled(text: '第一条'));
    await waitUntil(() => agent.sent.length == 2, reason: '上一条结束后才轮到下一条');
    expect(agent.sent.last.requestId, 'c-2');
  });

  test('stop 排队中的指令：直接回执取消，不再执行', () async {
    await store.writeHostToken('mb_1');
    final gate = Completer<void>();
    agent.holdSend = gate;
    heartbeat(
      (call) => switch (call) {
        1 => {
          'commands': [command('c-1'), command('c-2')],
        },
        2 => {
          'stop': ['c-2'],
        },
        _ => const {},
      },
    );

    await link.start();
    await waitUntil(() => resultOf('c-2') != null, reason: '取消排队指令要立刻回执');
    expect(resultOf('c-2')!['canceled'], isTrue);

    gate.complete();
    agent.holdSend = null;
    agent.emit(const AgentSettled(text: '第一条'));
    await waitUntil(() => resultOf('c-1') != null);
    expect(agent.sent.map((s) => s.requestId), ['c-1'], reason: '被取消的指令不再下发');
  });

  test('stop 正在执行的指令：中断本机回合并回执取消', () async {
    await store.writeHostToken('mb_1');
    final gate = Completer<void>();
    agent.holdSend = gate;
    heartbeat(
      (call) => switch (call) {
        1 => {
          'commands': [
            {...command('c-run'), 'timeoutSec': 2},
          ],
        },
        2 => {
          'stop': ['c-run'],
        },
        _ => const {},
      },
    );

    await link.start();
    await waitUntil(() => link.state.runningTitle == '对话指令');
    gate.complete();
    agent.holdSend = null;
    await waitUntil(() => agent.sent.isNotEmpty);
    await waitUntil(() => resultOf('c-run') != null);

    expect(agent.cancels, [agent.sessionId]);
    expect(resultOf('c-run')!['canceled'], isTrue);
  });

  test('心跳失败先重试，恢复后重新上线', () async {
    await store.writeHostToken('mb_1');
    final seen = <MobotLinkStatus>[];
    final sub = link.changes.listen((state) => seen.add(state.status));
    var calls = 0;
    transport.handlers[heartbeatPath] = (call) {
      calls++;
      return calls == 1
          ? MobotReply(500, const {'ok': false, 'message': '服务繁忙'})
          : reply(call, const {'heartbeatSeconds': 0});
    };

    await link.start();
    await waitUntil(() => link.state.isOnline, reason: '重试之后要恢复在线');
    await sub.cancel();

    expect(seen, contains(MobotLinkStatus.retrying));
    expect(seen.first, MobotLinkStatus.starting);
    expect(link.state.detail, isEmpty, reason: '上线后把错误文案清掉');
  });

  test('令牌被吊销：清令牌、收回本机模型、不再重试', () async {
    await store.writeHostToken('mb_1');
    await store.writeGrantFingerprint('7|openai|https://gw.example/v1|gpt-x');
    transport.handlers[heartbeatPath] = (call) => MobotReply(401, const {'ok': false, 'message': '主机令牌已失效'});

    await link.start();
    await waitUntil(() => link.state.status == MobotLinkStatus.unpaired);

    expect(await store.readHostToken(), isNull);
    expect(api.hostToken, isNull);
    expect(writer.removes, 1, reason: '平台侧已解绑，本机 Provider 要收回');
    expect(link.state.detail, '主机令牌已失效');
    expect(transport.callsTo(heartbeatPath), hasLength(1));
  });

  test('心跳把引擎阶段、唤起开关与同步时间上报', () async {
    await store.writeHostToken('mb_1');
    await store.writeModelSyncedAt('2026-11-16T00:00:00.000Z');
    link.extraCaps = () async => {'battery': 66, 'charging': false};
    heartbeat((_) => const {});

    await link.start();
    await waitUntil(() => link.state.isOnline);

    final caps = readMap(transport.callsTo(heartbeatPath).first.body['caps']);
    expect(caps['engine'], 'ready');
    expect(caps['canWake'], isTrue);
    expect(caps['modelSyncedAt'], '2026-11-16T00:00:00.000Z');
    expect(caps['battery'], 66);
  });

  test('平台授权的模型写进本机 Provider，密钥不外传', () async {
    await store.writeHostToken('mb_1');
    heartbeat(
      (_) => {
        'modelGrant': {
          'channelId': 7,
          'baseUrl': 'https://gw.example/v1',
          'protocol': 'openai',
          'apiKey': 'sk-secret',
          'model': 'gpt-x',
        },
      },
    );

    await link.start();
    await waitUntil(() => writer.upserted.isNotEmpty);

    expect(writer.upserted.single.model, 'gpt-x');
    expect(writer.upserted.single.apiKey, 'sk-secret');
    expect(await store.readGrantFingerprint(), '7|openai|https://gw.example/v1|gpt-x');
    final leaked = transport.calls.where((call) => '${call.body}'.contains('sk-secret'));
    expect(leaked, isEmpty, reason: '平台下发的密钥不再回传平台');
  });

  test('停止只结束循环，令牌留着下次自动重连', () async {
    await store.writeHostToken('mb_1');
    heartbeat((_) => const {});
    await link.start();
    await waitUntil(() => link.state.isOnline);

    await link.stop();

    expect(link.state.status, MobotLinkStatus.stopped);
    expect(await store.readHostToken(), 'mb_1');
    final calls = transport.callsTo(heartbeatPath).length;
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(transport.callsTo(heartbeatPath), hasLength(calls), reason: '停止后不再心跳');
  });

  test('解绑：下线、清令牌、收回模型', () async {
    await store.writeHostToken('mb_1');
    await store.writeGrantFingerprint('7|openai|https://gw.example/v1|gpt-x');
    heartbeat((_) => const {});
    await link.start();
    await waitUntil(() => link.state.isOnline);

    await link.unbind();

    expect(transport.callsTo('${MobotApi.channel}/logout'), hasLength(1));
    expect(await store.readHostToken(), isNull);
    expect(writer.removes, 1);
    expect(link.state.status, MobotLinkStatus.unpaired);
  });
}
