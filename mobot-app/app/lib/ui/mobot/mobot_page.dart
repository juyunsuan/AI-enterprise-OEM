import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobot_link/mobot_link.dart';

import '../../l10n/l10n.dart';
import '../../mobot/mobot_state.dart';
import '../common/app_dialog.dart';
import '../common/app_sheet.dart';
import '../common/brief_notice.dart';
import '../common/overview_card.dart';
import '../common/sheet_title_bar.dart';
import '../settings/settings_widgets.dart';
import '../shell/page_frame.dart';
import '../theme/app_icons.dart';
import '../theme/theme.dart';
import 'mobot_pair_page.dart';

/// Mobot 手机: this phone's link to the platform — the site, the account, the
/// pairing and what the link is doing.
///
/// Nothing on this page is answered for the person: the pairing code is typed on
/// the platform, and an approval a command runs into still waits on this screen.
class MobotPage extends ConsumerWidget {
  const MobotPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final state = ref.watch(mobotProvider);
    final colors = DshColors.of(context);
    final status = _status(state, l10n, colors);
    final profile = state.profile;
    final reports = state.link.reports;
    final modelError = ref.read(mobotProvider.notifier).modelError;
    return AppPage.list(
      title: l10n.mobotTitle,
      subtitle: Text(l10n.mobotSubtitle),
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
                    onChanged: (linked) => unawaited(ref.read(mobotProvider.notifier).setLinked(linked)),
                  )
                : null,
          ),
          SettingsSection(
            title: l10n.mobotSectionLink,
            footer: Text(l10n.mobotSiteHint),
            children: [
              SettingsTile(
                icon: AppIcons.cloud,
                title: l10n.mobotSiteAddress,
                value: Text(
                  state.baseUrl.isEmpty ? l10n.commonNotSet : (Uri.tryParse(state.baseUrl)?.host ?? state.baseUrl),
                  style: state.baseUrl.isEmpty ? TextStyle(color: colors.textTertiary) : null,
                ),
                onTap: () => unawaited(_editSite(context, ref)),
              ),
              SettingsTile(
                icon: AppIcons.account,
                title: l10n.mobotAccount,
                value: Text(
                  state.signedIn && profile.username.isNotEmpty
                      ? '${profile.username}${profile.siteName.isNotEmpty ? ' · ${profile.siteName}' : ''}'
                      : state.signedIn
                      ? l10n.commonSignedIn
                      : l10n.mobotNotSignedIn,
                  style: state.signedIn ? null : TextStyle(color: colors.textTertiary),
                ),
                onTap: state.baseUrl.isEmpty
                    ? null
                    : () => unawaited(state.signedIn ? _accountSheet(context, ref) : _openPair(context)),
              ),
              if (state.signedIn)
                SettingsTile(
                  icon: AppIcons.balance,
                  title: l10n.mobotPoints,
                  value: Text('${profile.pointsBalance}'),
                  chevron: false,
                ),
              if (!state.hasDeviceToken)
                SettingsTile(
                  icon: AppIcons.qrCode,
                  title: l10n.mobotPairAction,
                  onTap: state.baseUrl.isEmpty ? null : () => unawaited(_openPair(context)),
                ),
            ],
          ),
          if (state.hasDeviceToken)
            SettingsSection(
              title: l10n.mobotSectionDevice,
              children: [
                SettingsSwitchTile(
                  icon: AppIcons.power,
                  title: l10n.mobotAllowWake,
                  subtitle: l10n.mobotAllowWakeHint,
                  value: state.allowWake,
                  onChanged: (allowed) => unawaited(ref.read(mobotProvider.notifier).setAllowWake(allowed)),
                ),
                SettingsTile(
                  icon: AppIcons.model,
                  title: l10n.mobotModelSync,
                  value: Text(switch (modelError) {
                    final error? => l10n.mobotModelSyncError(error),
                    null => state.modelSynced ? l10n.mobotModelSynced : l10n.mobotModelNotSynced,
                  }),
                  chevron: false,
                ),
                SettingsTile(
                  icon: AppIcons.logout,
                  danger: true,
                  title: l10n.mobotUnbind,
                  onTap: () => unawaited(_confirmUnbind(context, ref)),
                ),
              ],
            ),
          if (state.link.runningTitle.isNotEmpty || state.link.queued > 0 || reports.isNotEmpty || state.hasDeviceToken)
            SettingsSection(
              title: l10n.mobotSectionCommands,
              children: [
                if (state.link.runningTitle.isNotEmpty)
                  SettingsTile(
                    icon: AppIcons.running,
                    title: l10n.mobotRunning(state.link.runningTitle),
                    chevron: false,
                  ),
                if (state.link.queued > 0)
                  SettingsTile(icon: AppIcons.queued, title: l10n.mobotQueued(state.link.queued), chevron: false),
                if (reports.isEmpty && state.link.runningTitle.isEmpty)
                  SettingsTile(title: l10n.mobotCommandsEmpty, chevron: false)
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

  static ({String label, String hint, Color color}) _status(MobotUiState state, L10n l10n, DshColors colors) =>
      switch (state.link.status) {
        _ when !state.hasDeviceToken => (
          label: l10n.mobotStatusUnpaired,
          hint: l10n.mobotStatusUnpairedHint,
          color: colors.textTertiary,
        ),
        MobotLinkStatus.starting => (
          label: l10n.mobotStatusStarting,
          hint: l10n.mobotStatusOnlineHint,
          color: colors.warning,
        ),
        MobotLinkStatus.online => (
          label: l10n.mobotStatusOnline,
          hint: l10n.mobotStatusOnlineHint,
          color: colors.success,
        ),
        MobotLinkStatus.retrying => (
          label: l10n.mobotStatusRetrying,
          hint: l10n.mobotStatusOnlineHint,
          color: colors.warning,
        ),
        MobotLinkStatus.stopped => (
          label: l10n.mobotStatusStopped,
          hint: l10n.mobotStatusOnlineHint,
          color: colors.textTertiary,
        ),
        MobotLinkStatus.unpaired => (
          label: l10n.mobotStatusUnpaired,
          hint: l10n.mobotStatusUnpairedHint,
          color: colors.textTertiary,
        ),
      };

  static Future<void> _openPair(BuildContext context) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const MobotPairPage()));

  static Future<void> _editSite(BuildContext context, WidgetRef ref) async {
    final saved = await showAppSheet<String>(
      context,
      isScrollControlled: true,
      dismissal: SheetDismissal.button,
      builder: (_) => _SiteSheet(initial: ref.read(mobotProvider).baseUrl),
    );
    if (saved == null || !context.mounted) return;
    final l10n = context.l10n;
    try {
      await ref.read(mobotProvider.notifier).setBaseUrl(saved);
      if (context.mounted) showBriefNotice(context, l10n.commonSaved);
    } on Object catch (error) {
      if (context.mounted) showBriefNotice(context, _describe(error));
    }
  }

  static Future<void> _accountSheet(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final signOut = await showAppSheet<bool>(
      context,
      builder: (sheet) => SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SheetHeader(l10n.mobotAccount),
            SheetGroup(
              margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              children: [
                SettingsTile(
                  icon: AppIcons.logout,
                  danger: true,
                  title: l10n.commonSignOut,
                  chevron: false,
                  onTap: () => Navigator.pop(sheet, true),
                ),
              ],
            ),
          ],
        ),
      ),
    );
    if (signOut != true || !context.mounted) return;
    // The device binding stays: the desktop client keeps working after sign-out too.
    await ref.read(mobotProvider.notifier).signOut();
    if (context.mounted) showBriefNotice(context, l10n.mobotSignedOut);
  }

  static Future<void> _confirmUnbind(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final ok = await showAppDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(l10n.mobotUnbindTitle),
        content: Text(l10n.mobotUnbindBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog, false), child: Text(l10n.commonCancel)),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: DshColors.of(dialog).danger,
              foregroundColor: DshColors.of(dialog).onDanger,
            ),
            onPressed: () => Navigator.pop(dialog, true),
            child: Text(l10n.mobotUnbind),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    await ref.read(mobotProvider.notifier).unbind();
    if (context.mounted) showBriefNotice(context, l10n.mobotUnbound);
  }
}

/// The message the person can act on, not the exception's type name.
String _describe(Object error) => error is MobotApiException ? error.message : '$error';

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
            SheetTitleBar(l10n.mobotSiteDialogTitle),
            Padding(
              padding: const EdgeInsets.fromLTRB(SheetTitleBar.inset, 0, SheetTitleBar.inset, 8),
              child: TextField(
                controller: _url,
                autofocus: true,
                keyboardType: TextInputType.url,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _save(),
                decoration: InputDecoration(hintText: l10n.mobotSiteDialogHint, errorText: _error),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(SheetTitleBar.inset, 4, SheetTitleBar.inset, 0),
              child: Text(l10n.mobotSiteHint, style: TextStyle(color: colors.textTertiary)),
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
