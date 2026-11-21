import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:awbot_link/awbot_link.dart';

import '../l10n/l10n.dart';
import '../state/app_info.dart';
import 'awbot_agent.dart';
import 'awbot_foreground.dart';
import 'awbot_models.dart';
import 'awbot_stores.dart';

/// Everything the connection page shows, in one place: the site, the account, the
/// device binding and what the link is doing right now.
@immutable
class AWBotUiState {
  const AWBotUiState({
    this.ready = false,
    this.baseUrl = '',
    this.signedIn = false,
    this.profile = PlatformProfile.empty,
    this.hasDeviceToken = false,
    this.desktopHost = '',
    this.link = const AWBotLinkState(status: AWBotLinkStatus.unpaired),
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

  /// 扫 AWBotDSH 码时同一账号下的那台桌面主机；平台码为空。
  final String desktopHost;
  final AWBotLinkState link;

  /// A platform command may start this phone's engine (the page's switch).
  final bool allowWake;

  /// The granted platform model is in this phone's provider store.
  final bool modelSynced;

  bool get running =>
      hasDeviceToken && link.status != AWBotLinkStatus.stopped && link.status != AWBotLinkStatus.unpaired;

  AWBotUiState copyWith({
    bool? ready,
    String? baseUrl,
    bool? signedIn,
    PlatformProfile? profile,
    bool? hasDeviceToken,
    String? desktopHost,
    AWBotLinkState? link,
    bool? allowWake,
    bool? modelSynced,
  }) => AWBotUiState(
    ready: ready ?? this.ready,
    baseUrl: baseUrl ?? this.baseUrl,
    signedIn: signedIn ?? this.signedIn,
    profile: profile ?? this.profile,
    hasDeviceToken: hasDeviceToken ?? this.hasDeviceToken,
    desktopHost: desktopHost ?? this.desktopHost,
    link: link ?? this.link,
    allowWake: allowWake ?? this.allowWake,
    modelSynced: modelSynced ?? this.modelSynced,
  );
}

/// Owns the AWBot Link for the life of the app: reads what the phone kept, starts the
/// heartbeat when a device token exists, and hands the pages the actions they need.
///
/// Booted once from `app.dart`, like the other app-lifetime services, so a paired
/// phone is already listening before the settings page is ever opened.
class AWBotController extends Notifier<AWBotUiState> {
  AWBotStore? _store;
  HttpAWBotTransport? _transport;
  AWBotApi? _api;
  AWBotPairer? _pairer;
  AWBotLink? _link;
  StreamSubscription<AWBotLinkState>? _linkChanges;

  /// The notification text currently shown (Android), so a heartbeat that changes
  /// nothing does not talk to the shell every five seconds.
  String? _shownForeground;
  static const _foreground = AWBotForeground();

  /// The platform only accepts these two from a phone.
  static String get platform => Platform.isAndroid
      ? 'android'
      : Platform.isIOS
      ? 'ios'
      : Platform.operatingSystem;

  @override
  AWBotUiState build() {
    ref.onDispose(_disposeAll);
    unawaited(_boot());
    return const AWBotUiState();
  }

  AWBotPairer get _pairerOrThrow => _pairer ?? (throw StateError(appL10n.awbotSiteMissing));

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
    final prefs = AWBotPrefs();
    final store = AWBotStore(secrets: const AWBotVault(), prefs: prefs);
    final baseUrl = await store.readBaseUrl() ?? '';
    final desktopHost = await prefs.read(awbotDesktopHostKey) ?? '';
    final allowWake = await prefs.read(awbotAllowWakeKey) != 'false';
    // 连接平台 turned off by hand stays off across launches.
    final linked = await prefs.read(awbotLinkedKey) != 'false';
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
      } on AWBotApiException catch (error) {
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
        desktopHost: desktopHost,
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
        desktopHost: '',
        link: const AWBotLinkState(status: AWBotLinkStatus.unpaired),
        modelSynced: false,
      ),
    );
    try {
      await AWBotPrefs().write(awbotDesktopHostKey, null);
    } on Object {
      // 记不住只影响下次显示，不影响配对。
    }
  }

  /// Renumbers the link's own plumbing after a different site was chosen.
  void _open(String baseUrl) {
    _transport?.close();
    final transport = HttpAWBotTransport(baseUrl, timeout: const Duration(seconds: 15));
    if (baseUrl.startsWith('http://')) transport.allowInsecureCertificates();
    _transport = transport;
    _api = AWBotApi(transport);
    _pairer = AWBotPairer(
      api: _api!,
      store: _store!,
      deviceInfo: {'platform': platform, 'clientVersion': AppInfo.version},
    );
  }

  /// 扫到平台的码，或扫到 AWBotDSH 的组合码：都先完成平台配对。
  /// 组合码额外带主机信息，由桌面端在 QR 里声明，手机不需要登录平台账号。
  Future<AWBotPairPayload> pairFromScan(String raw) async {
    final payload = AWBotPairPayload.parse(raw);
    await setBaseUrl(payload.site);
    await _redeem(payload.code);
    if (payload.fromDesktop) {
      final name = payload.hostName.isNotEmpty ? payload.hostName : 'AWBotDSH';
      await AWBotPrefs().write(awbotDesktopHostKey, name);
      _update((s) => s.copyWith(desktopHost: name));
    }
    return payload;
  }

  /// 手输配对码：站点 + 平台生成的 12 位码。
  Future<void> pairWithCode(String site, String code) async {
    await setBaseUrl(site);
    await _redeem(code);
  }

  Future<void> _redeem(String code) async {
    final outcome = await _pairerOrThrow.pairWithCode(code.trim());
    if (outcome == null) {
      throw const FormatException('Pairing code was not accepted');
    }
    _update((s) => s.copyWith(hasDeviceToken: true));
    await _startLink();
  }

  /// 暂停 / 继续 on the page. Pausing keeps the device token and is remembered.
  Future<void> setLinked(bool linked) async {
    if (linked) {
      await _startLink();
    } else {
      await _stopLink();
    }
    try {
      await AWBotPrefs().write(awbotLinkedKey, '$linked');
    } on Object {
      // Not remembering the pause only means the next launch connects again.
    }
  }

  Future<void> setAllowWake(bool allowed) async {
    _link?.allowWake = allowed;
    _update((s) => s.copyWith(allowWake: allowed));
    try {
      await AWBotPrefs().write(awbotAllowWakeKey, '$allowed');
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
        desktopHost: '',
        modelSynced: false,
        link: const AWBotLinkState(status: AWBotLinkStatus.unpaired),
      ),
    );
    try {
      await AWBotPrefs().write(awbotDesktopHostKey, null);
    } on Object {
      // 同上：显示用元数据，清不掉也不影响已断开的状态。
    }
  }

  Future<void> _startLink() async {
    final api = _api;
    final store = _store;
    if (api == null || store == null) return;
    var link = _link;
    if (link == null) {
      final agent = EngineAgent(ref);
      link = AWBotLink(
        api: api,
        agent: agent,
        store: store,
        models: AWBotModelSync(
          writer: EngineModelWriter(ref, session: agent.session),
          store: store,
          displayName: appL10n.awbotProviderName,
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

  void _onLink(AWBotLinkState link) {
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
  /// [AWBotForeground] does nothing.
  void _updateForeground(AWBotLinkState link) {
    final active =
        state.hasDeviceToken && link.status != AWBotLinkStatus.stopped && link.status != AWBotLinkStatus.unpaired;
    final text = !active
        ? ''
        : link.runningTitle.isNotEmpty
        ? appL10n.awbotRunning(link.runningTitle)
        : switch (link.status) {
            AWBotLinkStatus.online => appL10n.awbotStatusOnlineHint,
            AWBotLinkStatus.starting => appL10n.awbotStatusStarting,
            AWBotLinkStatus.retrying => appL10n.awbotStatusRetrying,
            _ => appL10n.awbotStatusOnline,
          };
    if (text == _shownForeground) return;
    _shownForeground = text;
    if (text.isEmpty) {
      unawaited(_foreground.hide());
    } else {
      unawaited(_foreground.show(title: appL10n.awbotTitle, text: text));
    }
  }

  Future<void> _refreshModelState() async {
    final store = _store;
    if (store == null) return;
    final synced = await store.readGrantFingerprint() != null;
    if (!ref.mounted) return;
    _update((s) => s.copyWith(modelSynced: synced));
  }

  void _update(AWBotUiState Function(AWBotUiState) change) {
    if (ref.mounted) state = change(state);
  }

  void _disposeAll() {
    unawaited(_linkChanges?.cancel());
    unawaited(_link?.dispose());
    unawaited(_foreground.hide());
    _transport?.close();
  }
}

final awbotProvider = NotifierProvider<AWBotController, AWBotUiState>(AWBotController.new);
