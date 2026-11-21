"use client";

import {
  App,
  AutoComplete,
  Button,
  Divider,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import type { TableProps } from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  HEALTH_DISPATCH_MODES,
  HEALTH_DISPATCH_MODE_LABELS,
  HEALTH_PHARMACIST_REVIEW_MODES,
  HEALTH_PHARMACIST_REVIEW_MODE_LABELS,
  HEALTH_SCRM_EVENT_LABELS,
  HEALTH_SCRM_EVENT_STATUSES,
  HEALTH_SCRM_EVENT_STATUS_LABELS,
  HEALTH_SCRM_EVENT_TYPES,
  HEALTH_STAFF_ROLES,
  HEALTH_STAFF_ROLE_LABELS,
  type ContentModel,
  type ContentModelChannel,
  type ContentSettings,
  type HealthScrmEventRow,
  type HealthStaffRow,
  type HealthTongueRecord,
  type HealthTrade,
} from "@enterprise/contracts";
import { contentApi } from "@/api/content";
import { healthApi } from "@/api/health";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useRouter } from "next/navigation";
import {
  DataTable,
  Descriptions,
  FilterBar,
  LoadError,
  OnOffTag,
  StatusTag,
  labelOf,
  useHealthResource,
} from "./health-common";
import { useHealthMeta, useHealthScope, useHealthShopId } from "./health-scope";

/**
 * 店铺设置：店铺资料、交易参数、主题、人员权限、AI客服、SCRM。
 * 这些配置都从小程序端实时读取，改完即时生效，不用重新出包。
 */

const PAGE_SIZE = 20;

export function SettingTab() {
  const shopId = useHealthShopId();
  const [tab, setTab] = useState("shop");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "shop", label: "店铺", children: <ShopSection shopId={shopId} /> },
        { key: "trade", label: "交易参数", children: <TradeSection shopId={shopId} /> },
        { key: "theme", label: "主题", children: <ThemeSection shopId={shopId} /> },
        { key: "staff", label: "人员权限", children: <StaffSection shopId={shopId} /> },
        {
          key: "desk",
          label: "AI客服",
          children: (
            <div style={{ display: "grid", gap: 16 }}>
              <DeskSection shopId={shopId} />
              <AiStaffSection shopId={shopId} />
            </div>
          ),
        },
        {
          key: "value-add",
          label: "增值服务",
          children: <TongueSection shopId={shopId} />,
        },
        { key: "scrm", label: "SCRM", children: <ScrmSection shopId={shopId} /> },
      ]}
    />
  );
}

/* ------------------------------ 店铺 ------------------------------ */

type ShopForm = {
  name: string;
  slogan: string;
  logo: string;
  servicePhone: string;
  shareImage: string;
  city: string;
};

function ShopSection({ shopId }: { shopId: number }) {
  const { shop, reload } = useHealthScope();
  const meta = useHealthMeta();
  const { message } = App.useApp();
  const [form] = Form.useForm<ShopForm>();
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!shop) return;
    form.setFieldsValue({
      name: shop.name,
      slogan: shop.slogan,
      logo: shop.logo,
      servicePhone: shop.servicePhone,
      shareImage: shop.shareImage,
      city: shop.city,
    });
  }, [shop, form]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.shopSave({
        body: {
          shopId,
          name: values.name.trim(),
          slogan: values.slogan ?? "",
          logo: values.logo ?? "",
          servicePhone: values.servicePhone ?? "",
          shareImage: values.shareImage ?? "",
          city: values.city ?? "",
        },
      });
      message.success("店铺资料已保存");
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    const next = shop?.status === "ONLINE" ? "DRAFT" : "ONLINE";
    setSwitching(true);
    try {
      await healthApi.shopStatus({ body: { shopId, status: next } });
      message.success(next === "ONLINE" ? "店铺已上线营业" : "店铺已下线，顾客端暂停下单");
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSwitching(false);
    }
  };

  const closeShop = async () => {
    setSwitching(true);
    try {
      await healthApi.shopClose({ body: { shopId, reason: reason.trim() } });
      message.success("店铺已关闭");
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSwitching(false);
    }
  };

  if (!shop) return <span className="muted text-12">正在读取店铺…</span>;

  const offline = shop.status === "CLOSED" || shop.status === "SUSPENDED";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="店铺资料" titleExtra={<span className="muted text-12">店铺码 {shop.shopCode}</span>}>
        <Form form={form} layout="vertical" style={{ maxWidth: 760 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item name="name" label="店铺名称" rules={[{ required: true, message: "请填写店铺名称" }]}>
              <Input maxLength={120} placeholder="如 某某互联网医院" />
            </Form.Item>
            <Form.Item name="slogan" label="一句话介绍">
              <Input maxLength={120} placeholder="首页副标题，如 慢病管理 · 在线问诊" />
            </Form.Item>
            <Form.Item name="logo" label="Logo 地址" extra="建议正方形，域名需可公网访问">
              <Input maxLength={500} placeholder="https://…/logo.png" />
            </Form.Item>
            <Form.Item name="shareImage" label="分享卡片图" extra="顾客转发小程序时展示，建议 5:4">
              <Input maxLength={500} placeholder="https://…/share.png" />
            </Form.Item>
            <Form.Item name="servicePhone" label="客服电话">
              <Input maxLength={32} placeholder="顾客端展示的服务电话" />
            </Form.Item>
            <Form.Item name="city" label="主营城市" extra="小程序切城市的默认值">
              <Input maxLength={60} placeholder="如 杭州" />
            </Form.Item>
          </div>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            保存资料
          </Button>
        </Form>
      </Panel>

      <Panel
        title="营业状态"
        titleExtra={<StatusTag meta={meta} kind="shopStatuses" value={shop.status} />}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <span className="text-12 muted">
            上线后顾客扫码可进入并下单；下线只停止新下单，店内数据、机构医护与订单都保留。
            {shop.status === "SUSPENDED" ? " 当前被平台停服，需联系平台管理员恢复。" : ""}
          </span>
          {shop.status === "CLOSED" ? (
            <Notice variant="warn">店铺已关闭：不能再上线，如需重新经营请另外新建店铺。</Notice>
          ) : (
            <Space wrap>
              <Popconfirm
                title={shop.status === "ONLINE" ? "下线店铺" : "上线营业"}
                description={
                  shop.status === "ONLINE"
                    ? "下线后顾客端暂停下单，已付款订单仍需履约。"
                    : "上线前需已保存 AppID 与密钥，否则顾客扫码进不来。"
                }
                okText="确认"
                onConfirm={() => void toggleStatus()}
              >
                <Button type={shop.status === "ONLINE" ? "default" : "primary"} loading={switching} disabled={offline}>
                  {shop.status === "ONLINE" ? "下线维护" : "上线营业"}
                </Button>
              </Popconfirm>
            </Space>
          )}
        </div>
      </Panel>

      <Panel title="关闭店铺" titleExtra={<span className="muted text-12">不可逆操作，只有店主可以执行</span>}>
        <Notice variant="warn">
          关闭后小程序不再对外开放，历史订单与档案仍可在后台查看；关闭状态无法再切回营业中。
        </Notice>
        <Space wrap style={{ marginTop: 12 }}>
          <Input
            style={{ width: 340 }}
            maxLength={200}
            placeholder="关闭原因（会记录在店铺停业原因里）"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Popconfirm
            title="确认关闭店铺"
            description="关闭后顾客无法再进入小程序，且不能恢复营业。"
            okText="关闭店铺"
            okButtonProps={{ danger: true }}
            onConfirm={() => void closeShop()}
            disabled={shop.status === "CLOSED"}
          >
            <Button danger loading={switching} disabled={shop.status === "CLOSED"}>
              关闭店铺
            </Button>
          </Popconfirm>
        </Space>
      </Panel>
    </div>
  );
}

/* ------------------------------ 交易参数 ------------------------------ */

type TradeForm = Omit<
  HealthTrade,
  "freeShippingOverCents" | "defaultShippingCents" | "withdrawalMinCents"
> & {
  freeShippingYuan: number;
  defaultShippingYuan: number;
  withdrawalMinYuan: number;
};

const TRADE_DEFAULTS: TradeForm = {
  autoCancelMinutes: 15,
  timeUnitMinutes: 30,
  bufferMinutes: 0,
  maxDays: 14,
  allowCrossDay: false,
  bookingLeadMinutes: 30,
  dispatchMode: "PRACTITIONER",
  canTxHours: 24,
  refundReleaseSlot: true,
  onlinePayEnabled: true,
  walletPayEnabled: true,
  pointDeductEnabled: true,
  pointDeductMaxPercent: 50,
  freeShippingYuan: 0,
  defaultShippingYuan: 0,
  prescriptionDrugGuard: true,
  pharmacistReviewMode: "REQUIRED",
  pharmacistSamplePercent: 30,
  prescriptionValidHours: 72,
  selfOnboarding: true,
  onboardingAudit: true,
  promoterEnabled: false,
  promoterRatePercent: 10,
  withdrawalEnabled: true,
  withdrawalMinYuan: 10,
  withdrawalTaxPercent: 0,
  reviewEnabled: true,
  reviewAuditFirst: false,
  alertEnabled: true,
  alertDedupeMinutes: 60,
  followupOverdueHours: 24,
  postAuditFirst: true,
  emergencyTip: "",
};

function TradeSection({ shopId }: { shopId: number }) {
  const { shop, reload } = useHealthScope();
  const { message } = App.useApp();
  const [form] = Form.useForm<TradeForm>();
  const [saving, setSaving] = useState(false);
  const dispatchMode = Form.useWatch("dispatchMode", form);

  useEffect(() => {
    if (!shop) return;
    const trade = shop.trade;
    form.setFieldsValue({
      ...trade,
      freeShippingYuan: trade.freeShippingOverCents / 100,
      defaultShippingYuan: trade.defaultShippingCents / 100,
      withdrawalMinYuan: trade.withdrawalMinCents / 100,
    });
  }, [shop, form]);

  const save = async () => {
    const values = await form.validateFields();
    const body: HealthTrade & { shopId: number } = {
      shopId,
      autoCancelMinutes: Number(values.autoCancelMinutes),
      timeUnitMinutes: Number(values.timeUnitMinutes),
      bufferMinutes: Number(values.bufferMinutes),
      maxDays: Number(values.maxDays),
      allowCrossDay: Boolean(values.allowCrossDay),
      bookingLeadMinutes: Number(values.bookingLeadMinutes),
      dispatchMode: values.dispatchMode,
      canTxHours: Number(values.canTxHours),
      refundReleaseSlot: Boolean(values.refundReleaseSlot),
      onlinePayEnabled: Boolean(values.onlinePayEnabled),
      walletPayEnabled: Boolean(values.walletPayEnabled),
      pointDeductEnabled: Boolean(values.pointDeductEnabled),
      pointDeductMaxPercent: Number(values.pointDeductMaxPercent),
      freeShippingOverCents: Math.round(Number(values.freeShippingYuan || 0) * 100),
      defaultShippingCents: Math.round(Number(values.defaultShippingYuan || 0) * 100),
      prescriptionDrugGuard: Boolean(values.prescriptionDrugGuard),
      pharmacistReviewMode: values.pharmacistReviewMode,
      pharmacistSamplePercent: Number(values.pharmacistSamplePercent),
      prescriptionValidHours: Number(values.prescriptionValidHours),
      selfOnboarding: Boolean(values.selfOnboarding),
      onboardingAudit: Boolean(values.onboardingAudit),
      promoterEnabled: Boolean(values.promoterEnabled),
      promoterRatePercent: Number(values.promoterRatePercent),
      withdrawalEnabled: Boolean(values.withdrawalEnabled),
      withdrawalMinCents: Math.round(Number(values.withdrawalMinYuan || 0) * 100),
      withdrawalTaxPercent: Number(values.withdrawalTaxPercent),
      reviewEnabled: Boolean(values.reviewEnabled),
      reviewAuditFirst: Boolean(values.reviewAuditFirst),
      alertEnabled: Boolean(values.alertEnabled),
      alertDedupeMinutes: Number(values.alertDedupeMinutes),
      followupOverdueHours: Number(values.followupOverdueHours),
      postAuditFirst: Boolean(values.postAuditFirst),
      emergencyTip: String(values.emergencyTip || "").trim(),
    };
    setSaving(true);
    try {
      await healthApi.tradeSave({ body });
      message.success("交易参数已保存，小程序端即时生效");
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="交易与运营参数"
      titleExtra={<span className="muted text-12">数字与开关都按店生效，保存后不必重新出包</span>}
    >
      <Form form={form} layout="vertical" initialValues={TRADE_DEFAULTS}>
        <Divider plain style={{ margin: "0 0 12px" }}>
          预约与号源
        </Divider>
        <Grid>
          <NumItem name="autoCancelMinutes" label="未付款自动取消" suffix="分钟" min={1} max={120} />
          <NumItem
            name="timeUnitMinutes"
            label="可约时间片粒度"
            suffix="分钟"
            min={5}
            max={120}
            extra="必须是 5 的倍数，号源按它切片"
          />
          <NumItem name="bufferMinutes" label="前后缓冲" suffix="分钟" min={0} max={120} />
          <NumItem name="maxDays" label="最多可约到第几天" suffix="天" min={1} max={90} />
          <NumItem name="bookingLeadMinutes" label="最少提前预约" suffix="分钟" min={0} max={1440} />
          <Form.Item name="allowCrossDay" label="允许跨天预约" valuePropName="checked">
            <Switch checkedChildren="允许" unCheckedChildren="仅当天" />
          </Form.Item>
          <Form.Item
            name="dispatchMode"
            label="派单方式"
            extra={dispatchMode ? HEALTH_DISPATCH_MODE_LABELS[dispatchMode] : ""}
          >
            <Select
              options={HEALTH_DISPATCH_MODES.map((value) => ({
                value,
                label: HEALTH_DISPATCH_MODE_LABELS[value],
              }))}
            />
          </Form.Item>
          <Form.Item name="refundReleaseSlot" label="退款回补号源" valuePropName="checked">
            <Switch checkedChildren="回补" unCheckedChildren="不回补" />
          </Form.Item>
        </Grid>

        <Divider plain style={{ margin: "12px 0" }}>
          支付与结算
        </Divider>
        <Grid>
          <Form.Item name="onlinePayEnabled" label="在线收款" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item name="walletPayEnabled" label="储值余额支付" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item name="pointDeductEnabled" label="积分抵扣" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <NumItem name="pointDeductMaxPercent" label="积分最多抵扣比例" suffix="%" min={0} max={100} />
          <NumItem
            name="canTxHours"
            label="完成后多久可提现"
            suffix="小时"
            min={0}
            max={720}
            extra="留出退款与售后窗口，避免先提现后退款"
          />
        </Grid>

        <Divider plain style={{ margin: "12px 0" }}>
          用药与处方
        </Divider>
        <Grid>
          <Form.Item name="prescriptionDrugGuard" label="处方药下单校验" valuePropName="checked">
            <Switch checkedChildren="必须有处方" unCheckedChildren="不校验" />
          </Form.Item>
          <Form.Item name="pharmacistReviewMode" label="药师审方">
            <Select
              options={HEALTH_PHARMACIST_REVIEW_MODES.map((value) => ({
                value,
                label: HEALTH_PHARMACIST_REVIEW_MODE_LABELS[value],
              }))}
            />
          </Form.Item>
          <NumItem name="pharmacistSamplePercent" label="抽检比例" suffix="%" min={1} max={100} />
          <NumItem name="prescriptionValidHours" label="处方有效期" suffix="小时" min={1} max={72} />
        </Grid>

        <Divider plain style={{ margin: "12px 0" }}>
          入驻与分销
        </Divider>
        <Grid>
          <Form.Item name="selfOnboarding" label="允许自助入驻" valuePropName="checked">
            <Switch checkedChildren="允许" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item name="onboardingAudit" label="入驻需店主审核" valuePropName="checked">
            <Switch checkedChildren="需审核" unCheckedChildren="自动通过" />
          </Form.Item>
          <Form.Item name="promoterEnabled" label="推客分销" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <NumItem name="promoterRatePercent" label="默认分佣比例" suffix="%" min={0} max={50} />
        </Grid>

        <Divider plain style={{ margin: "12px 0" }}>
          提现、评价与提醒
        </Divider>
        <Grid>
          <Form.Item name="withdrawalEnabled" label="允许提现" valuePropName="checked">
            <Switch checkedChildren="允许" unCheckedChildren="关闭" />
          </Form.Item>
          <MoneyItem name="withdrawalMinYuan" label="提现最低金额" />
          <NumItem name="withdrawalTaxPercent" label="提现税点" suffix="%" min={0} max={45} />
          <Form.Item name="reviewEnabled" label="评价功能" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item name="reviewAuditFirst" label="评价先审后展示" valuePropName="checked">
            <Switch checkedChildren="先审" unCheckedChildren="直接展示" />
          </Form.Item>
          <Form.Item name="alertEnabled" label="指标预警" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <NumItem name="alertDedupeMinutes" label="预警去重窗口" suffix="分钟" min={1} max={1440} />
          <NumItem name="followupOverdueHours" label="随访逾期提醒" suffix="小时" min={1} max={168} />
          <Form.Item name="postAuditFirst" label="病友圈发帖先审" valuePropName="checked">
            <Switch checkedChildren="先审" unCheckedChildren="直接发布" />
          </Form.Item>
        </Grid>

        <Divider plain style={{ margin: "12px 0" }}>
          商城配送与提示
        </Divider>
        <Grid>
          <MoneyItem name="freeShippingYuan" label="包邮门槛" extra="0 表示不设包邮门槛" />
          <MoneyItem name="defaultShippingYuan" label="默认运费" />
        </Grid>
        <Form.Item
          name="emergencyTip"
          label="紧急就医提示"
          extra="端上固定展示，不可清空；急危重症引导顾客立即就医"
          rules={[{ required: true, message: "请保留紧急就医提示文案" }]}
        >
          <Input.TextArea rows={2} maxLength={200} showCount />
        </Form.Item>

        <Button type="primary" loading={saving} onClick={() => void save()}>
          保存交易参数
        </Button>
      </Form>
    </Panel>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
      {children}
    </div>
  );
}

function NumItem({
  name,
  label,
  suffix,
  min,
  max,
  extra,
}: {
  name: string;
  label: string;
  suffix: string;
  min: number;
  max: number;
  extra?: string;
}) {
  return (
    <Form.Item name={name} label={label} extra={extra}>
      <InputNumber min={min} max={max} precision={0} suffix={suffix} style={{ width: "100%" }} />
    </Form.Item>
  );
}

function MoneyItem({ name, label, extra }: { name: string; label: string; extra?: string }) {
  return (
    <Form.Item name={name} label={label} extra={extra}>
      <InputNumber min={0} precision={2} prefix="¥" style={{ width: "100%" }} />
    </Form.Item>
  );
}

/* ------------------------------ 主题 ------------------------------ */

type ThemeForm = {
  themeColor: string;
  navigationTitle: string;
  tabHome: string;
  tabService: string;
  tabConsult: string;
  tabMine: string;
};

function ThemeSection({ shopId }: { shopId: number }) {
  const { shop, reload } = useHealthScope();
  const { message } = App.useApp();
  const [form] = Form.useForm<ThemeForm>();
  const [saving, setSaving] = useState(false);
  const color = Form.useWatch("themeColor", form);

  useEffect(() => {
    if (!shop) return;
    const labels = shop.theme.tabBarLabels;
    form.setFieldsValue({
      themeColor: shop.theme.themeColor,
      navigationTitle: shop.theme.navigationTitle,
      tabHome: labels[0] ?? "首页",
      tabService: labels[1] ?? "服务",
      tabConsult: labels[2] ?? "问诊",
      tabMine: labels[3] ?? "我的",
    });
  }, [shop, form]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.themeSave({
        body: {
          shopId,
          themeColor: values.themeColor.trim(),
          navigationTitle: values.navigationTitle.trim(),
          tabBarLabels: [
            values.tabHome.trim(),
            values.tabService.trim(),
            values.tabConsult.trim(),
            values.tabMine.trim(),
          ],
        },
      });
      message.success("主题已保存，小程序端重新进入即生效");
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="外观主题" titleExtra={<span className="muted text-12">tabBar 固定四项，顺序不可调整</span>}>
      <Form form={form} layout="vertical" style={{ maxWidth: 560 }}>
        <Form.Item
          name="themeColor"
          label="主题色"
          rules={[{ pattern: /^#[0-9a-fA-F]{6}$/, message: "主题色需为 #RRGGBB" }]}
          extra="按钮、价格与选中态的基色"
        >
          <Input
            maxLength={7}
            placeholder="#1a73e8"
            suffix={
              <span
                style={{
                  display: "inline-block",
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: /^#[0-9a-fA-F]{6}$/.test(String(color || "")) ? String(color) : "#fff",
                  border: "1px solid var(--border)",
                }}
              />
            }
          />
        </Form.Item>
        <Form.Item
          name="navigationTitle"
          label="导航栏标题"
          rules={[{ required: true, message: "请填写导航栏标题" }]}
        >
          <Input maxLength={30} placeholder="如 健康管理" />
        </Form.Item>
        <Divider plain style={{ margin: "0 0 12px" }}>
          底部 tabBar 文案
        </Divider>
        <Grid>
          <Form.Item name="tabHome" label="第 1 项" rules={[{ required: true, message: "请填写" }]}>
            <Input maxLength={8} />
          </Form.Item>
          <Form.Item name="tabService" label="第 2 项" rules={[{ required: true, message: "请填写" }]}>
            <Input maxLength={8} />
          </Form.Item>
          <Form.Item name="tabConsult" label="第 3 项" rules={[{ required: true, message: "请填写" }]}>
            <Input maxLength={8} />
          </Form.Item>
          <Form.Item name="tabMine" label="第 4 项" rules={[{ required: true, message: "请填写" }]}>
            <Input maxLength={8} />
          </Form.Item>
        </Grid>
        <Button type="primary" loading={saving} onClick={() => void save()}>
          保存主题
        </Button>
      </Form>
    </Panel>
  );
}

/* ------------------------------ 人员权限 ------------------------------ */

type StaffForm = {
  userId: string;
  label: string;
  role: string;
  status: string;
  scopes: string[];
};

function StaffSection({ shopId }: { shopId: number }) {
  const meta = useHealthMeta();
  const { message } = App.useApp();
  const list = useHealthResource(
    () => healthApi.staffList({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const scopes = useHealthResource(
    () => healthApi.staffScopes({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const [editing, setEditing] = useState<{ row: HealthStaffRow | null } | null>(null);

  const scopeOptions = useMemo(() => {
    const rows = scopes.data ?? [];
    const groups = Array.from(new Set(rows.map((row) => row.group)));
    return groups.map((group) => ({
      label: group,
      options: rows
        .filter((row) => row.group === group)
        .map((row) => ({ value: row.key, label: row.label })),
    }));
  }, [scopes.data]);

  const scopeLabel = (key: string) =>
    (scopes.data ?? []).find((item) => item.key === key)?.label ?? key;

  const remove = async (row: HealthStaffRow) => {
    try {
      await healthApi.staffRemove({ body: { shopId, id: row.id } });
      message.success("成员已移除");
      await list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const rows = list.data ?? [];

  const columns: TableProps<HealthStaffRow>["columns"] = [
    { title: "账号", dataIndex: "userId", width: 150 },
    { title: "备注", dataIndex: "label", width: 120, render: (value: string) => value || "—" },
    {
      title: "岗位",
      dataIndex: "role",
      width: 110,
      render: (value: string) => labelOf(meta, "staffRoles", value),
    },
    {
      title: "权限面",
      dataIndex: "scopes",
      render: (value: string[]) =>
        value.length ? (
          <Space size={4} wrap>
            {value.map((key) => (
              <Tag key={key}>{scopeLabel(key)}</Tag>
            ))}
          </Space>
        ) : (
          <span className="muted text-12">按岗位默认</span>
        ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "加入时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      fixed: "right",
      render: (_value, row) => (
        <Space size={0}>
          <Button size="small" type="link" onClick={() => setEditing({ row })}>
            编辑
          </Button>
          <Popconfirm
            title={`移除成员 ${row.userId}`}
            description="移除后该账号不能再进这家店的工作台，店内数据不受影响。"
            okText="移除"
            okButtonProps={{ danger: true }}
            onConfirm={() => void remove(row)}
            disabled={row.role === "OWNER"}
          >
            <Button size="small" type="link" danger disabled={row.role === "OWNER"}>
              移除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="店内人员与权限"
      titleExtra={<span className="muted text-12">按岗位给本站账号分权，未选权限面时按岗位默认</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing({ row: null })}>
          新增成员
        </Button>
      }
    >
      {list.error ? <LoadError text={list.error} /> : null}
      {list.loading || rows.length ? (
        <DataTable<HealthStaffRow> rows={rows} columns={columns} page={1} loading={list.loading} />
      ) : (
        <EmptyState
          text="还没有授权任何成员：店主默认拥有全部权限，需要协作时再按岗位添加。"
          action={<Button onClick={() => setEditing({ row: null })}>新增成员</Button>}
        />
      )}

      <StaffModal
        shopId={shopId}
        editing={editing}
        scopeOptions={scopeOptions}
        onClose={() => setEditing(null)}
        onDone={() => void list.reload()}
      />
    </Panel>
  );
}

function StaffModal({
  shopId,
  editing,
  scopeOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: { row: HealthStaffRow | null } | null;
  scopeOptions: { label: string; options: { value: string; label: string }[] }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<StaffForm>();
  const [saving, setSaving] = useState(false);
  const row = editing?.row ?? null;

  useEffect(() => {
    if (!editing) return;
    form.setFieldsValue({
      userId: row?.userId ?? "",
      label: row?.label ?? "",
      role: row?.role ?? "OPERATION",
      status: row?.status ?? "ON",
      scopes: row?.scopes ?? [],
    });
  }, [editing, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.staffSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          userId: values.userId.trim(),
          label: values.label ?? "",
          role: values.role as HealthStaffRow["role"],
          scopes: values.scopes ?? [],
          status: values.status as HealthStaffRow["status"],
        },
      });
      message.success(row ? "成员权限已更新" : "成员已添加");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(editing)}
      title={row ? "编辑成员权限" : "新增成员"}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={560}
      onCancel={onClose}
      onOk={() => void submit()}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="userId"
          label="站内账号"
          extra="本站账号编号（登录后的用户编号），不是顾客令牌"
          rules={[{ required: true, message: "请填写账号" }]}
        >
          <Input maxLength={64} placeholder="如 1024" />
        </Form.Item>
        <Form.Item name="label" label="备注">
          <Input maxLength={60} placeholder="如 张医生、前台小李" />
        </Form.Item>
        <Form.Item name="role" label="岗位" rules={[{ required: true, message: "请选择岗位" }]}>
          <Select
            options={HEALTH_STAFF_ROLES.map((value) => ({
              value,
              label: HEALTH_STAFF_ROLE_LABELS[value],
            }))}
          />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select
            options={[
              { value: "ON", label: "启用" },
              { value: "OFF", label: "停用" },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="scopes"
          label="权限面"
          extra="不选表示按岗位默认权限；选了就只开放勾选的页签"
        >
          <Select mode="multiple" optionFilterProp="label" options={scopeOptions} placeholder="按分组勾选权限" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ------------------------------ AI客服 ------------------------------ */

function DeskSection({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const router = useRouter();
  const desk = useHealthResource(
    () => healthApi.serviceDeskBind({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const [siteKey, setSiteKey] = useState("");
  const [saving, setSaving] = useState(false);
  const data = desk.data;

  useEffect(() => {
    setSiteKey(data?.siteKey ?? "");
  }, [data?.siteKey]);

  const save = async () => {
    setSaving(true);
    try {
      await healthApi.serviceDeskBindSave({ body: { shopId, siteKey: siteKey.trim() } });
      message.success(siteKey.trim() ? "AI客服站点已绑定" : "已解除 AI客服站点绑定");
      await desk.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {desk.error ? <LoadError text={desk.error} /> : null}
      <Panel
        title="AI客服接入"
        titleExtra={<Tag color={data?.bound ? "green" : "default"}>{data?.bound ? "已绑定" : "未绑定"}</Tag>}
      >
        <Notice variant="info">
          问诊与在线客服的文字沟通统一走平台 AI客服，本工具不存聊天记录，只保存会话标识与状态机。
          未绑定时小程序端回落联系方式卡片，下单与预约仍然可用。
        </Notice>
        {data ? (
          <div style={{ marginTop: 12 }}>
            <Descriptions
              items={[
                { label: "站点名称", value: data.siteName || "未绑定" },
                { label: "站点 Key", value: data.siteKey || "—" },
                { label: "坐席数", value: data.agentCount },
                { label: "累计会话", value: data.conversationCount },
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <Notice variant={data.bound ? "success" : "warn"}>
                {data.guideText}
                {data.guideHref ? (
                  <Button size="small" type="link" onClick={() => router.push(data.guideHref)}>
                    去 AI客服
                  </Button>
                ) : null}
              </Notice>
            </div>
          </div>
        ) : (
          <span className="muted text-12">正在读取绑定状态…</span>
        )}
        <Space wrap style={{ marginTop: 12 }}>
          <Input
            style={{ width: 320 }}
            maxLength={64}
            placeholder="AI客服站点 Key，留空并保存即解除绑定"
            value={siteKey}
            onChange={(event) => setSiteKey(event.target.value)}
          />
          <Button type="primary" loading={saving} onClick={() => void save()}>
            保存绑定
          </Button>
        </Space>
      </Panel>
    </div>
  );
}

/* ------------------------------ AI 医护 ------------------------------ */

/**
 * AI 医护：这里只有一件事——开或关，以及每位医护用哪位 AI 客服。
 * 人设、模型、能查哪些资料、什么时候转人工，全在 AI客服 板块维护，本工具不复制一份。
 */
function AiStaffSection({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const router = useRouter();
  const ai = useHealthResource(
    () => healthApi.aiStaffStatus({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const [saving, setSaving] = useState(false);
  const data = ai.data;
  const agents = data?.agents ?? [];
  const practitioners = data?.practitioners ?? [];
  const boundCount = practitioners.filter((row) => row.agentId > 0).length;
  const mainAgent = agents.find((item) => item.id === data?.agentId);
  const canTurnOn = agents.length > 0;

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      await healthApi.aiStaffEnabledSave({ body: { shopId, enabled } });
      message.success(enabled ? "AI 医护已开启" : "AI 医护已关闭");
      await ai.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {ai.error ? <LoadError text={ai.error} /> : null}
      <Panel
        title="AI 医护"
        titleExtra={
          <Tag color={data?.enabled ? "green" : "default"}>
            {data?.enabled ? "已开启" : "未开启"}
          </Tag>
        }
      >
        <Notice variant="info">
          AI 医护就是「AI客服」里的纯AI客服员工：医生、健管师在小程序里提问，答话的是这里选定的
          AI 客服。人设、模型、能查哪些资料、什么时候转人工，都在 AI客服 里维护，本工具只管开与关、以及每位医护用哪位
          AI 客服。
        </Notice>
        <div style={{ marginTop: 14 }}>
          <Descriptions
            items={[
              {
                label: "开启 AI 医护",
                value: (
                  <Space size={8}>
                    <Switch
                      checked={data?.enabled === true}
                      loading={saving}
                      disabled={!data || !canTurnOn}
                      checkedChildren="开启"
                      unCheckedChildren="关闭"
                      onChange={(value) => void toggle(value)}
                    />
                    <span className="muted text-12">
                      {canTurnOn
                        ? "关闭后医护端的提问入口即隐藏"
                        : "先建一位纯AI客服员工，才谈得上开启"}
                    </span>
                  </Space>
                ),
              },
              {
                label: "在岗的 AI 客服",
                value: agents.length ? `${agents.length} 位` : "0 位",
              },
              { label: "当前主力", value: mainAgent?.name || "未绑定" },
              {
                label: "已绑定的医护",
                value: `${boundCount} / ${practitioners.length} 位`,
              },
            ]}
          />
        </div>
        {!canTurnOn ? (
          <div style={{ marginTop: 12 }}>
            <Notice variant="warn">
              还没有可用的纯AI客服员工，AI 医护开不起来。先到 AI客服 建一位（接待方式选「纯AI接待」）再回来开启。
              <Button
                size="small"
                type="link"
                onClick={() => router.push("/service-desk")}
              >
                去 AI客服 → 客服团队
              </Button>
            </Notice>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <Notice variant="success">
              给具体医护指派 AI 客服，请到「人员」页签的医护列表里逐位选择；不选就表示这位医护不用 AI 帮忙。
              <Button size="small" type="link" onClick={() => router.push("/service-desk")}>
                调整 AI 客服
              </Button>
            </Notice>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------ 增值服务 · 舌象分析 ------------------------------ */

type TongueForm = { enabled: boolean; channelId: number; model: string };

function TongueSection({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const router = useRouter();
  const [form] = Form.useForm<TongueForm>();
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState<ContentSettings | null>(null);
  const [models, setModels] = useState<ContentModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<HealthTongueRecord | null>(null);
  const channelId = Form.useWatch("channelId", form);

  const config = useHealthResource(
    () => healthApi.tongueConfig({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const records = useHealthResource(
    () => healthApi.tongueRecords({ query: { shopId, page, pageSize: PAGE_SIZE } }),
    [shopId, page],
    shopId > 0,
  );

  useEffect(() => {
    void contentApi
      .settings()
      .then((next) => setContent(next))
      .catch(() => setContent(null));
  }, []);

  useEffect(() => {
    if (!config.data) return;
    form.setFieldsValue({
      enabled: config.data.enabled,
      channelId: config.data.channelId,
      model: config.data.model,
    });
  }, [config.data, form]);

  useEffect(() => {
    if (!content || typeof channelId !== "number") return;
    setLoadingModels(true);
    void contentApi
      .models({ query: { channelId } })
      .then((result) =>
        setModels((result?.models || []).filter((item) => item.vision)),
      )
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, [content, channelId]);

  const channelOptions = useMemo(
    () =>
      (content?.channels || []).map((channel: ContentModelChannel) => ({
        value: channel.id,
        label:
          channel.id === 0
            ? "AIPDD"
            : channel.id === -1
              ? "LocalAPI（本站模型广场，免 Key）"
              : channel.available
                ? channel.name
                : `${channel.name}（${channel.unavailableReason || "不可用"}）`,
        disabled: !channel.available,
      })),
    [content],
  );

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.tongueConfigSave({
        body: {
          shopId,
          enabled: Boolean(values.enabled),
          channelId: Number(values.channelId || 0),
          model: String(values.model || "").trim(),
        },
      });
      message.success("舌象分析设置已保存，小程序端即时生效");
      await config.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: HealthTongueRecord) => {
    try {
      await healthApi.tongueRecordRemove({ body: { shopId, id: row.id } });
      message.success("记录已删除");
      await records.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const columns: TableProps<HealthTongueRecord>["columns"] = [
    {
      title: "照片",
      dataIndex: "imageUrl",
      width: 76,
      render: (value: string) =>
        value ? <Image alt="舌象照片缩略图" src={value} width={48} height={48} style={{ objectFit: "cover", borderRadius: 6 }} /> : "—",
    },
    { title: "顾客", dataIndex: "customerName", width: 120, render: (value: string) => value || "—" },
    {
      title: "舌象特征",
      key: "features",
      render: (_value, row) => (
        <Space size={4} wrap>
          {[row.tongueColor, row.coatingColor, row.tongueShape].filter(Boolean).map((item) => (
            <Tag key={item}>{item}</Tag>
          ))}
          {!row.tongueColor && !row.coatingColor && !row.tongueShape ? "—" : null}
        </Space>
      ),
    },
    { title: "体质倾向", dataIndex: "constitution", width: 140, render: (value: string) => value || "—" },
    {
      title: "置信度",
      dataIndex: "confidence",
      width: 90,
      render: (value: number) => (value > 0 ? `${value}%` : "—"),
    },
    {
      title: "分析时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 130,
      fixed: "right",
      render: (_value, row) => (
        <Space size={0}>
          <Button size="small" type="link" onClick={() => setDetail(row)}>
            查看
          </Button>
          <Popconfirm
            title="删除这条舌象记录"
            description="记录与原图会一并删除，无法恢复。"
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {config.error ? <LoadError text={config.error} /> : null}
      <Panel
        title="舌象分析（增值服务）"
        titleExtra={
          <Tag color={config.data?.enabled ? "green" : "default"}>
            {config.data?.enabled ? "已开通" : "未开通"}
          </Tag>
        }
      >
        <Notice variant="info">
          顾客在健康小程序拍照上传舌象，系统用视觉大模型输出舌色、舌苔、舌形、体质倾向与生活建议。
          分析仅作健康参考，不构成诊断，也不能替代医生面诊；照片会存入店铺数字资产台账。
          模型 Key 按店主账号的「模型服务」解析，因此模型与开关仅店主可保存。
        </Notice>
        <Form form={form} layout="vertical" style={{ maxWidth: 640, marginTop: 14 }}>
          <Form.Item name="enabled" label="开通舌象分析" valuePropName="checked">
            <Switch checkedChildren="开通" unCheckedChildren="关闭" />
          </Form.Item>
          <Grid>
            <Form.Item
              name="channelId"
              label="视觉模型渠道"
              extra="留空模型时按「模型服务 → 模型设置 → 视觉理解」的账号默认渠道"
            >
              <Select options={channelOptions} placeholder="AIPDD" />
            </Form.Item>
            <Form.Item
              name="model"
              label="视觉模型"
              extra="可输入或选择支持图片理解的模型；留空表示跟随账号「视觉理解」槽位"
            >
              <AutoComplete
                allowClear
                options={models.map((item) => ({ value: item.id, label: item.id }))}
                placeholder={loadingModels ? "正在读取模型…" : "留空跟随账号模型设置"}
                filterOption={(input, option) =>
                  String(option?.value || "").toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </Grid>
          <Space wrap>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              保存设置
            </Button>
            <Button onClick={() => router.push("/model-settings")}>
              去模型设置
            </Button>
          </Space>
        </Form>
      </Panel>

      <Panel
        title="分析记录"
        titleExtra={<span className="muted text-12">按店铺隔离，删除记录会同时删除原图</span>}
      >
        {records.error ? <LoadError text={records.error} /> : null}
        {records.loading || (records.data?.list.length ?? 0) > 0 ? (
          <DataTable<HealthTongueRecord>
            rows={records.data?.list ?? []}
            columns={columns}
            total={records.data?.total}
            page={page}
            pageSize={PAGE_SIZE}
            loading={records.loading}
            onPage={setPage}
          />
        ) : (
          <EmptyState text="还没有顾客使用舌象分析：开通后入口会出现在小程序首页与服务入口里。" />
        )}
      </Panel>

      <Modal
        open={Boolean(detail)}
        title="舌象分析详情"
        footer={null}
        width={640}
        destroyOnHidden
        onCancel={() => setDetail(null)}
      >
        {detail ? (
          <div style={{ display: "grid", gap: 14 }}>
            {detail.imageUrl ? (
              <Image alt="舌象照片" src={detail.imageUrl} width="100%" style={{ maxHeight: 360, objectFit: "contain" }} />
            ) : null}
            <Descriptions
              items={[
                { label: "顾客", value: detail.customerName || "—" },
                { label: "舌质", value: detail.tongueColor || "—" },
                { label: "舌苔", value: detail.coatingColor || "—" },
                { label: "舌形", value: detail.tongueShape || "—" },
                { label: "体质倾向", value: detail.constitution || "—" },
                { label: "置信度", value: detail.confidence > 0 ? `${detail.confidence}%` : "—" },
                { label: "模型", value: detail.model || "—" },
                { label: "分析时间", value: fmtTime(detail.createdAt) },
              ]}
            />
            <div>
              <div className="muted text-12" style={{ marginBottom: 4 }}>
                中医解读
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{detail.interpretation || "—"}</div>
            </div>
            <div>
              <div className="muted text-12" style={{ marginBottom: 4 }}>
                生活建议
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {detail.suggestions.length ? (
                  detail.suggestions.map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li>—</li>
                )}
              </ul>
            </div>
            <div>
              <div className="muted text-12" style={{ marginBottom: 4 }}>
                就医提醒
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {detail.cautions.length ? (
                  detail.cautions.map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li>—</li>
                )}
              </ul>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ------------------------------ SCRM ------------------------------ */

type ScrmForm = {
  orgType: string;
  orgUserId: string;
  pushEnabled: boolean;
  pullEnabled: boolean;
  tagMap: string;
};

const NO_LINK_NOTICE = "事件会在队列里排队（PENDING），不影响健康工具的任何功能；绑定后再推即可。";

function ScrmSection({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const router = useRouter();
  const link = useHealthResource(
    () => healthApi.scrmLink({ query: { shopId } }),
    [shopId],
    shopId > 0,
  );
  const [form] = Form.useForm<ScrmForm>();
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState("all");
  const [eventStatus, setEventStatus] = useState("all");
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const events = useHealthResource(
    () => healthApi.scrmEvents({ query: { shopId, page, pageSize: PAGE_SIZE, eventType, eventStatus } }),
    [shopId, page, eventType, eventStatus],
    shopId > 0,
  );
  const data = link.data;
  const eventRows = events.data?.list ?? [];

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      orgType: data.orgType,
      orgUserId: data.orgUserId,
      pushEnabled: data.pushEnabled,
      pullEnabled: data.pullEnabled,
      tagMap: JSON.stringify(data.tagMap ?? {}, null, 2),
    });
  }, [data, form]);

  const save = async () => {
    const values = await form.validateFields();
    const tagMap: Record<string, number> = {};
    const raw = String(values.tagMap || "").trim();
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("标签映射要是一个对象，形如 {\"ORDER_PAID\": 12}");
        }
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          const id = Number(value);
          if (!Number.isFinite(id) || id < 0) {
            throw new Error(`事件 ${key} 的标签 id 必须是 0 或正整数`);
          }
          tagMap[key] = Math.trunc(id);
        }
      } catch (cause) {
        message.error(cause instanceof Error ? cause.message : "标签映射格式不对");
        return;
      }
    }
    setSaving(true);
    try {
      await healthApi.scrmLinkSave({
        body: {
          shopId,
          orgType: values.orgType.trim(),
          orgUserId: values.orgUserId.trim(),
          pushEnabled: Boolean(values.pushEnabled),
          pullEnabled: Boolean(values.pullEnabled),
          tagMap,
        },
      });
      message.success("SCRM 绑定已保存");
      await link.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    try {
      await healthApi.scrmLinkRemove({ body: { shopId } });
      message.success("已解除 SCRM 绑定");
      await link.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const push = async () => {
    setPushing(true);
    try {
      const result = await healthApi.scrmPush({ body: { shopId, ids: [], limit: 50 } });
      message.success(result?.message || `已推送 ${result?.sent ?? 0} 条，跳过 ${result?.skipped ?? 0} 条`);
      await link.reload();
      await events.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setPushing(false);
    }
  };

  const skip = async (row: HealthScrmEventRow) => {
    try {
      await healthApi.scrmSkip({ body: { shopId, ids: [row.id] } });
      message.success("事件已跳过");
      await events.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const columns: TableProps<HealthScrmEventRow>["columns"] = [
    {
      title: "事件",
      dataIndex: "eventType",
      width: 130,
      render: (value: string) => HEALTH_SCRM_EVENT_LABELS[value] || value,
    },
    { title: "顾客", dataIndex: "customerName", width: 130, render: (value: string) => value || "—" },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => (
        <Tag
          color={
            value === "SENT" ? "green" : value === "FAILED" ? "red" : value === "SKIPPED" ? "default" : "gold"
          }
        >
          {HEALTH_SCRM_EVENT_STATUS_LABELS[value] || value}
        </Tag>
      ),
    },
    { title: "尝试次数", dataIndex: "attempts", width: 90 },
    {
      title: "最近错误",
      dataIndex: "lastError",
      width: 200,
      render: (value: string) =>
        value ? (
          <Tooltip title={value}>
            <span className="muted text-12">{`${value.slice(0, 24)}…`}</span>
          </Tooltip>
        ) : (
          "—"
        ),
    },
    {
      title: "发生时间",
      dataIndex: "occurredAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      fixed: "right",
      render: (_value, row) =>
        row.status === "PENDING" || row.status === "FAILED" ? (
          <Popconfirm title="跳过这条事件" description="跳过表示这次不打标签，之后也不会自动补推。" okText="跳过" onConfirm={() => void skip(row)}>
            <Button size="small" type="link">
              跳过
            </Button>
          </Popconfirm>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {link.error ? <LoadError text={link.error} /> : null}
      <Panel
        title="企业微信 SCRM 对接"
        titleExtra={<Tag color={data?.linked ? "green" : "default"}>{data?.linked ? "已绑定" : "未绑定"}</Tag>}
      >
        <Notice variant="info">
          只做单向出站：命中业务事件时给顾客的企微外部联系人打标签，后续跟进由 SCRM 自己的 SOP 决定。
          {NO_LINK_NOTICE}
        </Notice>
        {data ? (
          <div style={{ marginTop: 12 }}>
            <Descriptions
              items={[
                { label: "SCRM 状态", value: data.scrmStatusText || "未接入" },
                { label: "组织类型 / 组织键", value: data.orgType ? `${data.orgType} / ${data.orgUserId}` : "—" },
                { label: "排队中", value: data.pendingCount },
                { label: "已推送 / 失败", value: `${data.sentCount} / ${data.failedCount}` },
                { label: "最近推送", value: data.lastPushAt ? fmtTime(data.lastPushAt) : "—" },
                { label: "最近拉取", value: data.lastPullAt ? fmtTime(data.lastPullAt) : "—" },
              ]}
            />
            {data.lastError ? <Notice variant="error">最近一次失败：{data.lastError}</Notice> : null}
            {!data.linked ? (
              <Notice variant="warn">
                {data.guideText}
                {data.guideHref ? (
                  <Button size="small" type="link" onClick={() => router.push(data.guideHref)}>
                    去企业微信 SCRM
                  </Button>
                ) : null}
              </Notice>
            ) : null}
          </div>
        ) : null}

        <Divider plain style={{ margin: "16px 0 12px" }}>
          绑定参数
        </Divider>
        <Form form={form} layout="vertical" style={{ maxWidth: 640 }}>
          <Grid>
            <Form.Item
              name="orgType"
              label="组织类型"
              extra="与企业微信 SCRM 里接入时的组织类型一致"
              rules={[{ required: true, message: "请填写组织类型" }]}
            >
              <Input maxLength={20} placeholder="如 wecom" />
            </Form.Item>
            <Form.Item
              name="orgUserId"
              label="组织键"
              extra="SCRM 里的企业标识（orgUserId）"
              rules={[{ required: true, message: "请填写组织键" }]}
            >
              <Input maxLength={64} />
            </Form.Item>
            <Form.Item name="pushEnabled" label="事件推送" valuePropName="checked">
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item name="pullEnabled" label="回读标签" valuePropName="checked">
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
          </Grid>
          <Form.Item
            name="tagMap"
            label="事件 → 企微标签 id"
            extra='JSON 对象，键为事件类型（如 ORDER_PAID），值为 SCRM 标签库里的数字 id'
          >
            <Input.TextArea rows={5} className="mono" placeholder={'{\n  "ORDER_PAID": 12\n}'} />
          </Form.Item>
          <Space wrap>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              保存绑定
            </Button>
            <Popconfirm
              title="解除 SCRM 绑定"
              description="解除后事件继续排队，不再推送；SCRM 侧的历史标签不受影响。"
              okText="解除"
              okButtonProps={{ danger: true }}
              onConfirm={() => void unlink()}
              disabled={!data?.linked}
            >
              <Button danger disabled={!data?.linked}>
                解除绑定
              </Button>
            </Popconfirm>
            <Button loading={pushing} onClick={() => void push()}>
              推送队列
            </Button>
          </Space>
        </Form>
      </Panel>

      <Panel
        title="事件队列"
        titleExtra={<span className="muted text-12">留空筛选即看全部；推送按队列先进先出</span>}
      >
        <FilterBar
          action={
            <Button size="small" loading={events.loading} onClick={() => void events.reload()}>
              刷新
            </Button>
          }
        >
          <Select
            size="small"
            style={{ width: 160 }}
            value={eventType}
            onChange={(value: string) => {
              setPage(1);
              setEventType(value);
            }}
            options={[
              { value: "all", label: "全部事件" },
              ...HEALTH_SCRM_EVENT_TYPES.map((value) => ({
                value,
                label: HEALTH_SCRM_EVENT_LABELS[value],
              })),
            ]}
          />
          <Select
            size="small"
            style={{ width: 140 }}
            value={eventStatus}
            onChange={(value: string) => {
              setPage(1);
              setEventStatus(value);
            }}
            options={[
              { value: "all", label: "全部状态" },
              ...HEALTH_SCRM_EVENT_STATUSES.filter((value) => value !== "SKIPPED").map((value) => ({
                value,
                label: HEALTH_SCRM_EVENT_STATUS_LABELS[value],
              })),
            ]}
          />
        </FilterBar>
        {events.error ? <LoadError text={events.error} /> : null}
        {events.loading || eventRows.length ? (
          <DataTable<HealthScrmEventRow>
            rows={eventRows}
            columns={columns}
            total={events.data?.total}
            page={page}
            pageSize={PAGE_SIZE}
            loading={events.loading}
            onPage={(next) => setPage(next)}
          />
        ) : (
          <EmptyState text="队列里还没有事件：顾客注册、下单、预警、随访到期等动作会在这里排队。" />
        )}
      </Panel>
    </div>
  );
}
