"use client";

import { Button, Modal, Steps, Typography } from "antd";
import { useState } from "react";

const { Text, Title } = Typography;

const STEP_ITEMS = [
  {
    title: "登记平台凭据",
    content:
      "点「登记账号」，按平台实际需要填用户名、登录口令、API Key、Cookie 或其他字段。至少填一种凭据；口令、API Key、Cookie 保存后不再回显，修改时留空即沿用原值。",
  },
  {
    title: "绑定给具体 Agent",
    content:
      "两个方向都能设：① 在「BotBuddy 主机」「MoBot 手机」「WorkBuddy 企业云」各自的「Agent 绑定账号」页签里，选中某一台设备/账号，勾选它可用的 AI 调用账号；② 在本页签点某条凭据的「绑定」，一次勾选多台 Agent。一份凭据可同时授权给多台 Agent，绑定关系随时可改。",
  },
  {
    title: "Agent 侧取用（两种通道）",
    content:
      "① 已配对的客户端（BotBuddy / MoBot）带主机令牌 x-bot-token 直接取：GET /api/public/bot-host/ai-call/accounts（手机是 /api/public/mobot/…），身份就是本机，不用传设备 ID。\n② 外部任务/脚本用平台 API Key（「模型服务 → API Key 管理」生成，头 x-api-key）取：GET /api/v1/ai-call/accounts?kind=DESKTOP&agentId=<主机ID>。kind 取 DESKTOP / MOBOT / WORKBUDDY。",
  },
  {
    title: "运行时按列表取凭据",
    content:
      "先列账号（不含明文），再 GET …/accounts/<id>/credentials 取一次明文凭据。两条通道都严格按绑定放行：没绑到本机的账号查不到，也取不到凭据。",
  },
  {
    title: "停用与解绑",
    content:
      "AI 调用账号停用后不再出现在任何 Agent 的列表里；要收回某个 Agent 的权限，去它的「Agent 绑定账号」页签取消勾选，或在本页签点该凭据的「绑定」把这台设备去掉。删除 AI 调用账号不可恢复，同时会清掉它的全部绑定。",
  },
];

/** AI 调用账号使用说明：讲清「登记 → 绑定 Agent → 取用 → 收回」。 */
export function AiCallGuideButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>使用说明</Button>
      <Modal
        open={open}
        title="AI 调用账号使用说明"
        onCancel={() => setOpen(false)}
        footer={<Button onClick={() => setOpen(false)}>知道了</Button>}
        width={760}
        destroyOnHidden
      >
        <Title level={5} style={{ marginTop: 0 }}>
          这套账号解决什么
        </Title>
        <Text type="secondary">
          很多平台没有给 AI 用的开放接口，只能靠账号登录或 Cookie 操作。这里把各平台的凭据集中加密保存，
          再以「哪台 Agent 在用」为授权边界：BotBuddy 主机、MoBot 手机、WorkBuddy 企业账号各自只能取绑给自己的凭据。
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
          安全边界
        </Title>
        <Text style={{ whiteSpace: "pre-wrap" }}>
{`• 口令 / API Key / Cookie 以 AES-256-GCM 密文落库，密钥上下文独立，界面与列表只显示「存过没有」。
• 明文只在通道取用时解密一次，并记录审计；未绑定、已停用或跨账号的请求一律拒绝。
• 平台管理员也不代看他人凭据；请按最小范围绑定给具体 Agent。`}
        </Text>
      </Modal>
    </>
  );
}
