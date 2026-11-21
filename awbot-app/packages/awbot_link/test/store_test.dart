import 'dart:convert';

import 'package:awbot_link/awbot_link.dart';
import 'package:test/test.dart';

import 'support.dart';

void main() {
  group('AWBotStore', () {
    late MemoryStore memory;
    late AWBotStore store;

    setUp(() {
      memory = MemoryStore();
      store = AWBotStore(secrets: memory, prefs: memory);
    });

    test('站点地址、两类令牌与模型同步时间各归各位', () async {
      final plain = MemoryStore();
      final vault = MemoryStore();
      final kept = AWBotStore(secrets: vault, prefs: plain);

      await kept.writeBaseUrl('https://example.com');
      await kept.writeSessionToken('jwt-1');
      await kept.writeHostToken('awb_1');
      await kept.writeModelSyncedAt('2026-11-16T12:00:00Z');

      expect(await kept.readBaseUrl(), 'https://example.com');
      expect(vault.values['awbot.sessionToken'], 'jwt-1', reason: '账号会话走密钥存储');
      expect(vault.values['awbot.hostToken'], 'awb_1');
      expect(plain.values['awbot.baseUrl'], 'https://example.com');
      expect(vault.values.containsKey('awbot.baseUrl'), isFalse, reason: '站点地址不是机密');
      expect(plain.values['awbot.modelSyncedAt'], '2026-11-16T12:00:00Z');

      await kept.writeHostToken(null);
      expect(await kept.readHostToken(), isNull);
      expect(vault.values, isNot(contains('awbot.hostToken')));
    });

    test('claim 只放行第一次，重启后仍然有效', () async {
      expect(await store.claim('c-1'), isTrue);
      expect(await store.claim('c-1'), isFalse);
      expect(await store.claim(''), isFalse);

      final reopened = AWBotStore(secrets: memory, prefs: memory);
      expect(await reopened.claim('c-1'), isFalse);
      expect(await reopened.claim('c-2'), isTrue);
    });

    test('幂等表有上限，只保留最近的指令码', () async {
      for (var i = 0; i < AWBotStore.seenCommandsLimit + 20; i++) {
        await store.claim('c-$i');
      }
      final seen = jsonDecode(memory.values['awbot.seenCommands']!) as List;
      expect(seen.length, AWBotStore.seenCommandsLimit);
      expect(seen.first, 'c-20', reason: '最旧的被挤掉');
      expect(await store.claim('c-0'), isTrue, reason: '超出上限的老码可以再用');
    });

    test('幂等表坏了就当没有，不阻塞心跳', () async {
      await memory.write('awbot.seenCommands', '{ 这不是 JSON');
      expect(await store.claim('c-9'), isTrue);
    });
  });
}
