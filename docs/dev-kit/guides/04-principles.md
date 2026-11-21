# 开发原则与一键接入

## 工程纪律（ub-mode）

每一处改动分三步：

1. **First Make it Work** —— 先让最小路径跑通，数据形状先定对，测试先行。
2. **Then Make it Right** —— 修根因、拆可验证的小单元、补行为测试、消除重复与死代码。
3. **Practice** —— 记录动作与理由、保护上下文窗口、清理工作区、小步提交。

技能真源：`docs/dev-kit/skills/ub-mode/SKILL.md`。
Codex 用 `$ub-mode` 触发，Claude Code 用 `/ub-mode` 触发。
`SKILL.md` 中提到的 crapper / dryer / mutator 是外部工具，本仓不随附；
工具不可用时跳过该步并如实报告，不得虚构验证结果。

## 三条红线

1. **令牌物理隔离**：C 端令牌不得进入 `/enterprise/**`，企业会话令牌也不得下放到 C 端通道。
2. **顾客态双条件**：顾客态数据必须同时按「站点/店铺标识 + 顾客标识」限定，缺一即视为越权风险。
3. **网络出口唯一**：前端只经业务 API，后端只经统一传输层；不得裸写 `fetch(`。

## 可执行守护

文字原则的权威是可执行脚本，不是文档：

```bash
pnpm check:architecture
```

它覆盖网络出口、契约纯度、AI 闸门与计量、字节写入门面、ERP 直连、商城互引、
小程序单一真源等规则。改完代码若这一步不过，不要提交。

## 本系统专属技能

- `enterprise-contract`：新增 / 修改契约端点的标准动作。
- `enterprise-miniapp`：新增小程序 / 新终端的标准动作。
- `enterprise-review`：提交前自检（三条红线 + 全量守卫）。

技能正文在 `docs/dev-kit/skills/`，安装副本在 `.agents/skills/` 与 `.claude/skills/`。

## 一键接入

```bash
pnpm setup:dev-kit     # 生成根入口、同步技能副本、生成接口索引
pnpm devkit:check      # 校验生成物没有漂移
pnpm pack:dev-kit      # 重新打包下载套件
```

后台「二次开发指引」页可下载完整套件与单个技能包，也可复制一键命令与 AI 提示词。
