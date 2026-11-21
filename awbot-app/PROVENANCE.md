# AWBot App — 对应源码说明（PROVENANCE）

本目录是 **AWBot 安卓/iOS 客户端的完整对应源码**，随 GitHub Release 上分发的 AWBot APK 一起提供，
用于履行 AGPL-3.0 的「提供对应源码」义务。

## 许可与上游

- 许可证：**AGPL-3.0**，见同目录 [`LICENSE`](LICENSE)，第三方声明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)；
  两份文件均按上游原样保留，未删改版权与许可信息。
- 上游工程：`io.github.ccch1mneyyy` 的 dsh-go（Flutter + 原生 Android/iOS）。本目录基于该工程的一份
  工作快照，**不含上游 git 历史**；AGPL 所要求的对应源码（含构建/安装所用脚本）在本目录内齐备。
- 包名 `io.github.ccch1mneyyy.dsh_app` 首版保持不变（避免存量用户数据迁移），界面显示名已改为 `AWBot`。

## 本副本包含的改造

改造范围与决策口径统一记录在平台仓库的
[`docs/AWBot手机接入方案.md`](../docs/AWBot手机接入方案.md)，本目录只是其产物快照，未做额外改写：

- 品牌：`android:label`、iOS `CFBundleDisplayName`、应用内文案与图标改为 AWBot（Dart 源码注释里的
  工程名沿用上游 `DSH Go`，属描述上游工程的注释，非界面文案）。
- 与本平台对接：6 位连接码配对、`awb_` 令牌、`/api/public/awbot/**` 心跳通道、逐台对话与定时任务、
  按设备授权模型、AWBot Link 与模型同步。
- 使用手册等随包资产按上游 `guide_sync.py` 流程重建。

## 构建方式

```bash
# 1) 先在 x86_64 Linux 上产出 APK 内嵌的 runtime bundle（release 构建的硬前置）
bash runtime/build-runtime.sh arm64-v8a
# 2) 再出正式包（版本号取 app/pubspec.yaml，versionCode 取构建分钟）
bash tooling/build-apk.sh            # release, arm64（手机）
bash tooling/build-apk.sh -f x64     # release, x64（模拟器）
```

App 自身的版本线（`app/pubspec.yaml`，当前 `1.1.0`）与平台版本号（如 `v1.7.0`）**不是同一套编号**，
不要混用。

## 未随本目录分发的事物（有意排除）

- 构建产物与生成物：`app/build/`、各处 `.dart_tool/`、`node_modules/`、`runtime/.work/`、
  `runtime/.cache/`、`runtime/out/`。
- **签名材料**：`app/android/key.properties` 与任何 `.jks` / `.keystore` 都不在本目录、也不在平台仓库里。

关于签名的使用者须知：分发用的 AWBot APK 由我们自己新建的正式发布密钥签名，与上游 DSH 包的签名密钥
不同。因此**已安装上游 DSH Go 的用户无法直接覆盖升级**，需要先卸载再安装（App 内数据会随之清除）；
此后各 AWBot 版本之间可以正常覆盖升级。签名库由分发方离线保管，遗失将导致后续版本同样只能卸载重装。
