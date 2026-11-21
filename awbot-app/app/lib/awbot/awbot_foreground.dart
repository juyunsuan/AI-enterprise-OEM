import 'dart:io';

import 'package:flutter/services.dart';

/// The link's persistent notification on Android (`AWBotLinkService`).
///
/// It shows 已连接 / 正在执行 and, more importantly, keeps this process — and with it
/// the Dart isolate running the heartbeat — alive while the app is in the background.
/// Other platforms have no equivalent here.
class AWBotForeground {
  const AWBotForeground();

  static const _channel = MethodChannel('dsh/app');

  bool get supported => Platform.isAndroid;

  Future<void> show({required String title, required String text}) async {
    if (!supported) return;
    try {
      await _channel.invokeMethod<void>('awbotForeground', {'on': true, 'title': title, 'text': text});
    } on PlatformException {
      // No notification only costs the keep-alive; the link itself keeps working.
    } on MissingPluginException {
      // Older builds of the shell have no handler.
    }
  }

  Future<void> hide() async {
    if (!supported) return;
    try {
      await _channel.invokeMethod<void>('awbotForeground', {'on': false});
    } on PlatformException {
      // Nothing left to take away.
    } on MissingPluginException {
      // As in [show].
    }
  }

  /// 省电与网络，for the heartbeat caps the platform's device card shows. Empty
  /// where the shell cannot answer.
  Future<Map<String, Object?>> deviceCaps() async {
    if (!supported) return const {};
    try {
      return await _channel.invokeMapMethod<String, Object?>('awbotDeviceCaps') ?? const {};
    } on PlatformException {
      return const {};
    } on MissingPluginException {
      return const {};
    }
  }
}
