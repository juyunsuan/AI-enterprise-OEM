import 'package:dsh_app/l10n/l10n.dart';
import 'package:dsh_app/state/star_prompt.dart';
import 'package:dsh_app/state/update_state.dart';
import 'package:dsh_app/ui/settings/about_page.dart';
import 'package:dsh_app/ui/settings/settings_widgets.dart';
import 'package:dsh_app/ui/theme/theme.dart';
import 'package:dsh_app/update/version.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/test_fonts.dart';

class _FixedUpdate extends AppUpdateController {
  @override
  AppUpdateState build() => const AppUpdateState(current: AppVersion(1, 0, 2, build: 42));
}

class _StarStore implements StarPromptStore {
  final writes = <StarPromptRecord>[];

  @override
  Future<StarPromptRecord?> read() async => const StarPromptRecord();

  @override
  Future<void> write(StarPromptRecord record) async => writes.add(record);
}

const _repoUrl = 'https://github.com/liujh0729-jpg/AI-enterprise-OEM';

void main() {
  late List<Uri> opened;
  late _StarStore store;
  late Future<bool> Function(Uri) opener;

  setUp(() {
    opened = [];
    store = _StarStore();
    opener = (uri) async {
      opened.add(uri);
      return true;
    };
  });

  tearDown(() => AppLocale.use(AppLocale.zhCN));

  Future<void> pump(
    WidgetTester tester, {
    Locale locale = AppLocale.zhCN,
    Brightness brightness = Brightness.light,
    double scale = 1,
  }) async {
    AppLocale.use(locale);
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 800);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appUpdateProvider.overrideWith(_FixedUpdate.new),
          starLinkOpenerProvider.overrideWithValue((uri) => opener(uri)),
          starPromptStoreProvider.overrideWithValue(store),
          starPromptGateProvider.overrideWithValue(false),
        ],
        child: MaterialApp(
          theme: withTestFonts(buildLightTheme()),
          darkTheme: withTestFonts(buildDarkTheme()),
          themeMode: brightness == Brightness.dark ? ThemeMode.dark : ThemeMode.light,
          locale: locale,
          supportedLocales: AppLocale.supported,
          localizationsDelegates: L10n.localizationsDelegates,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: const AboutPage(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, String key) async {
    final row = find.byKey(ValueKey(key));
    await tester.ensureVisible(row);
    await tester.pumpAndSettle();
    await tester.tap(row);
    await tester.pumpAndSettle();
  }

  for (final locale in AppLocale.supported) {
    for (final brightness in Brightness.values) {
      testWidgets('about fits 360dp at 1.3x without the original author in $locale $brightness', (tester) async {
        await pump(tester, locale: locale, brightness: brightness, scale: 1.3);
        final english = locale == AppLocale.en;
        expect(find.text(english ? 'Original author of DSH Go' : 'DSH Go 原作者'), findsNothing);
        expect(find.text('ccch1mneyyy'), findsNothing);
        expect(find.text('1.0.2 (42)'), findsOneWidget);
        expect(find.byKey(const ValueKey('settings-star')), findsOneWidget);
        expect(find.text(english ? 'Bilibili profile' : 'B站主页'), findsNothing);

        final star = find.byKey(const ValueKey('settings-star'));
        await tester.ensureVisible(star);
        await tester.pumpAndSettle();
        expect(tester.widget<SettingsTile>(star).onTap, isNotNull);
        expect(tester.takeException(), isNull, reason: 'No overflow around the star row');
        final disclaimer = find.text(
          english ? 'Built on DeepSeek Harness · Unofficial DeepSeek app' : '基于 DeepSeek Harness 构建 · 非 DeepSeek 官方应用',
        );
        await tester.ensureVisible(disclaimer);
        await tester.pumpAndSettle();
        expect(disclaimer.hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('the star row opens this repository and finishes the prompt', (tester) async {
    await pump(tester);
    await tap(tester, 'settings-star');
    expect(opened.map((uri) => uri.toString()), [_repoUrl]);
    expect(store.writes.last.finished, isTrue);
  });

  testWidgets('no browser copies the repository URL and reports it', (tester) async {
    String? clipboard;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') clipboard = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    opener = (_) async => false;
    await pump(tester);
    await tap(tester, 'settings-star');
    expect(clipboard, _repoUrl);
    expect(find.text('没能打开浏览器，网址已复制'), findsOneWidget);
  });

  testWidgets('browser and clipboard exceptions report failure without claiming a copy', (tester) async {
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') throw PlatformException(code: 'no-clipboard');
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    opener = (_) async => throw PlatformException(code: 'no-browser');
    await pump(tester, locale: AppLocale.en);
    await tap(tester, 'settings-star');
    expect(find.text(lookupL10n(AppLocale.en).stateBrowserOpenFailed), findsOneWidget);
    expect(find.text(lookupL10n(AppLocale.en).shellBrowserUrlCopied), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
