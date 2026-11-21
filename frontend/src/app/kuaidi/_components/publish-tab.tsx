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
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  type KuaidiAppSaveBody,
  type KuaidiAppTestResult,
  type MiniAppView,
} from "@enterprise/contracts";
import { kuaidiApi } from "@/api/kuaidi";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { MiniProgramPublishGuide } from "@/components/mini-program/publish-guide";
import { fmtTime } from "@/lib/datetime";

/**
 * 发布：主体凭据 → 直接下载统一源码包（zip）→ 在微信开发者工具里自填参数、编译上传。
 * 没有「生成代码包」按钮，也没有发布台账：包是平台模板源码，点了就下。
 *
 * 与其它建站工具同一套底座：一个账号一部小程序，AppID 都属店主自己的主体。
 * 微信支付凭据不在这里：运费走「收款账户」里的企业级商户号。
 */
const APP_ID_PATTERN = /^wx[0-9a-zA-Z]{14,32}$/;

/** 密钥类字段只写不读：留空即沿用库里原值。 */
const SECRET_FIELDS = ["appSecret"] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

type CredentialValues = {
  appId: string;
} & Partial<Record<SecretField, string>>;

export function PublishTab() {
  const { message } = App.useApp();
  const [app, setApp] = useState<MiniAppView | null>(null);
  const [test, setTest] = useState<KuaidiAppTestResult | null>(null);
  const [qrcodePath, setQrcodePath] = useState("");

  const load = useCallback(async () => {
    try {
      setApp(await kuaidiApi.appDetail());
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "发布信息读取失败");
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const serverIp = test?.serverIp || "";

  const saveApp = async (body: KuaidiAppSaveBody) => {
    const next = await kuaidiApi.appSave({ body });
    if (next) setApp(next);
    message.success("凭据已保存（密钥只写不读，留空即保留原值）");
    await load();
  };

  const testApp = async () => {
    try {
      const result = await kuaidiApi.appTest({ body: {} });
      if (result) setTest(result);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "自检失败");
    }
  };

  const generateQrcode = async () => {
    try {
      const view = await kuaidiApi.qrcodeGenerate({ body: { path: qrcodePath.trim() } });
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
          <Notice variant="info">
            <Space orientation="vertical" size={2}>
              <strong>2. 业务域名（AI 客服 web-view）</strong>
              <span className="text-12">
                客服会话走 web-view，业务域名与 request 是两套清单：同样把站点域名加进
                业务域名，并按微信提示下载校验文件放到站点根目录。未绑定 AI 客服站点时，
                小程序端回落联系方式卡片，不会白屏。
              </span>
            </Space>
          </Notice>
        </Space>
      </Panel>


      {/* 与「建站管理·小程序板块」「帮助中心」同一份说明、同一个后端接口；下载按钮就在组件里。 */}
      <MiniProgramPublishGuide
        tool="kuaidi"
        onOpenSettings={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      />
      <Panel
        title="小程序码"
        titleExtra={
          <span className="muted text-12">
            扫码进入小程序后由顾客选择寄件点；要直达某一站，可在落地页路径后带
            {" "}<Typography.Text className="mono">?site=寄件点码</Typography.Text>
          </span>
        }
      >
        <Space wrap align="start">
          <Input
            style={{ width: 340 }}
            maxLength={120}
            disabled={!app?.appId || !app?.appSecretConfigured}
            placeholder="留空为首页；可填 pages/index/index?site=寄件点码"
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
                alt="本站小程序码"
                width={180}
                height={180}
                style={{ objectFit: "contain" }}
              />
              <Space orientation="vertical" size={4}>
                <Typography.Link href={app.qrcodeUrl} target="_blank" rel="noopener noreferrer">
                  下载小程序码原图
                </Typography.Link>
                <span className="muted text-12">
                  存下来贴到朋友圈、包裹卡或门店物料；扫码进的是当前线上版本，与开发版无关。
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
}: {
  app: MiniAppView | null;
  test: KuaidiAppTestResult | null;
  serverIp: string;
  onSave: (body: KuaidiAppSaveBody) => Promise<void>;
  onTestApp: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CredentialValues>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!app) return;
    form.setFieldsValue({
      appId: app.appId,
    });
  }, [app, form]);

  if (!app) {
    return (
      <Panel title="主体凭据（你自己的小程序）">
        <span className="muted text-12">正在读取本账号的小程序主体…</span>
      </Panel>
    );
  }

  const secretPlaceholder = (configured: boolean, configuredText: string, emptyText: string) =>
    configured ? `已配置，留空则不修改（${configuredText}）` : emptyText;

  const save = async () => {
    const values = await form.validateFields();
    const body: KuaidiAppSaveBody = {
      appId: values.appId.trim(),
      // 快递寄件不在这张表存商户号（走「收款账户」），原值原样带回避免被默认值清空
      mchId: app.mchId,
      payCertSerial: app.payCertSerial,
      payEnabled: app.payEnabled,
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
          <Tag color={app.appId ? "success" : "default"}>{app.appId ? "已填写 AppID" : "未填写 AppID"}</Tag>
          {app.verifiedAt ? <span className="muted text-12">最近自检 {fmtTime(app.verifiedAt)}</span> : null}
        </Space>
      }
    >
      <Notice variant="info">
        一个账号对应你自己申请的一部微信小程序：AppID 全局唯一，顾客进小程序后选择寄件点，
        多个寄件点共用这一部小程序。微信支付商户号不在这里，
        请到「收款账户」维护（运费直接进你的商户号，平台不经手资金）。密钥类字段只写不读，
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
          extra="微信公众平台 → 开发管理 → 开发设置 → AppID；一个 AppID 只绑本账号一部小程序"
          rules={[
            { required: true, message: "请填写小程序 AppID" },
            { pattern: APP_ID_PATTERN, message: "AppID 应形如 wx1234567890abcdef" },
          ]}
        >
          <Input style={{ maxWidth: 320 }} maxLength={64} placeholder="wx…" />
        </Form.Item>
        <Form.Item name="appSecret" label="小程序 AppSecret" extra="与 AppID 同页；重置后微信只显示一次，请立即粘贴保存">
          <Input.Password
            style={{ maxWidth: 420 }}
            maxLength={128}
            placeholder={secretPlaceholder(app.appSecretConfigured, "AppSecret", "AppSecret（必填）")}
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
          <span className="muted text-12">
            收款商户号请到「收款账户」维护；自检只校验 AppID 与密钥能否换到 access_token
          </span>
        </Space>
      </Form>
    </Panel>
  );
}

