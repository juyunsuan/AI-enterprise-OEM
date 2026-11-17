import 'dart:async';

import 'package:mobot_link/mobot_link.dart';

/// A transport that answers from a per-path handler and records every call.
class FakeTransport implements MobotTransport {
  final Map<String, MobotReply Function(FakeCall call)> handlers = {};
  final List<FakeCall> calls = [];

  void on(String path, Object? Function(FakeCall call) answer) {
    handlers[path] = (call) => reply(call, answer(call));
  }

  void fail(String path, int status, String message) {
    handlers[path] = (call) => MobotReply(status, {'ok': false, 'message': message});
  }

  List<FakeCall> callsTo(String path) => calls.where((call) => call.path == path).toList();

  FakeCall last(String path) => callsTo(path).last;

  @override
  Future<MobotReply> post(
    String path, {
    Map<String, Object?> body = const {},
    String? sessionToken,
    String? hostToken,
  }) async {
    final call = FakeCall(path, body, sessionToken, hostToken);
    calls.add(call);
    final handler = handlers[path];
    if (handler == null) return reply(call, const {});
    return handler(call);
  }
}

final class FakeCall {
  const FakeCall(this.path, this.body, this.sessionToken, this.hostToken);

  final String path;
  final Map<String, Object?> body;
  final String? sessionToken;
  final String? hostToken;
}

MobotReply reply(FakeCall call, Object? data) => MobotReply(200, {'ok': true, ...readMap(data)});

/// `{"ok":true,...}` answer for the many endpoints that only acknowledge.
Object? Function(FakeCall call) accepted([Map<String, Object?> extra = const {}]) =>
    (call) => extra;

/// The phone's storage, in memory.
class MemoryStore implements MobotKeyValueStore, MobotSecretStore {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String? value) async {
    if (value == null) {
      values.remove(key);
    } else {
      values[key] = value;
    }
  }
}

/// A scripted local agent.
class FakeAgent implements PlatformAgent {
  FakeAgent({this.sessionId = 'dsh-session-1'});

  final String sessionId;
  final _events = StreamController<AgentEvent>.broadcast();
  final List<({String instruction, String requestId})> sent = [];
  final List<String> cancels = [];

  bool wakeResult = true;
  bool? wokenWith;
  bool failSession = false;
  String enginePhaseValue = 'ready';

  /// When set, [send] waits for it: used to hold a turn open while the queue fills up.
  Completer<void>? holdSend;

  @override
  Future<bool> wakeIfNeeded({required bool allowed}) async {
    wokenWith = allowed;
    return wakeResult;
  }

  @override
  Future<String> session() async {
    if (failSession) throw StateError('引擎拒绝建会话');
    return sessionId;
  }

  @override
  Future<void> send(String sessionId, String instruction, {required String requestId}) async {
    await holdSend?.future;
    sent.add((instruction: instruction, requestId: requestId));
  }

  @override
  Stream<AgentEvent> follow(String sessionId) => _events.stream;

  @override
  Future<void> cancel(String sessionId) async {
    cancels.add(sessionId);
    // 真机引擎被中断后这一轮就结束了：不结束，执行器会一直等到超时。
    emit(const AgentSettled(text: ''));
  }

  @override
  String get enginePhase => enginePhaseValue;

  void emit(AgentEvent event) => _events.add(event);

  Future<void> dispose() => _events.close();
}

class RecordingModelWriter implements PlatformModelWriter {
  final List<PlatformModel> upserted = [];
  int removes = 0;
  Object? throwError;

  @override
  Future<void> upsert(PlatformModel model) async {
    if (throwError case final error?) throw error;
    upserted.add(model);
  }

  @override
  Future<void> remove() async {
    if (throwError case final error?) throw error;
    removes++;
  }
}

DispatchedCommand command(String code, {String instruction = '你好', int timeoutSec = 5}) => DispatchedCommand(
  commandCode: code,
  kind: 'prompt',
  title: '对话指令',
  instruction: instruction,
  timeout: Duration(seconds: timeoutSec),
);

/// Waits for [condition] instead of sleeping a guessed amount.
Future<void> waitUntil(
  bool Function() condition, {
  String? reason,
  Duration timeout = const Duration(seconds: 2),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (!condition()) {
    if (DateTime.now().isAfter(deadline)) {
      throw StateError('等待条件超时：${reason ?? '未命名'}');
    }
    await Future<void>.delayed(const Duration(milliseconds: 2));
  }
}
