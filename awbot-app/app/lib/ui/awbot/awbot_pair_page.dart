import 'dart:async';

import 'package:awbot_link/awbot_link.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../../awbot/awbot_state.dart';
import '../common/brief_notice.dart';
import '../shell/page_frame.dart';
import '../theme/theme.dart';
import 'awbot_scan_page.dart';

/// 配对：平台出码、手机扫码，不需要登录平台账号。
///
/// 平台码只绑平台；AWBotDSH 的组合码会同时绑平台与那台主机。
/// 扫不了码时可以手输平台上的配对码。
class AWBotPairPage extends ConsumerStatefulWidget {
  const AWBotPairPage({super.key});

  @override
  ConsumerState<AWBotPairPage> createState() => _AWBotPairPageState();
}

class _AWBotPairPageState extends ConsumerState<AWBotPairPage> {
  final _site = TextEditingController();
  final _code = TextEditingController();
  bool _manual = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _site.text = ref.read(awbotProvider).baseUrl;
  }

  @override
  void dispose() {
    _site.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _scan() async {
    final paired = await Navigator.of(context).push(AWBotScanPage.route());
    if (paired == true && mounted) {
      showBriefNotice(context, context.l10n.awbotPaired);
      Navigator.of(context).maybePop();
    }
  }

  Future<void> _pairManual() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(awbotProvider.notifier).pairWithCode(_site.text.trim(), _code.text.trim());
      if (!mounted) return;
      showBriefNotice(context, context.l10n.awbotPaired);
      Navigator.of(context).maybePop();
    } on Object catch (error) {
      if (mounted) setState(() => _error = _describe(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(awbotProvider);
    final colors = DshColors.of(context);
    return AppPage.list(
      title: l10n.awbotTitle,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          child: state.hasDeviceToken
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(l10n.awbotPaired, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 16),
                    FilledButton(onPressed: () => Navigator.of(context).maybePop(), child: Text(l10n.commonBack)),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(l10n.awbotScanPairHint, style: Theme.of(context).textTheme.bodyMedium),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _busy ? null : () => unawaited(_scan()),
                      icon: const Icon(Icons.qr_code_scanner, size: 20),
                      label: Text(l10n.awbotScanPair),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy ? null : () => setState(() => _manual = !_manual),
                      child: Text(_manual ? l10n.awbotScanPair : l10n.awbotManualPair),
                    ),
                    if (_manual) ...[
                      const SizedBox(height: 8),
                      Text(l10n.awbotSiteAddress, style: Theme.of(context).textTheme.bodyMedium),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _site,
                        keyboardType: TextInputType.url,
                        decoration: InputDecoration(hintText: l10n.awbotSiteDialogHint),
                      ),
                      const SizedBox(height: 12),
                      Text(l10n.awbotPairCode, style: Theme.of(context).textTheme.bodyMedium),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _code,
                        textCapitalization: TextCapitalization.characters,
                        decoration: InputDecoration(hintText: 'QRXXXXXXXXXX'),
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _busy ? null : () => unawaited(_pairManual()),
                        child: Text(_busy ? l10n.commonInProgress : l10n.awbotPairSubmit),
                      ),
                    ],
                    if (_error case final error?) ...[
                      const SizedBox(height: 12),
                      Text(error, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colors.danger)),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

String _describe(Object error) => error is AWBotApiException ? error.message : '$error';
