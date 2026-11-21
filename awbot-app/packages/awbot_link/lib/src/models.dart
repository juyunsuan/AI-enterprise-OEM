/// Wire types of the platform AWBot channel.
///
/// Field names follow `backend/src/bot-host` so a change on the server shows up
/// here as a renamed field, not as a translation layer.
library;

/// One prompt waiting to be executed on this phone.
///
/// Desktop hosts also carry `cwd`/`mode`; the platform always sends them empty
/// for AWBOT devices, so they are not modelled here.
final class DispatchedCommand {
  const DispatchedCommand({
    required this.commandCode,
    required this.kind,
    required this.title,
    required this.instruction,
    required this.timeout,
  });

  factory DispatchedCommand.fromJson(Map<String, Object?> json) => DispatchedCommand(
    commandCode: readString(json['commandCode']),
    kind: readString(json['kind']),
    title: readString(json['title']),
    instruction: readString(json['instruction']),
    timeout: Duration(seconds: readInt(json['timeoutSec'], 300)),
  );

  final String commandCode;

  /// `prompt` for a conversation turn, `schedule` for a timed task, `connect` for the
  /// pairing probe.
  final String kind;
  final String title;
  final String instruction;
  final Duration timeout;

  bool get hasWork => instruction.isNotEmpty;
}

/// A model channel the account granted to this device.
final class ModelGrant {
  const ModelGrant({
    required this.channelId,
    required this.baseUrl,
    required this.protocol,
    required this.apiKey,
    required this.model,
    required this.source,
  });

  factory ModelGrant.fromJson(Map<String, Object?> json) => ModelGrant(
    channelId: readInt(json['channelId']),
    baseUrl: readString(json['baseUrl']),
    protocol: readString(json['protocol'], 'openai'),
    apiKey: readString(json['apiKey']),
    model: readString(json['model']),
    source: readString(json['source']),
  );

  static ModelGrant? tryParse(Object? value) {
    final json = readMap(value);
    if (json.isEmpty) return null;
    final grant = ModelGrant.fromJson(json);
    return grant.baseUrl.isEmpty || grant.model.isEmpty ? null : grant;
  }

  final int channelId;
  final String baseUrl;

  /// `openai` or `anthropic`.
  final String protocol;
  final String apiKey;
  final String model;
  final String source;

  /// Change detection only ever compares this: it must not contain the key, so a
  /// fingerprint can be persisted outside the secret store.
  String get fingerprint => '$channelId|$protocol|$baseUrl|$model';
}

/// Everything the heartbeat answers with.
final class HeartbeatReply {
  const HeartbeatReply({
    required this.heartbeatSeconds,
    required this.commands,
    required this.stop,
    required this.grant,
    required this.grantUnchanged,
    required this.pointsBalance,
  });

  factory HeartbeatReply.fromJson(Map<String, Object?> json) => HeartbeatReply(
    heartbeatSeconds: readInt(json['heartbeatSeconds'], 5),
    commands: [for (final row in readList(json['commands'])) DispatchedCommand.fromJson(readMap(row))],
    stop: [for (final code in readList(json['stop'])) readString(code)].where((c) => c.isNotEmpty),
    grant: ModelGrant.tryParse(json['modelGrant']),
    grantUnchanged: json['grantUnchanged'] == true,
    pointsBalance: pointsOf(json['points']),
  );

  final int heartbeatSeconds;
  final List<DispatchedCommand> commands;
  final Iterable<String> stop;

  /// Null together with [grantUnchanged] means "same as the one you already have".
  final ModelGrant? grant;
  final bool grantUnchanged;
  final int pointsBalance;
}

/// Account-side identity shown on the connection page after login.
final class PlatformProfile {
  const PlatformProfile({
    required this.username,
    required this.role,
    required this.siteName,
    required this.pointsBalance,
    required this.mustChangePassword,
  });

  factory PlatformProfile.fromJson(Map<String, Object?> json) {
    final user = readMap(json['user']);
    final site = readMap(json['site']);
    return PlatformProfile(
      username: readString(user['username']),
      role: readString(user['role']),
      siteName: readString(site['name']),
      pointsBalance: pointsOf(json['points']),
      mustChangePassword: json['mustChangePassword'] == true,
    );
  }

  static const PlatformProfile empty = PlatformProfile(
    username: '',
    role: '',
    siteName: '',
    pointsBalance: 0,
    mustChangePassword: false,
  );

  final String username;
  final String role;
  final String siteName;
  final int pointsBalance;
  final bool mustChangePassword;
}

/// Result of polling a pairing code.
final class PairOutcome {
  const PairOutcome({required this.paired, required this.token, required this.hostName});

  factory PairOutcome.fromJson(Map<String, Object?> json) => PairOutcome(
    paired: json['paired'] == true,
    token: readString(json['token']),
    hostName: readString(json['hostName']),
  );

  final bool paired;

  /// Shown once, then only ever kept in the secret store.
  final String token;
  final String hostName;
}

// ── Lenient readers ──────────────────────────────────────────────────────────
//
// The platform answers with plain JSON; a missing field must not throw inside a
// heartbeat loop that has no user looking at the screen.

String readString(Object? value, [String fallback = '']) {
  if (value is String) return value;
  if (value is num) return '$value';
  return fallback;
}

int readInt(Object? value, [int fallback = 0]) => value is num ? value.toInt() : fallback;

/// 积分余额在两个接口里写法不同：登录/会话是 `{points:{balance}}`，心跳直接给数字。
int pointsOf(Object? value) => value is num ? value.toInt() : readInt(readMap(value)['balance']);

Map<String, Object?> readMap(Object? value) =>
    value is Map ? value.map((key, Object? item) => MapEntry('$key', item)) : const {};

List<Object?> readList(Object? value) => value is List ? value : const [];
