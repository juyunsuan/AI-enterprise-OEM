"use client";

import { App, Button, Divider, Form, Input, Space, Tag } from "antd";
import { useEffect, useState } from "react";
import {
  MINI_APP_STATUS_LABELS,
  type MiniAppInput,
  type MiniAppTestResult,
  type MiniAppView,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { Notice, Panel } from "@/components/ui/panel";
import { Descriptions, LoadError, useHealthResource } from "./health-common";
import { useHealthShopId } from "./health-scope";

/**
 * 微信凭据：店主自己那部小程序的 AppID、密钥、商户号与订阅消息模板位。
 * 密钥类字段只写不读（留空即保留库里原值），读接口只回「是否已配置」。
 */

/** 只写不读的字段：留空不覆盖。 */
const SECRET_FIELDS = ["appSecret", "payApiV3Key", "payPrivateKey", "mapKey"] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

type WechatForm = {
  appId: string;
  mchId: string;
  payCertSerial: string;
  payEnabled: boolean;
  templates?: Record<string, string>;
} & Partial<Record<SecretField, string>>;

export function WechatTab() {
  const shopId = useHealthShopId();
  const view = useHealthResource(() => healthApi.wechat({ query: { shopId } }), [shopId], shopId > 0);
  const app = view.data;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {view.error ? <LoadError text={view.error} /> : null}
      {app ? <CredentialForm shopId={shopId} app={app} onSaved={() => void view.reload()} /> : null}
      {!app && !view.error ? <span className="muted text-12">正在读取小程序主体凭据…</span> : null}
    </div>
  );
}

function CredentialForm({
  shopId,
  app,
  onSaved,
}: {
  shopId: number;
  app: MiniAppView;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<WechatForm>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<MiniAppTestResult | null>(null);
  const [extra, setExtra] = useState<{ key: string; value: string } | null>(null);
  const templateKeys = Object.keys(app.templates ?? {});

  useEffect(() => {
    form.setFieldsValue({
      appId: app.appId,
      mchId: app.mchId,
      payCertSerial: app.payCertSerial,
      payEnabled: app.payEnabled,
      templates: { ...app.templates },
    });
  }, [app, form]);

  const secretPlaceholder = (configured: boolean, name: string, emptyText: string) =>
    configured ? `已配置，留空则不修改（${name}）` : emptyText;

  const save = async () => {
    const values = await form.validateFields();
    const merged: Record<string, string> = { ...app.templates, ...(values.templates ?? {}) };
    if (extra?.key.trim() && extra.value.trim()) {
      merged[extra.key.trim().slice(0, 40)] = extra.value.trim().slice(0, 64);
    }
    // 清空某个模板位即从 record 里摘掉，避免留一串空串。
    const templates = Object.fromEntries(
      Object.entries(merged).filter(([, value]) => String(value || "").trim()),
    );
    const body: MiniAppInput & { shopId: number } = {
      shopId,
      appId: String(values.appId || "").trim(),
      mchId: String(values.mchId || "").trim(),
      payCertSerial: String(values.payCertSerial || "").trim(),
      payEnabled: Boolean(values.payEnabled),
      templates,
    };
    for (const field of SECRET_FIELDS) {
      const plain = String(values[field] ?? "").trim();
      if (plain) body[field] = plain;
    }
    setSaving(true);
    try {
      await healthApi.wechatSave({ body });
      message.success("微信凭据已保存（密钥只写不读，留空即保留原值）");
      SECRET_FIELDS.forEach((field) => form.setFieldValue(field, ""));
      setExtra(null);
      onSaved();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const result = await healthApi.wechatTest({ body: { shopId } });
      setTest(result ?? null);
      if (result?.ok) {
        message.success(result.message || "自检通过");
      } else {
        message.error(result?.message || "自检未通过");
      }
      onSaved();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <Panel
        title="小程序主体"
        titleExtra={
          <Space size={6} wrap>
            <Tag color={app.configured ? "green" : "default"}>
              {app.configured ? "凭据齐全" : "凭据未配齐"}
            </Tag>
            <Tag color={app.status === "VERIFIED" ? "blue" : app.status === "FAILED" ? "red" : "default"}>
              {MINI_APP_STATUS_LABELS[app.status]}
            </Tag>
          </Space>
        }
      >
        <Notice variant="info">
          这部小程序属于你自己的微信主体：AppID、AppSecret 与商户号都由你自己申请，
          顾客的付款直接进你的微信商户账户。密钥只写不读，保存后只显示「已配置」。
          这里的凭据供本站做连通自检、生成小程序码、走微信支付与客服使用；编译预览与上传代码都在你自己的
          微信开发者工具里完成，本站不代传。
          获取路径：微信公众平台「开发管理 → 开发设置」里取 AppID 与 AppSecret；
          商户号在微信支付商户平台「账户中心」。
        </Notice>
        {app.lastError ? <Notice variant="error">上次自检失败：{app.lastError}</Notice> : null}
        {test ? (
          <Notice variant={test.ok ? "success" : "error"}>
            {test.ok ? "自检通过" : "自检未通过"}：{test.message || "微信没有返回更多信息"}
          </Notice>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <Descriptions
            items={[
              { label: "AppID", value: app.appId || "未填写" },
              {
                label: "密钥状态",
                value: `AppSecret ${app.appSecretConfigured ? "已配置" : "未配置"}`,
              },
              {
                label: "微信支付",
                value: app.mchId
                  ? `商户号 ${app.mchId}（${app.payEnabled ? "在线收款" : "线下登记"}）`
                  : "未配置商户号",
              },
              {
                label: "订阅消息模板位",
                value: templateKeys.length ? templateKeys.join("、") : "未登记",
              },
            ]}
          />
        </div>

        <Divider plain style={{ margin: "16px 0 12px" }}>
          凭据与支付
        </Divider>
        <Form form={form} layout="vertical" style={{ maxWidth: 760 }}>
          <Form.Item
            name="appId"
            label="小程序 AppID"
            extra="一个 AppID 只能绑一家健康管理店铺，两个店铺共用一个会抢同一部小程序（开发者工具里的 project.config.json 也填这个 AppID）"
            rules={[
              { required: true, message: "请填写小程序 AppID" },
              { pattern: /^wx[0-9a-zA-Z]{14,32}$/, message: "AppID 应形如 wx1234567890abcdef" },
            ]}
          >
            <Input style={{ maxWidth: 320 }} maxLength={64} placeholder="wx…" />
          </Form.Item>
          <Form.Item
            name="appSecret"
            label="小程序 AppSecret"
            extra="与 AppID 同页；生成小程序码与调微信接口要用它，微信只显示一次"
          >
            <Input.Password
              style={{ maxWidth: 420 }}
              maxLength={128}
              placeholder={secretPlaceholder(app.appSecretConfigured, "AppSecret", "AppSecret（必填）")}
            />
          </Form.Item>
          <Form.Item
            name="mchId"
            label="微信支付商户号"
            extra="顾客付款直接进这个商户号，平台不经手资金"
          >
            <Input style={{ maxWidth: 260 }} maxLength={64} placeholder="如 1600000000" />
          </Form.Item>
          <Form.Item
            name="payApiV3Key"
            label="APIv3 密钥"
            extra="商户平台 → 账户中心 → APIv3 密钥，32 位；支付回调报文用它解密"
          >
            <Input.Password
              style={{ maxWidth: 420 }}
              maxLength={128}
              placeholder={secretPlaceholder(app.payKeyConfigured, "APIv3 密钥", "APIv3 密钥（开启收款必填）")}
            />
          </Form.Item>
          <Form.Item
            name="payCertSerial"
            label="商户证书序列号"
            extra="商户平台 API 证书里的序列号，明文保存、可回显"
          >
            <Input style={{ maxWidth: 420 }} maxLength={128} />
          </Form.Item>
          <Form.Item
            name="payPrivateKey"
            label="商户 API 证书私钥"
            extra="apiclient_key.pem 整段粘贴；与证书序列号必须来自同一次证书申请"
          >
            <Input.TextArea
              rows={3}
              maxLength={8192}
              placeholder={secretPlaceholder(app.payCertConfigured, "证书私钥", "PEM 内容")}
            />
          </Form.Item>
          <Form.Item
            name="mapKey"
            label="地图服务密钥"
            extra="选填：门店与医院地址需要地图定位时再填"
          >
            <Input.Password
              style={{ maxWidth: 420 }}
              maxLength={128}
              placeholder={secretPlaceholder(app.mapKeyConfigured, "地图密钥", "选填")}
            />
          </Form.Item>

          <Divider plain style={{ margin: "12px 0" }}>
            订阅消息模板位
          </Divider>
          <span className="muted text-12">
            模板位键名由你自己定（预约成功、接诊提醒等），值是微信公众平台「订阅消息」里的模板 ID；
            留空即删除该模板位。
          </span>
          {templateKeys.length ? (
            templateKeys.map((key) => (
              <Form.Item key={key} name={["templates", key]} label={key} style={{ marginTop: 12 }}>
                <Input maxLength={64} placeholder="微信订阅消息模板 ID" />
              </Form.Item>
            ))
          ) : (
            <div className="muted text-12" style={{ marginTop: 8 }}>
              还没有模板位：不影响下单与履约，只是顾客收不到订阅消息提醒。
            </div>
          )}
          {extra ? (
            <div className="muted text-12" style={{ marginTop: 12 }}>
              保存时会并入一个模板位：{extra.key || "（待填键名）"} → {extra.value || "（待填模板 ID）"}
            </div>
          ) : null}
          <Space wrap style={{ marginTop: 12 }}>
            <Input
              style={{ width: 160 }}
              maxLength={40}
              placeholder="模板位键名"
              value={extra?.key ?? ""}
              onChange={(event) => setExtra({ key: event.target.value, value: extra?.value ?? "" })}
            />
            <Input
              style={{ width: 240 }}
              maxLength={64}
              placeholder="模板 ID"
              value={extra?.value ?? ""}
              onChange={(event) => setExtra({ key: extra?.key ?? "", value: event.target.value })}
            />
          </Space>

          <Space wrap style={{ marginTop: 16 }}>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              保存凭据
            </Button>
            <Button loading={testing} onClick={() => void runTest()}>
              连通自检
            </Button>
            <span className="muted text-12">自检只核对凭据是否可用，不会发起真实下单</span>
          </Space>
        </Form>
      </Panel>
    </>
  );
}
