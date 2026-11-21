"use client";

import { QrcodeOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Divider,
  Form,
  Image,
  Input,
    Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  type MiniAppInput,
  type MiniAppView,
  type MpAppTestResult,
} from "@enterprise/contracts";
import { marketplaceApi } from "@/api/marketplace";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { MiniProgramPublishGuide } from "@/components/mini-program/publish-guide";
import { fmtTime } from "@/lib/datetime";
import { NoMarket } from "./common";

/**
 * 多店铺商城小程序发布：主体凭据 → 直接下载统一源码包（zip）→
 * 在微信开发者工具里自填参数、编译上传 → 自己的微信公众平台提审发布。
 *
 * 与卡密 / 快递共用建站底座：AppID、商户号都属市场运营方自己的小程序主体。
 * 下载包是平台模板源码（不含账号参数），不再走「生成代码包」，也没有发布台账。
 */
const APP_ID_PATTERN = /^wx[0-9a-zA-Z]{14,32}$/;

const SECRET_FIELDS = [
  "appSecret",
  "payApiV3Key",
  "payPrivateKey",
] as const;

type SecretField = (typeof SECRET_FIELDS)[number];

type CredentialValues = {
  appId: string;
  mchId: string;
  payCertSerial: string;
  payEnabled: boolean;
} & Partial<Record<SecretField, string>>;

export function PublishTab({
  hasMarket,
  onGoMarket,
}: {
  hasMarket: boolean;
  onGoMarket: () => void;
}) {
  const { message } = App.useApp();
  const [app, setApp] = useState<MiniAppView | null>(null);
  const [test, setTest] = useState<MpAppTestResult | null>(null);
  const [qrcodePath, setQrcodePath] = useState("");

  const load = useCallback(async () => {
    if (!hasMarket) return;
    try {
      setApp(await marketplaceApi.appDetail());
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "发布信息读取失败");
    }
  }, [hasMarket, message]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hasMarket) {
    return (
      <NoMarket
        title="先创建市场，再配置小程序"
        desc="小程序主体、代码包与二维码都挂在市场上：先在「市场设置」创建市场，拿到市场编号后再回这里登记自己的小程序并发布。"
        action={
          <Button type="primary" onClick={onGoMarket}>
            去市场设置
          </Button>
        }
      />
    );
  }

  const serverIp = test?.serverIp || "";

  const saveApp = async (body: MiniAppInput) => {
    const next = await marketplaceApi.appSave({ body });
    if (next) setApp(next);
    message.success("凭据已保存（密钥只写不读，留空即保留原值）");
    await load();
  };

  const testApp = async () => {
    try {
      const result = await marketplaceApi.appTest({ body: {} });
      if (result) setTest(result);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "自检失败");
    }
  };

  const testPay = async () => {
    try {
      const result = await marketplaceApi.payTest({ body: {} });
      if (result) {
        setTest((prev) => ({
          ok: result.ok,
          shopName: prev?.shopName || "",
          message: result.message,
          nextAction: "",
          serverIp,
        }));
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "支付自检失败");
    }
  };

  const generateQrcode = async () => {
    try {
      const view = await marketplaceApi.qrcodeGenerate({
        body: { path: qrcodePath.trim() },
      });
      if (view) setApp(view);
      message.success("小程序码已生成");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "生成小程序码失败");
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <CredentialPanel
        key={app?.appId || "new"}
        app={app}
        test={test}
        serverIp={serverIp}
        onSave={saveApp}
        onTestApp={testApp}
        onTestPay={testPay}
      />

      <Panel
        title="上线前要登记的微信侧配置"
        titleExtra={<span className="muted text-12">微信侧配置在本站之外，缺一项小程序就会白屏或请求失败</span>}
      >
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          <Notice variant="info">
            <Space orientation="vertical" size={2}>
              <strong>1. 服务器域名（request / uploadFile / downloadFile）</strong>
              <span className="text-12">
                这份清单由平台按站点配置自动生成，就在下方「小程序发布说明 ③ 服务器域名清单」里逐条添加；
                本页不再另写一份地址，免得两处说法不一致。
              </span>
            </Space>
          </Notice>
        </Space>
      </Panel>


      {/* 与「建站管理·小程序板块」「帮助中心」同一份说明、同一个后端接口；下载按钮就在组件里。 */}
      <MiniProgramPublishGuide
        tool="marketplace"
        onOpenSettings={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      />
      <Panel
        title="小程序码"
        titleExtra={<span className="muted text-12">码里带的是市场编号，扫码进入你这个多店铺商城</span>}
      >
        <Space wrap align="start">
          <Input
            style={{ width: 340 }}
            maxLength={120}
            disabled={!app?.appId || !app?.appSecretConfigured}
            placeholder="落地页路径，留空为首页 pages/index/index"
            value={qrcodePath}
            onChange={(event) => setQrcodePath(event.target.value)}
          />
          <Button
            type="primary"
            icon={<QrcodeOutlined aria-hidden />}
            disabled={!app?.appId || !app?.appSecretConfigured}
            onClick={() => void generateQrcode()}
          >
            生成小程序码
          </Button>
        </Space>
        {app?.appId && app?.appSecretConfigured ? null : (
          <Notice variant="warn">
            生成小程序码要调用微信 wxacode 接口：请先在上方保存 AppID 与 AppSecret 并完成连通自检。
          </Notice>
        )}
        <div style={{ marginTop: 12 }}>
          {app?.qrcodeUrl ? (
            <Space align="start">
              <Image
                src={app.qrcodeUrl}
                alt="市场小程序码"
                width={180}
                height={180}
                style={{ objectFit: "contain" }}
              />
              <Space orientation="vertical" size={4}>
                <Typography.Link href={app.qrcodeUrl} target="_blank" rel="noopener noreferrer">
                  下载小程序码原图
                </Typography.Link>
                <span className="muted text-12">
                  存下来贴到招商物料或商户群里；扫码进的是当前线上版本，与开发版无关。
                </span>
              </Space>
            </Space>
          ) : (
            <EmptyState text="还没有生成小程序码：上面填好路径（或留空）后点「生成小程序码」。" />
          )}
        </div>
      </Panel>
    </div>
  );
}

function CredentialPanel({
  app,
  test,
  serverIp,
  onSave,
  onTestApp,
  onTestPay,
}: {
  app: MiniAppView | null;
  test: MpAppTestResult | null;
  serverIp: string;
  onSave: (body: MiniAppInput) => Promise<void>;
  onTestApp: () => Promise<void>;
  onTestPay: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CredentialValues>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [payTesting, setPayTesting] = useState(false);

  useEffect(() => {
    if (!app) return;
    form.setFieldsValue({
      appId: app.appId,
      mchId: app.mchId,
      payCertSerial: app.payCertSerial,
      payEnabled: app.payEnabled,
    });
  }, [app, form]);

  if (!app) {
    return (
      <Panel title="主体凭据（你自己的小程序）">
        <span className="muted text-12">正在读取本市场的小程序主体…</span>
      </Panel>
    );
  }

  const secretPlaceholder = (configured: boolean, configuredText: string, emptyText: string) =>
    configured ? `已配置，留空则不修改（${configuredText}）` : emptyText;

  const save = async () => {
    const values = await form.validateFields();
    const body: MiniAppInput = {
      appId: values.appId.trim(),
      mchId: values.mchId.trim(),
      payCertSerial: values.payCertSerial.trim(),
      payEnabled: values.payEnabled,
      templates: { ...app.templates },
    };
    for (const field of SECRET_FIELDS) {
      const plain = (values[field] ?? "").trim();
      if (plain) body[field] = plain;
    }
    setSaving(true);
    try {
      await onSave(body);
      for (const field of SECRET_FIELDS) form.setFieldValue(field, "");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="主体凭据（你自己的小程序）"
      titleExtra={
        <Space size={6}>
          <Tag color={app.appId ? "success" : "default"}>
            {app.appId ? "已填写 AppID" : "未填写 AppID"}
          </Tag>
          {app.verifiedAt ? (
            <span className="muted text-12">最近自检 {fmtTime(app.verifiedAt)}</span>
          ) : null}
        </Space>
      }
    >
      <Notice variant="info">
        一个市场对应你自己申请的一部微信小程序：AppID 全局唯一，两个主体不能共用，
        否则两部小程序会抢同一个主体。微信支付商户号归属这个主体，
        买家付款直接进你自己的微信商户账户，平台不经手资金。密钥类字段只写不读，
        保存后只显示「已配置，留空则不修改」。
      </Notice>
      {app.lastError ? <Notice variant="error">上次自检失败：{app.lastError}</Notice> : null}
      {test ? (
        <Notice variant={test.ok ? "success" : "error"}>
          <Space orientation="vertical" size={4} style={{ width: "100%" }}>
            <span>
              {test.ok ? "自检通过" : "自检未通过"}：{test.message || "微信没有返回更多信息"}
            </span>
            {test.nextAction ? <span className="muted text-12">{test.nextAction}</span> : null}
            <span className="muted text-12">
              服务器出口 IP：{test.serverIp || serverIp || "未取到——请向平台管理员索取服务器公网 IP"}
            </span>
          </Space>
        </Notice>
      ) : null}

      <Form form={form} layout="vertical" style={{ maxWidth: 760, marginTop: 12 }}>
        <Divider plain style={{ margin: "0 0 12px" }}>
          小程序主体
        </Divider>
        <Form.Item
          name="appId"
          label="小程序 AppID"
          extra="微信公众平台 → 开发管理 → 开发设置 → AppID；一个 AppID 只能绑一个市场"
          rules={[
            { required: true, message: "请填写小程序 AppID" },
            { pattern: APP_ID_PATTERN, message: "AppID 应形如 wx1234567890abcdef" },
          ]}
        >
          <Input style={{ maxWidth: 320 }} maxLength={64} placeholder="wx…" />
        </Form.Item>
        <Form.Item
          name="appSecret"
          label="小程序 AppSecret"
          extra="与 AppID 同页；重置后微信只显示一次，请立即粘贴保存"
        >
          <Input.Password
            style={{ maxWidth: 420 }}
            maxLength={128}
            placeholder={secretPlaceholder(app.appSecretConfigured, "AppSecret", "AppSecret（必填）")}
          />
        </Form.Item>
        <Divider plain style={{ margin: "12px 0" }}>
          微信支付（资金直进你的商户号）
        </Divider>
        <Form.Item name="payEnabled" label="开启在线收款" valuePropName="checked">
          <Switch checkedChildren="在线收款" unCheckedChildren="线下登记" />
        </Form.Item>
        <Form.Item name="mchId" label="微信支付商户号 mchid" extra="商户平台账户中心里的数字商户号，本市场专属">
          <Input style={{ maxWidth: 260 }} maxLength={64} placeholder="如 1600000000" />
        </Form.Item>
        <Form.Item name="payApiV3Key" label="APIv3 密钥" extra="商户平台 → 账户中心 → APIv3 密钥，32 位；回调报文用它解密">
          <Input.Password
            style={{ maxWidth: 420 }}
            maxLength={128}
            placeholder={secretPlaceholder(app.payKeyConfigured, "APIv3 密钥", "APIv3 密钥（开启在线收款必填）")}
          />
        </Form.Item>
        <Form.Item name="payCertSerial" label="商户证书序列号" extra="商户平台 API 证书里的序列号，明文保存、可回显">
          <Input style={{ maxWidth: 420 }} maxLength={128} placeholder="如 5157F09EF9727AE160BB38F82BABEDZ2" />
        </Form.Item>
        <Form.Item
          name="payPrivateKey"
          label="商户 API 证书私钥"
          extra="apiclient_key.pem 文件内容整段粘贴；与证书序列号必须来自同一次证书申请"
        >
          <Input.TextArea
            rows={3}
            maxLength={8192}
            placeholder={secretPlaceholder(app.payCertConfigured, "证书私钥", "apiclient_key.pem 的 PEM 内容")}
          />
        </Form.Item>

        <Space wrap>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            保存凭据
          </Button>
          <Button
            loading={testing}
            onClick={async () => {
              setTesting(true);
              try {
                await onTestApp();
              } finally {
                setTesting(false);
              }
            }}
          >
            连通自检
          </Button>
          <Button
            loading={payTesting}
            onClick={async () => {
              setPayTesting(true);
              try {
                await onTestPay();
              } finally {
                setPayTesting(false);
              }
            }}
          >
            支付自检
          </Button>
          <span className="muted text-12">支付自检只核对凭据是否齐全，不会发起真实下单</span>
        </Space>
      </Form>
    </Panel>
  );
}

