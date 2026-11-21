"use client";

import { QrcodeOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Divider,
  Form,
  Input,
    Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import type {
  ErrandAppTestResult,
  MiniAppView,
} from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";
import { MiniProgramPublishGuide } from "@/components/mini-program/publish-guide";

type CredentialValues = {
  appId: string;
  appSecret?: string;
  mchId: string;
  payApiV3Key?: string;
  payCertSerial: string;
  payPrivateKey?: string;
  payEnabled: boolean;
  mapKey?: string;
  templates?: Record<string, string>;
};

const TEMPLATE_SLOTS: { key: string; label: string }[] = [
  { key: "order", label: "下单成功（顾客）" },
  { key: "accept", label: "接单 / 支付成功（顾客）" },
  { key: "coachChange", label: "送达提醒（顾客）" },
  { key: "cancel", label: "取消提醒（顾客）" },
  { key: "help", label: "新单提醒（骑手）" },
];

/** 发布：主体与支付凭据 → 自检 → 统一源码包直下 + 小程序码；平台不代编译、不代传。 */
export function PublishTab() {
  const { message } = App.useApp();
  const [app, setApp] = useState<MiniAppView | null>(null);
  const [test, setTest] = useState<ErrandAppTestResult | null>(null);
  const [qrcodePath, setQrcodePath] = useState("");
  const [form] = Form.useForm<CredentialValues>();

  const load = useCallback(async () => {
    try {
      const appView = await errandApi.appDetail();
      setApp(appView ?? null);
      if (appView) {
        form.setFieldsValue({
          appId: appView.appId,
          mchId: appView.mchId,
          payCertSerial: appView.payCertSerial,
          payEnabled: appView.payEnabled,
          templates: appView.templates || {},
        });
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "发布信息读取失败");
    }
  }, [form, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const values = await form.validateFields();
    try {
      const next = await errandApi.appSave({ body: values });
      setApp(next ?? null);
      message.success("小程序凭据已保存");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    }
  };

  const runTest = async () => {
    try {
      const result = await errandApi.appTest({ body: {} });
      setTest(result ?? null);
      message.success(result?.ok ? "凭据自检通过" : "自检未通过，按提示补齐");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "自检失败");
    }
  };

  const generateQrcode = async () => {
    try {
      const result = await errandApi.qrcodeGenerate({ body: { path: qrcodePath.trim() } });
      message.success("小程序码已生成并登记到数字资产");
      if (result?.url) window.open(result.url, "_blank");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "生成失败");
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="小程序主体与支付凭据"
        titleExtra={
          <Space>
            {app?.configured ? <Tag color="green">AppID 已配置</Tag> : <Tag>未配置</Tag>}
            {app?.status ? <Tag>{app.status}</Tag> : null}
            <Button size="small" onClick={() => void runTest()}>
              连通自检
            </Button>
          </Space>
        }
      >
        {test ? (
          <Notice variant={test.ok ? "info" : "error"}>
            {test.message}
            {test.nextAction ? ` · 下一步：${test.nextAction}` : ""}
          </Notice>
        ) : null}
        <Form form={form} layout="vertical">
          <Space wrap align="start">
            <Form.Item
              name="appId"
              label="小程序 AppID"
              rules={[{ pattern: /^wx[0-9a-zA-Z]{14,32}$/, message: "应形如 wx1234567890abcdef" }]}
            >
              <Input style={{ width: 280 }} maxLength={64} placeholder="微信公众平台 AppID" />
            </Form.Item>
            <Form.Item name="appSecret" label="AppSecret（留空保留原值）">
              <Input.Password style={{ width: 280 }} maxLength={128} placeholder="只写不读" />
            </Form.Item>
            <Form.Item name="mapKey" label="腾讯地图 Key（留空保留原值）">
              <Input.Password style={{ width: 240 }} maxLength={128} placeholder="用于距离/定位" />
            </Form.Item>
          </Space>
          <Divider titlePlacement="left">微信支付（资金直进你的商户号）</Divider>
          <Space wrap align="start">
            <Form.Item name="mchId" label="商户号">
              <Input style={{ width: 200 }} maxLength={64} />
            </Form.Item>
            <Form.Item name="payApiV3Key" label="APIv3 密钥（留空保留原值）">
              <Input.Password style={{ width: 280 }} maxLength={128} />
            </Form.Item>
            <Form.Item name="payCertSerial" label="证书序列号">
              <Input style={{ width: 240 }} maxLength={128} />
            </Form.Item>
            <Form.Item name="payPrivateKey" label="商户私钥（留空保留原值）">
              <Input.TextArea rows={2} style={{ width: 320 }} placeholder="PEM 内容" />
            </Form.Item>
            <Form.Item name="payEnabled" label="启用在线收款" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Divider titlePlacement="left">订阅消息模板</Divider>
          <Space wrap align="start">
            {TEMPLATE_SLOTS.map((slot) => (
              <Form.Item
                key={slot.key}
                name={["templates", slot.key]}
                label={slot.label}
              >
                <Input style={{ width: 260 }} maxLength={128} placeholder="微信订阅消息模板 ID" />
              </Form.Item>
            ))}
          </Space>
          <Button type="primary" onClick={() => void save()}>
            保存凭据
          </Button>
        </Form>
      </Panel>

      <MiniProgramPublishGuide tool="errand" onOpenSettings={() => window.scrollTo({ top: 0, behavior: "smooth" })} />

      <Panel
        title="小程序码"
        titleExtra={<span className="muted text-12">生成后自动登记到数字资产，可用于线下物料</span>}
      >
        <Space wrap align="start">
          <Input
            style={{ width: 340 }}
            maxLength={120}
            placeholder="留空为首页；可填 pages/index/index"
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
          {app?.qrcodeUrl ? <Typography.Link href={app.qrcodeUrl} target="_blank">最近一次生成</Typography.Link> : null}
        </Space>
        <Notice variant="info">未绑定 AI 客服站点时，小程序端回落联系方式卡片，不会白屏。</Notice>
      </Panel>
    </div>
  );
}
