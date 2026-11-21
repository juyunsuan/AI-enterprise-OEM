import 'dart:convert';

import 'api.dart';
import 'models.dart';
import 'store.dart';

/// What the platform's pairing QR carries: the site to talk to and the one-time code.
class AWBotPairPayload {
  const AWBotPairPayload({
    required this.site,
    required this.code,
    this.hostId = 0,
    this.hostName = '',
    this.fromDesktop = false,
  });

  final String site;
  final String code;

  /// AWBotDSH 组合码带上那台桌面主机的身份；平台码为 0 / 空。
  final int hostId;
  final String hostName;
  final bool fromDesktop;

  /// Accepts only this app's own payloads; anything else is a wrong QR code.
  static AWBotPairPayload parse(String raw) {
    final Object? decoded;
    try {
      decoded = jsonDecode(raw);
    } on FormatException {
      throw const FormatException('Not an AWBot pairing code');
    }
    if (decoded is! Map) {
      throw const FormatException('Not an AWBot pairing code');
    }
    final type = readString(decoded['type']);
    if (type != 'awbot-pair' && type != 'awbotdsh-pair') {
      throw const FormatException('Not an AWBot pairing code');
    }
    final site = readString(decoded['site']);
    final code = readString(decoded['code']);
    if (site.isEmpty || code.isEmpty) {
      throw const FormatException('AWBot pairing code is incomplete');
    }
    final host = decoded['host'];
    final hostMap = host is Map ? host : const {};
    return AWBotPairPayload(
      site: site,
      code: code,
      hostId: hostMap['id'] is int ? hostMap['id'] as int : int.tryParse(readString(hostMap['id'])) ?? 0,
      hostName: readString(hostMap['name']),
      fromDesktop: type == 'awbotdsh-pair',
    );
  }
}

/// The 6-digit flow: sign in with the platform account, show a code, wait until the user
/// types it into 工作台 → Agent-Bot → AWBot 手机, then hold on to the device token.
///
/// The code itself is only kept in memory by the page: it dies in ten minutes.
class AWBotPairer {
  AWBotPairer({required this.api, required this.store, this.deviceInfo = const {}});

  final AWBotApi api;
  final AWBotStore store;

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

  /// Pairs with the one-time code from the platform's QR (or the same code typed
  /// by hand). No platform account is involved; the token is kept like [poll]'s.
  Future<PairOutcome?> pairWithCode(String code) async {
    final outcome = await api.redeemPairCode(code: code, deviceInfo: deviceInfo);
    if (!outcome.paired || outcome.token.isEmpty) return null;
    api.hostToken = outcome.token;
    await store.writeHostToken(outcome.token);
    return outcome;
  }

  /// Null while nobody has claimed the code yet. A paired answer stores the token, which
  /// is the signal for the caller to start [AWBotLink].
  Future<PairOutcome?> poll(String code) async {
    final outcome = await api.pollPairCode(code);
    if (!outcome.paired || outcome.token.isEmpty) return null;
    api.hostToken = outcome.token;
    await store.writeHostToken(outcome.token);
    return outcome;
  }
}
