import 'dart:convert';

/// Key/value seam. `read` returns null for an unknown key.
abstract interface class AWBotKeyValueStore {
  Future<String?> read(String key);

  /// A null [value] removes the key.
  Future<void> write(String key, String? value);
}

/// Where the two credentials live. The app answers with the device keystore, so
/// nothing here may log or export what it holds.
abstract interface class AWBotSecretStore {
  Future<String?> read(String key);
  Future<void> write(String key, String? value);
}

/// Everything AWBot Link persists: the site address, the two credentials, the
/// model-grant fingerprint and the command codes already answered.
class AWBotStore {
  AWBotStore({required this.secrets, required this.prefs});

  static const String _kBaseUrl = 'awbot.baseUrl';
  static const String _kSessionToken = 'awbot.sessionToken';
  static const String _kHostToken = 'awbot.hostToken';
  static const String _kGrantFingerprint = 'awbot.grantFingerprint';
  static const String _kModelSyncedAt = 'awbot.modelSyncedAt';
  static const String _kSeenCommands = 'awbot.seenCommands';

  /// Command codes kept for idempotency; heartbeats are cheap but memory is not free.
  static const int seenCommandsLimit = 200;

  final AWBotSecretStore secrets;
  final AWBotKeyValueStore prefs;

  Future<String?> readBaseUrl() => prefs.read(_kBaseUrl);
  Future<void> writeBaseUrl(String value) => prefs.write(_kBaseUrl, value);

  Future<String?> readSessionToken() => secrets.read(_kSessionToken);
  Future<void> writeSessionToken(String? value) => secrets.write(_kSessionToken, value);

  Future<String?> readHostToken() => secrets.read(_kHostToken);
  Future<void> writeHostToken(String? value) => secrets.write(_kHostToken, value);

  Future<String?> readGrantFingerprint() => prefs.read(_kGrantFingerprint);
  Future<void> writeGrantFingerprint(String? value) => prefs.write(_kGrantFingerprint, value);

  /// UTC ISO-8601, echoed in the heartbeat caps so the platform can show sync freshness.
  Future<String?> readModelSyncedAt() => prefs.read(_kModelSyncedAt);
  Future<void> writeModelSyncedAt(String? value) => prefs.write(_kModelSyncedAt, value);

  /// Answers false when this code was already taken; the caller must not run it twice.
  Future<bool> claim(String commandCode) async {
    if (commandCode.isEmpty) return false;
    final seen = await _readSeen();
    if (seen.contains(commandCode)) return false;
    seen.add(commandCode);
    if (seen.length > seenCommandsLimit) seen.removeRange(0, seen.length - seenCommandsLimit);
    await prefs.write(_kSeenCommands, jsonEncode(seen));
    return true;
  }

  Future<List<String>> _readSeen() async {
    final raw = await prefs.read(_kSeenCommands);
    if (raw == null || raw.isEmpty) return <String>[];
    final Object? decoded;
    try {
      decoded = jsonDecode(raw);
    } on FormatException {
      return <String>[];
    }
    return decoded is List ? [for (final item in decoded) '$item'] : <String>[];
  }
}
