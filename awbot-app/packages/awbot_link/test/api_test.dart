import 'package:awbot_link/awbot_link.dart';
import 'package:test/test.dart';

import 'support.dart';

void main() {
  group('AWBotApi', () {
    late FakeTransport transport;
    late AWBotApi api;

    setUp(() {
      transport = FakeTransport();
      api = AWBotApi(transport);
    });

    test('登录换取账号会话，并解析用户、站点与积分', () async {
      transport.on(
        '/api/public/awbot/login',
        (call) => {
          'token': 'jwt-1',
          'mustChangePassword': true,
          'user': {'username': '张三', 'role': 'admin'},
          'site': {'name': '测试站'},
          'points': {'balance': 120},
        },
      );

      final profile = await api.login(username: 'zhang', password: 'pw');

      expect(api.sessionToken, 'jwt-1');
      expect(profile.username, '张三');
      expect(profile.role, 'admin');
      expect(profile.siteName, '测试站');
      expect(profile.pointsBalance, 120);
      expect(profile.mustChangePassword, isTrue);

      final call = transport.last('/api/public/awbot/login');
      expect(call.body, {'username': 'zhang', 'password': 'pw'});
      expect(call.sessionToken, isNull, reason: '登录本身不带身份');
    });

    test('会话校验带 Bearer，配对与轮询也带账号会话', () async {
      api.sessionToken = 'jwt-1';
      transport.on(
        '/api/public/awbot/session',
        (call) => {
          'user': {'username': '张三'},
        },
      );
      transport.on('/api/public/awbot/pair', (call) => {'code': '482913'});
      transport.on(
        '/api/public/awbot/pair/poll',
        (call) => {'paired': true, 'token': 'awb_abcdef', 'hostName': 'AWBot 一号'},
      );

      final profile = await api.session();
      final code = await api.requestPairCode(deviceInfo: {'brand': 'Pixel'});
      final outcome = await api.pollPairCode(code);

      expect(profile.username, '张三');
      expect(code, '482913');
      expect(outcome.paired, isTrue);
      expect(outcome.token, 'awb_abcdef');
      expect(outcome.hostName, 'AWBot 一号');

      expect(transport.last('/api/public/awbot/pair').sessionToken, 'jwt-1');
      expect(transport.last('/api/public/awbot/pair').body['deviceInfo'], {'brand': 'Pixel'});
      expect(transport.last('/api/public/awbot/pair/poll').body, {'code': '482913'});
    });

    test('未认领的连接码轮询回来 paired=false', () async {
      transport.on(
        '/api/public/awbot/pair/poll',
        (call) => {'paired': false, 'token': '', 'hostName': '', 'hostId': 0},
      );
      final outcome = await api.pollPairCode('123456');
      expect(outcome.paired, isFalse);
      expect(outcome.token, isEmpty);
    });

    test('心跳解析指令、取消、授权与积分', () async {
      api.hostToken = 'awb_1';
      transport.on(
        '/api/public/awbot/heartbeat',
        (call) => {
          'heartbeatSeconds': 5,
          'commands': [
            {
              'commandCode': 'c-1',
              'kind': 'prompt',
              'title': '对话指令',
              'instruction': '写一首诗',
              'cwd': '',
              'mode': '',
              'timeoutSec': 120,
            },
          ],
          'stop': ['c-0'],
          'modelGrant': {
            'channelId': 7,
            'baseUrl': 'https://api.example.com/v1',
            'protocol': 'anthropic',
            'apiKey': 'sk-1',
            'model': 'claude-x',
            'source': 'grant',
          },
          'grantUnchanged': false,
          // 心跳路由把积分平铺成数字（登录/会话才是 {balance}），两种都要认。
          'points': 42,
        },
      );

      final reply = await api.heartbeat(platform: 'android', clientVersion: 'awbot/1.0.0', caps: {'battery': 82});

      final call = transport.last('/api/public/awbot/heartbeat');
      expect(call.hostToken, 'awb_1');
      expect(call.body['platform'], 'android');
      expect(call.body['caps'], {'battery': 82});

      expect(reply.heartbeatSeconds, 5);
      expect(reply.stop, ['c-0']);
      expect(reply.pointsBalance, 42);
      final command = reply.commands.single;
      expect(command.commandCode, 'c-1');
      expect(command.instruction, '写一首诗');
      expect(command.timeout, const Duration(seconds: 120));
      expect(command.hasWork, isTrue);
      expect(reply.grant?.protocol, 'anthropic');
      expect(reply.grant?.fingerprint, '7|anthropic|https://api.example.com/v1|claude-x');
    });

    test('grantUnchanged=true 时不带授权', () async {
      api.hostToken = 'awb_1';
      transport.on('/api/public/awbot/heartbeat', (call) => {'grantUnchanged': true});
      final reply = await api.heartbeat(platform: 'android', clientVersion: '', caps: const {});
      expect(reply.grant, isNull);
      expect(reply.grantUnchanged, isTrue);
      expect(reply.commands, isEmpty);
    });

    test('缺字段的应答退化成空值，不抛异常', () async {
      api.hostToken = 'awb_1';
      transport.on('/api/public/awbot/heartbeat', (call) => {'commands': null, 'stop': null});
      final reply = await api.heartbeat(platform: 'android', clientVersion: '', caps: const {});
      expect(reply.heartbeatSeconds, 5, reason: '缺省用平台默认心跳周期');
      expect(reply.commands, isEmpty);
      expect(reply.grant, isNull);
    });

    test('进度上报带回取消标记，回执带耗时与失败原因', () async {
      api.hostToken = 'awb_1';
      transport.on('/api/public/awbot/progress', (call) => {'cancelRequested': true});
      expect(await api.reportProgress(commandCode: 'c-1', text: '片段', sessionId: 's-1'), isTrue);
      expect(transport.last('/api/public/awbot/progress').body, {
        'commandCode': 'c-1',
        'text': '片段',
        'acpSessionId': 's-1',
      });

      await api.reportResult(
        commandCode: 'c-1',
        ok: false,
        errorMessage: '超时',
        elapsed: const Duration(milliseconds: 1500),
        canceled: true,
        failReason: 'timeout',
      );
      expect(transport.last('/api/public/awbot/result').body, {
        'commandCode': 'c-1',
        'ok': false,
        'text': '',
        'errorMessage': '超时',
        'elapsedMs': 1500,
        'canceled': true,
        'failReason': 'timeout',
      });
    });

    test('平台拒绝时抛出原话与状态码', () async {
      api.hostToken = 'awb_1';
      transport.fail('/api/public/awbot/heartbeat', 401, '主机令牌无效或已失效，请在客户端里重新配对本站账号');
      await expectLater(
        api.heartbeat(platform: 'android', clientVersion: '', caps: const {}),
        throwsA(
          isA<AWBotApiException>()
              .having((e) => e.status, 'status', 401)
              .having((e) => e.unauthorized, 'unauthorized', true)
              .having((e) => e.message, 'message', contains('重新配对')),
        ),
      );
    });

    test('业务失败（200 + ok:false）同样抛出，但不算令牌失效', () async {
      api.sessionToken = 'jwt-1';
      transport.fail('/api/public/awbot/pair/poll', 200, '这个连接码不是当前账号生成的，请退出后重新登录');
      await expectLater(
        api.pollPairCode('123456'),
        throwsA(
          isA<AWBotApiException>()
              // 服务端用 HTTP 状态表意，这里原样保留：200 + ok:false 是业务拒绝，
              // 只有真 401 才让调用方认定「配对已失效」。
              .having((e) => e.status, 'status', 200)
              .having((e) => e.unauthorized, 'unauthorized', false)
              .having((e) => e.message, 'message', contains('不是当前账号生成的')),
        ),
      );
    });

    test('连不上平台时归成 status=0', () async {
      final api = AWBotApi(_BrokenTransport());
      await expectLater(
        api.heartbeat(platform: 'android', clientVersion: '', caps: const {}),
        throwsA(isA<AWBotApiException>().having((e) => e.unreachable, 'unreachable', true)),
      );
    });
  });

  group('normalizeBaseUrl', () {
    test('接受 http(s) 源地址，去掉结尾斜杠', () {
      expect(normalizeBaseUrl('https://example.com/').toString(), 'https://example.com');
      expect(normalizeBaseUrl('http://192.168.1.9:1690').toString(), 'http://192.168.1.9:1690');
    });

    test('拒绝非 http(s) 与缺域名的地址', () {
      expect(() => normalizeBaseUrl('example.com'), throwsA(isA<ArgumentError>()));
      expect(() => normalizeBaseUrl('ftp://example.com'), throwsA(isA<ArgumentError>()));
      expect(() => normalizeBaseUrl('https://'), throwsA(isA<ArgumentError>()));
    });
  });
}

class _BrokenTransport implements AWBotTransport {
  @override
  Future<AWBotReply> post(
    String path, {
    Map<String, Object?> body = const {},
    String? sessionToken,
    String? hostToken,
  }) async {
    throw const SocketErrorStub();
  }
}

class SocketErrorStub implements Exception {
  const SocketErrorStub();
}
