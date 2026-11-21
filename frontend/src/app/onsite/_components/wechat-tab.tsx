"use client";

// 微信凭据页签：自营小程序主体（AppID / AppSecret）+ 微信支付商户号 + 订阅消息模板 + 小程序码。
import { ReloadOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Image,
  Input,
    Modal,
  Space,
  Switch,
  Tag,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  MINI_TEMPLATE_KEYS,
  MINI_TEMPLATE_LABELS,
  type MiniAppInput,
  type MiniAppView,
  type OnsitePoster,
} from "@enterprise/contracts";
import { onsiteApi } from "@/api/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  UNVERIFIED: { color: "default", text: "未自检" },
  VERIFIED: { color: "success", text: "凭据可用" },
  FAILED: { color: "error", text: "自检失败" },
};

type Draft = {
  appId: string;
  appSecret: string;
  mchId: string;
  payApiV3Key: string;
  payCertSerial: string;
  payPrivateKey: string;
  payEnabled: boolean;
  mapKey: string;
  templates: Record<string, string>;
};

const emptyDraft: Draft = {
  appId: "",
  appSecret: "",
  mchId: "",
  payApiV3Key: "",
  payCertSerial: "",
  payPrivateKey: "",
  payEnabled: false,
  mapKey: "",
  templates: {},
};

/** 密钥只写不读：留空表示沿用已保存值，所以表单永远不回显密文。 */
function toDraft(view: MiniAppView): Draft {
  return {
    ...emptyDraft,
    appId: view.appId,
    mchId: view.mchId,
    payCertSerial: view.payCertSerial,
    payEnabled: view.payEnabled,
    templates: { ...view.templates },
  };
}

export function WechatTab({
  shopId,
  onReload,
}: {
  shopId: number;
  onReload: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const [view, setView] = useState<MiniAppView | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [qrcodeBusy, setQrcodeBusy] = useState(false);
  const [posterBusy, setPosterBusy] = useState(false);
  const [poster, setPoster] = useState<OnsitePoster | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;
    try {
      const data = await onsiteApi.wechat({ params: { id: String(shopId) } });
      setView(data);
      if (data) setDraft(toDraft(data));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "凭据加载失败");
    }
  }, [shopId, message]);

  // 进入即加载，保存/自检后自动重拉，不给手动刷新按钮留位置。
  useEffect(() => {
    void load();
  }, [load]);

  if (!shopId) {
    return (
      <Panel title="微信凭据">
        <EmptyState text="请先在「店铺与交易」页签开通上门服务店铺，再绑定你自己的小程序主体。" />
      </Panel>
    );
  }

  const patch = (values: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...values }));

  const save = async () => {
    setSaving(true);
    try {
      const body: MiniAppInput = {
        appId: draft.appId,
        mchId: draft.mchId,
        payCertSerial: draft.payCertSerial,
        payEnabled: draft.payEnabled,
        templates: draft.templates,
      };
      // 只有真正填了才提交：留空在后端语义是「沿用原密文」，不能当成清空
      if (draft.appSecret.trim()) body.appSecret = draft.appSecret.trim();
      if (draft.payApiV3Key.trim()) body.payApiV3Key = draft.payApiV3Key.trim();
      if (draft.payPrivateKey.trim())
        body.payPrivateKey = draft.payPrivateKey.trim();
      if (draft.mapKey.trim()) body.mapKey = draft.mapKey.trim();
      const data = await onsiteApi.saveWechat({
        params: { id: String(shopId) },
        body,
      });
      if (data) {
        setView(data);
        setDraft(toDraft(data));
      }
      message.success("凭据已保存（密钥只写不读，留空即沿用原值）");
      await onReload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const data = await onsiteApi.testWechat({
        params: { id: String(shopId) },
        body: {},
      });
      message[data?.ok ? "success" : "error"](data?.message || "自检完成");
      await load();
      await onReload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "自检失败");
    } finally {
      setTesting(false);
    }
  };

  const generateQrcode = async () => {
    setQrcodeBusy(true);
    try {
      const data = await onsiteApi.qrcode({
        params: { id: String(shopId) },
        body: { page: "pages/index/index" },
      });
      if (data?.qrcodeUrl) {
        message.success("小程序码已生成");
        await load();
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "生成小程序码失败");
    } finally {
      setQrcodeBusy(false);
    }
  };

  const generatePoster = async () => {
    setPosterBusy(true);
    try {
      const data = await onsiteApi.poster({
        params: { id: String(shopId) },
        query: { kind: "SHOP", agentId: 0 },
      });
      if (data) {
        setPoster(data);
        await load();
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "生成海报失败");
    } finally {
      setPosterBusy(false);
    }
  };

  const status = STATUS_TAG[view?.status ?? "UNVERIFIED"];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel
        title="小程序主体"
        titleExtra={
          <Space>
            <Tag color={status.color}>{status.text}</Tag>
            {view?.verifiedAt ? (
              <span className="muted">最近自检 {fmtTime(view.verifiedAt)}</span>
            ) : null}
          </Space>
        }
      >
        <Notice variant="info">
          这里填的是你自己申请的小程序凭据（微信公众平台 → 开发管理 → 开发设置）。
          资金与类目资质都归属该主体；本站只输出统一源码包，编译、预览、上传都在你自己的微信开发者工具里完成，
          提审发布在你的微信公众平台，本站不代传、不代提审。凭据本身仍要配齐：连通自检、微信支付、
          订阅消息与小程序码都靠它。
        </Notice>
        {view?.lastError ? <Notice variant="error">{view.lastError}</Notice> : null}
        <Space orientation="vertical" size={12} style={{ width: "100%", marginTop: 12 }}>
          <Space wrap>
            <Input
              style={{ width: 280 }}
              placeholder="AppID（wx 开头）"
              value={draft.appId}
              onChange={(e) => patch({ appId: e.target.value.trim() })}
            />
            <Input.Password
              style={{ width: 280 }}
              placeholder={
                view?.appSecretConfigured ? "AppSecret（留空沿用原值）" : "AppSecret"
              }
              value={draft.appSecret}
              onChange={(e) => patch({ appSecret: e.target.value })}
            />
          </Space>
          <Input
            style={{ width: 280 }}
            placeholder={
              view?.mapKeyConfigured ? "腾讯地图 key（留空沿用）" : "腾讯地图 key（可选）"
            }
            value={draft.mapKey}
            onChange={(e) => patch({ mapKey: e.target.value.trim() })}
          />
          <Space wrap>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              保存凭据
            </Button>
            <Button icon={<ReloadOutlined />} loading={testing} onClick={() => void test()}>
              连接自检
            </Button>
          </Space>
        </Space>
      </Panel>

      <Panel title="微信支付商户号">
        <Notice variant="warn">
          顾客付款直接进你自己的商户账户，平台不经手、不过账。未配置时订单按线下收款登记，
          履约与分账流程照走；平台若关闭「允许在线收款」，此处开关也不生效。
        </Notice>
        <Space orientation="vertical" size={12} style={{ width: "100%", marginTop: 12 }}>
          <Space wrap>
            <Input
              style={{ width: 220 }}
              placeholder="商户号 mchid"
              value={draft.mchId}
              onChange={(e) => patch({ mchId: e.target.value.trim() })}
            />
            <Input
              style={{ width: 260 }}
              placeholder="APIv3 密钥（留空沿用）"
              value={draft.payApiV3Key}
              onChange={(e) => patch({ payApiV3Key: e.target.value })}
            />
            <Input
              style={{ width: 260 }}
              placeholder="商户证书序列号"
              value={draft.payCertSerial}
              onChange={(e) => patch({ payCertSerial: e.target.value.trim() })}
            />
            <Switch
              checked={draft.payEnabled}
              onChange={(checked) => patch({ payEnabled: checked })}
              checkedChildren="开启收款"
              unCheckedChildren="线下登记"
            />
          </Space>
          <Input.TextArea
            rows={3}
            placeholder={
              view?.payCertConfigured
                ? "商户 API 私钥 apiclient_key.pem 内容（留空沿用原值）"
                : "商户 API 私钥 apiclient_key.pem 内容"
            }
            value={draft.payPrivateKey}
            onChange={(e) => patch({ payPrivateKey: e.target.value })}
          />
        </Space>
      </Panel>

      <Panel title="订阅消息模板">
        <Space wrap>
          {MINI_TEMPLATE_KEYS.map((key) => (
            <Input
              key={key}
              style={{ width: 320 }}
              prefix={MINI_TEMPLATE_LABELS[key]}
              placeholder="模板 ID（可选）"
              value={draft.templates[key] ?? ""}
              onChange={(e) =>
                patch({ templates: { ...draft.templates, [key]: e.target.value.trim() } })
              }
            />
          ))}
        </Space>
        <div className="muted" style={{ marginTop: 8 }}>
          模板 ID 来自你自己的小程序后台（功能 → 订阅消息）。留空时对应通知只走站内消息，不影响下单。
        </div>
      </Panel>

      <Panel title="小程序码">
        <Space align="start">
          {view?.qrcodeUrl ? (
            <Image
              src={view.qrcodeUrl}
              alt="小程序码"
              width={160}
              height={160}
              style={{ objectFit: "contain" }}
            />
          ) : (
            <EmptyState text="还没有生成小程序码" />
          )}
          <Space orientation="vertical">
            <Button loading={qrcodeBusy} onClick={() => void generateQrcode()}>
              用当前凭据生成
            </Button>
            <Button
              type="primary"
              ghost
              loading={posterBusy}
              onClick={() => void generatePoster()}
            >
              生成分享海报
            </Button>
          </Space>
        </Space>
        <div className="muted" style={{ marginTop: 8 }}>
          海报为 750×1180 竖版图，含店名与小程序码，可直接发朋友圈；海报每次生成都会取一张新码，改店名后重新生成即可。
        </div>
      </Panel>

      <Modal
        open={!!poster}
        onCancel={() => setPoster(null)}
        footer={null}
        width={420}
        title="店铺分享海报"
        destroyOnHidden
      >
        {poster ? (
          <div style={{ textAlign: "center" }}>
            {/* 海报是服务端排版的 SVG（data URI），不经对象存储，避免 SVG 公开可执行 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={poster.posterUrl}
              alt="店铺分享海报"
              style={{ width: "100%", borderRadius: 8 }}
            />
            <Space style={{ marginTop: 12 }}>
              <Button
                type="primary"
                href={poster.posterUrl}
                download={`onsite-poster-${poster.shopName}.svg`}
              >
                下载海报
              </Button>
            </Space>
            <div className="muted" style={{ marginTop: 8 }}>
              分享给顾客或发朋友圈，长按识别小程序码即可下单。
            </div>
          </div>
        ) : null}
      </Modal>
    </Space>
  );
}
