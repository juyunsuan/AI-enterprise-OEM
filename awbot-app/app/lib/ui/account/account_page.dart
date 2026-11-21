import 'dart:async';

import 'package:awbot_link/awbot_link.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../../awbot/awbot_state.dart';
import '../../state/connection_state.dart';
import '../../state/provider_keys.dart';
import '../../state/providers_state.dart';
import '../../state/settings_state.dart';
import '../common/app_dialog.dart';
import '../common/app_sheet.dart';
import '../common/brief_notice.dart';
import '../common/overview_card.dart';
import '../onboarding/api_key_page.dart';
import '../settings/credential_recovery_dialog.dart';
import '../settings/settings_widgets.dart';
import '../shell/page_frame.dart';
import '../theme/app_icons.dart';
import '../theme/theme.dart';
import '../awbot/awbot_scan_page.dart';

/// 账号：扫码登录平台（不需要 DeepSeek 账号），以及 AIPDD / 平台 API Key。
class AccountPage extends ConsumerWidget {
  const AccountPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return AppPage.list(
      title: l10n.engineAccountTitle,
      children: const [
        _ScanAccountCard(),
        SizedBox(height: 24),
        ApiKeySection(),
      ],
    );
  }
}

class _ScanAccountCard extends ConsumerWidget {
  const _ScanAccountCard();

  Future<void> _scan(BuildContext context) async {
    final paired = await Navigator.of(context).push(AWBotScanPage.route());
    if (paired == true && context.mounted) {
      showBriefNotice(context, context.l10n.engineAccountScannedIn);
    }
  }

  Future<void> _unbind(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final ok = await showAppDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(l10n.awbotUnbindTitle),
        content: Text(l10n.awbotUnbindBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog, false), child: Text(l10n.commonCancel)),
          FilledButton(onPressed: () => Navigator.pop(dialog, true), child: Text(l10n.awbotUnbind)),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    await ref.read(awbotProvider.notifier).unbind();
    if (context.mounted) showBriefNotice(context, l10n.awbotUnbound);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final awbot = ref.watch(awbotProvider);
    final linked = awbot.hasDeviceToken;
    final site = Uri.tryParse(awbot.baseUrl)?.host ?? '';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: GlassSurface(
        tier: GlassTier.card,
        borderRadius: AppShape.radiusLg,
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const OverviewGlyph(AppIcons.qrCode),
                const SizedBox(width: OverviewCard.gap),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        linked ? l10n.engineAccountScannedIn : l10n.engineAccountDeepSeek,
                        style: theme.textTheme.titleMedium,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        linked
                            ? [site, if (awbot.desktopHost.isNotEmpty) awbot.desktopHost].where((v) => v.isNotEmpty).join(' · ')
                            : l10n.engineAccountNoKeyNeeded,
                        style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (linked) ...[
              OutlinedButton(
                onPressed: () => unawaited(_scan(context)),
                child: Text(l10n.engineAccountRescan),
              ),
              const SizedBox(height: 6),
              TextButton(
                onPressed: () => unawaited(_unbind(context, ref)),
                child: Text(l10n.awbotUnbind),
              ),
            ] else
              FilledButton(
                onPressed: () => unawaited(_scan(context)),
                child: Text(l10n.engineAccountSignInDeepSeek),
              ),
          ],
        ),
      ),
    );
  }
}

/// 「API Key」：AIPDD Key，以及扫码登录后自动匹配的平台 Key。
class ApiKeySection extends ConsumerWidget {
  const ApiKeySection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final linked = ref.watch(awbotProvider.select((s) => s.hasDeviceToken));
    // 平台模型同步完成后，自动匹配的 Key 才落进本机；到点重读一次。
    ref.listen(awbotProvider.select((s) => s.modelSynced), (previous, next) {
      if (next && previous != true) ref.invalidate(platformApiKeyProvider);
    });
    return SettingsSection(
      title: context.l10n.engineAccountAipddKey,
      children: [
        const ApiKeyTile(),
        if (linked) const PlatformApiKeyTile(),
      ],
    );
  }
}

/// The saved AIPDD API Key, masked; opens "replace / clear", or the key page
/// when there is none.
class ApiKeyTile extends ConsumerWidget {
  const ApiKeyTile({super.key, this.tinted = false, this.tint = 0});

  final bool tinted;
  final int tint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final settings = ref.watch(settingsProvider);
    final scheme = Theme.of(context).colorScheme;
    final colors = DshColors.of(context);
    return SettingsTile(
      icon: AppIcons.apiKey,
      tint: tint,
      tinted: tinted,
      title: l10n.engineAccountAipddKey,
      value: settings.hasApiKey
          ? Text(maskApiKey(settings.apiKey), style: AppType.monoLabel(color: scheme.onSurfaceVariant))
          : Text(l10n.commonNotSet, style: TextStyle(color: colors.textTertiary)),
      onTap: () => manageApiKey(context, ref),
    );
  }
}

/// 平台 API Key: the platform channel key matched by QR sign-in; editable.
final platformApiKeyProvider = FutureProvider.autoDispose<String>((ref) async {
  final all = await ref.watch(providerKeyVaultProvider).readAll();
  return all[AWBotModelSync.route] ?? '';
});

class PlatformApiKeyTile extends ConsumerWidget {
  const PlatformApiKeyTile({super.key});

  Future<void> _edit(BuildContext context, WidgetRef ref, String current) async {
    final controller = TextEditingController(text: current);
    final value = await showAppDialog<String>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(context.l10n.engineAccountPlatformKey),
        content: TextField(
          controller: controller,
          autofocus: true,
          obscureText: true,
          decoration: const InputDecoration(hintText: 'sk-…'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog), child: Text(context.l10n.commonCancel)),
          FilledButton(onPressed: () => Navigator.pop(dialog, controller.text.trim()), child: Text(context.l10n.commonSave)),
        ],
      ),
    );
    if (value == null || value.isEmpty || !context.mounted) return;
    final client = ref.read(localConnectionProvider).value?.client;
    if (client == null) {
      showBriefNotice(context, context.l10n.awbotEngineNotRunning);
      return;
    }
    final backend = ClientProviderBackend(client, isLocal: true, hostLabel: context.l10n.commonThisPhone);
    await backend.storeKey(deriveProviderKeyRef(AWBotModelSync.route), value);
    await ref.read(settingsProvider.notifier).saveProviderKey(AWBotModelSync.route, value);
    ref.invalidate(platformApiKeyProvider);
    if (context.mounted) showBriefNotice(context, context.l10n.commonSaved);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final key = ref.watch(platformApiKeyProvider).value ?? '';
    final scheme = Theme.of(context).colorScheme;
    return SettingsTile(
      icon: AppIcons.model,
      title: l10n.engineAccountPlatformKey,
      subtitle: l10n.engineAccountPlatformKeyHint,
      value: key.isEmpty
          ? Text(l10n.engineAccountPlatformKeyHint, style: TextStyle(color: scheme.onSurfaceVariant))
          : Text(maskApiKey(key), style: AppType.monoLabel(color: scheme.onSurfaceVariant)),
      onTap: () => unawaited(_edit(context, ref, key)),
    );
  }
}

/// No key: the key page. A key: a sheet to replace or clear it.
Future<void> manageApiKey(BuildContext context, WidgetRef ref) async {
  final l10n = context.l10n;
  void push(Widget page) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));
  if (!ref.read(settingsProvider).hasApiKey) {
    push(const ApiKeyPage(onboarding: false));
    return;
  }
  final action = await showAppSheet<String>(
    context,
    builder: (sheet) => SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SheetHeader(l10n.engineAccountAipddKey),
          SheetGroup(
            margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              SettingsTile(
                icon: AppIcons.edit,
                tinted: false,
                title: l10n.engineAccountReplaceKey,
                chevron: false,
                onTap: () => Navigator.pop(sheet, 'replace'),
              ),
              SettingsTile(
                icon: AppIcons.delete,
                tinted: false,
                danger: true,
                title: l10n.commonClear,
                chevron: false,
                onTap: () => Navigator.pop(sheet, 'clear'),
              ),
            ],
          ),
        ],
      ),
    ),
  );
  if (!context.mounted) return;
  switch (action) {
    case 'replace':
      push(const ApiKeyPage(onboarding: false));
    case 'clear':
      final ok = await showAppDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: Text(l10n.engineAccountClearKeyTitle),
          content: Text(l10n.engineAccountClearKeyBody),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialog, false), child: Text(l10n.commonCancel)),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: DshColors.of(dialog).danger,
                foregroundColor: DshColors.of(dialog).onDanger,
              ),
              onPressed: () => Navigator.pop(dialog, true),
              child: Text(l10n.commonClear),
            ),
          ],
        ),
      );
      if (ok != true) return;
      try {
        await ref.read(settingsProvider.notifier).setApiKey('');
      } catch (e) {
        if (!context.mounted || !await offerCredentialRecovery(context, ref, e)) rethrow;
      }
  }
}
