import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobot_link/mobot_link.dart';

import '../../l10n/l10n.dart';
import '../../mobot/mobot_state.dart';
import '../common/brief_notice.dart';
import '../shell/page_frame.dart';
import '../theme/theme.dart';

/// 配对: the platform account, then the 6-digit code, then the platform claims it.
///
/// The code is only ever held in this page's memory (it dies in ten minutes), and
/// the password only long enough to sign in: neither is written down anywhere.
class MobotPairPage extends ConsumerStatefulWidget {
  const MobotPairPage({super.key});

  @override
  ConsumerState<MobotPairPage> createState() => _MobotPairPageState();
}

class _MobotPairPageState extends ConsumerState<MobotPairPage> {
  final _site = TextEditingController();
  final _user = TextEditingController();
  final _password = TextEditingController();
  Timer? _poll;
  bool _polling = false;
  bool _busy = false;
  String? _code;
  String? _error;

  @override
  void initState() {
    super.initState();
    _site.text = ref.read(mobotProvider).baseUrl;
  }

  @override
  void dispose() {
    _poll?.cancel();
    _site.dispose();
    _user.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _saveSite() async {
    setState(() => _error = null);
    try {
      await ref.read(mobotProvider.notifier).setBaseUrl(_site.text);
    } on ArgumentError catch (error) {
      if (mounted) setState(() => _error = '${error.message}');
    }
  }

  Future<void> _signIn() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(mobotProvider.notifier).signIn(_user.text.trim(), _password.text);
      _password.clear();
      if (mounted) showBriefNotice(context, context.l10n.mobotSignedInNotice);
    } on Object catch (error) {
      if (mounted) setState(() => _error = _describe(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _requestCode() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final code = await ref.read(mobotProvider.notifier).requestCode();
      if (!mounted) return;
      if (code.isEmpty) {
        setState(() => _error = context.l10n.commonFailedTryAgain);
        return;
      }
      setState(() => _code = code);
      _watch(code);
    } on Object catch (error) {
      if (mounted) setState(() => _error = _describe(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _watch(String code) {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 2), (_) => unawaited(_tick(code)));
  }

  Future<void> _tick(String code) async {
    if (_polling) return;
    _polling = true;
    try {
      final paired = await ref.read(mobotProvider.notifier).pollPair(code);
      if (!mounted) return;
      if (paired) {
        _poll?.cancel();
        showBriefNotice(context, context.l10n.mobotPaired);
        Navigator.of(context).maybePop();
      }
    } on MobotApiException catch (error) {
      // A refusal (expired code, someone else's account) will not change by asking
      // again; a timeout or a 5xx may, so only the first stops the loop.
      if (!mounted || error.status < 400 || error.status >= 500) return;
      _poll?.cancel();
      setState(() {
        _code = null;
        _error = error.message;
      });
    } on Object {
      // Offline for a moment: the next tick asks again.
    } finally {
      _polling = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(mobotProvider);
    final colors = DshColors.of(context);
    return AppPage.list(
      title: l10n.mobotTitle,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (state.baseUrl.isEmpty)
                ..._siteForm(l10n)
              else if (!state.signedIn)
                ..._signInForm(l10n)
              else if (!state.hasDeviceToken)
                ..._codeView(l10n, colors)
              else ...[
                Text(l10n.mobotPaired, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => Navigator.of(context).maybePop(), child: Text(l10n.commonBack)),
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

  List<Widget> _siteForm(L10n l10n) => [
    Text(l10n.mobotSiteAddress, style: Theme.of(context).textTheme.bodyMedium),
    const SizedBox(height: 8),
    TextField(
      controller: _site,
      autofocus: true,
      keyboardType: TextInputType.url,
      textInputAction: TextInputAction.done,
      onSubmitted: (_) => _saveSite(),
      decoration: InputDecoration(hintText: l10n.mobotSiteDialogHint),
    ),
    const SizedBox(height: 16),
    FilledButton(onPressed: _saveSite, child: Text(l10n.commonSave)),
  ];

  List<Widget> _signInForm(L10n l10n) => [
    Text(l10n.mobotSignInFirst, style: Theme.of(context).textTheme.bodyMedium),
    const SizedBox(height: 16),
    TextField(
      controller: _user,
      autofocus: true,
      textInputAction: TextInputAction.next,
      decoration: InputDecoration(labelText: l10n.mobotUsername),
    ),
    const SizedBox(height: 12),
    TextField(
      controller: _password,
      obscureText: true,
      textInputAction: TextInputAction.done,
      onSubmitted: (_) => _signIn(),
      decoration: InputDecoration(labelText: l10n.mobotPassword),
    ),
    const SizedBox(height: 16),
    FilledButton(onPressed: _busy ? null : _signIn, child: Text(_busy ? l10n.commonInProgress : l10n.commonSignIn)),
  ];

  List<Widget> _codeView(L10n l10n, DshColors colors) => [
    if (_code case final code?) ...[
      Text(l10n.mobotCodeTitle, style: Theme.of(context).textTheme.bodyMedium),
      const SizedBox(height: 8),
      SelectableText(
        code,
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.displaySmall
            ?.copyWith(color: Theme.of(context).colorScheme.primary, letterSpacing: 8, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 12),
      Text(l10n.mobotCodeHint, textAlign: TextAlign.center),
      const SizedBox(height: 8),
      Text(
        '${l10n.mobotCodeExpires} · ${l10n.mobotCodeWaiting}',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colors.textTertiary),
      ),
      const SizedBox(height: 16),
      OutlinedButton(onPressed: _busy ? null : _requestCode, child: Text(l10n.mobotCodeNew)),
    ] else ...[
      Text(l10n.mobotCodeHint, textAlign: TextAlign.center),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: _busy ? null : _requestCode,
        child: Text(_busy ? l10n.commonInProgress : l10n.mobotCodeRequest),
      ),
    ],
  ];
}

String _describe(Object error) => error is MobotApiException ? error.message : '$error';
