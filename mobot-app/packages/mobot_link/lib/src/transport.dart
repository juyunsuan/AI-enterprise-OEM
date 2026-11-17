import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'models.dart';

/// One HTTP answer of the Mobot channel.
final class MobotReply {
  const MobotReply(this.status, this.json);

  final int status;
  final Map<String, Object?> json;
}

/// Transport seam: the app talks HTTPS, tests talk to a fake.
abstract interface class MobotTransport {
  Future<MobotReply> post(String path, {Map<String, Object?> body, String? sessionToken, String? hostToken});
}

/// Any channel failure, including a platform refusal (`ok: false`).
///
/// [status] is the HTTP code, or 0 when the request never got an answer.
final class MobotApiException implements Exception {
  const MobotApiException(this.status, this.message);

  final int status;
  final String message;

  /// Token revoked, device removed or account disabled: pairing is over.
  bool get unauthorized => status == 401;

  bool get unreachable => status == 0;

  @override
  String toString() => 'MobotApiException($status): $message';
}

/// `dart:io` transport over plain HTTPS. No packages, so the whole module stays
/// testable with the bare Dart SDK.
final class HttpMobotTransport implements MobotTransport {
  HttpMobotTransport(String baseUrl, {HttpClient? client, this.timeout = const Duration(seconds: 20)})
    : base = normalizeBaseUrl(baseUrl),
      _client = client ?? HttpClient();

  /// Origin without a trailing slash, e.g. `https://example.com`.
  final Uri base;
  final Duration timeout;
  final HttpClient _client;

  /// Only used by the app when it points the phone at a dev server on the LAN.
  void allowInsecureCertificates() => _client.badCertificateCallback = (_, _, _) => true;

  void close() => _client.close(force: true);

  @override
  Future<MobotReply> post(
    String path, {
    Map<String, Object?> body = const {},
    String? sessionToken,
    String? hostToken,
  }) async {
    final request = await _client
        .postUrl(base.replace(path: '${base.path}$path'))
        .timeout(timeout, onTimeout: () => throw MobotApiException(0, '连接平台超时'));
    request.headers.contentType = ContentType.json;
    request.headers.contentLength = -1;
    if (sessionToken != null) request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $sessionToken');
    if (hostToken != null) request.headers.set('x-bot-token', hostToken);
    request.write(jsonEncode(body));
    final response = await request.close().timeout(timeout, onTimeout: () => throw MobotApiException(0, '平台响应超时'));
    final text = await response
        .transform(utf8.decoder)
        .join()
        .timeout(timeout, onTimeout: () => throw MobotApiException(0, '平台响应超时'));
    final Object? decoded;
    try {
      decoded = text.isEmpty ? null : jsonDecode(text);
    } on FormatException {
      throw MobotApiException(response.statusCode, '平台返回了无法解析的内容');
    }
    return MobotReply(response.statusCode, readMap(decoded));
  }
}

/// Validates what the connection page typed in: an origin with a host and http(s).
Uri normalizeBaseUrl(String raw) {
  final uri = Uri.tryParse(raw.trim());
  if (uri == null) {
    throw ArgumentError.value(raw, 'baseUrl', '站点地址格式不正确');
  }
  if (uri.scheme != 'https' && uri.scheme != 'http') {
    throw ArgumentError.value(raw, 'baseUrl', '站点地址必须以 http:// 或 https:// 开头');
  }
  if (uri.host.isEmpty) {
    throw ArgumentError.value(raw, 'baseUrl', '站点地址缺少域名');
  }
  return uri.replace(path: uri.path.endsWith('/') ? uri.path.substring(0, uri.path.length - 1) : uri.path);
}
