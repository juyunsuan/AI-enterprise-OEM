import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../l10n/l10n.dart';
import '../../awbot/awbot_state.dart';
import '../shell/page_frame.dart';
import '../theme/app_icons.dart';
import '../theme/theme.dart';

/// 扫平台码或 AWBotDSH 组合码：识别后直接完成平台配对，不需要登录。
class AWBotScanPage extends ConsumerStatefulWidget {
  const AWBotScanPage({super.key});

  static Route<bool> route() => MaterialPageRoute<bool>(builder: (_) => const AWBotScanPage());

  @override
  ConsumerState<AWBotScanPage> createState() => _AWBotScanPageState();
}

class _AWBotScanPageState extends ConsumerState<AWBotScanPage> {
  final _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _busy = false;
  bool _reported = false;
  String? _error;
  late final Future<void> _initialization;

  @override
  void initState() {
    super.initState();
    // Android 关闭了 ML Kit 的 eager provider，拍照与相册识别都要先初始化。
    _initialization = !kIsWeb && defaultTargetPlatform == TargetPlatform.android
        ? const MethodChannel('dsh/app').invokeMethod<void>('initializePairingScanner')
        : Future<void>.value();
  }

  @override
  void dispose() {
    unawaited(_controller.dispose());
    super.dispose();
  }

  Future<void> _take(String raw) async {
    if (_busy || _reported) return;
    _reported = true;
    setState(() {
      _busy = true;
      _error = null;
    });
    await _controller.stop();
    try {
      await ref.read(awbotProvider.notifier).pairFromScan(raw);
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _reported = false;
        _error = error is FormatException ? context.l10n.awbotScanInvalid : error is ArgumentError ? '${error.message}' : '$error';
      });
      await _controller.start();
    }
  }

  Future<void> _fromImage() async {
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.maybeOf(context);
    final XFile? picked;
    try {
      picked = await ImagePicker().pickImage(source: ImageSource.gallery, requestFullMetadata: false);
    } catch (_) {
      messenger?.showSnackBar(SnackBar(content: Text(l10n.awbotScanInvalid)));
      return;
    }
    if (picked == null || !mounted) return;
    BarcodeCapture? capture;
    try {
      await _initialization;
      capture = await _controller.analyzeImage(picked.path, formats: const [BarcodeFormat.qrCode]);
    } catch (_) {
      messenger?.showSnackBar(SnackBar(content: Text(l10n.awbotScanUnavailable)));
      return;
    }
    final code = capture?.barcodes.map((b) => b.rawValue ?? '').firstWhere((v) => v.isNotEmpty, orElse: () => '') ?? '';
    if (code.isEmpty) {
      messenger?.showSnackBar(SnackBar(content: Text(l10n.awbotScanInvalid)));
      return;
    }
    await _take(code);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = DshColors.of(context);
    return AppPage.list(
      title: l10n.awbotScanTitle,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Text(l10n.awbotScanHint, style: Theme.of(context).textTheme.bodyMedium),
        ),
        AspectRatio(
          aspectRatio: 1,
          child: ClipRRect(
            borderRadius: AppShape.radiusLg,
            child: FutureBuilder<void>(
              future: _initialization,
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return _Unavailable(message: l10n.awbotScanUnavailable);
                }
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                return MobileScanner(
                  controller: _controller,
                  onDetect: (capture) {
                    for (final code in capture.barcodes) {
                      final raw = code.rawValue;
                      if (raw != null && raw.isNotEmpty) {
                        unawaited(_take(raw));
                        return;
                      }
                    }
                  },
                  errorBuilder: (context, error) => _Unavailable(
                    message: error.errorCode == MobileScannerErrorCode.permissionDenied
                        ? l10n.awbotScanPermission
                        : l10n.awbotScanUnavailable,
                  ),
                );
              },
            ),
          ),
        ),
        if (_busy)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Row(
              children: [
                const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                const SizedBox(width: 12),
                Expanded(child: Text(l10n.awbotScanPairing)),
              ],
            ),
          ),
        if (_error case final error?)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Text(error, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colors.danger)),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: OutlinedButton.icon(
            onPressed: _busy ? null : () => unawaited(_fromImage()),
            icon: const Icon(AppIcons.files, size: 18),
            label: Text(l10n.awbotScanGallery),
          ),
        ),
      ],
    );
  }
}

class _Unavailable extends StatelessWidget {
  const _Unavailable({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Theme.of(context).colorScheme.surfaceContainerHighest,
    child: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(message, textAlign: TextAlign.center),
      ),
    ),
  );
}
