import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../l10n/l10n.dart';
import '../../state/app_info.dart';
import '../../state/settings_state.dart';
import '../common/app_sheet.dart';
import '../common/brief_notice.dart';
import '../common/sheet_title_bar.dart';
import '../onboarding/api_key_page.dart';
import '../settings/settings_widgets.dart';
import '../theme/app_icons.dart';
import '../theme/theme.dart';

/// 顶栏右侧的社交圆键:替换原来的模型胶囊,点开 AIworkin 社交。
class SocialHeaderButton extends StatelessWidget {
  const SocialHeaderButton({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Semantics(
      button: true,
      label: l10n.socialTitle,
      excludeSemantics: true,
      child: GlassSurface(
        tier: GlassTier.chrome,
        circle: true,
        grouped: true,
        onTap: () => unawaited(showSocialHub(context)),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(AppIcons.social, size: 20, color: Theme.of(context).colorScheme.onSurface),
        ),
      ),
    );
  }
}

Future<void> showSocialHub(BuildContext context) => showAppSheet<void>(
  context,
  isScrollControlled: true,
  builder: (_) => const SocialHubSheet(),
);

enum _SocialView { key, menu }

class SocialHubSheet extends ConsumerStatefulWidget {
  const SocialHubSheet({super.key});

  @override
  ConsumerState<SocialHubSheet> createState() => _SocialHubSheetState();
}

class _SocialHubSheetState extends ConsumerState<SocialHubSheet> {
  late _SocialView _view;

  @override
  void initState() {
    super.initState();
    _view = ref.read(settingsProvider).hasApiKey ? _SocialView.menu : _SocialView.key;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final key = ref.watch(settingsProvider.select((s) => s.apiKey)).trim();
    final view = key.isEmpty ? _SocialView.key : _view;
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.86),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SheetTitleBar(
                view == _SocialView.key ? l10n.socialKeyTitle : l10n.socialTitle,
                maxLines: 1,
                actions: [
                  if (view == _SocialView.key && key.isNotEmpty)
                    SheetIconButton(
                      icon: AppIcons.back,
                      tooltip: l10n.commonBack,
                      onPressed: () => setState(() => _view = _SocialView.menu),
                    ),
                ],
              ),
              Flexible(
                child: view == _SocialView.key
                    ? _KeyEntry(onSaved: () => setState(() => _view = _SocialView.menu))
                    : _MenuView(apiKey: key, onManageKey: () => setState(() => _view = _SocialView.key)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _KeyEntry extends ConsumerStatefulWidget {
  const _KeyEntry({required this.onSaved});

  final VoidCallback onSaved;

  @override
  ConsumerState<_KeyEntry> createState() => _KeyEntryState();
}

class _KeyEntryState extends ConsumerState<_KeyEntry> {
  final _controller = TextEditingController();
  bool _obscure = true;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l10n = context.l10n;
    final key = normalizeApiKey(_controller.text);
    if (key.isEmpty) {
      setState(() => _error = l10n.socialKeyRequired);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(settingsProvider.notifier).setApiKey(key);
      if (mounted) widget.onSaved();
    } catch (_) {
      if (mounted) setState(() => _error = l10n.commonSaveFailedRetry);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(kSheetGutter, 4, kSheetGutter, 20),
      children: [
        Text(l10n.socialKeyBody, style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
        const SizedBox(height: 16),
        TextField(
          key: const ValueKey('social-key-field'),
          controller: _controller,
          autofocus: true,
          obscureText: _obscure,
          autocorrect: false,
          enableSuggestions: false,
          decoration: InputDecoration(
            labelText: l10n.socialKeyLabel,
            hintText: 'sk-…',
            errorText: _error,
            suffixIcon: IconButton(
              icon: Icon(_obscure ? AppIcons.showSecret : AppIcons.hideSecret),
              tooltip: _obscure ? l10n.shellShow : l10n.commonHide,
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
          ),
          onSubmitted: (_) => unawaited(_save()),
        ),
        const SizedBox(height: 4),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            icon: const Icon(AppIcons.openExternal, size: 16),
            label: Text(l10n.socialKeyGet),
            onPressed: () => unawaited(
              launchUrl(Uri.parse(AppInfo.aipddPlatform), mode: LaunchMode.externalApplication),
            ),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton(
          key: const ValueKey('social-key-save'),
          onPressed: _saving ? null : () => unawaited(_save()),
          child: _saving
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(l10n.socialKeySave),
        ),
      ],
    );
  }
}

/// The AIworkin panel: the same three groups the DSH plugin's `view.json`
/// declares, each entry opening the matching AIworkin page.
class _MenuView extends StatelessWidget {
  const _MenuView({required this.apiKey, required this.onManageKey});

  final String apiKey;
  final VoidCallback onManageKey;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final base = AppInfo.aipddPlatform;
    final locale = Localizations.localeOf(context).languageCode == 'en' ? 'en' : 'cn';
    void open(String path) => unawaited(_open(context, Uri.parse('$base/$locale$path')));
    return ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.only(bottom: 16),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(kSheetGutter, 0, kSheetGutter, 6),
          child: Text(l10n.socialIntro, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ),
        SheetGroup(
          children: [
            SettingsTile(icon: AppIcons.feedback, title: l10n.socialOpenChat, onTap: () => open('/chat')),
            SettingsTile(icon: AppIcons.subagents, title: l10n.socialOpenTwins, onTap: () => open('/dashboard/twins')),
            SettingsTile(icon: AppIcons.social, title: l10n.socialDiscover, onTap: () => open('/discover')),
            SettingsTile(icon: AppIcons.workspaceGroup, title: l10n.socialGroups, onTap: () => open('/groups')),
          ],
        ),
        SheetGroup(
          title: l10n.socialMore,
          children: [
            SettingsTile(icon: AppIcons.jobs, title: l10n.socialHiring, onTap: () => open('/hiring')),
            SettingsTile(icon: AppIcons.workflow, title: l10n.socialMatching, onTap: () => open('/work-market/demand')),
            SettingsTile(icon: AppIcons.skill, title: l10n.socialSkillsMarket, onTap: () => open('/skills')),
            SettingsTile(icon: AppIcons.plugin, title: l10n.socialApps, onTap: () => open('/apps')),
          ],
        ),
        SheetGroup(
          title: l10n.socialGovernance,
          children: [
            SettingsTile(icon: AppIcons.profile, title: l10n.socialFriends, onTap: () => open('/network')),
            SettingsTile(icon: AppIcons.notifications, title: l10n.socialNotifications, onTap: () => open('/notifications')),
            SettingsTile(icon: AppIcons.feedback, title: l10n.socialMail, onTap: () => open('/mail')),
            SettingsTile(icon: AppIcons.code, title: l10n.socialDevelopers, onTap: () => open('/developers')),
          ],
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(kSheetGutter, 8, kSheetGutter, 0),
          child: Text(l10n.socialPowered, style: theme.textTheme.bodySmall?.copyWith(color: DshColors.of(context).textTertiary)),
        ),
        SheetGroup(
          children: [
            SettingsTile(
              icon: AppIcons.apiKey,
              title: l10n.engineAccountAipddKey,
              subtitle: l10n.socialKeyChange,
              value: Text(maskApiKey(apiKey), style: AppType.monoLabel(color: theme.colorScheme.onSurfaceVariant)),
              onTap: onManageKey,
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _open(BuildContext context, Uri url) async {
    final opened = await launchUrl(url, mode: LaunchMode.externalApplication).catchError((_) => false);
    if (!opened && context.mounted) showBriefNotice(context, context.l10n.stateBrowserOpenFailed);
  }
}
