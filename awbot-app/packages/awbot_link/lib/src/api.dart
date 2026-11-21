import 'models.dart';
import 'transport.dart';

/// Client of `/api/public/awbot/*`.
///
/// Two identities, exactly as the channel defines them:
/// * [sessionToken] — the account session (`Authorization: Bearer`), only used by
///   login, session refresh, and pairing;
/// * [hostToken] — the `awb_` device token (`x-bot-token`), used by everything that
///   runs as the paired device.
class AWBotApi {
  AWBotApi(this._transport, {this.sessionToken, this.hostToken});

  static const String channel = '/api/public/awbot';

  final AWBotTransport _transport;

  String? sessionToken;
  String? hostToken;

  /// Account password login. The password never outlives this call.
  Future<PlatformProfile> login({required String username, required String password}) async {
    final json = await _post('/login', {'username': username, 'password': password});
    sessionToken = readString(json['token']);
    return PlatformProfile.fromJson(json);
  }

  /// Validates the stored session and refreshes what the page shows.
  Future<PlatformProfile> session() async => PlatformProfile.fromJson(await _post('/session', const {}, session: true));

  /// Asks for a fresh 6-digit code, valid ten minutes and claimable by this account only.
  Future<String> requestPairCode({required Map<String, Object?> deviceInfo}) async {
    final json = await _post('/pair', {'deviceInfo': deviceInfo}, session: true);
    return readString(json['code']);
  }

  /// Polls a code. `paired: false` simply means nobody has typed it in yet.
  Future<PairOutcome> pollPairCode(String code) async =>
      PairOutcome.fromJson(await _post('/pair/poll', {'code': code}, session: true));

  /// Redeems the one-time code from the platform's pairing QR — no account login.
  Future<PairOutcome> redeemPairCode({
    required String code,
    required Map<String, Object?> deviceInfo,
  }) async => PairOutcome.fromJson(
    await _post('/pair/qr', {'code': code, 'deviceInfo': deviceInfo}),
  );

  /// Refreshes presence and picks up commands, cancellations and model grants.
  Future<HeartbeatReply> heartbeat({
    required String platform,
    required String clientVersion,
    required Map<String, Object?> caps,
    bool needGrant = false,
  }) async {
    final json = await _post('/heartbeat', {
      'platform': platform,
      'clientVersion': clientVersion,
      'caps': caps,
      if (needGrant) 'needGrant': true,
    }, host: true);
    return HeartbeatReply.fromJson(json);
  }

  /// One streamed chunk; answers whether the platform asked to cancel this command.
  Future<bool> reportProgress({required String commandCode, required String text, String sessionId = ''}) async {
    final json = await _post('/progress', {
      'commandCode': commandCode,
      'text': text,
      if (sessionId.isNotEmpty) 'acpSessionId': sessionId,
    }, host: true);
    return json['cancelRequested'] == true;
  }

  /// Terminal receipt. Idempotent on the platform side by [commandCode].
  Future<void> reportResult({
    required String commandCode,
    required bool ok,
    String text = '',
    String errorMessage = '',
    Duration elapsed = Duration.zero,
    bool canceled = false,
    String failReason = '',
    String sessionId = '',
  }) => _post('/result', {
    'commandCode': commandCode,
    'ok': ok,
    'text': text,
    'errorMessage': errorMessage,
    'elapsedMs': elapsed.inMilliseconds,
    if (canceled) 'canceled': true,
    if (failReason.isNotEmpty) 'failReason': failReason,
    if (sessionId.isNotEmpty) 'acpSessionId': sessionId,
  }, host: true);

  /// Goes offline but keeps the token, so reopening the app re-pairs silently.
  Future<void> logout() => _post('/logout', const {}, host: true);

  Future<Map<String, Object?>> _post(
    String suffix,
    Map<String, Object?> body, {
    bool session = false,
    bool host = false,
  }) async {
    final AWBotReply reply;
    try {
      reply = await _transport.post(
        '$channel$suffix',
        body: body,
        sessionToken: session ? sessionToken : null,
        hostToken: host ? hostToken : null,
      );
    } on AWBotApiException {
      rethrow;
    } on Object catch (error) {
      throw AWBotApiException(0, '无法连接平台：$error');
    }
    if (reply.status < 400 && reply.json['ok'] == true) return reply.json;
    throw AWBotApiException(reply.status, readString(reply.json['message'], '平台请求失败（${reply.status}）'));
  }
}
