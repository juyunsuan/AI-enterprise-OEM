import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:awbot_link/awbot_link.dart';

import '../../l10n/l10n.dart';
import '../../awbot/awbot_state.dart';
import '../common/app_dialog.dart';
import '../common/app_sheet.dart';
import '../common/brief_notice.dart';
import '../common/overview_card.dart';
import '../common/sheet_title_bar.dart';
import '../settings/settings_widgets.dart';
import '../shell/page_frame.dart';
import '../theme/app_icons.dart';
import '../theme/theme.dart';
import 'awbot_pair_page.dart';

/// AWBot 手机: this phone's link to the platform — the site, the account, the
/// pairing and what the link is doing.
///
/// Nothing on this page is answered for the person: the pairing code is typed on
/// the platform, and an approval a command runs into still waits on this screen.
class AWBotPage extends ConsumerWidget {
  const AWBotPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final state = ref.watch(awbotProvider);
    final colors = DshColors.of(context);
    final status = _status(state, l10n, colors);
    final reports = state.link.reports;
    final modelError = ref.read(awbotProvider.notifier).modelError;
    return AppPage.list(
      title: l10n.awbotTitle,
      subtitle: Text(l10n.awbotSubtitle),
      children: [
        if (!state.ready)
          const Padding(
            padding: EdgeInsets.fromLTRB(0, 24, 0, 0),
            child: Center(child: CircularProgressIndicator()),
          )
        else ...[
          OverviewCard(
            leading: const OverviewGlyph(AppIcons.phoneControl),
            title: Text(status.label, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: status.color)),
            subtitle: Text(state.link.detail.isNotEmpty ? state.link.detail : status.hint),
            trailing: state.hasDeviceToken
                ? Switch.adaptive(
                    value: state.running,
                    onChanged: (linked) => unawaited(ref.read(awbotProvider.notifier).setLinked(linked)),
                  )
                : null,
          ),
          SettingsSection(
            title: l10n.awbotSectionLink,
            footer: Text(l10n.awbotSiteHint),
            children: [
              SettingsTile(
                icon: AppIcons.cloud,
                title: l10n.awbotSiteAddress,
                value: Text(
                  state.baseUrl.isEmpty ? l10n.commonNotSet : (Uri.tryParse(state.baseUrl)?.host ?? state.baseUrl),
                  style: state.baseUrl.isEmpty ? TextStyle(color: colors.textTertiary) : null,
                ),
                onTap: () => unawaited(_editSite(context, ref)),
              ),
              if (!state.hasDeviceToken)
                SettingsTile(
                  icon: AppIcons.qrCode,
                  title: l10n.awbotPairAction,
                  onTap: () => unawaited(_openPair(context)),
                ),
              if (state.desktopHost.isNotEmpty)
                SettingsTile(
                  icon: AppIcons.computer,
                  title: l10n.awbotDesktopHost,
                  value: Text(state.desktopHost),
                  chevron: false,
                ),
            ],
          ),
          if (state.hasDeviceToken)
            SettingsSection(
              title: l10n.awbotSectionDevice,
              children: [
                SettingsSwitchTile(
                  icon: AppIcons.power,
                  title: l10n.awbotAllowWake,
                  subtitle: l10n.awbotAllowWakeHint,
                  value: state.allowWake,
                  onChanged: (allowed) => unawaited(ref.read(awbotProvider.notifier).setAllowWake(allowed)),
                ),
                SettingsTile(
                  icon: AppIcons.model,
                  title: l10n.awbotModelSync,
                  value: Text(switch (modelError) {
                    final error? => l10n.awbotModelSyncError(error),
                    null => state.modelSynced ? l10n.awbotModelSynced : l10n.awbotModelNotSynced,
                  }),
                  chevron: false,
                ),
                SettingsTile(
                  icon: AppIcons.logout,
                  danger: true,
                  title: l10n.awbotUnbind,
                  onTap: () => unawaited(_confirmUnbind(context, ref)),
                ),
              ],
            ),
          if (state.link.runningTitle.isNotEmpty || state.link.queued > 0 || reports.isNotEmpty || state.hasDeviceToken)
            SettingsSection(
              title: l10n.awbotSectionCommands,
              children: [
                if (state.link.runningTitle.isNotEmpty)
                  SettingsTile(
                    icon: AppIcons.running,
                    title: l10n.awbotRunning(state.link.runningTitle),
                    chevron: false,
                  ),
                if (state.link.queued > 0)
                  SettingsTile(icon: AppIcons.queued, title: l10n.awbotQueued(state.link.queued), chevron: false),
                if (reports.isEmpty && state.link.runningTitle.isEmpty)
                  SettingsTile(title: l10n.awbotCommandsEmpty, chevron: false)
                else
                  for (final report in reports)
                    SettingsTile(
                      icon: switch (report.status) {
                        'done' => AppIcons.completed,
                        'canceled' => AppIcons.stopped,
                        _ => AppIcons.failed,
                      },
                      title: switch (report.status) {
                        'done' => l10n.commonCompleted,
                        'canceled' => l10n.commonCancelled,
                        _ => l10n.commonFailed,
                      },
                      subtitle: report.detail.isEmpty ? null : report.detail,
                      chevron: false,
                    ),
              ],
            ),
        ],
      ],
    );
  }

  static ({String label, String hint, Color color}) _status(AWBotUiState state, L10n l10n, DshColors colors) =>
      switch (state.link.status) {
        _ when !state.hasDeviceToken => (
          label: l10n.awbotStatusUnpaired,
          hint: l10n.awbotStatusUnpairedHint,
          color: colors.textTertiary,
        ),
        AWBotLinkStatus.starting => (
          label: l10n.awbotStatusStarting,
          hint: l10n.awbotStatusOnlineHint,
          color: colors.warning,
        ),
        AWBotLinkStatus.online => (
          label: l10n.awbotStatusOnline,
          hint: l10n.awbotStatusOnlineHint,
          color: colors.success,
        ),
        AWBotLinkStatus.retrying => (
          label: l10n.awbotStatusRetrying,
          hint: l10n.awbotStatusOnlineHint,
          color: colors.warning,
        ),
        AWBotLinkStatus.stopped => (
          label: l10n.awbotStatusStopped,
          hint: l10n.awbotStatusOnlineHint,
          color: colors.textTertiary,
        ),
        AWBotLinkStatus.unpaired => (
          label: l10n.awbotStatusUnpaired,
          hint: l10n.awbotStatusUnpairedHint,
          color: colors.textTertiary,
        ),
      };

  static Future<void> _openPair(BuildContext context) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AWBotPairPage()));

  static Future<void> _editSite(BuildContext context, WidgetRef ref) async {
    final saved = await showAppSheet<String>(
      context,
      isScrollControlled: true,
      dismissal: SheetDismissal.button,
      builder: (_) => _SiteSheet(initial: ref.read(awbotProvider).baseUrl),
    );
    if (saved == null || !context.mounted) return;
    final l10n = context.l10n;
    try {
      await ref.read(awbotProvider.notifier).setBaseUrl(saved);
      if (context.mounted) showBriefNotice(context, l10n.commonSaved);
    } on Object catch (error) {
      if (context.mounted) showBriefNotice(context, _describe(error));
    }
  }

  static Future<void> _confirmUnbind(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final ok = await showAppDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(l10n.awbotUnbindTitle),
        content: Text(l10n.awbotUnbindBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog, false), child: Text(l10n.commonCancel)),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: DshColors.of(dialog).danger,
              foregroundColor: DshColors.of(dialog).onDanger,
            ),
            onPressed: () => Navigator.pop(dialog, true),
            child: Text(l10n.awbotUnbind),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    await ref.read(awbotProvider.notifier).unbind();
    if (context.mounted) showBriefNotice(context, l10n.awbotUnbound);
  }
}

/// The message the person can act on, not the exception's type name.
String _describe(Object error) => error is AWBotApiException ? error.message : '$error';

/// 站点地址: one line, checked before it replaces what already works.
class _SiteSheet extends StatefulWidget {
  const _SiteSheet({required this.initial});

  final String initial;

  @override
  State<_SiteSheet> createState() => _SiteSheetState();
}

class _SiteSheetState extends State<_SiteSheet> {
  late final _url = TextEditingController(text: widget.initial);
  String? _error;

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  void _save() {
    final raw = _url.text.trim();
    try {
      normalizeBaseUrl(raw);
    } on ArgumentError catch (error) {
      setState(() => _error = '${error.message}');
      return;
    }
    Navigator.of(context).pop(raw);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = DshColors.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SheetTitleBar(l10n.awbotSiteDialogTitle),
            Padding(
              padding: const EdgeInsets.fromLTRB(SheetTitleBar.inset, 0, SheetTitleBar.inset, 8),
              child: TextField(
                controller: _url,
                autofocus: true,
                keyboardType: TextInputType.url,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _save(),
                decoration: InputDecoration(hintText: l10n.awbotSiteDialogHint, errorText: _error),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(SheetTitleBar.inset, 4, SheetTitleBar.inset, 0),
              child: Text(l10n.awbotSiteHint, style: TextStyle(color: colors.textTertiary)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(SheetTitleBar.inset, 12, SheetTitleBar.inset, 16),
              child: FilledButton(onPressed: _save, child: Text(l10n.commonSave)),
            ),
          ],
        ),
      ),
    );
  }
}
