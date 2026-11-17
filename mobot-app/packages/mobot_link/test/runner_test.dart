import 'package:mobot_link/mobot_link.dart';
import 'package:test/test.dart';

import 'support.dart';

void main() {
  late FakeTransport transport;
  late MobotApi api;
  late FakeAgent agent;
  late CommandRunner runner;

  setUp(() {
    transport = FakeTransport();
    api = MobotApi(transport)..hostToken = 'mb_1';
    agent = FakeAgent();
    runner = CommandRunner(api: api, agent: agent, flushInterval: const Duration(milliseconds: 2));
  });

  tearDown(() async {
    await agent.dispose();
  });

  Map<String, Object?>? resultOf(String code) {
    for (final call in transport.callsTo('/api/public/mobot/result').reversed) {
      if (call.body['commandCode'] == code) return call.body;
    }
    return null;
  }

  List<String> progressOf(String code) => transport
      .callsTo('/api/public/mobot/progress')
      .where((call) => call.body['commandCode'] == code)
      .map((call) => call.body['text']! as String)
      .toList();

  test('把流式片段上报平台，收尾回最终文本', () async {
    final running = runner.run(command('c-1', instruction: '写一首诗'));
    await waitUntil(() => agent.sent.isNotEmpty, reason: '指令应送到本机 Agent');
    expect(agent.sent.single.requestId, 'c-1', reason: '用平台指令码做幂等请求号');

    agent.emit(const AgentDelta('床前'));
    agent.emit(const AgentNotice('调用工具：read_file'));
    agent.emit(const AgentDelta('明月光'));
    agent.emit(const AgentSettled(text: '床前明月光'));

    final report = await running.done;
    expect(report.status, 'done');
    expect(progressOf('c-1').join(), contains('床前'));
    expect(progressOf('c-1').join(), contains('明月光'));
    expect(progressOf('c-1').join(), contains('调用工具：read_file'));

    final result = resultOf('c-1')!;
    expect(result['ok'], isTrue);
    expect(result['text'], '床前明月光');
    expect(result['acpSessionId'], agent.sessionId);
    expect(result.containsKey('canceled'), isFalse);
  });

  test('引擎起不来时回执 engine_off，不发指令', () async {
    agent.wakeResult = false;
    final report = await runner.run(command('c-1')).done;
    expect(report.status, 'failed');
    expect(agent.sent, isEmpty);

    final result = resultOf('c-1')!;
    expect(result['ok'], isFalse);
    expect(result['failReason'], 'engine_off');
    expect(result['errorMessage'], contains('本地引擎未运行'));
  });

  test('allowWake=false 时不要求引擎拉起自己', () async {
    agent.wakeResult = false;
    runner.allowWake = false;
    await runner.run(command('c-1')).done;
    expect(agent.wokenWith, isFalse);
  });

  test('超时中断本机回合并记 timeout', () async {
    final running = runner.run(
      DispatchedCommand(
        commandCode: 'c-slow',
        kind: 'prompt',
        title: '',
        instruction: '慢活',
        timeout: const Duration(milliseconds: 60),
      ),
    );
    final report = await running.done;
    expect(report.status, 'failed');
    expect(report.detail, 'timeout');
    expect(agent.cancels, [agent.sessionId], reason: '超时要真正中断引擎');
    expect(resultOf('c-slow')!['failReason'], 'timeout');
  });

  test('平台在进度应答里标记取消时立即中断', () async {
    transport.on('/api/public/mobot/progress', (call) => {'cancelRequested': true});
    final running = runner.run(command('c-cancel'));
    await waitUntil(() => agent.sent.isNotEmpty);
    agent.emit(const AgentDelta('一半'));

    final report = await running.done;
    expect(report.status, 'canceled');
    expect(agent.cancels, [agent.sessionId]);
    final result = resultOf('c-cancel')!;
    expect(result['ok'], isFalse);
    expect(result['canceled'], isTrue);
    expect(result['text'], contains('一半'), reason: '已产出的内容仍然回传');
  });

  test('手机侧收到 stop 时结束这一轮', () async {
    final running = runner.run(command('c-stop'));
    await waitUntil(() => agent.sent.isNotEmpty);
    await running.cancel();
    final report = await running.done;
    expect(report.status, 'canceled');
    expect(agent.cancels, [agent.sessionId]);
  });

  test('单次片段不超过平台上限，其余进下一段', () async {
    final running = runner.run(command('c-long'));
    await waitUntil(() => agent.sent.isNotEmpty);
    agent.emit(AgentDelta('字' * 5000));
    agent.emit(const AgentSettled(text: '结束'));
    await running.done;

    final chunks = progressOf('c-long');
    expect(chunks.length, greaterThanOrEqualTo(2));
    expect(chunks.first.length, CommandRunner.maxChunkChars);
    expect(chunks.join().length, 5000);
  });

  test('进度上报失败只丢片段，不影响本轮结果', () async {
    final flaky = FakeTransport()..fail('/api/public/mobot/progress', 500, '服务繁忙');
    final local = CommandRunner(
      api: MobotApi(flaky)..hostToken = 'mb_1',
      agent: agent,
      flushInterval: const Duration(milliseconds: 2),
    );
    final running = local.run(command('c-flaky'));
    await waitUntil(() => agent.sent.isNotEmpty);
    agent.emit(const AgentDelta('前半'));
    await Future<void>.delayed(const Duration(milliseconds: 10));
    agent.emit(const AgentDelta('后半'));
    agent.emit(const AgentSettled(text: '完整答案'));

    final report = await running.done;
    expect(report.status, 'done');
    expect(flaky.callsTo('/api/public/mobot/progress'), isNotEmpty);
    expect(flaky.last('/api/public/mobot/result').body['text'], '完整答案');
  });

  test('回执送不出去时如实报告，不假装完成', () async {
    transport.fail('/api/public/mobot/result', 500, '服务繁忙');
    final running = runner.run(command('c-lost'));
    await waitUntil(() => agent.sent.isNotEmpty);
    agent.emit(const AgentSettled(text: '好了'));
    final report = await running.done;
    expect(report.status, 'done');
    expect(report.detail, contains('结果未能送达平台'));
  });

  test('空指令与建会话失败各自给出原因', () async {
    expect((await runner.run(command('c-empty', instruction: '')).done).detail, 'empty');
    expect(agent.sent, isEmpty, reason: '空指令不该惊动引擎');

    agent.failSession = true;
    final report = await runner.run(command('c-no-session')).done;
    expect(report.status, 'failed');
    expect(resultOf('c-no-session')!['failReason'], 'session_failed');
  });

  test('引擎报错当作本轮失败回传', () async {
    final running = runner.run(command('c-error'));
    await waitUntil(() => agent.sent.isNotEmpty);
    agent.emit(const AgentSettled(error: '模型不可用'));
    final report = await running.done;
    expect(report.status, 'failed');
    expect(resultOf('c-error')!['errorMessage'], contains('模型不可用'));
  });
}
