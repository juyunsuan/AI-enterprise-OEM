"use client";
import {
  App,
  Button,
  ColorPicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { CheckCircleFilled, CloseCircleFilled, PlusOutlined } from "@ant-design/icons";
import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type BrandExpress,
  type BrandExpressSaveBody,
  type BrandMeta,
  type BrandShippingRule,
  type BrandShippingSaveBody,
  type BrandShippingTemplate,
  type BrandShopDetail,
  type BrandTradeConfig,
} from "@enterprise/contracts";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";
import {
  useBrandExpress,
  useBrandMarketingActions,
  useBrandShipping,
  useBrandShippingActions,
  useBrandShopActions,
  useBrandShopDetail,
} from "@/query/brand-mall";
import { BrandShell, useBrandScope } from "../_components/brand-shell";
import { ActionLink, StatusTag, dash } from "../_components/brand-common";
import { ImageUrlField } from "@/components/ui/image-field";
import { ScrmIntegrationTab } from "../_components/scrm-integration-tab";

/** 页签键要能由 URL 指定：订单发货弹窗里有 `/brand-mall/setting?tab=express` 的深链。 */
const TAB_KEYS = ["basic", "trade", "shipping", "express", "integration", "danger"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  basic: "基础信息",
  trade: "交易设置",
  shipping: "运费模板",
  express: "快递维护",
  integration: "企业微信对接",
  danger: "危险操作",
};

/** 与契约 `brandShopUpdateBodySchema` / `brandExpressSaveBodySchema` 同口径的长度。 */
const LIMITS = {
  nameMin: 2,
  nameMax: 30,
  sloganMax: 60,
  phoneMax: 30,
  logoMax: 500,
  expressNameMax: 40,
  expressCodeMax: 40,
};

/** 契约里 money 的上限，交易参数每个金额框都用它。 */
const MONEY_MAX = 99_999_999;

export default function BrandSettingPage() {
  return (
    <BrandShell
      active="setting"
      title="店铺设置"
      desc="商城的门面资料、交易规则、快递公司与营业状态都在这一页。改完即时生效在顾客端；换 AppID、换站点域名或换店铺码时，改 config.js 后重新编译上传即可，源码包随时可在「小程序发布」页直接下载。"
    >
      <SettingTabs />
    </BrandShell>
  );
}

function SettingTabs() {
  const { shopId } = useBrandScope();
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("tab") ?? "basic";
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(raw)
    ? (raw as TabKey)
    : "basic";

  const select = (key: string) => {
    router.replace(`/brand-mall/setting?tab=${key}&shopId=${shopId}`, { scroll: false });
  };

  return (
    <PanelTabs
      value={tab}
      onChange={select}
      items={TAB_KEYS.map((key) => ({
        key,
        label: TAB_LABELS[key],
        children: (
          <LoadingShop shopId={shopId}>
            {(detail, meta) => {
              if (key === "basic") return <BasicTab detail={detail} meta={meta} />;
              if (key === "trade") return <TradeTab detail={detail} />;
              if (key === "shipping") return <ShippingTab detail={detail} />;
              if (key === "express") return <ExpressTab detail={detail} />;
              if (key === "integration") return <ScrmIntegrationTab shopId={detail.id} />;
              return <DangerTab detail={detail} meta={meta} />;
            }}
          </LoadingShop>
        ),
      }))}
    />
  );
}

/** 页签共用的取数壳：店铺详情读失败时整页只报一次，不给每个页签各写一套错误分支。 */
function LoadingShop({
  shopId,
  children,
}: {
  shopId: number;
  children: (detail: BrandShopDetail, meta: BrandMeta | null) => ReactNode;
}) {
  const detailQuery = useBrandShopDetail({ shopId });
  const { meta } = useBrandScope();
  if (detailQuery.isError) {
    return (
      <Panel title="店铺资料">
        <Notice variant="error">
          店铺信息读取失败：{detailQuery.error.message || "请稍后重试"}
        </Notice>
      </Panel>
    );
  }
  if (!detailQuery.data) {
    return (
      <Panel title="店铺资料">
        <span className="muted text-12">正在读取店铺资料…</span>
      </Panel>
    );
  }
  return <>{children(detailQuery.data, meta)}</>;
}

// ---------------------------------------------------------------- 基础信息

function BasicTab({ detail, meta }: { detail: BrandShopDetail; meta: BrandMeta | null }) {
  const { message } = App.useApp();
  const actions = useBrandShopActions();
  const [form] = Form.useForm<{
    name: string;
    logo: string;
    slogan: string;
    servicePhone: string;
    themeColor: string;
  }>();
  const themeColor = Form.useWatch("themeColor", form) ?? detail.themeColor ?? "#FA3534";

  const save = async () => {
    const values = await form.validateFields();
    const updated = await actions.update.mutateAsync({
      body: {
        shopId: detail.id,
        name: values.name.trim(),
        logo: values.logo ?? "",
        slogan: values.slogan ?? "",
        servicePhone: values.servicePhone ?? "",
        themeColor: values.themeColor,
      },
    });
    if (updated) message.success("商城资料已保存，顾客端下次打开就是新资料");
  };

  const goOnline = async () => {
    const updated = await actions.setStatus.mutateAsync({
      body: { shopId: detail.id, status: "ONLINE" },
    });
    if (updated) message.success(`商城「${updated.name}」已开始营业`);
  };

  const failed = detail.checks.filter((item) => !item.ok);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="商城资料"
        titleExtra={
          <span className="muted text-12">
            这些内容在顾客端实时读取，改完不用重新出代码包
          </span>
        }
      >
        <Form
          form={form}
          layout="vertical"
          key={`${detail.id}-${detail.updatedAt}`}
          style={{ maxWidth: 640 }}
          initialValues={{
            name: detail.name,
            logo: detail.logo,
            slogan: detail.slogan,
            servicePhone: detail.servicePhone,
            themeColor: detail.themeColor || "#FA3534",
          }}
        >
          <Form.Item
            name="name"
            label="商城名称"
            extra={`显示在小程序顶部与分享卡片，${LIMITS.nameMin}-${LIMITS.nameMax} 个字；删除店铺时也要用它做确认`}
            rules={[
              {
                required: true,
                min: LIMITS.nameMin,
                max: LIMITS.nameMax,
                message: `请填写 ${LIMITS.nameMin}-${LIMITS.nameMax} 个字`,
              },
            ]}
          >
            <Input maxLength={LIMITS.nameMax} placeholder="如：小王家鲜果铺" />
          </Form.Item>
          <Form.Item
            name="logo"
            label="商城 Logo"
            extra={`建议 200×200 方图，填本站图片地址，最长 ${LIMITS.logoMax} 字符`}
          >
            <ImageUrlField />
          </Form.Item>
          <Form.Item name="slogan" label="一句话简介" extra={`小程序首页顶部展示，最多 ${LIMITS.sloganMax} 字`}>
            <Input maxLength={LIMITS.sloganMax} placeholder="如：产地直发，当天采摘当天寄" />
          </Form.Item>
          <Form.Item
            name="servicePhone"
            label="客服电话"
            extra="顾客在「我的」页能看到，售后咨询走这一支号"
          >
            <Input maxLength={LIMITS.phoneMax} placeholder="如：400-000-0000" />
          </Form.Item>
          <Form.Item label="在线客服" extra="开店时自动为你开通专属客服站点，不用手工挑；会话与 AI 接待都在「AI 客服」里处理">
            {detail.deskReady ? (
              <Notice variant="success">
                客服站点「{detail.deskSiteName}」已开通：顾客在小程序点「联系客服」会直接进入 AI
                客服会话。站点名称、欢迎语与接待设置到
                <ActionLink path="/service-desk">AI 客服</ActionLink>
                里改，改动实时生效，不用重新出包。
              </Notice>
            ) : (
              <Notice variant="warn">
                客服站点还没就绪：顾客端暂时只显示客服电话。到
                <ActionLink path={`/brand-mall/publish?shopId=${detail.id}`}>小程序发布页</ActionLink>
                会自动重新开通；若提示站点配额已满，请先到
                <ActionLink path="/service-desk">AI 客服</ActionLink>
                删除不用的站点。
              </Notice>
            )}
          </Form.Item>
          <Form.Item
            name="themeColor"
            label="主题色"
            extra="小程序按钮、价格与导航高亮都用这一支色，必须写成 #RRGGBB"
            rules={[
              {
                required: true,
                pattern: /^#[0-9A-Fa-f]{6}$/,
                message: "主题色要写成 #RRGGBB，例如 #FA3534",
              },
            ]}
          >
            <Space>
              <ColorPicker
                format="hex"
                value={themeColor}
                onChangeComplete={(color) =>
                  form.setFieldValue("themeColor", color.toHexString())
                }
              />
              <Input
                style={{ width: 140 }}
                maxLength={7}
                value={themeColor}
                onChange={(event) => form.setFieldValue("themeColor", event.target.value.trim())}
              />
            </Space>
          </Form.Item>
          <Space>
            <Button type="primary" loading={actions.update.isPending} onClick={() => void save()}>
              保存资料
            </Button>
            <span className="muted text-12">
              店铺码 {dash(detail.shopCode)} 由本站生成，公开寻址用它，改了要重新出包
            </span>
          </Space>
        </Form>
      </Panel>

      <Panel
        title="营业状态与上线自检"
        titleExtra={
          <Space size={6}>
            <StatusTag meta={meta} kind="shop" value={detail.status} />
            <span className="muted text-12">
              商品 {detail.onlineProductCount}/{detail.productCount} · 顾客 {detail.customerCount}
            </span>
          </Space>
        }
      >
        {detail.status === "SUSPENDED" ? (
          <Notice variant="error">
            店铺被平台停服，顾客端已无法下单：{dash(detail.offReason)}。请联系平台核实原因后恢复。
          </Notice>
        ) : null}
        {detail.status === "ONLINE" ? (
          <Notice variant="success">
            商城正在营业。要暂时停业请去「危险操作 → 关闭店铺」，商品与订单都会保留。
          </Notice>
        ) : detail.status === "SUSPENDED" ? null : (
          <Notice variant="info">
            上线有硬前置：绑定自己的小程序 AppID、发布首页装修、至少上架 1 个商品。
            下面还亮着的项都做完，再点「开始营业」。
          </Notice>
        )}
        <div style={{ display: "grid", gap: 4, margin: "12px 0" }}>
          {detail.checks.map((check) => (
            <div key={check.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {check.ok ? (
                <CheckCircleFilled style={{ color: "#52c41a" }} aria-hidden />
              ) : (
                <CloseCircleFilled style={{ color: "#faad14" }} aria-hidden />
              )}
              <span className="text-12">{check.label}</span>
              <span className="muted text-12">{check.hint}</span>
              {!check.ok && check.action ? (
                <ActionLink path={check.action}>去处理</ActionLink>
              ) : null}
            </div>
          ))}
        </div>
        {detail.status === "ONLINE" ? (
          <span className="muted text-12">
            自检 {failed.length} 项待办，处理完顾客体验更顺。
          </span>
        ) : detail.status === "SUSPENDED" ? (
          // 平台停服的店不能自己点回营业中：恢复权在平台，这里只给说明
          <span className="muted text-12">
            店铺由平台停服，恢复营业需要平台侧解除，本页不提供「开始营业」。
          </span>
        ) : (
          <Tooltip
            title={
              failed.length
                ? "还有未通过的自检项，点了也会被挡住并告诉你缺什么"
                : undefined
            }
          >
            <Button
              type="primary"
              loading={actions.setStatus.isPending}
              onClick={() => void goOnline()}
            >
              {detail.status === "CLOSED" ? "重新开业" : "开始营业"}
            </Button>
          </Tooltip>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- 交易设置

function TradeTab({ detail }: { detail: BrandShopDetail }) {
  const { message } = App.useApp();
  const actions = useBrandShopActions();
  const [form] = Form.useForm<BrandTradeConfig>();
  const pointsEnabled = Form.useWatch("pointsEnabled", form);
  const pointsPerYuan = Form.useWatch("pointsPerYuan", form);
  // 后端会把这种误配的单笔抵扣比例压回 0：先在页面上说清楚，别让用户以为积分能花了
  const pointsGap = Boolean(pointsEnabled) && !(Number(pointsPerYuan) > 0);

  const save = async () => {
    const values = await form.validateFields();
    const updated = await actions.saveTrade.mutateAsync({
      body: { shopId: detail.id, trade: { ...detail.trade, ...values } },
    });
    if (updated) message.success("交易参数已保存，顾客下单时立即按新规则算价");
  };

  return (
    <Panel
      title="交易规则"
      titleExtra={
        <span className="muted text-12">
          改完即时生效在顾客端结算页，不用重新出代码包；下面的初值是开店铺时从平台「默认交易参数」拷来的
        </span>
      }
    >
      <Form
        form={form}
        layout="vertical"
        key={`${detail.id}-trade`}
        style={{ maxWidth: 520 }}
        initialValues={detail.trade}
      >
        <Divider plain>下单与取消</Divider>
        <Form.Item
          name="autoCancelMinutes"
          label="未付款自动取消（分钟）"
          extra="顾客下单后一直不付款，到点本站自动关单并回补库存。范围 5 分钟 ~ 10080 分钟（7 天）"
          rules={[{ required: true, message: "请填写自动取消分钟数" }]}
        >
          <InputNumber min={5} max={10080} step={5} style={{ width: 200 }} suffix="分钟" />
        </Form.Item>
        <Form.Item
          name="minOrderAmount"
          label="最低下单金额"
          extra="购物车金额低于这个数就不让提交订单；填 0 表示不限金额"
        >
          <InputNumber min={0} max={MONEY_MAX} precision={2} style={{ width: 200 }} prefix="¥" />
        </Form.Item>
        <Form.Item
          name="selfCancelEnabled"
          label="允许顾客自助取消未付款订单"
          valuePropName="checked"
          extra="关掉后未付款订单只能等自动取消或由你在订单页手动关闭"
        >
          <Switch checkedChildren="允许" unCheckedChildren="不允许" />
        </Form.Item>
        <Form.Item
          name="buyerMessageEnabled"
          label="下单页显示买家留言"
          valuePropName="checked"
          extra="开启后顾客能在确认订单页填一句备注，订单详情与发货单都会带上"
        >
          <Switch checkedChildren="显示" unCheckedChildren="隐藏" />
        </Form.Item>

        <Divider plain>运费与包邮</Divider>
        <Form.Item
          name="freightAmount"
          label="统一运费"
          extra="商品没指定运费模板、或模板规则没命中收货地区时的兜底价；填 0 表示免运费"
        >
          <InputNumber min={0} max={MONEY_MAX} precision={2} style={{ width: 200 }} prefix="¥" />
        </Form.Item>
        <Form.Item
          name="freeFreightAmount"
          label="满额包邮门槛"
          extra="实付商品金额达到这个数就免运费；填 0 表示永不包邮"
        >
          <InputNumber min={0} max={MONEY_MAX} precision={2} style={{ width: 200 }} prefix="¥" />
        </Form.Item>

        <Divider plain>售后</Divider>
        <Form.Item
          name="refundEnabled"
          label="允许顾客申请售后"
          valuePropName="checked"
          extra="关掉后顾客端不出现「申请退款/退货」入口，只能联系客服人工处理"
        >
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item
          name="refundDaysLimit"
          label="售后申请时限（天）"
          extra="确认收货后多少天内还能申请售后；填 0 表示不限时"
          rules={[{ required: true, message: "请填写售后时限天数" }]}
        >
          <InputNumber min={0} max={365} style={{ width: 200 }} suffix="天" />
        </Form.Item>

        <Divider plain>积分</Divider>
        {pointsGap ? (
          <Notice variant="warn">
            已开启积分但「抵扣 1 元所需积分」还是 0：顾客攒了积分也花不掉，
            保存时本站会把「单笔抵扣上限」压回 0。要么补上抵扣比例，要么先关掉积分开关。
          </Notice>
        ) : null}
        <Form.Item
          name="pointsEnabled"
          label="积分总开关"
          valuePropName="checked"
          extra="关闭时下单不返分、结算页也不出现积分抵扣"
        >
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item
          name="pointsReturnRate"
          label="每消费 1 元返多少积分"
          extra="按实付金额计算，范围 0-1000；填 0 等于只保留积分账户不返分"
        >
          <InputNumber min={0} max={1000} step={0.1} style={{ width: 200 }} />
        </Form.Item>
        <Form.Item
          name="pointsPerYuan"
          label="抵扣 1 元所需积分"
          extra="0 = 不允许抵扣；范围 0-100000，例如填 100 表示 100 积分抵 1 元"
        >
          <InputNumber min={0} max={100000} style={{ width: 200 }} />
        </Form.Item>
        <Form.Item
          name="pointsDeductMaxPercent"
          label="单笔最多抵扣实付金额的百分比"
          extra="0-100 的整数，用来控制一单里最多用积分抵掉多少比例，防止整单被积分抵成 0 元"
        >
          <InputNumber min={0} max={100} style={{ width: 200 }} suffix="%" />
        </Form.Item>

        <Space style={{ marginTop: 8 }}>
          <Button type="primary" loading={actions.saveTrade.isPending} onClick={() => void save()}>
            保存交易设置
          </Button>
          <span className="muted text-12">
            金额单位元、两位小数；改完顾客端下一次进结算页就按新规则算
          </span>
        </Space>
      </Form>
    </Panel>
  );
}

// ---------------------------------------------------------------- 运费模板

function ruleSummary(rule: BrandShippingRule): string {
  const regions = rule.regions.length
    ? `${rule.regions.slice(0, 3).join("、")}${rule.regions.length > 3 ? ` 等 ${rule.regions.length} 地` : ""}`
    : "全国";
  const first = `首 ${rule.firstPiece} 件 ${moneyCny(rule.firstFee)}`;
  const extra =
    rule.additionalPiece > 0
      ? `，续 ${rule.additionalPiece} 件 +${moneyCny(rule.additionalFee)}`
      : "";
  const free = rule.freePiece > 0 ? `，满 ${rule.freePiece} 件包邮` : "";
  return `${regions}：${first}${extra}${free}`;
}

function ShippingTab({ detail }: { detail: BrandShopDetail }) {
  const { message, modal } = App.useApp();
  const query = useBrandShipping({ shopId: detail.id });
  const actions = useBrandShippingActions();
  const [editing, setEditing] = useState<BrandShippingTemplate | "new" | null>(null);
  const rows = query.data ?? [];

  const remove = (row: BrandShippingTemplate) => {
    modal.confirm({
      title: `删除运费模板「${row.name}」`,
      content: "删掉后原本指定这张模板的商品会回落店铺默认模板 / 统一运费，已生成订单的运费不受影响。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.remove.mutateAsync({ body: { shopId: detail.id, id: row.id } });
        message.success(`已删除「${row.name}」`);
      },
    });
  };

  const columns: ColumnsType<BrandShippingTemplate> = [
    {
      title: "模板名称",
      dataIndex: "name",
      width: 220,
      render: (value: string, row) => (
        <Space size={6}>
          <span>{value}</span>
          {row.isDefault ? <Tag color="blue">店铺默认</Tag> : null}
        </Space>
      ),
    },
    {
      title: "规则",
      dataIndex: "rules",
      render: (_, row) =>
        row.rules.length ? (
          <div>
            {row.rules.slice(0, 3).map((rule) => (
              <div key={rule.id} className="text-12">
                {ruleSummary(rule)}
              </div>
            ))}
            {row.rules.length > 3 ? (
              <span className="muted text-12">…共 {row.rules.length} 条规则</span>
            ) : null}
          </div>
        ) : (
          <span className="muted text-12">没有规则，按统一运费算</span>
        ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      render: (_, row) => (
        <Space size={0}>
          <Button size="small" type="link" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Button size="small" type="link" danger onClick={() => remove(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="运费模板"
      titleExtra={
        <span className="muted text-12">
          商品单独指定模板；未指定时用「店铺默认」模板，没有默认模板则用统一运费
        </span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新建模板
        </Button>
      }
    >
      <Notice variant="info">
        规则按收货城市匹配，命中多条时按排序取先命中的一条；地区留空的规则是「全国」兜底行，
        建议放在最后。模板改完即时生效在结算页，不用重新出包。
      </Notice>
      <Table<BrandShippingTemplate>
        rowKey="id"
        size="small"
        loading={query.isFetching}
        columns={columns}
        dataSource={rows}
        pagination={false}
        locale={{
          emptyText: (
            <EmptyState text="还没有运费模板。建一张后到商品里选它，就能按地区/件数分别算运费。" />
          ),
        }}
      />
      <ShippingModal
        shopId={detail.id}
        rows={rows}
        row={editing}
        onClose={() => setEditing(null)}
      />
    </Panel>
  );
}

type ShippingRuleValues = {
  name: string;
  regions: string[];
  firstPiece: number;
  firstFee: number;
  additionalPiece: number;
  additionalFee: number;
  freePiece: number;
  sortOrder: number;
};

type ShippingFormValues = {
  name: string;
  isDefault: boolean;
  rules: ShippingRuleValues[];
};

const EMPTY_SHIPPING_RULE: ShippingRuleValues = {
  name: "",
  regions: [],
  firstPiece: 1,
  firstFee: 0,
  additionalPiece: 0,
  additionalFee: 0,
  freePiece: 0,
  sortOrder: 0,
};

function ShippingModal({
  shopId,
  rows,
  row,
  onClose,
}: {
  shopId: number;
  rows: BrandShippingTemplate[];
  row: BrandShippingTemplate | "new" | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const actions = useBrandShippingActions();
  const [form] = Form.useForm<ShippingFormValues>();
  const open = row !== null;
  const initial: ShippingFormValues =
    row && row !== "new"
      ? {
          name: row.name,
          isDefault: row.isDefault,
          rules: row.rules.map((rule) => ({
            name: rule.name,
            regions: [...rule.regions],
            firstPiece: rule.firstPiece,
            firstFee: rule.firstFee,
            additionalPiece: rule.additionalPiece,
            additionalFee: rule.additionalFee,
            freePiece: rule.freePiece,
            sortOrder: rule.sortOrder,
          })),
        }
      : {
          name: "",
          isDefault: rows.length === 0,
          rules: [{ ...EMPTY_SHIPPING_RULE, name: "全国" }],
        };

  const submit = async () => {
    const values = await form.validateFields();
    const body: BrandShippingSaveBody = {
      shopId,
      name: values.name.trim(),
      isDefault: values.isDefault === true,
      rules: (values.rules ?? []).map((rule, index) => ({
        name: (rule.name ?? "").trim(),
        regions: rule.regions ?? [],
        firstPiece: Number(rule.firstPiece) || 1,
        firstFee: Number(rule.firstFee) || 0,
        additionalPiece: Number(rule.additionalPiece) || 0,
        additionalFee: Number(rule.additionalFee) || 0,
        freePiece: Number(rule.freePiece) || 0,
        sortOrder: index,
      })),
    };
    if (row && row !== "new") body.id = row.id;
    try {
      await actions.save.mutateAsync({ body });
      message.success(row && row !== "new" ? "运费模板已保存" : `已创建「${body.name}」`);
      onClose();
    } catch {
      /* mutations 的 onError 已提示 */
    }
  };

  return (
    <Modal
      open={open}
      width={760}
      title={row && row !== "new" ? `编辑运费模板「${row.name}」` : "新建运费模板"}
      okText="保存"
      confirmLoading={actions.save.isPending}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
    >
      <Notice variant="info">
        运费按「件数」计：首件区间内收首费，超出后每满「续件数」加一次续费；
        满件包邮填 0 表示不启用。
      </Notice>
      <Form
        form={form}
        layout="vertical"
        key={`${shopId}-${row === "new" ? "new" : (row?.id ?? "none")}`}
        initialValues={initial}
        style={{ marginTop: 12 }}
      >
        <Space wrap align="start">
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, whitespace: true, max: 60, message: "请填写模板名称，最多 60 字" }]}
            style={{ width: 320 }}
          >
            <Input maxLength={60} placeholder="如：华东包邮、偏远地区加价" />
          </Form.Item>
          <Form.Item
            name="isDefault"
            label="设为店铺默认"
            valuePropName="checked"
            extra="商品没单独指定模板时用它；同一时间只有一张默认模板"
          >
            <Switch checkedChildren="默认" unCheckedChildren="普通" />
          </Form.Item>
        </Space>

        <Divider plain>地区规则</Divider>
        <Form.List name="rules">
          {(fields, { add, remove }) => (
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              {fields.map((field) => (
                <div
                  key={field.key}
                  style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: 12 }}
                >
                  <Space wrap align="start">
                    <Form.Item
                      name={[field.name, "name"]}
                      label="规则名"
                      style={{ width: 200 }}
                    >
                      <Input maxLength={60} placeholder="如：华东 / 新疆西藏" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "regions"]}
                      label="适用地区"
                      extra="填收货城市名，回车添加；留空 = 全国兜底"
                      style={{ width: 420 }}
                    >
                      <Select
                        mode="tags"
                        maxCount={400}
                        tokenSeparators={[",", "，"]}
                        placeholder="输入城市名后回车，如：杭州市"
                        open={false}
                      />
                    </Form.Item>
                  </Space>
                  <Space wrap align="start">
                    <Form.Item
                      name={[field.name, "firstPiece"]}
                      label="首件（件）"
                      rules={[{ required: true, message: "请填写首件数" }]}
                    >
                      <InputNumber min={1} max={9999} precision={0} style={{ width: 110 }} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "firstFee"]}
                      label="首费（元）"
                      rules={[{ required: true, message: "请填写首费，免运费填 0" }]}
                    >
                      <InputNumber min={0} max={MONEY_MAX} precision={2} style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, "additionalPiece"]} label="续件（件）">
                      <InputNumber min={0} max={9999} precision={0} style={{ width: 110 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, "additionalFee"]} label="续费（元）">
                      <InputNumber min={0} max={MONEY_MAX} precision={2} style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, "freePiece"]} label="满件包邮">
                      <InputNumber min={0} max={999999} precision={0} style={{ width: 120 }} />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      style={{ marginTop: 30 }}
                      onClick={() => remove(field.name)}
                    >
                      删除
                    </Button>
                  </Space>
                </div>
              ))}
              <Button
                icon={<PlusOutlined aria-hidden />}
                disabled={fields.length >= 20}
                onClick={() => add({ ...EMPTY_SHIPPING_RULE })}
              >
                添加地区规则
              </Button>
              <span className="muted text-12">
                {fields.length
                  ? `共 ${fields.length} 条（上限 20）；保存时按这里的顺序落库，靠前优先命中。`
                  : "没有规则时，本模板等于不收运费，请至少保留一条全国兜底行。"}
              </span>
            </Space>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------- 快递维护

function ExpressTab({ detail }: { detail: BrandShopDetail }) {
  const { message, modal } = App.useApp();
  const expressQuery = useBrandExpress({ shopId: detail.id });
  // 契约里没有「发布/店铺」侧的快递写入口，预置与本店公司共用营销这一份 mutation
  const actions = useBrandMarketingActions();
  const [editing, setEditing] = useState<BrandExpress | "new" | null>(null);
  const rows = expressQuery.data ?? [];

  const remove = (row: BrandExpress) => {
    modal.confirm({
      title: `删除快递公司「${row.name}」`,
      content: "只影响之后发货时的下拉选项，已发货订单上的公司与单号不受影响。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.removeExpress.mutateAsync({ body: { shopId: detail.id, id: row.id } });
        message.success(`已删除「${row.name}」`);
      },
    });
  };

  const toggle = async (row: BrandExpress, enabled: boolean) => {
    try {
      await actions.saveExpress.mutateAsync({
        body: {
          shopId: detail.id,
          id: row.id,
          name: row.name,
          code: row.code,
          phone: row.phone,
          enabled,
          sortOrder: row.sortOrder,
        },
      });
      message.success(enabled ? `已启用「${row.name}」` : `已停用「${row.name}」`);
    } catch {
      /* mutations 的 onError 已提示 */
    }
  };

  const columns: ColumnsType<BrandExpress> = [
    {
      title: "快递公司",
      dataIndex: "name",
      width: 220,
      render: (value: string, row) => (
        <Space size={6}>
          <span>{value}</span>
          {row.shopId === 0 ? <Tag color="blue">平台预置</Tag> : null}
        </Space>
      ),
    },
    { title: "公司编码", dataIndex: "code", width: 160, render: dash },
    { title: "客服电话", dataIndex: "phone", width: 160, render: dash },
    {
      title: "排序",
      dataIndex: "sortOrder",
      width: 90,
      render: (value: number) => (value ? `${value}` : "—"),
    },
    {
      title: "启用",
      dataIndex: "enabled",
      width: 100,
      render: (value: boolean, row) =>
        row.shopId === 0 ? (
          <Tooltip title="平台预置公司，启用状态由平台统一维护">
            <Switch size="small" checked={value} disabled />
          </Tooltip>
        ) : (
          <Switch
            size="small"
            checked={value}
            loading={actions.saveExpress.isPending}
            onChange={(next) => void toggle(row, next)}
          />
        ),
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      render: (_, row) =>
        row.shopId === 0 ? (
          <span className="muted text-12">只读，可复制一份成自己的</span>
        ) : (
          <Space size={0}>
            <Button size="small" type="link" onClick={() => setEditing(row)}>
              编辑
            </Button>
            <Button size="small" type="link" danger onClick={() => remove(row)}>
              删除
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <Panel
      title="快递公司"
      titleExtra={
        <span className="muted text-12">
          平台预置（全平台共用）只读；你自己添加的公司只有本店能改删
        </span>
      }
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          添加快递公司
        </Button>
      }
    >
      <Table<BrandExpress>
        rowKey={(row) => `${row.shopId}-${row.id}`}
        size="small"
        loading={expressQuery.isFetching}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 900 }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{
          emptyText: (
            <EmptyState text="还没有快递公司。平台预置的会自动出现在发货下拉里，也可以添加你自己的。" />
          ),
        }}
      />
      <ExpressModal
        shopId={detail.id}
        row={editing}
        onClose={() => setEditing(null)}
      />
    </Panel>
  );
}

function ExpressModal({
  shopId,
  row,
  onClose,
}: {
  shopId: number;
  row: BrandExpress | "new" | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const actions = useBrandMarketingActions();
  const [form] = Form.useForm<{
    name: string;
    code: string;
    phone: string;
    enabled: boolean;
    sortOrder: number;
  }>();
  const open = row !== null;
  const initial =
    row && row !== "new"
      ? {
          name: row.name,
          code: row.code,
          phone: row.phone,
          enabled: row.enabled,
          sortOrder: row.sortOrder,
        }
      : { name: "", code: "", phone: "", enabled: true, sortOrder: 0 };

  const submit = async () => {
    const values = await form.validateFields();
    const body: BrandExpressSaveBody = {
      shopId,
      name: values.name.trim(),
      code: (values.code ?? "").trim(),
      phone: values.phone ?? "",
      enabled: values.enabled !== false,
      sortOrder: Number(values.sortOrder) || 0,
    };
    if (row && row !== "new") body.id = row.id;
    try {
      await actions.saveExpress.mutateAsync({ body });
      message.success(row && row !== "new" ? "快递公司已更新" : `已添加「${body.name}」`);
      onClose();
    } catch {
      /* mutations 的 onError 已提示 */
    }
  };

  return (
    <Modal
      open={open}
      title={row && row !== "new" ? `编辑「${row.name}」` : "添加快递公司"}
      okText="保存"
      confirmLoading={actions.saveExpress.isPending}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void submit()}
    >
      <Notice variant="info">
        公司编码填微信物流/快递100 那套标准简称（如 SF、YTO），填了顾客端就能自动跟踪物流；
        留空只影响跟踪，不影响发货。
      </Notice>
      <Form
        form={form}
        layout="vertical"
        key={`${shopId}-${row === "new" ? "new" : (row?.id ?? "none")}`}
        initialValues={initial}
        style={{ marginTop: 12 }}
      >
        <Form.Item
          name="name"
          label="快递公司名称"
          rules={[
            { required: true, max: LIMITS.expressNameMax, message: `请填写名称，最多 ${LIMITS.expressNameMax} 字` },
          ]}
        >
          <Input maxLength={LIMITS.expressNameMax} placeholder="如：顺丰速运" />
        </Form.Item>
        <Form.Item name="code" label="公司编码" extra={`物流查询用的标准简称，最多 ${LIMITS.expressCodeMax} 字符`}>
          <Input maxLength={LIMITS.expressCodeMax} placeholder="如：SF" />
        </Form.Item>
        <Form.Item name="phone" label="客服电话">
          <Input maxLength={30} placeholder="如：95338" />
        </Form.Item>
        <Form.Item name="sortOrder" label="排序值" extra="数字越小越靠前，0-9999">
          <InputNumber min={0} max={9999} style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="enabled" label="启用" valuePropName="checked" extra="停用后不出现在发货下拉里，但记录保留">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------- 危险操作

function DangerTab({ detail, meta }: { detail: BrandShopDetail; meta: BrandMeta | null }) {
  const { message } = App.useApp();
  const router = useRouter();
  const actions = useBrandShopActions();
  const [confirm, setConfirm] = useState<"close" | "remove" | null>(null);

  const closeShop = async () => {
    const updated = await actions.setStatus.mutateAsync({
      body: { shopId: detail.id, status: "CLOSED" },
    });
    if (updated) {
      message.success("店铺已关闭：顾客端打不开下单，随时可以在「基础信息」重新开业");
      setConfirm(null);
    }
  };

  const removeShop = async () => {
    await actions.remove.mutateAsync({ body: { shopId: detail.id } });
    message.success("店铺及其商品、装修、顾客数据已删除");
    setConfirm(null);
    router.push("/brand-mall");
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="停止营业">
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          <span>
            关闭店铺后顾客打开小程序会看到店铺已停业，不能浏览下单；
            商品、分类、装修、顾客与订单全部保留，重新点「开始营业」即恢复。
          </span>
          {meta ? (
            <span className="muted text-12">
              平台每个账号最多 {meta.shopQuota} 个商城，当前已开 {meta.shopCount} 个；
              名额用满时关掉不再经营的一家就能再开新店。
            </span>
          ) : null}
          <div>
            <Button
              danger
              disabled={detail.status === "CLOSED"}
              onClick={() => setConfirm("close")}
            >
              {detail.status === "CLOSED" ? "当前已关闭" : "关闭店铺"}
            </Button>
          </div>
        </Space>
      </Panel>

      <Panel title="删除店铺">
        <Notice variant="error">
          <Space orientation="vertical" size={2}>
            <strong>删除是不可恢复的</strong>
            <span className="text-12">
              会连带清掉本店的商品与规格、分类、页面装修、优惠券与领取记录、顾客与收货地址、
              订单与售后，以及绑定的小程序主体凭据（AppID 与商户号回到未绑定状态）。
            </span>
            <span className="text-12">
              只要还有未完结订单（待付款 / 已付款 / 已发货），本站会拒绝删除并告诉你还剩几笔，
              请先在「订单」页处理完再来。建议先执行上面的「关闭店铺」。
            </span>
          </Space>
        </Notice>
        <div style={{ marginTop: 12 }}>
          <Button danger type="primary" onClick={() => setConfirm("remove")}>
            删除店铺
          </Button>
          <span className="muted text-12" style={{ marginLeft: 8 }}>
            需要输入商城名称「{detail.name}」才能确认
          </span>
        </div>
      </Panel>

      <NameConfirmModal
        open={confirm !== null}
        title={confirm === "remove" ? "删除店铺" : "关闭店铺"}
        description={
          confirm === "remove"
            ? "删除后商品、装修、顾客与订单数据全部清空且无法恢复，请先确认已导出要留存的资料。"
            : "关闭后顾客端立即无法浏览与下单，数据都会保留，可随时重新开业。"
        }
        expected={detail.name}
        okText={confirm === "remove" ? "确认删除" : "确认关闭"}
        loading={actions.remove.isPending || actions.setStatus.isPending}
        onSubmit={() => (confirm === "remove" ? removeShop() : closeShop())}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

/**
 * 破坏性操作只靠「再点一下确认」不够：这里要求把商城名称原样打一遍，
 * 手滑点错的概率才真正降下来。
 */
function NameConfirmModal({
  open,
  title,
  description,
  expected,
  okText,
  loading,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  expected: string;
  okText: string;
  loading: boolean;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
}) {
  const [form] = Form.useForm<{ value: string }>();

  const submit = async () => {
    await form.validateFields();
    try {
      await onSubmit();
    } finally {
      form.resetFields();
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      okButtonProps={{ danger: true }}
      confirmLoading={loading}
      destroyOnHidden
      onCancel={onCancel}
      onOk={() => void submit()}
    >
      <Notice variant="error">{description}</Notice>
      <Form form={form} layout="vertical" key={expected} style={{ marginTop: 12 }}>
        <Form.Item
          name="value"
          label={`请输入商城名称「${expected}」`}
          extra="名称要与上方完全一致，本站才认为这是你本人的决定"
          rules={[
            { required: true, message: "请输入商城名称" },
            {
              validator: (_rule, value: string) =>
                String(value ?? "").trim() === expected
                  ? Promise.resolve()
                  : Promise.reject(new Error("输入的名称与商城名称不一致")),
            },
          ]}
        >
          <Input placeholder={expected} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
