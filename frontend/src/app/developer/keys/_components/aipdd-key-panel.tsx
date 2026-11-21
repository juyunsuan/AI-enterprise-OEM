"use client";

import { CopyOutlined, LinkOutlined } from "@ant-design/icons";
import { App, Button, Input, Space, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";
import { aipddKeyApi, type AipddKeyStatus } from "@/api/aipdd-key";
import { Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";

/** 面板说明（原独立页的页头描述，并入功能板块内） */
const PANEL_NOTE =
  "绑定 AIPDD 平台签发的 API Key（sk-），才能使用「同步发布到 AIworkin」「AI社交」「服务商数据同步」等上游能力；本地注册不绑定也全可用。一个账号可绑多把 Key：模型/计费使用最早绑定的可用 Key，AI社交通知会按每把 Key 所属账号分别拉取并合并。Key 经 AES-256-GCM 加密保存，界面与接口永不回显原文。";

/**
 * AIPDD API Key 绑定（原「模型服务 → AIPDD Key 绑定」独立页，已并入「API Key 管理」）：
 * 上游动作的唯一用户凭证入口，本地功能不绑定也全可用。
 * 面板同时承担注册引导：管理员在「站点设置」配了 AIPDD 推荐码后，引导新用户去
 * www.aipdd.work 注册并填写推荐码——邀请注册佣金归管理员，新用户获赠算力。
 */
export function AipddKeyPanel() {
  const { message, modal } = App.useApp();
  const [status, setStatus] = useState<AipddKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>("");
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setStatus(await aipddKeyApi.status());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const copyCode = async () => {
    const code = status?.referralCode || "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      message.success("推荐码已复制");
    } catch {
      message.warning("浏览器不允许剪贴板，请手动复制");
    }
  };

  const bind = async () => {
    const key = keyInput.trim();
    if (!key) {
      message.warning("请先粘贴 AIPDD 平台的 API Key（sk- 开头）");
      return;
    }
    setBusy(true);
    try {
      setStatus(await aipddKeyApi.bind(key));
      setKeyInput("");
      message.success("绑定成功");
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const unbind = (keyId: number, masked: string) =>
    modal.confirm({
      title: "解绑 AIPDD API Key",
      okText: "确认解绑",
      cancelText: "取消",
      okButtonProps: { danger: true },
      content: `解绑 ${masked} 后，使用这把 Key 的上游同步与 AI社交通知将停止（本地功能不受影响）。确定解绑吗？`,
      onOk: async () => {
        try {
          await aipddKeyApi.unbind(keyId);
          message.success("已解绑");
          await reload();
        } catch (error) {
          message.error(error instanceof Error ? error.message : "解绑失败");
          throw error;
        }
      },
    });

  const referralCode = status?.referralCode || "";
  const registerUrl = status?.registerUrl || "https://www.aipdd.work";
  const keys = status?.keys || [];

  return (
    <Panel
      title="AIPDD API Key 绑定"
      titleExtra={<span className="muted text-12">一个账号可绑多把；同一把也可被多人绑（N:1）</span>}
    >
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        {PANEL_NOTE}
      </p>

      {loadError ? (
        <Notice variant="error">
          {loadError} <Button size="small" onClick={() => void reload()}>重试</Button>
        </Notice>
      ) : loading ? (
        <span className="muted text-12">加载中…</span>
      ) : keys.length ? (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {keys.map((item) => (
            <div
              key={item.keyId}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                border: "1px solid var(--line, #f0f0f0)",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              <span style={{ fontFamily: "monospace" }}>{item.masked}</span>
              {item.primary ? <Tag color="blue">主 Key</Tag> : null}
              {item.status !== "ACTIVE" ? <Tag color="red">已失效</Tag> : null}
              <span className="muted text-12">
                {String(item.profile?.nickName || item.profile?.username || "") ||
                  item.aipddUserId ||
                  "—"}
              </span>
              <span className="muted text-12">绑定于 {fmtTime(item.boundAt)}</span>
              <span className="muted text-12">同 Key {item.sharedWith} 人</span>
              <Button
                size="small"
                danger
                type="link"
                onClick={() => unbind(item.keyId, item.masked)}
              >
                解绑
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Notice variant="info">当前尚未绑定 AIPDD API Key，按下方步骤注册并粘贴 Key 绑定。</Notice>
      )}

      <Space.Compact style={{ width: "min(560px, 100%)", marginTop: 4 }}>
        <Input.Password
          value={keyInput}
          onChange={(event) => setKeyInput(event.target.value)}
          placeholder={
            keys.length
              ? "再粘贴一把 AIPDD API Key 追加绑定"
              : "粘贴 AIPDD API Key（sk- 开头 51 位）"
          }
          maxLength={200}
          disabled={loading || busy}
          onPressEnter={() => void bind()}
        />
        <Button type="primary" loading={busy} disabled={loading} onClick={() => void bind()}>
          {keys.length ? "添加 Key" : "绑定"}
        </Button>
      </Space.Compact>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          还没有 AIPDD 账号？三步注册并绑定
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
          <li>
            前往{" "}
            <a href={registerUrl} target="_blank" rel="noreferrer">
              {registerUrl.replace(/^https?:\/\//, "")}
            </a>{" "}
            注册账号
            {referralCode ? (
              <>
                ，注册时填写推荐码{" "}
                <Space size={6}>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 14,
                      padding: "2px 8px",
                      border: "1px solid var(--line, #d9d9d9)",
                      borderRadius: 6,
                      background: "rgba(0,0,0,0.02)",
                    }}
                  >
                    {referralCode}
                  </span>
                  <Button size="small" icon={<CopyOutlined aria-hidden />} onClick={() => void copyCode()}>
                    复制推荐码
                  </Button>
                </Space>
                ，即可<b>获赠算力</b>
              </>
            ) : null}
            。
          </li>
          <li>登录后在 AIPDD 平台的「API Key 管理」创建 API Key（sk- 开头的 51 位字符）。</li>
          <li>回到本页粘贴 Key 绑定即可；Key 经 AES-256-GCM 加密保存，界面与接口永不回显原文。</li>
        </ol>
        {!referralCode && !loading && !loadError ? (
          <Notice variant="info">
            管理员尚未在「平台管理后台 → 站点设置」配置 AIPDD 推荐码；配置后这里会展示推荐码与赠算力引导。
          </Notice>
        ) : null}
      </div>

      <div className="muted text-12" style={{ marginTop: 12, display: "flex", gap: 4, alignItems: "center" }}>
        <LinkOutlined aria-hidden />
        绑定即代表同意由本站代为调用 AIPDD 上游接口；本系统不托管上游账号密码，也不涉币。
      </div>
    </Panel>
  );
}
