import 'package:dsh_app/state/settings_state.dart';
import 'package:dsh_app/ui/chat/chat_screen.dart';
import 'package:dsh_app/ui/social/social_hub.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../chat/support/harness.dart';

Widget _host(AppSettings settings) => testApp(
  Builder(
    builder: (context) => Scaffold(
      body: Center(
        child: ElevatedButton(onPressed: () => showSocialHub(context), child: const Text('open')),
      ),
    ),
  ),
  overrides: [settingsProvider.overrideWith(() => TestSettings(settings))],
);

Future<void> _open(WidgetTester tester, AppSettings settings) async {
  await tester.pumpWidget(_host(settings));
  await tester.tap(find.text('open'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

void main() {
  testWidgets('asks for the AIPDD key before showing the social menu', (tester) async {
    await _open(tester, const AppSettings(loaded: true));
    expect(find.text('输入 AIPDD API Key'), findsOneWidget);
    expect(find.text('打开聊天'), findsNothing);

    await tester.enterText(find.byKey(const ValueKey('social-key-field')), 'sk-social-test-key');
    await tester.tap(find.byKey(const ValueKey('social-key-save')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('打开聊天'), findsOneWidget);
    expect(find.text('我的分身'), findsOneWidget);
    expect(find.text('发现人脉'), findsOneWidget);
    expect(find.text('小组'), findsOneWidget);
  });

  testWidgets('an existing AIPDD key goes straight to the social menu', (tester) async {
    await _open(tester, const AppSettings(loaded: true, apiKey: 'sk-social-test-key'));

    expect(find.byKey(const ValueKey('social-key-field')), findsNothing);
    expect(find.text('打开聊天'), findsOneWidget);
    expect(find.text('AIworkin 社交'), findsOneWidget);
  });

  testWidgets('the header social entry is on by default', (tester) async {
    usePhoneView(tester);
    final harness = ChatHarness(connected: false);
    await tester.pumpWidget(testApp(const ChatScreen(), overrides: harness.overrides));
    await pumpFrames(tester, 8);

    expect(find.byKey(const ValueKey('social-header')), findsOneWidget);
  });

  testWidgets('turning AI social off hides the header entry', (tester) async {
    usePhoneView(tester);
    final harness = ChatHarness(
      connected: false,
      settings: const AppSettings(loaded: true, apiKey: 'sk-social-test-key', socialEnabled: false),
    );
    await tester.pumpWidget(testApp(const ChatScreen(), overrides: harness.overrides));
    await pumpFrames(tester, 8);

    expect(find.byKey(const ValueKey('social-header')), findsNothing);
    expect(find.byType(SocialHeaderButton), findsNothing);
  });
}
