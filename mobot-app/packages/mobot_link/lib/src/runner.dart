import 'dart:async';
import 'dart:math' as math;

import 'agent.dart';
import 'api.dart';
import 'models.dart';
import 'transport.dart';

/// How one platform command ended, for the connection page and the tests.
final class CommandReport {
  const CommandReport(this.commandCode, this.status, [this.detail = '']);

  final String commandCode;

  /// `done`, `failed` or `canceled`.
  final String status;
  final String detail;
}

/// A command in flight: await [done], or [cancel] it when the platform asks.
final class RunningCommand {
  RunningCommand._(this.commandCode, this._done, this._cancel);

  final String commandCode;
  final Future<CommandReport> _done;
  final Future<void> Function() _cancel;

  Future<CommandReport> get done => _done;

  Future<void> cancel() => _cancel();
}

/// Runs one prompt on the local agent and keeps the platform posted: streamed chunks on
/// `/progress`, one terminal receipt on `/result`.
///
/// Commands run one at a time (the caller queues them); approvals are never answered
/// here, they surface as [AgentNotice] and wait for a human on the phone.
class CommandRunner {
  CommandRunner({
    required this.api,
    required this.agent,
    this.allowWake = true,
    this.flushInterval = const Duration(milliseconds: 800),
  });

  final MobotApi api;
  final PlatformAgent agent;

  /// Whether the platform may start the local engine. Set from the connection page.
  bool allowWake;

  /// How often buffered text is shipped. The platform keeps the last chunks of a command,
  /// so a coarser interval only costs detail.
  Duration flushInterval;

  /// Stay under the 4000 characters the platform takes per progress call.
  static const int maxChunkChars = 3800;

  /// Executes [command] and answers the platform. Never throws: a failure becomes a
  /// `failed` report, because a command left unanswered is worse than a failed one.
  RunningCommand run(DispatchedCommand command) {
    final cancelSignal = Completer<void>();
    final done = _execute(command, cancelSignal);
    return RunningCommand._(command.commandCode, done, () async {
      if (!cancelSignal.isCompleted) cancelSignal.complete();
      await done;
    });
  }

  Future<CommandReport> _execute(DispatchedCommand command, Completer<void> cancelSignal) async {
    final started = DateTime.now();
    if (command.instruction.isEmpty) {
      return _finish(command.commandCode, ok: false, failReason: 'empty', started: started);
    }
    if (!await agent.wakeIfNeeded(allowed: allowWake)) {
      return _finish(
        command.commandCode,
        ok: false,
        failReason: 'engine_off',
        errorMessage: '本地引擎未运行，且未允许平台唤起本机 Agent',
        started: started,
      );
    }

    String sessionId;
    try {
      sessionId = await agent.session();
    } on Object catch (error) {
      return _finish(
        command.commandCode,
        ok: false,
        failReason: 'session_failed',
        errorMessage: '$error',
        started: started,
      );
    }

    final buffer = _ChunkBuffer();
    final settled = Completer<AgentSettled>();
    final sub = agent
        .follow(sessionId)
        .listen(
          (event) {
            switch (event) {
              case AgentDelta(:final text):
                buffer.add(text);
              case AgentNotice(:final text):
                buffer.add('$text\n');
              case AgentSettled():
                if (!settled.isCompleted) settled.complete(event);
            }
          },
          onError: (Object error, StackTrace _) {
            if (!settled.isCompleted) settled.complete(AgentSettled(error: '$error'));
          },
        );

    try {
      await agent.send(sessionId, command.instruction, requestId: command.commandCode);
    } on Object catch (error) {
      await sub.cancel();
      return _finish(
        command.commandCode,
        ok: false,
        failReason: 'send_failed',
        errorMessage: '$error',
        started: started,
      );
    }

    var canceled = false;
    var timedOut = false;
    Future<void>? flushing;
    Future<void> flush() {
      Future<void> work() => _flush(command.commandCode, sessionId, buffer, () async {
        // The platform asked to stop this one: end the turn through the same signal a
        // local cancel uses, so the engine gets interrupted exactly once below.
        if (!cancelSignal.isCompleted) cancelSignal.complete();
      });
      // One send at a time: ticks queue behind each other instead of racing for the
      // same slice of the buffer.
      final next = flushing == null ? work() : flushing!.then((_) => work());
      flushing = next;
      return next;
    }

    final ticker = Timer.periodic(flushInterval, (_) => unawaited(flush()));

    final AgentSettled? outcome;
    try {
      outcome =
          await Future.any<AgentSettled?>([
            settled.future,
            cancelSignal.future.then<AgentSettled?>((_) {
              canceled = true;
              return null;
            }),
          ]).timeout(
            command.timeout,
            onTimeout: () {
              timedOut = true;
              return null;
            },
          );
    } finally {
      ticker.cancel();
      await sub.cancel();
    }
    if (timedOut || canceled) await _safeCancel(sessionId);
    await flush();

    if (timedOut) {
      return _finish(
        command.commandCode,
        ok: false,
        failReason: 'timeout',
        errorMessage: '超过 ${command.timeout.inSeconds} 秒没有完成，已中断',
        sessionId: sessionId,
        text: buffer.transcript,
        started: started,
      );
    }
    if (canceled || outcome == null) {
      return _finish(
        command.commandCode,
        ok: false,
        canceled: true,
        sessionId: sessionId,
        text: buffer.transcript,
        started: started,
      );
    }
    if (outcome.failed) {
      return _finish(
        command.commandCode,
        ok: false,
        errorMessage: outcome.error,
        sessionId: sessionId,
        text: buffer.transcript,
        started: started,
      );
    }
    final answer = outcome.text.isNotEmpty ? outcome.text : buffer.transcript;
    return _finish(command.commandCode, ok: true, text: answer, sessionId: sessionId, started: started);
  }

  /// Ships what has accumulated, slice by slice; a broken connection stops at once and
  /// leaves the cursor where it is, so the same text goes out again on the next tick.
  Future<void> _flush(
    String commandCode,
    String sessionId,
    _ChunkBuffer buffer,
    Future<void> Function() onCancel,
  ) async {
    while (true) {
      final send = buffer.take();
      if (send == null) return;
      final bool cancelRequested;
      try {
        cancelRequested = await api.reportProgress(commandCode: commandCode, text: send, sessionId: sessionId);
      } on MobotApiException {
        return;
      }
      buffer.deliver(send);
      if (!cancelRequested) continue;
      await onCancel();
      return;
    }
  }

  Future<void> _safeCancel(String sessionId) async {
    try {
      await agent.cancel(sessionId);
    } on Object {
      // Already over, or the engine refused: the receipt below tells the platform.
    }
  }

  Future<CommandReport> _finish(
    String commandCode, {
    required bool ok,
    String text = '',
    String errorMessage = '',
    String failReason = '',
    String sessionId = '',
    bool canceled = false,
    required DateTime started,
  }) async {
    final status = canceled
        ? 'canceled'
        : ok
        ? 'done'
        : 'failed';
    try {
      await api.reportResult(
        commandCode: commandCode,
        ok: ok,
        text: text,
        errorMessage: errorMessage,
        elapsed: DateTime.now().difference(started),
        canceled: canceled,
        failReason: failReason,
        sessionId: sessionId,
      );
    } on MobotApiException catch (error) {
      return CommandReport(commandCode, status, '结果未能送达平台：${error.message}');
    }
    return CommandReport(commandCode, status, failReason.isNotEmpty ? failReason : errorMessage);
  }

  /// Answers a command that was dropped before it started, so the platform can close it.
  Future<CommandReport> cancelQueued(String commandCode) =>
      _finish(commandCode, ok: false, canceled: true, started: DateTime.now());
}

/// What the agent has said and the platform has not taken yet. The text is append-only and
/// ships in [CommandRunner.maxChunkChars] slices; only delivered slices join the
/// transcript, so a refused slice is resent rather than lost or cut short.
final class _ChunkBuffer {
  final StringBuffer _text = StringBuffer();
  final StringBuffer _delivered = StringBuffer();

  void add(String text) => _text.write(text);

  /// The next slice to send, or null when everything has gone out.
  String? take() {
    if (_text.length == _delivered.length) return null;
    final end = math.min(_delivered.length + CommandRunner.maxChunkChars, _text.length);
    return _text.toString().substring(_delivered.length, end);
  }

  void deliver(String slice) => _delivered.write(slice);

  String get transcript => _delivered.toString();
}
