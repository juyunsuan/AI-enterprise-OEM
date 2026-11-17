import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobot_link/mobot_link.dart';

import '../l10n/l10n.dart';
import '../state/app_info.dart';
import 'mobot_agent.dart';
import 'mobot_foreground.dart';
import 'mobot_models.dart';
import 'mobot_stores.dart';

/// Everything the connection page shows, in one place: the site, the account, the
/// device binding and what the link is doing right now.
@immutable
class MobotUiState {
  const MobotUiState({
    this.ready = false,
    this.baseUrl = '',
    this.signedIn = false,
    this.profile = PlatformProfile.empty,
    this.hasDeviceToken = false,
    this.link = const MobotLinkState(status: MobotLinkStatus.unpaired),
    this.allowWake = true,
    this.modelSynced = false,
  });

  /// False until the stored site, session and device token have been read.
  final bool ready;
  final String baseUrl;

  /// An account session is on the phone (退出登录 can end it; the device stays).
  final bool signedIn;
  final PlatformProfile profile;

  /// The device token is here: the heartbeat loop runs whether or not the page is open.
  final bool hasDeviceToken;
  final MobotLinkState link;

  /// A platform command may start this phone's engine (the page's switch).
  final bool allowWake;

  /// The granted platform model is in this phone's provider store.
  final bool modelSynced;

  bool get running =>
      hasDeviceToken && link.status != MobotLinkStatus.stopped && link.status != MobotLinkStatus.unpaired;

  MobotUiState copyWith({
    bool? ready,
    String? baseUrl,
    bool? signedIn,
    PlatformProfile? profile,
    bool? hasDeviceToken,
    MobotLinkState? link,
    bool? allowWake,
    bool? modelSynced,
  }) => MobotUiState(
    ready: ready ?? this.ready,
    baseUrl: baseUrl ?? this.baseUrl,
    signedIn: signedIn ?? this.signedIn,
    profile: profile ?? this.profile,
    hasDeviceToken: hasDeviceToken ?? this.hasDeviceToken,
    link: link ?? this.link,
    allowWake: allowWake ?? this.allowWake,
    modelSynced: modelSynced ?? this.modelSynced,
  );
}

/// Owns the Mobot Link for the life of the app: reads what the phone kept, starts the
/// heartbeat when a device token exists, and hands the pages the actions they need.
///
/// Booted once from `app.dart`, like the other app-lifetime services, so a paired
/// phone is already listening before the settings page is ever opened.
class MobotController extends Notifier<MobotUiState> {
  MobotStore? _store;
  HttpMobotTransport? _transport;
  MobotApi? _api;
  MobotPairer? _pairer;
  MobotLink? _link;
  StreamSubscription<MobotLinkState>? _linkChanges;

  /// The notification text currently shown (Android), so a heartbeat that changes
  /// nothing does not talk to the shell every five seconds.
  String? _shownForeground;
  static const _foreground = MobotForeground();

  /// The platform only accepts these two from a phone.
  static String get platform => Platform.isAndroid
      ? 'android'
      : Platform.isIOS
      ? 'ios'
      : Platform.operatingSystem;

  @override
  MobotUiState build() {
    ref.onDispose(_disposeAll);
    unawaited(_boot());
    return const MobotUiState();
  }

  MobotPairer get _pairerOrThrow => _pairer ?? (throw StateError(appL10n.mobotSiteMissing));

  /// The last model-sync failure, for the page; null after a success.
  String? get modelError => _link?.models.lastError;

  Future<void> _boot() async {
    try {
      await _restore();
    } on Object {
      // Preferences or the keystore unavailable: the page opens as 未配对 rather than
      // waiting for a boot that will not finish.
      _update((s) => s.copyWith(ready: true));
    }
  }

  Future<void> _restore() async {
    final prefs = MobotPrefs();
    final store = MobotStore(secrets: const MobotVault(), prefs: prefs);
    final baseUrl = await store.readBaseUrl() ?? '';
    final allowWake = await prefs.read(mobotAllowWakeKey) != 'false';
    // 连接平台 turned off by hand stays off across launches.
    final linked = await prefs.read(mobotLinkedKey) != 'false';
    var signedIn = false;
    var modelSynced = false;
    try {
      signedIn = await store.readSessionToken() != null;
      modelSynced = await store.readGrantFingerprint() != null;
    } on Object {
      // A keystore that will not answer reads as 未登录 / 未配对, so the page can start over.
    }
    if (!ref.mounted) return;
    _store = store;
    if (baseUrl.isNotEmpty) _open(baseUrl);
    var paired = false;
    final pairer = _pairer;
    if (pairer != null) {
      try {
        paired = await pairer.restore();
      } on Object {
        // A keystore that will not answer leaves the page saying 未配对; pairing again works.
      }
    }
    var profile = PlatformProfile.empty;
    var signedInNow = signedIn && _api != null;
    if (signedInNow) {
      // Best effort: the stored session is only good while the account is.
      try {
        profile = await _api!.session();
      } on MobotApiException catch (error) {
        if (error.unauthorized) {
          await pairer!.signOut();
          signedInNow = false;
        }
      }
    }
    if (!ref.mounted) return;
    _update(
      (s) => s.copyWith(
        ready: true,
        baseUrl: baseUrl,
        signedIn: signedInNow,
        profile: profile,
        hasDeviceToken: paired,
        allowWake: allowWake,
        modelSynced: modelSynced,
      ),
    );
    if (paired && linked) await _startLink();
  }

  /// Points the phone at a site. Validates first, so a typo never replaces a working one.
  Future<void> setBaseUrl(String raw) async {
    final uri = normalizeBaseUrl(raw);
    final url = uri.toString();
    await _stopLink();
    await _link?.dispose();
    _link = null;
    await _linkChanges?.cancel();
    _linkChanges = null;
    _open(url);
    final store = _store;
    if (store != null) {
      // The old site's credentials mean nothing to the new one.
      await store.writeBaseUrl(url);
      await store.writeSessionToken(null);
      await store.writeHostToken(null);
      await store.writeGrantFingerprint(null);
    }
    _update(
      (s) => s.copyWith(
        baseUrl: url,
        signedIn: false,
        profile: PlatformProfile.empty,
        hasDeviceToken: false,
        link: const MobotLinkState(status: MobotLinkStatus.unpaired),
        modelSynced: false,
      ),
    );
  }

  /// Renumbers the link's own plumbing after a different site was chosen.
  void _open(String baseUrl) {
    _transport?.close();
    final transport = HttpMobotTransport(baseUrl, timeout: const Duration(seconds: 15));
    if (baseUrl.startsWith('http://')) transport.allowInsecureCertificates();
    _transport = transport;
    _api = MobotApi(transport);
    _pairer = MobotPairer(
      api: _api!,
      store: _store!,
      deviceInfo: {'platform': platform, 'clientVersion': AppInfo.version},
    );
  }

  Future<void> signIn(String username, String password) async {
    final profile = await _pairerOrThrow.signIn(username: username, password: password);
    _update((s) => s.copyWith(signedIn: true, profile: profile));
  }

  Future<void> signOut() async {
    await _pairerOrThrow.signOut();
    _update((s) => s.copyWith(signedIn: false, profile: PlatformProfile.empty));
  }

  /// A fresh 6-digit code, valid ten minutes and claimable by this account only.
  Future<String> requestCode() => _pairerOrThrow.requestCode();

  /// True once the platform accepted the code. The caller keeps polling until then.
  Future<bool> pollPair(String code) async {
    final outcome = await _pairerOrThrow.poll(code);
    if (outcome == null) return false;
    _update((s) => s.copyWith(hasDeviceToken: true));
    await _startLink();
    return true;
  }

  /// 暂停 / 继续 on the page. Pausing keeps the device token and is remembered.
  Future<void> setLinked(bool linked) async {
    if (linked) {
      await _startLink();
    } else {
      await _stopLink();
    }
    try {
      await MobotPrefs().write(mobotLinkedKey, '$linked');
    } on Object {
      // Not remembering the pause only means the next launch connects again.
    }
  }

  Future<void> setAllowWake(bool allowed) async {
    _link?.allowWake = allowed;
    _update((s) => s.copyWith(allowWake: allowed));
    try {
      await MobotPrefs().write(mobotAllowWakeKey, '$allowed');
    } on Object {
      // Not remembering the switch only means it comes back on next launch.
    }
  }

  /// 断开连接: goes offline on the platform, drops the token and takes the granted
  /// model back out of the provider store.
  Future<void> unbind() async {
    final link = _link;
    if (link != null) await link.unbind();
    _update(
      (s) => s.copyWith(
        hasDeviceToken: false,
        modelSynced: false,
        link: const MobotLinkState(status: MobotLinkStatus.unpaired),
      ),
    );
  }

  Future<void> _startLink() async {
    final api = _api;
    final store = _store;
    if (api == null || store == null) return;
    var link = _link;
    if (link == null) {
      final agent = EngineAgent(ref);
      link = MobotLink(
        api: api,
        agent: agent,
        store: store,
        models: MobotModelSync(
          writer: EngineModelWriter(ref, session: agent.session),
          store: store,
          displayName: appL10n.mobotProviderName,
        ),
        platform: platform,
        clientVersion: AppInfo.version,
      );
      link.allowWake = state.allowWake;
      // 电量/充电/网络 ride along in the caps the platform's device card reads.
      link.extraCaps = _foreground.deviceCaps;
      _link = link;
      _linkChanges = link.changes.listen(_onLink);
    }
    await link.start();
    _onLink(link.state);
  }

  Future<void> _stopLink() async {
    final link = _link;
    if (link == null) return;
    await link.stop();
    _onLink(link.state);
  }

  void _onLink(MobotLinkState link) {
    if (!ref.mounted) return;
    final before = state.link;
    _update((s) => s.copyWith(link: link));
    _updateForeground(link);
    // Only when something that can change the model copy happened, not every heartbeat.
    if (before.status != link.status || before.reports.length != link.reports.length) {
      unawaited(_refreshModelState());
    }
  }

  /// The Android notification follows what the link is doing; on other platforms
  /// [MobotForeground] does nothing.
  void _updateForeground(MobotLinkState link) {
    final active =
        state.hasDeviceToken && link.status != MobotLinkStatus.stopped && link.status != MobotLinkStatus.unpaired;
    final text = !active
        ? ''
        : link.runningTitle.isNotEmpty
        ? appL10n.mobotRunning(link.runningTitle)
        : switch (link.status) {
            MobotLinkStatus.online => appL10n.mobotStatusOnlineHint,
            MobotLinkStatus.starting => appL10n.mobotStatusStarting,
            MobotLinkStatus.retrying => appL10n.mobotStatusRetrying,
            _ => appL10n.mobotStatusOnline,
          };
    if (text == _shownForeground) return;
    _shownForeground = text;
    if (text.isEmpty) {
      unawaited(_foreground.hide());
    } else {
      unawaited(_foreground.show(title: appL10n.mobotTitle, text: text));
    }
  }

  Future<void> _refreshModelState() async {
    final store = _store;
    if (store == null) return;
    final synced = await store.readGrantFingerprint() != null;
    if (!ref.mounted) return;
    _update((s) => s.copyWith(modelSynced: synced));
  }

  void _update(MobotUiState Function(MobotUiState) change) {
    if (ref.mounted) state = change(state);
  }

  void _disposeAll() {
    unawaited(_linkChanges?.cancel());
    unawaited(_link?.dispose());
    unawaited(_foreground.hide());
    _transport?.close();
  }
}

final mobotProvider = NotifierProvider<MobotController, MobotUiState>(MobotController.new);
