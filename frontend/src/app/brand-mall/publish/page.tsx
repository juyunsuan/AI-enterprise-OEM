"use client";
import {
  App,
  Button,
  Divider,
  Form,
  Image,
  Input,
    Space,
  Switch,
  Tooltip,
  Typography,
} from "antd";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MINI_TEMPLATE_KEYS,
  MINI_TEMPLATE_LABELS,
  type BrandAppSaveBody,
  type BrandAppTestResult,
  type BrandMeta,
  type MiniAppView,
} from "@enterprise/contracts";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { MiniProgramPublishGuide } from "@/components/mini-program/publish-guide";
import { fmtTime } from "@/lib/datetime";
import {
  useBrandApp,
  useBrandPublishActions,
} from "@/query/brand-mall";
import { BrandShell, useBrandScope } from "../_components/brand-shell";
import { StatusTag, dash } from "../_components/brand-common";


/** 与后端 `MiniAppService.save` 同一套校验，页面上先挡住一遍。 */
const APP_ID_PATTERN = /^wx[0-9a-zA-Z]{14,32}$/;

/** 密钥类字段：只写不读，留空即沿用库里原值。 */
const SECRET_FIELDS = [
  "appSecret",
  "payApiV3Key",
  "payPrivateKey",
  "mapKey",
] as const;

type SecretField = (typeof SECRET_FIELDS)[number];

type CredentialValues = {
  appId: string;
  mchId: string;
  payCertSerial: string;
  payEnabled: boolean;
  templates: Record<string, string>;
} & Partial<Record<SecretField, string>>;

export default function BrandPublishPage() {
  return (
    <BrandShell
      active="publish"
      title="小程序发布"
      desc="每家店铺对应你自己申请的一部微信小程序：AppID、微信商户号都是这一家店自己的，顾客付款直接进你自己的微信商户账户，平台不经手、不过账资金。这一页做三件事——绑定主体凭据、直接下载统一源码包（下载后自己在开发者工具填参数并上传）、生成小程序码。"
    >
      <PublishWorkbench />
    </BrandShell>
  );
}

function PublishWorkbench() {
  const { shopId, shop, meta } = useBrandScope();
  const appQuery = useBrandApp({ shopId });
  const app = appQuery.data ?? null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <CredentialSection
        shopId={shopId}
        meta={meta}
        app={app}
        loading={appQuery.isPending && !appQuery.data}
      />
      {/* 与「建站管理·小程序板块」「帮助中心」同一份说明、同一个后端接口；下载按钮就在组件里。 */}
      <MiniProgramPublishGuide tool="brand-mall" />
      <QrcodeSection shopId={shopId} app={app} shopCode={shop?.shopCode ?? ""} />
    </div>
  );
}

// ---------------------------------------------------------------- 主体凭据

function CredentialSection({
  shopId,
  meta,
  app,
  loading,
}: {
  shopId: number;
  meta: BrandMeta | null;
  app: MiniAppView | null;
  loading: boolean;
}) {
  const router = useRouter();
  const [test, setTest] = useState<BrandAppTestResult | null>(null);

  if (loading || !app) {
    return (
      <Panel title="主体凭据（你自己的小程序）">
        <span className="muted text-12">正在读取本店的小程序主体…</span>
      </Panel>
    );
  }

  return (
    <Panel
      title="主体凭据（你自己的小程序）"
      titleExtra={
        <Space size={6}>
          <StatusTag meta={meta} kind="appStatus" value={app.status} />
          {app.verifiedAt ? (
            <span className="muted text-12">最近自检 {fmtTime(app.verifiedAt)}</span>
          ) : null}
        </Space>
      }
    >
      <Notice variant="info">
        这里填的是你自己在微信公众平台申请的小程序凭据（开发管理 → 开发设置）。
        AppID 全局唯一：一部小程序只属于一个主体，两家店铺不能共用同一个 AppID，否则在微信开发者工具里上传会互相覆盖版本。
        微信支付商户号也归这一家店，顾客付款直接进你自己的微信商户账户，平台不经手、不过账资金。
        密钥类字段只写不读：保存后页面只显示「已配置，留空则不修改」，不会把密文回显到输入框。
      </Notice>
      {app.lastError ? <Notice variant="error">上次自检失败：{app.lastError}</Notice> : null}

      <CredentialForm
        key={`${shopId}-${app.appId}`}
        shopId={shopId}
        app={app}
        payAllowed={meta?.payAllowed !== false}
        onSaved={() => setTest(null)}
        onResult={(result) => {
          setTest(result);
        }}
      />

      {test ? (
        <Notice variant={test.ok ? "success" : "error"}>
          <Space orientation="vertical" size={4} style={{ width: "100%" }}>
            <span>
              {test.ok ? "自检通过" : "自检未通过"}：{test.message || "微信没有返回更多信息"}
            </span>
            {test.nextAction ? (
              <span className="muted text-12">{test.nextAction}</span>
            ) : null}
            <span className="muted text-12">
              本机出口 IP：
              {test.serverIp ||
                "未取到——请向平台管理员索取服务器公网 IP，再进微信后台加白名单"}
            </span>
            {!test.ok && test.nextPath ? (
              <div>
                <Button
                  size="small"
                  onClick={() => router.push(test.nextPath)}
                >
                  按提示去处理
                </Button>
              </div>
            ) : null}
          </Space>
        </Notice>
      ) : null}
    </Panel>
  );
}

/**
 * 凭据表单单独拆出来：`key` 随店铺与 AppID 变化重建，
 * 换店或换主体后不会把上一部的输入留在表单里（密钥本来也不回显）。
 */
function CredentialForm({
  shopId,
  app,
  payAllowed,
  onSaved,
  onResult,
}: {
  shopId: number;
  app: MiniAppView;
  payAllowed: boolean;
  onSaved: () => void;
  onResult: (result: BrandAppTestResult) => void;
}) {
  const { message } = App.useApp();
  const actions = useBrandPublishActions();
  const [form] = Form.useForm<CredentialValues>();

  const initial: CredentialValues = {
    appId: app.appId,
    mchId: app.mchId,
    payCertSerial: app.payCertSerial,
    payEnabled: app.payEnabled,
    templates: { ...app.templates },
  };

  /** 密钥输入框的占位符：已配置时说清「留空则不修改」，未配置时说清去哪儿拿。 */
  const secretPlaceholder = (
    configured: boolean,
    configuredText: string,
    emptyText: string,
  ) => (configured ? `已配置，留空则不修改（${configuredText}）` : emptyText);

  const save = async () => {
    const values = await form.validateFields();
    const body: BrandAppSaveBody = {
      shopId,
      appId: values.appId.trim(),
      mchId: values.mchId.trim(),
      payCertSerial: values.payCertSerial.trim(),
      payEnabled: values.payEnabled,
      // 订阅模板要凑齐字符串字典：契约的 record 不接受 undefined 值，缺位补空串
      templates: Object.fromEntries(
        MINI_TEMPLATE_KEYS.map((key) => [key, (values.templates?.[key] ?? "").trim()]),
      ),
    };
    // 只有真填了才带上：留空在后端意思是「沿用原密文」，发空串会被当成覆盖成空
    for (const field of SECRET_FIELDS) {
      const plain = (values[field] ?? "").trim();
      if (plain) body[field] = plain;
    }
    try {
      const next = await actions.saveApp.mutateAsync({ body });
      for (const field of SECRET_FIELDS) form.setFieldValue(field, "");
      message.success("凭据已保存（密钥只写不读，留空即保留原值）");
      if (next) onSaved();
    } catch {
      // 失败原因后端已给到可执行文案，mutations 的 onError 已弹提示
    }
  };

  const testApp = async () => {
    try {
      const result = await actions.appTest.mutateAsync({ body: { shopId } });
      if (result) onResult(result);
    } catch {
      /* 同上 */
    }
  };

  const testPay = async () => {
    try {
      const result = await actions.payTest.mutateAsync({ body: { shopId } });
      if (result) onResult(result);
    } catch {
      /* 同上 */
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initial}
      style={{ maxWidth: 760, marginTop: 12 }}
    >
      <Divider plain style={{ margin: "0 0 12px" }}>
        小程序主体
      </Divider>
      <Form.Item
        name="appId"
        label="小程序 AppID"
        extra="微信公众平台 → 开发管理 → 开发设置 → AppID；一个 AppID 只能绑一家店铺"
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
        extra="同一页面的「AppSecret」，重置后微信只显示一次，请立即粘贴保存"
      >
        <Input.Password
          style={{ maxWidth: 420 }}
          maxLength={128}
          placeholder={secretPlaceholder(
            app.appSecretConfigured,
            "AppSecret",
            "AppSecret（必填，出包与登录都要用）",
          )}
        />
      </Form.Item>
      <Form.Item
        name="mapKey"
        label="腾讯地图 key（可选）"
        extra="只在商品带配送范围等地图能力时需要"
      >
        <Input
          style={{ maxWidth: 420 }}
          maxLength={128}
          placeholder={secretPlaceholder(app.mapKeyConfigured, "地图 key", "地图 key（可选）")}
        />
      </Form.Item>

      <Divider plain style={{ margin: "12px 0" }}>
        微信支付（资金直进你的商户号）
      </Divider>
      {!payAllowed ? (
        <Notice variant="warn">
          平台当前不允许用户开启在线收款，「支付自检」已禁用，顾客下单只会落线下标记；
          需要开通请联系平台管理员。凭据仍可以先保存，放开后直接可用。
        </Notice>
      ) : null}
      <Form.Item name="payEnabled" label="开启在线收款" valuePropName="checked">
        <Switch checkedChildren="在线收款" unCheckedChildren="线下登记" />
      </Form.Item>
      <Form.Item
        name="mchId"
        label="微信支付商户号 mchid"
        extra="商户平台账户中心里的数字商户号，本店专属，不能与其他店铺共用"
      >
        <Input style={{ maxWidth: 260 }} maxLength={64} placeholder="如 1600000000" />
      </Form.Item>
      <Form.Item
        name="payApiV3Key"
        label="APIv3 密钥"
        extra="商户平台 → 账户中心 → APIv3 密钥，32 位；回调报文用它解密"
      >
        <Input.Password
          style={{ maxWidth: 420 }}
          maxLength={128}
          placeholder={secretPlaceholder(
            app.payKeyConfigured,
            "APIv3 密钥",
            "APIv3 密钥（开启在线收款必填）",
          )}
        />
      </Form.Item>
      <Form.Item
        name="payCertSerial"
        label="商户证书序列号"
        extra="商户平台 → API 证书里的序列号，明文保存、可回显"
      >
        <Input style={{ maxWidth: 420 }} maxLength={128} placeholder="如 5157F09EF9727AE160BB38F82BABEDZ2" />
      </Form.Item>
      <Form.Item
        name="payPrivateKey"
        label="商户 API 证书私钥"
        extra="apiclient_key.pem 文件内容整段粘贴；与证书序列号必须来自同一次证书申请。"
      >
        <Input.TextArea
          rows={3}
          maxLength={8192}
          placeholder={secretPlaceholder(
            app.payCertConfigured,
            "证书私钥",
            "apiclient_key.pem 的 PEM 内容",
          )}
        />
      </Form.Item>

      <Divider plain style={{ margin: "12px 0" }}>
        订阅消息模板（可选）
      </Divider>
      <Form.Item
        label="模板 ID"
        extra="来自你自己小程序后台「功能 → 订阅消息」的模板 ID；留空时对应通知只走站内提醒，不影响下单。"
      >
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          {MINI_TEMPLATE_KEYS.map((key) => (
            <Form.Item key={key} name={["templates", key]} noStyle>
              <Input
                style={{ maxWidth: 460 }}
                maxLength={128}
                prefix={MINI_TEMPLATE_LABELS[key]}
                placeholder="模板 ID（可选）"
              />
            </Form.Item>
          ))}
        </Space>
      </Form.Item>

      <Space wrap style={{ marginTop: 4 }}>
        <Button type="primary" loading={actions.saveApp.isPending} onClick={() => void save()}>
          保存凭据
        </Button>
        <Button loading={actions.appTest.isPending} onClick={() => void testApp()}>
          连通自检
        </Button>
        <Tooltip
          title={payAllowed ? undefined : "平台已关闭在线收款，支付自检不可用"}
        >
          <Button loading={actions.payTest.isPending} disabled={!payAllowed} onClick={() => void testPay()}>
            支付自检
          </Button>
        </Tooltip>
        {!payAllowed ? (
          <span className="muted text-12">支付自检已禁用：平台未允许在线收款</span>
        ) : (
          <span className="muted text-12">
            支付自检只核对商户号凭据是否齐全、私钥能否解析，不会发起真实下单
          </span>
        )}
      </Space>
    </Form>
  );
}

// ---------------------------------------------------------------- 小程序码

function QrcodeSection({
  shopId,
  app,
  shopCode,
}: {
  shopId: number;
  app: MiniAppView | null;
  shopCode: string;
}) {
  const { message } = App.useApp();
  const actions = useBrandPublishActions();
  const [path, setPath] = useState("");
  const blocked = !app?.appId || !app?.appSecretConfigured;

  const generate = async () => {
    try {
      const view = await actions.qrcode.mutateAsync({
        body: { shopId, path: path.trim() },
      });
      if (view?.qrcodeUrl) message.success("小程序码已生成");
    } catch {
      /* 微信侧失败原因（IP/权限/未发布）后端已给原文，onError 已弹提示 */
    }
  };

  return (
    <Panel
      title="小程序码"
      titleExtra={
        <span className="muted text-12">
          码里带的 scene 是店铺码 {dash(shopCode)}，顾客扫码直接进这一家店，不会串店
        </span>
      }
    >
      <Space wrap align="start">
        <Input
          style={{ width: 340 }}
          maxLength={120}
          disabled={blocked}
          placeholder="落地页路径，留空为首页 pages/index/index"
          value={path}
          onChange={(event) => setPath(event.target.value.trim())}
        />
        <Button
          type="primary"
          loading={actions.qrcode.isPending}
          disabled={blocked}
          onClick={() => void generate()}
        >
          生成小程序码
        </Button>
      </Space>
      {blocked ? (
        <Notice variant="warn">
          生成小程序码要调用微信接口（wxacode.getUnlimited）：请先在「主体凭据」保存
          AppID 与 AppSecret 并做连通自检。
        </Notice>
      ) : (
        <span className="muted text-12">
          页面路径要写小程序里已发布的路径，首页可不填；重新生成会覆盖本站记录的码图片地址。
        </span>
      )}
      <div style={{ marginTop: 12 }}>
        {app?.qrcodeUrl ? (
          <Space align="start">
            <Image
              src={app.qrcodeUrl}
              alt="本店小程序码"
              width={180}
              height={180}
              style={{ objectFit: "contain" }}
            />
            <Space orientation="vertical" size={4}>
              <Typography.Link
                href={app.qrcodeUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                下载小程序码原图
              </Typography.Link>
              <span className="muted text-12">
                存下来贴到朋友圈、包裹卡或门店物料；扫码后进的是当前线上版本，
                与新出的开发版无关。
              </span>
            </Space>
          </Space>
        ) : (
          <EmptyState text="还没有生成小程序码：上面填好路径（或留空）后点「生成小程序码」。" />
        )}
      </div>
    </Panel>
  );
}
