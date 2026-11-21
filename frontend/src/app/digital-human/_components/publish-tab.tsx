"use client";

// 小程序发布页签：主体凭据 + 直接下载统一源码包（zip）+ 小程序码。
// 没有「生成代码包」按钮，也没有代码包台账：包是平台模板源码，点了就下。
import { QrcodeOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Image,
  Input,
    Space,
  Switch,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  MINI_APP_STATUS_LABELS,
  type MiniAppView,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { MiniProgramPublishGuide } from "@/components/mini-program/publish-guide";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";

type CredentialDraft = {
  appId: string;
  appSecret: string;
  mchId: string;
  payApiV3Key: string;
  payCertSerial: string;
  payPrivateKey: string;
  payEnabled: boolean;
};

export function PublishTab() {
  const { message } = App.useApp();
  const [view, setView] = useState<MiniAppView | null>(null);
  const [draft, setDraft] = useState<CredentialDraft | null>(null);
  const [qrcode, setQrcode] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const app = await digitalHumanApi.miniApp();
      if (app) {
        setView(app);
        setDraft({
          appId: app.appId,
          appSecret: "",
          mchId: app.mchId,
          payApiV3Key: "",
          payCertSerial: app.payCertSerial,
          payPrivateKey: "",
          payEnabled: app.payEnabled,
        });
        setQrcode(app.qrcodeUrl);
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "发布信息加载失败");
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.saveMiniApp({
        body: {
          appId: draft.appId,
          mchId: draft.mchId,
          payCertSerial: draft.payCertSerial,
          payEnabled: draft.payEnabled,
          templates: view?.templates ?? {},
          ...(draft.appSecret ? { appSecret: draft.appSecret } : {}),
          ...(draft.payApiV3Key ? { payApiV3Key: draft.payApiV3Key } : {}),
          ...(draft.payPrivateKey ? { payPrivateKey: draft.payPrivateKey } : {}),
        },
      });
      message.success("主体凭据已保存");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const result = await digitalHumanApi.testMiniApp();
      if (result?.ok) message.success(result.message || "凭据可用");
      else message.warning(result?.message || "自检失败");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "自检失败");
    } finally {
      setTesting(false);
    }
  };

  const makeQrcode = async () => {
    try {
      const result = await digitalHumanApi.releaseQrcode();
      setQrcode(result?.qrcodeUrl ?? "");
      if (!result?.qrcodeUrl) message.warning(result?.message || "小程序码生成失败");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "小程序码生成失败");
    }
  };

  return (
    <Space orientation="vertical" size={14} style={{ width: "100%" }}>
      <Panel
        title="小程序主体凭据"
        titleExtra={
          <span className="muted text-12">
            {view ? MINI_APP_STATUS_LABELS[view.status] || view.status : ""}
            {view?.verifiedAt ? ` · 自检于 ${fmtTime(view.verifiedAt)}` : ""}
          </span>
        }
        extra={
          <Space>
            <Button size="small" onClick={() => void test()} loading={testing}>
              连接自检
            </Button>
            <Button size="small" type="primary" onClick={() => void save()} loading={saving}>
              保存凭据
            </Button>
          </Space>
        }
      >
        <Notice variant="info">
          每个站点用自己申请的小程序：AppID 就是这部小程序的归属，你在微信开发者工具的
          project.config.json 里填的也是它（统一源码包不带这个值）。AppID/AppSecret 用于会员 wx.login 换
          openId、连通自检、生成小程序码与微信支付，商户号与 APIv3 密钥让会员付款直达你的商户号。
        </Notice>
        {draft ? (
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label>
              AppID
              <Input
                value={draft.appId}
                maxLength={64}
                onChange={(event) => setDraft({ ...draft, appId: event.target.value })}
              />
            </label>
            <label>
              AppSecret
              <Input.Password
                value={draft.appSecret}
                maxLength={128}
                placeholder={view?.appSecretConfigured ? "已配置，留空保留原值" : "小程序密钥"}
                onChange={(event) => setDraft({ ...draft, appSecret: event.target.value })}
              />
            </label>
            <label>
              微信商户号
              <Input
                value={draft.mchId}
                maxLength={64}
                onChange={(event) => setDraft({ ...draft, mchId: event.target.value })}
              />
            </label>
            <label>
              支付 APIv3 密钥
              <Input.Password
                value={draft.payApiV3Key}
                maxLength={128}
                placeholder={view?.payKeyConfigured ? "已配置，留空保留原值" : "32 位 APIv3 密钥"}
                onChange={(event) => setDraft({ ...draft, payApiV3Key: event.target.value })}
              />
            </label>
            <label>
              支付证书序列号
              <Input
                value={draft.payCertSerial}
                maxLength={128}
                onChange={(event) => setDraft({ ...draft, payCertSerial: event.target.value })}
              />
            </label>
            <label>
              支付私钥（PEM）
              <Input.TextArea
                rows={3}
                value={draft.payPrivateKey}
                placeholder={view?.payCertConfigured ? "已配置，留空保留原值" : "apiclient_key.pem 的内容"}
                onChange={(event) => setDraft({ ...draft, payPrivateKey: event.target.value })}
              />
            </label>
            <label>
              开启小程序内支付
              <Space>
                <Switch
                  checked={draft.payEnabled}
                  onChange={(payEnabled) => setDraft({ ...draft, payEnabled })}
                />
                <span className="muted text-12">未开户前关闭，端上隐藏支付按钮</span>
              </Space>
            </label>
          </div>
        ) : null}
      </Panel>

      {/* 与「建站管理·小程序板块」「帮助中心」同一份说明、同一个后端接口；下载按钮就在组件里。 */}
      <MiniProgramPublishGuide tool="digital-human" />

      <Panel
        title="小程序码"
        extra={
          <Button size="small" icon={<QrcodeOutlined />} onClick={() => void makeQrcode()}>
            生成/刷新
          </Button>
        }
      >
        {qrcode ? (
          <Space align="start" size={16}>
            <Image src={qrcode} alt="小程序码" width={160} height={160} />
            <p className="muted text-12">
              小程序码指向本站首页，海报合成复用同一张。微信主体未配置时生成会返回空。
            </p>
          </Space>
        ) : (
          <EmptyState text="还没有小程序码：配置主体凭据后点「生成/刷新」。" />
        )}
      </Panel>
    </Space>
  );
}
