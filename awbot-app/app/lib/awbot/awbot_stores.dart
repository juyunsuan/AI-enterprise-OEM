import 'package:awbot_link/awbot_link.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../secrets/secure_storage.dart';

/// The site address and the pairing bookkeeping: ordinary preferences, nothing
/// secret ever lands here ([AWBotStore] keeps the two tokens apart).
class AWBotPrefs implements AWBotKeyValueStore {
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
class AWBotVault implements AWBotSecretStore {
  const AWBotVault([this._storage = const AppSecureStorage()]);

  final AppSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String? value) => _storage.write(key: key, value: value);
}

/// Whether a platform command may start this phone's engine (连接页的开关).
const awbotAllowWakeKey = 'awbot.allowWake';

/// Whether a paired phone reconnects on its own at launch (连接页的总开关).
const awbotLinkedKey = 'awbot.linked';

/// 扫 AWBotDSH 组合码时一起绑定的那台桌面主机名。
const awbotDesktopHostKey = 'awbot.desktopHost';
