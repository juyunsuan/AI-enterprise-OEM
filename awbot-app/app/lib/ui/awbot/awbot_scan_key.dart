import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../common/brief_notice.dart';
import '../shell/page_frame.dart';
import '../theme/app_icons.dart';
import '../theme/theme.dart';
import 'awbot_scan_page.dart';

/// 抽屉顶栏的扫码键：扫平台码或 AWBotDSH 码完成配对。
class AWBotScanKey extends ConsumerWidget {
  const AWBotScanKey({super.key, this.size = 36, this.tier = GlassTier.pill});

  final double size;
  final GlassTier tier;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GlassIconButton(
      key: const ValueKey('awbot-scan-key'),
      icon: AppIcons.qrCode,
      tooltip: context.l10n.awbotScanPair,
      size: size,
      tier: tier,
      onPressed: () async {
        final paired = await Navigator.of(context).push(AWBotScanPage.route());
        if (paired == true && context.mounted) {
          showBriefNotice(context, context.l10n.awbotPaired);
        }
      },
    );
  }
}
