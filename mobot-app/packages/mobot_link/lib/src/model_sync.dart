import 'models.dart';
import 'store.dart';

/// The model the platform granted, in the shape the phone stores it.
///
/// [protocol] is the platform's word (`openai` / `anthropic`); the bridge turns it into
/// the engine's provider API.
final class PlatformModel {
  const PlatformModel({
    required this.displayName,
    required this.protocol,
    required this.baseUrl,
    required this.apiKey,
    required this.model,
  });

  final String displayName;
  final String protocol;
  final String baseUrl;
  final String apiKey;
  final String model;
}

/// Writes the granted model into the phone's existing provider configuration, and takes
/// it away again. Implemented on the app side over the engine's own provider APIs.
abstract interface class PlatformModelWriter {
  Future<void> upsert(PlatformModel model);

  /// Removes the route Mobot Link created; must not touch anything else.
  Future<void> remove();
}

/// Keeps the phone's `mobot-platform` provider in step with what the account grants.
///
/// The stored fingerprint is also the ownership marker: a provider the user made by hand
/// is never deleted, because we never recorded it.
class MobotModelSync {
  MobotModelSync({required this.writer, required this.store, this.displayName = 'Mobot 平台（自动同步）'});

  /// The only provider route this module writes; the bridge keys its self-heal copy on it.
  static const String route = 'mobot-platform';

  final PlatformModelWriter writer;
  final MobotStore store;
  final String displayName;

  /// Last failure, shown on the connection page; cleared by a later success.
  String? lastError;

  /// Handles one heartbeat answer. `grantUnchanged` means the platform sent nothing new.
  Future<bool> apply(HeartbeatReply reply) async {
    if (reply.grantUnchanged) return false;
    final grant = reply.grant;
    if (grant == null) {
      // No fingerprint means the provider on the phone was never ours; leave it alone.
      if (await store.readGrantFingerprint() == null) return false;
      try {
        await writer.remove();
      } on Object catch (error) {
        lastError = '$error';
        return false;
      }
      await store.writeGrantFingerprint(null);
      await store.writeModelSyncedAt(DateTime.now().toUtc().toIso8601String());
      lastError = null;
      return true;
    }
    if (await store.readGrantFingerprint() == grant.fingerprint) return false;
    try {
      await writer.upsert(
        PlatformModel(
          displayName: displayName,
          protocol: grant.protocol,
          baseUrl: grant.baseUrl,
          apiKey: grant.apiKey,
          model: grant.model,
        ),
      );
      await store.writeGrantFingerprint(grant.fingerprint);
      await store.writeModelSyncedAt(DateTime.now().toUtc().toIso8601String());
      lastError = null;
      return true;
    } on Object catch (error) {
      lastError = '$error';
      return false;
    }
  }

  /// Revokes what this device installed, e.g. when the user unbinds it.
  Future<void> clear() async {
    if (await store.readGrantFingerprint() == null) return;
    await writer.remove();
    await store.writeGrantFingerprint(null);
  }
}
