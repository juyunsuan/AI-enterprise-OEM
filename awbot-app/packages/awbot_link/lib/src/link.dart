import 'dart:async';
import 'dart:math' as math;

import 'agent.dart';
import 'api.dart';
import 'model_sync.dart';
import 'models.dart';
import 'runner.dart';
import 'store.dart';
import 'transport.dart';

/// Where the connection stands, as the page shows it.
enum AWBotLinkStatus {
  /// No device token on this phone.
  unpaired,

  /// Token loaded, first heartbeat not back yet.
  starting,

  /// The platform answers; commands are picked up.
  online,

  /// Waiting out a retry after a network or server failure.
  retrying,

  /// Stopped by the app (page closed on purpose, or the process is shutting down).
  stopped,
}

/// Snapshot published on [AWBotLink.changes].
final class AWBotLinkState {
  const AWBotLinkState({
    required this.status,
    this.detail = '',
    this.pointsBalance = 0,
    this.queued = 0,
    this.runningTitle = '',
    this.reports = const [],
  });

  final AWBotLinkStatus status;
  final String detail;
  final int pointsBalance;
  final int queued;
  final String runningTitle;

  /// Newest first, so the page can list what just ran.
  final List<CommandReport> reports;

  bool get isOnline => status == AWBotLinkStatus.online;

  AWBotLinkState copyWith({
    AWBotLinkStatus? status,
    String? detail,
    int? pointsBalance,
    int? queued,
    String? runningTitle,
    List<CommandReport>? reports,
  }) => AWBotLinkState(
    status: status ?? this.status,
    detail: detail ?? this.detail,
    pointsBalance: pointsBalance ?? this.pointsBalance,
    queued: queued ?? this.queued,
    runningTitle: runningTitle ?? this.runningTitle,
    reports: reports ?? this.reports,
  );
}

/// The companion link itself: heartbeat loop, one-at-a-time command queue, model sync.
///
/// Lifetime is app-controlled: [start] on boot when a token exists, [stop] when the
/// foreground service ends, [unbind] when the user disconnects on purpose.
class AWBotLink {
  AWBotLink({
    required this.api,
    required this.agent,
    required this.store,
    required this.models,
    this.platform = 'android',
    this.clientVersion = '',
    this.extraCaps,
  }) : runner = CommandRunner(api: api, agent: agent),
       _state = const AWBotLinkState(status: AWBotLinkStatus.unpaired);

  /// Retry waits: [minRetryDelay] after the first failure, doubling to [maxRetryDelay].
  /// Instance fields so a test can watch a whole backoff curve in milliseconds.
  Duration minRetryDelay = const Duration(seconds: 5);
  Duration maxRetryDelay = const Duration(seconds: 60);
  static const int reportsKept = 20;

  final AWBotApi api;
  final PlatformAgent agent;
  final AWBotStore store;
  final AWBotModelSync models;
  final CommandRunner runner;

  /// `android` or `ios`; the platform only accepts these two from a phone.
  final String platform;
  final String clientVersion;

  /// Battery, network type … merged into the heartbeat caps by the app.
  Future<Map<String, Object?>> Function()? extraCaps;

  final StreamController<AWBotLinkState> _changes = StreamController.broadcast();
  final List<DispatchedCommand> _waiting = [];
  final List<CommandReport> _reports = [];

  AWBotLinkState _state;
  Future<void>? _loop;
  bool _stopped = true;
  late Duration _retry;
  RunningCommand? _running;
  bool _draining = false;
  Completer<void>? _sleeper;

  /// The last model grant did not reach the engine (usually: it was not running).
  /// The next heartbeat asks the platform to send it again instead of waiting for a
  /// change that may never come.
  bool _needGrant = false;

  AWBotLinkState get state => _state;

  Stream<AWBotLinkState> get changes => _changes.stream;

  /// Whether the platform may start the local engine; the page owns this switch.
  bool get allowWake => runner.allowWake;
  set allowWake(bool value) => runner.allowWake = value;

  /// Starts the loop when this phone holds a device token. Returns false when unpaired.
  Future<bool> start() async {
    if (_loop != null) return true;
    final token = await store.readHostToken();
    if (token == null || token.isEmpty) {
      _emit((s) => s.copyWith(status: AWBotLinkStatus.unpaired, detail: ''));
      return false;
    }
    api.hostToken = token;
    _stopped = false;
    _retry = minRetryDelay;
    _emit((s) => s.copyWith(status: AWBotLinkStatus.starting, detail: ''));
    _loop = _run().whenComplete(() => _loop = null);
    return true;
  }

  /// Ends the loop without touching the token: reopening the app pairs again silently.
  Future<void> stop() async {
    _stopped = true;
    _wake();
    await _loop;
    _emit((s) => s.copyWith(status: AWBotLinkStatus.stopped, runningTitle: '', queued: _waiting.length));
  }

  /// Disconnects for good: goes offline on the platform, drops the token and the model
  /// this device installed.
  Future<void> unbind() async {
    try {
      await api.logout();
    } on AWBotApiException {
      // The device may already be removed server-side; local cleanup continues anyway.
    }
    await stop();
    await models.clear();
    await store.writeHostToken(null);
    api.hostToken = null;
    _waiting.clear();
    _emit((s) => s.copyWith(status: AWBotLinkStatus.unpaired, detail: '已断开连接', queued: 0, runningTitle: ''));
  }

  Future<void> _run() async {
    while (!_stopped) {
      final HeartbeatReply reply;
      try {
        reply = await api.heartbeat(
          platform: platform,
          clientVersion: clientVersion,
          caps: await _caps(),
          needGrant: _needGrant,
        );
      } on AWBotApiException catch (error) {
        if (error.unauthorized) {
          await _revoked(error.message);
          return;
        }
        _emit((s) => s.copyWith(status: AWBotLinkStatus.retrying, detail: error.message));
        await _sleep(_retry);
        _retry = Duration(seconds: math.min(maxRetryDelay.inSeconds, _retry.inSeconds * 2));
        continue;
      }
      _retry = minRetryDelay;
      _emit(
        (s) => s.copyWith(
          status: AWBotLinkStatus.online,
          detail: '',
          pointsBalance: reply.pointsBalance,
          queued: _waiting.length,
        ),
      );
      if (reply.grant != null) {
        // The provider store belongs to the engine: write it only after the engine
        // is up, otherwise the grant is dropped and the phone cannot run commands.
        try {
          await agent.wakeIfNeeded(allowed: allowWake);
        } on Object {
          // A failed wake is not a reason to stop the link; the next heartbeat asks
          // for the grant again after the engine comes back.
          _needGrant = true;
        }
      }
      await models.apply(reply);
      _needGrant = models.lastError != null;
      for (final command in reply.commands) {
        // The platform re-sends what has no receipt yet, so the same code arrives on
        // every heartbeat until this phone answers it. Only [store.claim] at the moment
        // of running knows for sure whether it already ran.
        if (!command.hasWork) continue;
        if (_waiting.any((queued) => queued.commandCode == command.commandCode)) continue;
        _waiting.add(command);
      }
      for (final code in reply.stop) {
        await _cancel(code);
      }
      unawaited(_drain());
      await _sleep(Duration(seconds: reply.heartbeatSeconds));
    }
  }

  /// One command at a time: the phone runs a local engine and must not overlap turns.
  Future<void> _drain() async {
    if (_draining) return;
    _draining = true;
    try {
      while (!_stopped && _waiting.isNotEmpty) {
        final command = _waiting.removeAt(0);
        if (!await store.claim(command.commandCode)) continue;
        final running = runner.run(command);
        _running = running;
        _emit((s) => s.copyWith(queued: _waiting.length, runningTitle: command.title));
        final report = await running.done;
        _running = null;
        _reports.insert(0, report);
        if (_reports.length > reportsKept) _reports.removeLast();
        _emit((s) => s.copyWith(queued: _waiting.length, runningTitle: '', reports: List.of(_reports)));
      }
    } finally {
      _draining = false;
    }
  }

  Future<void> _cancel(String commandCode) async {
    final running = _running;
    if (running != null && running.commandCode == commandCode) {
      unawaited(running.cancel());
      return;
    }
    final index = _waiting.indexWhere((c) => c.commandCode == commandCode);
    if (index < 0) return;
    _waiting.removeAt(index);
    // Never started, so answer it here and burn the code: a dispatched command left
    // open would hang the platform's queue view.
    await store.claim(commandCode);
    await runner.cancelQueued(commandCode);
    _emit((s) => s.copyWith(queued: _waiting.length));
  }

  Future<void> _revoked(String reason) async {
    await models.clear();
    await store.writeHostToken(null);
    api.hostToken = null;
    _waiting.clear();
    _stopped = true;
    _emit((s) => s.copyWith(status: AWBotLinkStatus.unpaired, detail: reason, queued: 0, runningTitle: ''));
  }

  Future<Map<String, Object?>> _caps() async {
    final syncedAt = await store.readModelSyncedAt();
    return {
      'engine': agent.enginePhase,
      'canWake': runner.allowWake,
      if (syncedAt != null && syncedAt.isNotEmpty) 'modelSyncedAt': syncedAt,
      if (models.lastError != null && models.lastError!.isNotEmpty) 'modelSyncError': models.lastError,
      ...?await extraCaps?.call(),
    };
  }

  void _emit(AWBotLinkState Function(AWBotLinkState) update) {
    _state = update(_state);
    if (!_changes.isClosed) _changes.add(_state);
  }

  /// Sleep that [stop] cuts short.
  Future<void> _sleep(Duration duration) {
    final completer = Completer<void>();
    _sleeper = completer;
    Timer(duration, () {
      if (!completer.isCompleted) completer.complete();
    });
    return completer.future;
  }

  void _wake() {
    final completer = _sleeper;
    _sleeper = null;
    if (completer != null && !completer.isCompleted) completer.complete();
  }

  Future<void> dispose() async {
    await stop();
    await _changes.close();
  }
}
