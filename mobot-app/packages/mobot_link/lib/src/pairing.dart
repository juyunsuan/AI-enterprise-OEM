import 'api.dart';
import 'models.dart';
import 'store.dart';

/// The 6-digit flow: sign in with the platform account, show a code, wait until the user
/// types it into 工作台 → Agent-Bot → Mobot 手机, then hold on to the device token.
///
/// The code itself is only kept in memory by the page: it dies in ten minutes.
class MobotPairer {
  MobotPairer({required this.api, required this.store, this.deviceInfo = const {}});

  final MobotApi api;
  final MobotStore store;

  /// What the platform records with the code (brand, system, app version).
  final Map<String, Object?> deviceInfo;

  /// Puts stored credentials back on [api] after a restart. Answers whether this phone is
  /// already paired.
  Future<bool> restore() async {
    api.sessionToken = await store.readSessionToken();
    api.hostToken = await store.readHostToken();
    return api.hostToken != null && api.hostToken!.isNotEmpty;
  }

  Future<PlatformProfile> signIn({required String username, required String password}) async {
    final profile = await api.login(username: username, password: password);
    await store.writeSessionToken(api.sessionToken);
    return profile;
  }

  /// Logs the account out. The device binding stays, exactly like the desktop client: a
  /// paired phone keeps working after the user closes the session here.
  Future<void> signOut() async {
    api.sessionToken = null;
    await store.writeSessionToken(null);
  }

  Future<String> requestCode() => api.requestPairCode(deviceInfo: deviceInfo);

  /// Null while nobody has claimed the code yet. A paired answer stores the token, which
  /// is the signal for the caller to start [MobotLink].
  Future<PairOutcome?> poll(String code) async {
    final outcome = await api.pollPairCode(code);
    if (!outcome.paired || outcome.token.isEmpty) return null;
    api.hostToken = outcome.token;
    await store.writeHostToken(outcome.token);
    return outcome;
  }
}
