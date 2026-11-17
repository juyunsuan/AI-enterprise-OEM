import 'package:mobot_link/mobot_link.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../secrets/secure_storage.dart';

/// The site address and the pairing bookkeeping: ordinary preferences, nothing
/// secret ever lands here ([MobotStore] keeps the two tokens apart).
class MobotPrefs implements MobotKeyValueStore {
  @override
  Future<String?> read(String key) async => (await SharedPreferences.getInstance()).getString(key);

  @override
  Future<void> write(String key, String? value) async {
    final prefs = await SharedPreferences.getInstance();
    if (value == null) {
      await prefs.remove(key);
    } else {
      await prefs.setString(key, value);
    }
  }
}

/// The account session and the device token, in the phone's own keystore
/// (flutter_secure_storage / HarmonyOS HUKS). They never enter a preference
/// file, a log or a diagnostic bundle.
class MobotVault implements MobotSecretStore {
  const MobotVault([this._storage = const AppSecureStorage()]);

  final AppSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String? value) => _storage.write(key: key, value: value);
}

/// Whether a platform command may start this phone's engine (连接页的开关).
const mobotAllowWakeKey = 'mobot.allowWake';

/// Whether a paired phone reconnects on its own at launch (连接页的总开关).
const mobotLinkedKey = 'mobot.linked';
