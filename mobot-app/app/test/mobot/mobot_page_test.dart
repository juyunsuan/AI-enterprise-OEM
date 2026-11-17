import 'package:dsh_app/l10n/l10n.dart';
import 'package:dsh_app/mobot/mobot_state.dart';
import 'package:dsh_app/ui/mobot/mobot_page.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobot_link/mobot_link.dart';

import '../chat/support/harness.dart';

/// The page over a settled state: boot would read the keystore, which a widget
/// test has no channel for, and the states are what this test is about.
class _Settled extends MobotController {
  _Settled(this._settled);

  final MobotUiState _settled;

  @override
  MobotUiState build() => _settled;
}

Future<void> _pump(WidgetTester tester, MobotUiState state) async {
  usePhoneView(tester);
  await tester.pumpWidget(testApp(const MobotPage(), overrides: [mobotProvider.overrideWith(() => _Settled(state))]));
  await pumpFrames(tester);
}

void main() {
  testWidgets('未配对：说清怎么连，并给出配对入口', (tester) async {
    await _pump(tester, const MobotUiState(ready: true));
    expect(find.text(appL10n.mobotStatusUnpaired), findsWidgets);
    expect(find.text(appL10n.mobotSiteAddress), findsOneWidget);
    expect(find.text(appL10n.commonNotSet), findsOneWidget);
    expect(find.text(appL10n.mobotNotSignedIn), findsOneWidget);
    expect(find.text(appL10n.mobotPairAction), findsOneWidget);
  });

  testWidgets('已连接：在线、账号、平台模型与断开连接都在', (tester) async {
    await _pump(
      tester,
      const MobotUiState(
        ready: true,
        baseUrl: 'https://mobot.example.com',
        signedIn: true,
        hasDeviceToken: true,
        profile: PlatformProfile(
          username: 'acme',
          role: 'admin',
          siteName: '示例站',
          pointsBalance: 88,
          mustChangePassword: false,
        ),
        link: MobotLinkState(status: MobotLinkStatus.online, pointsBalance: 88),
      ),
    );
    expect(find.text(appL10n.mobotStatusOnline), findsOneWidget);
    expect(find.text('88'), findsOneWidget);
    expect(find.text(appL10n.mobotModelNotSynced), findsOneWidget);
    expect(find.text(appL10n.mobotAllowWake), findsOneWidget);
    expect(find.text(appL10n.mobotUnbind), findsOneWidget);
    expect(find.text(appL10n.mobotCommandsEmpty), findsOneWidget);
    expect(find.text(appL10n.mobotPairAction), findsNothing);
  });
}
