import 'package:mobot_link/mobot_link.dart';
import 'package:test/test.dart';

import 'support.dart';

void main() {
  group('MobotModelSync', () {
    late MobotStore store;
    late RecordingModelWriter writer;
    late MobotModelSync sync;

    setUp(() {
      store = MobotStore(secrets: MemoryStore(), prefs: MemoryStore());
      writer = RecordingModelWriter();
      sync = MobotModelSync(writer: writer, store: store);
    });

    HeartbeatReply answer({ModelGrant? grant, bool unchanged = false}) => HeartbeatReply(
      heartbeatSeconds: 5,
      commands: const [],
      stop: const [],
      grant: grant,
      grantUnchanged: unchanged,
      pointsBalance: 0,
    );

    ModelGrant grant(String model) => ModelGrant(
      channelId: 7,
      baseUrl: 'https://api.example.com/v1',
      protocol: 'openai',
      apiKey: 'sk-secret',
      model: model,
      source: 'grant',
    );

    test('平台说没变时不动手机', () async {
      expect(await sync.apply(answer(unchanged: true)), isFalse);
      expect(writer.upserted, isEmpty);
      expect(writer.removes, 0);
    });

    test('首次授权写入固定 Provider 并记下指纹与时间', () async {
      expect(await sync.apply(answer(grant: grant('m-1'))), isTrue);
      final model = writer.upserted.single;
      expect(model.displayName, 'Mobot 平台（自动同步）');
      expect(model.baseUrl, 'https://api.example.com/v1');
      expect(model.protocol, 'openai');
      expect(model.apiKey, 'sk-secret');
      expect(model.model, 'm-1');
      expect(await store.readGrantFingerprint(), grant('m-1').fingerprint);
      expect(await store.readModelSyncedAt(), isNotNull);
    });

    test('同一授权重复下发不再写手机', () async {
      await sync.apply(answer(grant: grant('m-1')));
      final syncedAt = await store.readModelSyncedAt();
      await store.writeModelSyncedAt(null);

      expect(await sync.apply(answer(grant: grant('m-1'))), isFalse);
      expect(writer.upserted.length, 1);
      expect(await store.readModelSyncedAt(), isNull, reason: '没写就不刷新时间戳');
      expect(syncedAt, isNotNull);
    });

    test('换模型就更新同一条 Provider', () async {
      await sync.apply(answer(grant: grant('m-1')));
      await sync.apply(answer(grant: grant('m-2')));
      expect(writer.upserted.length, 2);
      expect(writer.upserted.last.model, 'm-2');
      expect(writer.removes, 0, reason: '更新不是先删后建');
    });

    test('撤销授权只删我们自己建的那条', () async {
      await sync.apply(answer(grant: grant('m-1')));
      expect(await sync.apply(answer()), isTrue);
      expect(writer.removes, 1);
      expect(await store.readGrantFingerprint(), isNull);

      expect(await sync.apply(answer()), isFalse);
      expect(writer.removes, 1, reason: '手机上同名 Provider 不属于我们，不碰');
    });

    test('写入失败记 lastError，且不认领所有权', () async {
      writer.throwError = StateError('引擎未连接');
      expect(await sync.apply(answer(grant: grant('m-1'))), isFalse);
      expect(sync.lastError, contains('引擎未连接'));
      expect(await store.readGrantFingerprint(), isNull);

      writer.throwError = null;
      expect(await sync.apply(answer()), isFalse);
      expect(writer.removes, 0);
    });

    test('删除失败时保留指纹，下次还能重试收回', () async {
      await sync.apply(answer(grant: grant('m-1')));
      writer.throwError = StateError('引擎未连接');
      expect(await sync.apply(answer()), isFalse);
      expect(await store.readGrantFingerprint(), isNotNull);

      writer.throwError = null;
      expect(await sync.apply(answer()), isTrue);
      expect(writer.removes, 1);
      expect(await store.readGrantFingerprint(), isNull);
      expect(sync.lastError, isNull);
    });

    test('断开绑定时 clear 收回授权', () async {
      await sync.apply(answer(grant: grant('m-1')));
      await sync.clear();
      expect(writer.removes, 1);
      expect(await store.readGrantFingerprint(), isNull);
      await sync.clear();
      expect(writer.removes, 1);
    });
  });
}
