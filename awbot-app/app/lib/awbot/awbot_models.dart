import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:awbot_link/awbot_link.dart';

import '../l10n/l10n.dart';
import '../state/connection_state.dart';
import '../state/models_state.dart';
import '../state/providers_state.dart';
import '../state/settings_state.dart';

/// The account's platform model, written into this phone's own provider store.
///
/// It is one ordinary custom provider (`awbot-platform`), so 设置 → 模型 shows it,
/// the model picker offers it and a later launch heals its key like any other — the
/// app's existing provider framework, only filled with the platform's grant.
class EngineModelWriter implements PlatformModelWriter {
  EngineModelWriter(this._ref, {required this.session});

  final Ref _ref;

  /// The AWBot conversation, needed only for the one case where this write also
  /// picks the model: a phone that had nothing usable before.
  final Future<String> Function() session;

  /// Always the on-device engine: a platform grant belongs to this phone, whatever
  /// host the chat happens to be talking to.
  ClientProviderBackend _backend() {
    final client =
        _ref.read(localConnectionProvider).value?.client ?? (throw StateError(appL10n.awbotEngineNotRunning));
    return ClientProviderBackend(client, isLocal: true, hostLabel: appL10n.commonThisPhone);
  }

  /// 方案 §11.5：引擎只列出有凭据的供应商，所以目录为空就是这台手机还跑不了任何
  /// 模型——只有这时才由这次同步替它选默认，已有模型的手机不动用户的选择。
  Future<bool> _hadNoModel(ClientProviderBackend backend) async {
    try {
      final catalog = await backend.client.listModels();
      return catalog.groups.every((group) => group.models.isEmpty);
    } on Object {
      // 读不到目录不是替用户做选择的理由。
      return false;
    }
  }

  Future<void> _pickDefault(ClientProviderBackend backend, PlatformModel model) async {
    try {
      // 路由在 profile 写下后才注册，没选中就留给用户自己挑，和这次同步之前一样。
      await backend.client.setModel(await session(), provider: AWBotModelSync.route, model: model.model);
    } on Object catch (_) {
      // Not chosen, not an error: the grant itself is in place.
    }
  }

  @override
  Future<void> upsert(PlatformModel model) async {
    final backend = _backend();
    final hadNothing = await _hadNoModel(backend);
    final keyRef = deriveProviderKeyRef(AWBotModelSync.route);
    final api = model.protocol == 'anthropic' ? ProviderApi.anthropicMessages : ProviderApi.openaiCompletions;
    final models = [ProviderModelSpec(id: model.model, name: model.model)];
    final settings = await backend.read();
    final existing = settings?.profiles.where((profile) => profile.route == AWBotModelSync.route).firstOrNull;
    if (existing == null) {
      await backend.create(
        ProviderProfile(
          route: AWBotModelSync.route,
          displayName: model.displayName,
          api: api.wire,
          baseUrl: model.baseUrl,
          apiKeyEnv: keyRef,
          models: models,
          headers: const {},
        ),
      );
    } else {
      await backend.update(
        AWBotModelSync.route,
        displayName: model.displayName,
        api: api,
        baseUrl: model.baseUrl,
        apiKeyEnv: keyRef,
        models: models,
        expectedRevision: settings?.revision,
      );
    }
    await backend.storeKey(keyRef, model.apiKey);
    // The same self-heal copy a hand-typed provider key gets: after a restart the
    // engine finds its key again without the platform re-sending the grant.
    await _ref.read(settingsProvider.notifier).saveProviderKey(AWBotModelSync.route, model.apiKey);
    if (hadNothing) await _pickDefault(backend, model);
    _refresh();
  }

  @override
  Future<void> remove() async {
    final backend = _backend();
    final settings = await backend.read();
    final existing = settings?.profiles.where((profile) => profile.route == AWBotModelSync.route).firstOrNull;
    if (existing == null) return;
    await backend.remove(AWBotModelSync.route, expectedRevision: settings?.revision);
    try {
      await backend.clearKey(deriveProviderKeyRef(AWBotModelSync.route));
    } catch (_) {
      // The route is gone; a leftover credential is harmless.
    }
    await _ref.read(settingsProvider.notifier).removeProviderKey(AWBotModelSync.route);
    _refresh();
  }

  void _refresh() {
    _ref
      ..invalidate(customProvidersProvider)
      ..invalidate(modelCatalogProvider);
  }
}
