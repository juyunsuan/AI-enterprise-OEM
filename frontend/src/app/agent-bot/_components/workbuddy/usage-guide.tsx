"use client";

import { Button, Modal, Steps, Typography } from "antd";
import { useState } from "react";

const { Text, Title } = Typography;

const STEP_ITEMS = [
  {
    title: "准备腾讯云 Workbuddy 企业版凭据",
    content:
      "在腾讯云控制台为 Workbuddy 企业版创建 API 密钥（SecretId / SecretKey），并确认这个账号下已经有可用的 Agent。用哪把密钥签名，就只能看到那个企业名下的 Agent 与会话，隔离由腾讯云侧完成。",
  },
  {
    title: "绑定凭据并校验",
    content:
      "到「Workbuddy Enterprise 账号」页签点「绑定凭据」：起个名字、填 SecretId / SecretKey、选地域（默认广州）、设启停与备注。保存后点「校验」，系统会真打一次腾讯云的 Agent 列表接口，能列出 Agent 才算这把 Key 通了；「最近校验」列会记下时间与可见 Agent 数。",
  },
  {
    title: "确认 Agent 与版本",
    content:
      "在账号台账的账号行点击「云端 Agent」，实时查看该账号名下的 Agent、最新版本、模型、会话数与 A2A 配置，并管理新建、改名、版本与删除；这些都直接写回腾讯云，本系统不另存一份。",
  },
  {
    title: "账号对话",
    content:
      "「账号对话」页签左侧选中一条账号，右侧选 Agent 与版本（版本留空＝最新版），输入指令下发。平台按该账号密钥新建云端会话并推送指令，之后每 5 秒追一次任务状态与消息，收口即停；失败原因与执行过程都回在这条指令下面。",
  },
  {
    title: "定时任务",
    content:
      "「定时任务」页签：选账号 →「新建定时任务」填名称、每轮指令、执行目标（账号 + Agent + 版本），再选排期（定时一次 / 周期重复：按分钟、每小时、每天、每周、每月）。到点由后台调度器按该账号自动下发一轮，错过不补跑，失败只在「运行记录」里留痕；也可以随时点「立即跑一次」。",
  },
  {
    title: "回看与跟踪",
    content:
      "每条指令与每轮定时都会留记录：账号对话看状态、过程与错误；定时任务的「运行记录」逐轮显示成功 / 失败与原因。停用的账号不参与下发，历史记录保留。",
  },
];

/**
 * Workbuddy 企业版使用说明：点页头标题右侧的「使用说明」按钮弹出。
 * 六步走：备凭据 → 绑定校验 → 看 Agent → 账号对话 → 定时任务 → 回看跟踪。
 * 只读内容，不做任何数据操作。
 */
export function WorkbuddyGuideButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>使用说明</Button>
      <Modal
        open={open}
        title="Workbuddy 企业版使用说明"
        onCancel={() => setOpen(false)}
        footer={<Button onClick={() => setOpen(false)}>知道了</Button>}
        width={760}
        destroyOnHidden
      >
        <Title level={5} style={{ marginTop: 0 }}>
          整体架构
        </Title>
        <Text type="secondary">
          企业云账号等同于 Bot 主机：一个 Workbuddy Enterprise 账号就是一条执行通道。
          云端（腾讯云 Workbuddy 企业版）负责 Agent、版本、会话与消息事件；本系统负责下发指令、排定时任务、记下状态与回传。
          每个用户填自己的 SecretId / SecretKey，账号之间互不相通，管理员也不代看他人密钥。
        </Text>

        <Title level={5} style={{ marginTop: 20 }}>
          接入步骤
        </Title>
        <Steps
          orientation="vertical"
          size="small"
          current={-1}
          items={STEP_ITEMS.map((item, index) => ({
            title: `${index + 1}. ${item.title}`,
            content: (
              <Text style={{ whiteSpace: "pre-wrap" }}>{item.content}</Text>
            ),
          }))}
        />

        <Title level={5} style={{ marginTop: 20 }}>
          四个页签的分工
        </Title>
        <Text style={{ whiteSpace: "pre-wrap" }}>
{`• 账号对话：选账号 + Agent 直接下发指令，自动追状态与消息，过程与错误回在指令下面。
• 定时任务：同账号同一套执行目标，按排期自动下发；运行记录逐轮留痕，错过不补跑。
• Workbuddy Enterprise 账号：绑多把腾讯云密钥，一把密钥对应一个企业；账号行「云端 Agent」管理远端 Agent 与版本。停用的账号不参与下发，历史记录保留。
• AI 调用账号：第三方平台凭据库（口令 / API Key / Cookie），按 Workbuddy 账号授权，任务运行时经机器通道按绑定取用。`}
        </Text>

        <Title level={5} style={{ marginTop: 20 }}>
          常见问题
        </Title>
        <Text style={{ whiteSpace: "pre-wrap" }}>
{`Q：Agent 列表是空的？
A：先确认「Workbuddy Enterprise 账号」里这把凭据校验通过；再确认这个腾讯云账号下确实建过 Agent。换账号下拉会重新拉一次，本系统不缓存 Agent 清单。

Q：指令一直停在「执行中」？
A：平台每 5 秒追一次 A2A 任务态与消息，云端跑完后自动收口；若长时间不动，先确认密钥未过期、账号未停用，再点右上角「刷新」。

Q：定时任务为什么没补跑？
A：与 Bot 主机同口径——错过的时间点不补跑，只跑下一次；一轮失败记在「运行记录」里，不会自动重试。

Q：腾讯云密钥安全吗？
A：SecretKey 只存密文镜像，界面只回打码串；替换密钥时留空＝沿用已存值。修改 / 删除凭据和定时任务都要过统一的密码校验。`}
        </Text>
      </Modal>
    </>
  );
}
