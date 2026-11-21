import 'package:dsh_app/state/ui_mode_state.dart';
import 'package:dsh_app/ui/web/web_target.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<UiModeState> _loaded(ProviderContainer c) async {
  c.read(uiModeProvider);
  for (var i = 0; i < 20 && !c.read(uiModeProvider).loaded; i++) {
    await Future<void>.delayed(Duration.zero);
  }
  return c.read(uiModeProvider);
}

void main() {
  test('a new install starts native', () async {
    SharedPreferences.setMockInitialValues({});
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect(c.read(uiModeProvider).loaded, isFalse);
    final state = await _loaded(c);
    expect(state.mode, UiMode.native);
    expect(state.web, isFalse);
  });

  test('网页模式已下线：set(web) 也保持原生', () async {
    SharedPreferences.setMockInitialValues({});
    final first = ProviderContainer();
    await _loaded(first);
    await first.read(uiModeProvider.notifier).set(UiMode.web);
    expect(first.read(uiModeProvider).mode, UiMode.native);
    expect((await SharedPreferences.getInstance()).getString(UiModeController.key), isNull);
  });

  test('旧版本存下的 web 不再生效', () async {
    SharedPreferences.setMockInitialValues({UiModeController.key: 'web'});
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect((await _loaded(c)).mode, UiMode.native);
  });

  test('an unknown stored value falls back to native', () async {
    SharedPreferences.setMockInitialValues({UiModeController.key: 'holo'});
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect((await _loaded(c)).mode, UiMode.native);
  });

  test('读取完成前请求网页模式也不生效', () async {
    SharedPreferences.setMockInitialValues({UiModeController.key: 'native'});
    final c = ProviderContainer();
    addTearDown(c.dispose);
    c.read(uiModeProvider);
    await c.read(uiModeProvider.notifier).set(UiMode.web);
    await Future<void>.delayed(Duration.zero);
    expect(c.read(uiModeProvider).mode, UiMode.native);
  });

  test('a web open request is taken once; a newer one stays', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final open = c.read(webOpenProvider.notifier);
    open.request(const DshWebTarget(sessionId: 'a'));
    final first = c.read(webOpenProvider)!;
    open.request(const DshWebTarget(newSession: true));
    open.taken(first);
    expect(c.read(webOpenProvider)!.target.newSession, isTrue);
    open.taken(c.read(webOpenProvider)!);
    expect(c.read(webOpenProvider), isNull);
  });
}
