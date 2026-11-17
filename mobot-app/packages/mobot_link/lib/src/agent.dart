/// What one turn of the local agent reports back.
///
/// The app bridge maps DSH engine events onto these three; Mobot Link itself never
/// sees engine types, which keeps this package testable without a runtime.
sealed class AgentEvent {
  const AgentEvent();
}

/// Assistant text produced since the last event.
final class AgentDelta extends AgentEvent {
  const AgentDelta(this.text);

  final String text;
}

/// A step worth showing as text: a tool call, a waiting approval. Never answered
/// automatically — the phone stays the one who approves.
final class AgentNotice extends AgentEvent {
  const AgentNotice(this.text);

  final String text;
}

/// The turn ended. Exactly one of [text] / [error] carries the outcome.
final class AgentSettled extends AgentEvent {
  const AgentSettled({this.text = '', this.error = ''});

  final String text;
  final String error;

  bool get failed => error.isNotEmpty;
}

/// The on-device agent, as Mobot Link needs it.
abstract interface class PlatformAgent {
  /// Brings the local engine up when the platform is allowed to, and waits for it to
  /// answer. False means "nothing can run right now": the switch is off, the runtime is
  /// not installed, or it did not come up in time.
  Future<bool> wakeIfNeeded({required bool allowed});

  /// The one session this device uses for platform work, created on first call.
  Future<String> session();

  /// Queues [instruction] on [sessionId]. [requestId] is the platform command code, which
  /// is what makes a retried send idempotent on the engine side.
  Future<void> send(String sessionId, String instruction, {required String requestId});

  /// Live events of [sessionId] until [AgentSettled]; the stream itself keeps following
  /// later turns, so the caller stops listening once a turn is over.
  Stream<AgentEvent> follow(String sessionId);

  Future<void> cancel(String sessionId);

  /// Short label for the heartbeat caps: `ready`, `starting`, `stopped`, `error`.
  String get enginePhase;
}
