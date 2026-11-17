import 'package:mobot_link/mobot_link.dart';
import 'package:test/test.dart';

import 'support.dart';

void main() {
  group('MobotPairer', () {
    late FakeTransport transport;
    late MobotApi api;
    late MobotStore store;
    late MobotPairer pairer;

    setUp(() {
      transport = FakeTransport();
      api = MobotApi(transport);
      store = MobotStore(secrets: MemoryStore(), prefs: MemoryStore());
      pairer = MobotPairer(api: api, store: store, deviceInfo: {'brand': 'Pixel 7'});
    });

    test('登录落会话，认领后落设备令牌', () async {
      transport.on(
        '/api/public/mobot/login',
        (call) => {
          'token': 'jwt-1',
          'user': {'username': '张三'},
        },
      );
      transport.on('/api/public/mobot/pair', (call) => {'code': '482913'});
      transport.on('/api/public/mobot/pair/poll', (call) => {'paired': true, 'token': 'mb_9', 'hostName': '我的手机'});

      expect(await pairer.restore(), isFalse);
      final profile = await pairer.signIn(username: 'zhang', password: 'pw');
      expect(profile.username, '张三');
      expect(await store.readSessionToken(), 'jwt-1');

      final code = await pairer.requestCode();
      expect(transport.last('/api/public/mobot/pair').body['deviceInfo'], {'brand': 'Pixel 7'});

      final outcome = await pairer.poll(code);
      expect(outcome?.hostName, '我的手机');
      expect(api.hostToken, 'mb_9');
      expect(await store.readHostToken(), 'mb_9');
    });

    test('没人认领时不落令牌', () async {
      transport.on('/api/public/mobot/pair/poll', (call) => {'paired': false});
      expect(await pairer.poll('111111'), isNull);
      expect(await store.readHostToken(), isNull);
    });

    test('restore 把重启前的两份令牌放回 api', () async {
      await store.writeSessionToken('jwt-1');
      await store.writeHostToken('mb_9');
      expect(await pairer.restore(), isTrue);
      expect(api.sessionToken, 'jwt-1');
      expect(api.hostToken, 'mb_9');
    });

    test('退出账号登录不清设备绑定', () async {
      await store.writeSessionToken('jwt-1');
      await store.writeHostToken('mb_9');
      await pairer.restore();
      await pairer.signOut();
      expect(api.sessionToken, isNull);
      expect(await store.readHostToken(), 'mb_9');
    });
  });
}
