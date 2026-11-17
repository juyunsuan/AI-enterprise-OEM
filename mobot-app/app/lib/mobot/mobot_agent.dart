import 'dart:async';

import 'package:dsh_client/dsh_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobot_link/mobot_link.dart';

import '../l10n/l10n.dart';
import '../runtime/runtime_bridge.dart';
import '../runtime/runtime_state.dart';
import '../state/connection_state.dart';
import '../state/engine_control.dart';
import '../state/workspaces_state.dart';

/// This phone's own DSH agent, as Mobot Link needs it.
///
/// The platform's commands run in one dedicated conversation (「Mobot 平台」) on the
/// local engine, so they show up in the app's history like anything typed by hand —
/// and an approval still waits for a finger on this screen.
class EngineAgent implements PlatformAgent {
  EngineAgent(this._ref);

  final Ref _ref;

  /// The client this session belongs to; a restart replaces it, and the session with it.
  DshClient? _client;
  String? _sessionId;

  /// The prompt this device sent and has not seen land yet. `session/prompt` echoes its
  /// requestId in the `user/message`, which is how [follow] knows which turn to report.
  String? _pendingRequestId;

  DshClient get _engine =>
      _ref.read(localConnectionProvider).value?.client ?? (throw StateError(appL10n.mobotEngineNotRunning));

  @override
  String get enginePhase {
    final phase = _ref.read(localRuntimeProvider).status.phase;
    return switch (phase) {
      RuntimePhase.running => _ref.read(localConnectionProvider).value == null ? 'starting' : 'ready',
      RuntimePhase.installing || RuntimePhase.starting || RuntimePhase.stopping => 'starting',
      RuntimePhase.error => 'error',
      _ => 'stopped',
    };
  }

  @override
  Future<bool> wakeIfNeeded({required bool allowed}) async {
    if (_ref.read(localConnectionProvider).value != null) return true;
    final phase = _ref.read(localRuntimeProvider).status.phase;
    if (phase != RuntimePhase.running) {
      // Absent, still downloading or half-stopped: only a person can fix those.
      if (!allowed || (phase != RuntimePhase.installed && phase != RuntimePhase.error)) return false;
      await EngineControl.ensureStarted(_ref.container);
    }
    return await _awaitConnection() != null;
  }

  /// Waits for the local connection, which appears once the engine answers.
  Future<HostConnection?> _awaitConnection({Duration wait = const Duration(seconds: 60)}) async {
    HostConnection? found;
    final settled = Completer<void>();
    void take(AsyncValue<HostConnection?> value) {
      final connection = value.value;
      if (connection == null || settled.isCompleted) return;
      found = connection;
      settled.complete();
    }

    final sub = _ref.listen<AsyncValue<HostConnection?>>(localConnectionProvider, (_, next) => take(next));
    try {
      take(_ref.read(localConnectionProvider));
      await settled.future.timeout(wait, onTimeout: () {});
      return found;
    } finally {
      sub.close();
    }
  }

  @override
  Future<String> session() async {
    final client = _engine;
    final known = _sessionId;
    if (known != null && identical(client, _client)) return known;
    final created = await createSessionInWorkspace(client, await workspaceForNewSession(_ref));
    // Named, so the conversation is recognisable in the session list.
    await client.renameSession(created.sessionId, appL10n.mobotSessionTitle);
    _client = client;
    _sessionId = created.sessionId;
    return created.sessionId;
  }

  @override
  Future<void> send(String sessionId, String instruction, {required String requestId}) async {
    _pendingRequestId = requestId;
    try {
      await _engine.prompt(sessionId, instruction, requestId: requestId);
    } on DshRemoteException catch (error) {
      // The conversation was deleted by hand: the next command opens a new one.
      if (error.code == 'session/not-found') _sessionId = null;
      rethrow;
    }
  }

  @override
  Stream<AgentEvent> follow(String sessionId) {
    final client = _engine;
    late final StreamController<AgentEvent> out;
    StreamSubscription<DshEvent>? sub;
    // Which turn the platform is waiting for. Asked by the log itself: our prompt echoes
    // the requestId [send] recorded — read when the event arrives, because [send] runs
    // after this subscription — and the turn it belongs to is the turn/start the log put
    // it under. The replay of older turns therefore reports nothing, in either order.
    var ourTurn = -1;
    var ourSeq = -1;
    var lastTurn = -1;
    var lastStartSeq = -1;
    var answer = '';
    out = StreamController<AgentEvent>(
      onListen: () {
        try {
          sub = client
              .watch(sessionId)
              .listen(
                (event) {
                  switch (event) {
                    case TurnStartedEvent(turn: final started) when ourTurn < 0:
                      if (ourSeq >= 0 && event.seq > ourSeq) {
                        ourTurn = started;
                      } else {
                        lastTurn = started;
                        lastStartSeq = event.seq;
                      }
                    case UserMessageEvent(requestId: final id)
                        when ourTurn < 0 && id != null && id == _pendingRequestId:
                      ourSeq = event.seq;
                      if (lastTurn >= 0 && ourSeq > lastStartSeq) ourTurn = lastTurn;
                    case AssistantChunkEvent(:final chunk) when ourTurn >= 0:
                      if (chunk case TextDeltaChunk(:final text)) out.add(AgentDelta(text));
                    case ToolCallEvent(:final name) when ourTurn >= 0:
                      out.add(AgentNotice(appL10n.mobotNoticeTool(name)));
                    case ApprovalAskedEvent(:final toolName) when ourTurn >= 0:
                      out.add(AgentNotice(appL10n.mobotNoticeApproval(toolName)));
                    case AssistantMessageEvent(:final message) when ourTurn >= 0:
                      answer = message.text;
                    case TurnEndedEvent(turn: final ended, :final reason) when ended == ourTurn && ourTurn >= 0:
                      // `blocked` means an approval is pending: the turn is not over, so the
                      // platform waits (or cancels) instead of this phone approving for itself.
                      if (reason.kind == 'blocked') break;
                      out.add(
                        reason.isError
                            ? AgentSettled(error: reason.error?.message ?? appL10n.mobotTurnFailed)
                            : AgentSettled(text: answer),
                      );
                    default:
                      break;
                  }
                },
                onError: (Object error, StackTrace stack) {
                  if (!out.isClosed) out.addError(error, stack);
                },
                onDone: () {
                  if (!out.isClosed) out.add(AgentSettled(error: appL10n.mobotEngineLost));
                },
              );
        } on Object catch (error, stack) {
          // The engine refused the follow outright: the runner reports this turn failed.
          if (!out.isClosed) out.addError(error, stack);
        }
      },
      onCancel: () async {
        final subscription = sub;
        sub = null;
        _pendingRequestId = null;
        await subscription?.cancel();
      },
    );
    return out.stream;
  }

  @override
  Future<void> cancel(String sessionId) => _engine.cancel(sessionId);
}
