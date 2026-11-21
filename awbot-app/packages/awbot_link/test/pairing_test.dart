import 'package:awbot_link/awbot_link.dart';
import 'package:test/test.dart';

import 'support.dart';

void main() {
  group('AWBotPairer', () {
    late FakeTransport transport;
    late AWBotApi api;
    late AWBotStore store;
    late AWBotPairer pairer;

    setUp(() {
      transport = FakeTransport();
      api = AWBotApi(transport);
      store = AWBotStore(secrets: MemoryStore(), prefs: MemoryStore());
      pairer = AWBotPairer(api: api, store: store, deviceInfo: {'brand': 'Pixel 7'});
    });

    test('登录落会话，认领后落设备令牌', () async {
      transport.on(
        '/api/public/awbot/login',
        (call) => {
          'token': 'jwt-1',
          'user': {'username': '张三'},
        },
      );
      transport.on('/api/public/awbot/pair', (call) => {'code': '482913'});
      transport.on('/api/public/awbot/pair/poll', (call) => {'paired': true, 'token': 'awb_9', 'hostName': '我的手机'});

      expect(await pairer.restore(), isFalse);
      final profile = await pairer.signIn(username: 'zhang', password: 'pw');
      expect(profile.username, '张三');
      expect(await store.readSessionToken(), 'jwt-1');

      final code = await pairer.requestCode();
      expect(transport.last('/api/public/awbot/pair').body['deviceInfo'], {'brand': 'Pixel 7'});

      final outcome = await pairer.poll(code);
      expect(outcome?.hostName, '我的手机');
      expect(api.hostToken, 'awb_9');
      expect(await store.readHostToken(), 'awb_9');
    });

    test('没人认领时不落令牌', () async {
      transport.on('/api/public/awbot/pair/poll', (call) => {'paired': false});
      expect(await pairer.poll('111111'), isNull);
      expect(await store.readHostToken(), isNull);
    });

    test('restore 把重启前的两份令牌放回 api', () async {
      await store.writeSessionToken('jwt-1');
      await store.writeHostToken('awb_9');
      expect(await pairer.restore(), isTrue);
      expect(api.sessionToken, 'jwt-1');
      expect(api.hostToken, 'awb_9');
    });

    test('退出账号登录不清设备绑定', () async {
      await store.writeSessionToken('jwt-1');
      await store.writeHostToken('awb_9');
      await pairer.restore();
      await pairer.signOut();
      expect(api.sessionToken, isNull);
      expect(await store.readHostToken(), 'awb_9');
    });
  });

  group('扫码配对', () {
    test('平台码只带站点与配对码', () {
      final payload = AWBotPairPayload.parse(
        '{"v":1,"type":"awbot-pair","site":"https://a.example.com","code":"QRABCDEFGHJK"}',
      );
      expect(payload.site, 'https://a.example.com');
      expect(payload.code, 'QRABCDEFGHJK');
      expect(payload.fromDesktop, isFalse);
      expect(payload.hostId, 0);
    });

    test('AWBotDSH 码带主机身份', () {
      final payload = AWBotPairPayload.parse(
        '{"v":1,"type":"awbotdsh-pair","site":"https://a.example.com","code":"QRABCDEFGHJK","host":{"id":7,"name":"工位机"}}',
      );
      expect(payload.fromDesktop, isTrue);
      expect(payload.hostId, 7);
      expect(payload.hostName, '工位机');
    });

    test('别的二维码不认', () {
      expect(() => AWBotPairPayload.parse('https://example.com/pair#v1.abc'), throwsFormatException);
      expect(() => AWBotPairPayload.parse('{"type":"dsh.remote.pairing"}'), throwsFormatException);
    });

    test('免登录兑换后落设备令牌', () async {
      final transport = FakeTransport();
      final store = AWBotStore(secrets: MemoryStore(), prefs: MemoryStore());
      final pairer = AWBotPairer(
        api: AWBotApi(transport),
        store: store,
        deviceInfo: {'brand': 'Pixel 7'},
      );
      transport.on(
        '/api/public/awbot/pair/qr',
        (call) => {'paired': true, 'token': 'awb_qr', 'hostName': 'AWBot 手机'},
      );

      final outcome = await pairer.pairWithCode('QRABCDEFGHJK');
      expect(outcome?.hostName, 'AWBot 手机');
      expect(await store.readHostToken(), 'awb_qr');
      expect(transport.last('/api/public/awbot/pair/qr').body['code'], 'QRABCDEFGHJK');
    });
  });
}
