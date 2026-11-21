import 'package:dsh_app/l10n/l10n.dart';
import 'package:dsh_app/awbot/awbot_state.dart';
import 'package:dsh_app/ui/awbot/awbot_page.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:awbot_link/awbot_link.dart';

import '../chat/support/harness.dart';

/// The page over a settled state: boot would read the keystore, which a widget
/// test has no channel for, and the states are what this test is about.
class _Settled extends AWBotController {
  _Settled(this._settled);

  final AWBotUiState _settled;

  @override
  AWBotUiState build() => _settled;
}

Future<void> _pump(WidgetTester tester, AWBotUiState state) async {
  usePhoneView(tester);
  await tester.pumpWidget(testApp(const AWBotPage(), overrides: [awbotProvider.overrideWith(() => _Settled(state))]));
  await pumpFrames(tester);
}

void main() {
  testWidgets('未配对：说清怎么连，并给出配对入口', (tester) async {
    await _pump(tester, const AWBotUiState(ready: true));
    expect(find.text(appL10n.awbotStatusUnpaired), findsWidgets);
    expect(find.text(appL10n.awbotSiteAddress), findsOneWidget);
    expect(find.text(appL10n.commonNotSet), findsOneWidget);
    expect(find.text(appL10n.awbotPairAction), findsOneWidget);
  });

  testWidgets('已连接：在线、平台模型与断开连接都在', (tester) async {
    await _pump(
      tester,
      const AWBotUiState(
        ready: true,
        baseUrl: 'https://awbot.example.com',
        hasDeviceToken: true,
        link: AWBotLinkState(status: AWBotLinkStatus.online, pointsBalance: 88),
      ),
    );
    expect(find.text(appL10n.awbotStatusOnline), findsOneWidget);
    expect(find.text(appL10n.awbotModelNotSynced), findsOneWidget);
    expect(find.text(appL10n.awbotAllowWake), findsOneWidget);
    expect(find.text(appL10n.awbotUnbind), findsOneWidget);
    expect(find.text(appL10n.awbotCommandsEmpty), findsOneWidget);
    expect(find.text(appL10n.awbotPairAction), findsNothing);
  });
}
