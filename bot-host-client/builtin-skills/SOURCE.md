# 内置技能来源

这些技能目录复制自本仓库 `awbot-app/app/assets/skills/`（AWBot 手机端的随包技能资产），
用于 AWBotDSH 桌面端首次启动时写入本机技能目录：

- 运行目录：`~/.awbotdsh/skills/<name>/`
- 安装方式：`src/main/skill-installer.js` 按各目录 `manifest.json` 的 `{ name, files }`
  映射逐文件复制，`SKILL.md` 最后写入，目录原子替换。
- 归属标记：`SKILL.md` 中的 `# dsh-go:managed` 行表示由客户端托管；
  用户删除该行后视为自有技能，升级不再覆盖。
- 许可：随仓库原有许可（AGPL-3.0-only），不得单独对外分发这些资产。
