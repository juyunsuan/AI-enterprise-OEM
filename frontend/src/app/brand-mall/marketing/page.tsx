"use client";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BRAND_COUPON_SCOPES,
  BRAND_COUPON_STATUSES,
  BRAND_COUPON_TYPES,
  BRAND_TICKET_STATUSES,
  type BrandCategoryTree,
  type BrandCoupon,
  type BrandCouponSaveBody,
  type BrandCouponTicket,
} from "@enterprise/contracts";
import { EmptyState, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";
import {
  useBrandCategories,
  useBrandCouponTickets,
  useBrandCoupons,
  useBrandMarketingActions,
  useBrandProducts,
} from "@/query/brand-mall";
import { BrandShell, useBrandScope } from "../_components/brand-shell";
import {
  ActionLink,
  MoneyOrUnlimited,
  StatusTag,
  dash,
  brandLabel,
  withShop,
} from "../_components/brand-common";

/** 契约把券的枚举常量导出了但没导出别名，这里统一从行类型上取，避免两边写歪。 */
type CouponType = BrandCoupon["type"];
type CouponValidType = BrandCoupon["validType"];
type CouponScope = BrandCoupon["scope"];
type CouponStatus = BrandCoupon["status"];
type TicketStatus = BrandCouponTicket["status"];

/** 上下界与 `brandCouponSaveBodySchema` 一一对应：前端先挡一层，后端仍是最终口径。 */
const COUPON_LIMITS = {
  nameMax: 40,
  valueMax: 999_999,
  thresholdMax: 99_999_999,
  totalMax: 9_999_999,
  perLimitMax: 99,
  validDaysMax: 3650,
  scopeIdsMax: 500,
};

const VALID_TYPE_OPTIONS: { value: CouponValidType; label: string }[] = [
  { value: "FIXED", label: "固定有效期" },
  { value: "DAYS", label: "领取后 N 天" },
];

export default function BrandMarketingPage() {
  return (
    <BrandShell
      active="marketing"
      title="优惠券"
      desc="满减券与折扣券都在这里建，顾客在小程序的「优惠券」组件里自助领取、下单时自己挑一张用。抵扣与门槛都只统计券适用范围内的那部分商品金额，不是整单。"
    >
      <MarketingTabs />
    </BrandShell>
  );
}

function MarketingTabs() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "tickets" ? "tickets" : "list");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "list", label: "券列表", children: <CouponSection key="list" /> },
        { key: "tickets", label: "领取明细", children: <TicketSection key="tickets" /> },
      ]}
    />
  );
}

/** 力度列的两种口径：满减看金额，折扣看「几折」（契约里 88 就是 8.8 折）。 */
function strengthOf(type: CouponType, value: number): string {
  return type === "DISCOUNT" ? `${(value / 10).toFixed(1)} 折` : `减 ${moneyCny(value)}`;
}

function CouponSection() {
  const { message, modal } = App.useApp();
  const { shopId, meta } = useBrandScope();
  const actions = useBrandMarketingActions();

  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ open: boolean; coupon: BrandCoupon | null }>({
    open: false,
    coupon: null,
  });

  const filter = useMemo(
    () => ({
      keyword: keyword.trim() || undefined,
      status: (status || undefined) as CouponStatus | undefined,
    }),
    [keyword, status],
  );
  const query = useBrandCoupons({ shopId }, filter, page);
  const rows = query.data?.list ?? [];
  const total = query.data?.total ?? 0;
  const filtered = Boolean(keyword.trim() || status);

  const changeStatus = async (row: BrandCoupon, next: CouponStatus) => {
    await actions.statusCoupon.mutateAsync({ body: { shopId, id: row.id, status: next } });
    message.success(`「${row.name}」已切换为「${brandLabel(meta, "couponStatus", next)}」`);
  };

  const removeRow = (row: BrandCoupon) => {
    if (row.usedCount > 0) {
      // 已核销的券是订单优惠的凭据，后端会拒删；这里把「改为停发」直接摆成按钮，不让人撞错误。
      modal.warning({
        title: `「${row.name}」已核销 ${row.usedCount} 次，不能删除`,
        content:
          "删掉就对不上账了。想让它不再发出去就改成「停发」，顾客手里没用的券仍按原规则可用。",
        okText: "改为停发",
        onOk: () => changeStatus(row, "OFFLINE"),
      });
      return;
    }
    modal.confirm({
      title: `删除「${row.name}」`,
      content: "删除后小程序端立即看不到这张券，顾客已领但未使用的券会一并作废。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.removeCoupon.mutateAsync({ body: { shopId, id: row.id } });
        message.success("优惠券已删除");
      },
    });
  };

  const columns: ColumnsType<BrandCoupon> = [
    {
      title: "券名",
      dataIndex: "name",
      width: 200,
      render: (value: string, row) => (
        <div>
          <div>{value}</div>
          <span className="muted text-12">
            #{row.id} · 每人限领 {row.perLimit} 张
          </span>
        </div>
      ),
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="couponType" value={value} />,
    },
    {
      title: "力度",
      dataIndex: "value",
      width: 110,
      render: (_, row) => <strong>{strengthOf(row.type, row.value)}</strong>,
    },
    {
      title: "门槛",
      dataIndex: "threshold",
      width: 110,
      render: (value: number) => <MoneyOrUnlimited value={value} zeroText="无门槛" />,
    },
    {
      title: "发放 / 领取 / 已用",
      dataIndex: "totalCount",
      width: 160,
      render: (_, row) => (
        <div>
          <div>
            {row.receivedCount}/{row.totalCount} 已领
          </div>
          <span className="muted text-12">已用 {row.usedCount} 张</span>
        </div>
      ),
    },
    {
      title: "有效期",
      dataIndex: "validType",
      width: 220,
      render: (_, row) =>
        row.validType === "DAYS" ? (
          <span>领取后 {row.validDays} 天内有效</span>
        ) : (
          <div>
            <div>{fmtTime(row.startAt)}</div>
            <div className="muted text-12">至 {fmtTime(row.endAt)}</div>
          </div>
        ),
    },
    {
      title: "适用范围",
      dataIndex: "scope",
      width: 150,
      render: (value: string, row) => (
        <span>
          {brandLabel(meta, "couponScope", value)}
          {value === "ALL" ? null : (
            <span className="muted text-12">（{row.scopeIds.length} 项）</span>
          )}
        </span>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <StatusTag meta={meta} kind="couponStatus" value={value} />,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 200,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => setEditing({ open: true, coupon: row })}>
            编辑
          </Button>
          <Button
            size="small"
            type="link"
            loading={actions.statusCoupon.isPending}
            disabled={row.status === "ENDED"}
            onClick={() => void changeStatus(row, row.status === "ONLINE" ? "OFFLINE" : "ONLINE")}
          >
            {row.status === "ONLINE" ? "停发" : "发放中"}
          </Button>
          <Button
            size="small"
            type="link"
            danger
            loading={actions.removeCoupon.isPending}
            onClick={() => removeRow(row)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="券列表"
      titleExtra={
        <span className="muted text-12">
          共 {total} 张
          {filtered ? (
            <Button
              size="small"
              type="link"
              onClick={() => {
                setKeyword("");
                setStatus("");
                setPage(1);
              }}
            >
              清除筛选
            </Button>
          ) : null}
        </span>
      }
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ open: true, coupon: null })}
        >
          新建优惠券
        </Button>
      }
    >
      {total === 0 ? <ClaimEntryHint shopId={shopId} /> : null}
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          style={{ width: 220 }}
          prefix={<SearchOutlined aria-hidden />}
          placeholder="券名关键字"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
        />
        <Select
          allowClear
          style={{ width: 140 }}
          placeholder="状态"
          value={status || undefined}
          onChange={(value) => {
            setStatus(value ?? "");
            setPage(1);
          }}
          options={BRAND_COUPON_STATUSES.map((value) => ({
            value,
            label: brandLabel(meta, "couponStatus", value),
          }))}
        />
      </Space>
      <Table<BrandCoupon>
        rowKey="id"
        size="small"
        loading={query.isFetching}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1500 }}
        locale={{
          emptyText: filtered ? (
            <EmptyState text="没有符合条件的券，换个关键字或清除筛选试试" />
          ) : (
            <EmptyState
              text="还没有优惠券。建一张券，再到页面装修里放「优惠券」组件，顾客进小程序才领得到。"
              action={
                <Button
                  type="primary"
                  icon={<PlusOutlined aria-hidden />}
                  onClick={() => setEditing({ open: true, coupon: null })}
                >
                  新建优惠券
                </Button>
              }
            />
          ),
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />
      <CouponDrawer
        open={editing.open}
        shopId={shopId}
        coupon={editing.coupon}
        onClose={() => setEditing({ open: false, coupon: null })}
      />
    </Panel>
  );
}

/** 一张券都没有时光建券没用：领取入口在装修里，必须把路指过去而不是等店主来问。 */
function ClaimEntryHint({ shopId }: { shopId: number }) {
  return (
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 12 }}
      message="建好券还要放组件，顾客才领得到"
      description={
        <span className="text-12">
          顾客是在小程序页面里点「优惠券」组件领券的：去页面装修把该组件拖进首页或活动页并发布，
          <ActionLink path={withShop("/brand-mall/decorate", shopId)}>去页面装修</ActionLink>
        </span>
      }
    />
  );
}

function CouponDrawer({
  open,
  shopId,
  coupon,
  onClose,
}: {
  open: boolean;
  shopId: number;
  coupon: BrandCoupon | null;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open}
      size={720}
      destroyOnHidden
      onClose={onClose}
      title={coupon ? `编辑优惠券 · ${coupon.name}` : "新建优惠券"}
    >
      {open ? (
        <CouponForm
          key={`${shopId}-${coupon?.id ?? "new"}`}
          shopId={shopId}
          coupon={coupon}
          onClose={onClose}
        />
      ) : null}
    </Drawer>
  );
}

type CouponFormValues = {
  name: string;
  type: CouponType;
  value: number;
  threshold: number;
  totalCount: number;
  perLimit: number;
  validType: CouponValidType;
  range: [Dayjs | null, Dayjs | null] | null;
  validDays: number;
  scope: CouponScope;
  scopeIds: number[];
  status: CouponStatus;
};

/** 契约没有「券详情」端点：编辑的初值直接取列表行，字段与 brandCouponSchema 完全一致。 */
function couponToForm(coupon: BrandCoupon | null): CouponFormValues {
  if (!coupon) {
    return {
      name: "",
      type: "FULL_REDUCE",
      value: 10,
      threshold: 100,
      totalCount: 100,
      perLimit: 1,
      validType: "FIXED",
      range: [dayjs().startOf("day"), dayjs().add(30, "day").endOf("day")],
      validDays: 7,
      scope: "ALL",
      scopeIds: [],
      status: "ONLINE",
    };
  }
  return {
    name: coupon.name,
    type: coupon.type,
    value: coupon.value,
    threshold: coupon.threshold,
    totalCount: coupon.totalCount,
    perLimit: coupon.perLimit,
    validType: coupon.validType,
    range: coupon.startAt && coupon.endAt ? [dayjs(coupon.startAt), dayjs(coupon.endAt)] : null,
    validDays: coupon.validDays,
    scope: coupon.scope,
    scopeIds: [...coupon.scopeIds],
    status: coupon.status,
  };
}

function CouponForm({
  shopId,
  coupon,
  onClose,
}: {
  shopId: number;
  coupon: BrandCoupon | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const { meta } = useBrandScope();
  const actions = useBrandMarketingActions();
  const [form] = Form.useForm<CouponFormValues>();
  const [productKeyword, setProductKeyword] = useState("");
  const type = Form.useWatch("type", form) ?? "FULL_REDUCE";
  const validType = Form.useWatch("validType", form) ?? "FIXED";
  const scope = Form.useWatch("scope", form) ?? "ALL";
  const scopeIdsValue = Form.useWatch("scopeIds", form);
  // watch 出来的数组每次渲染都是新引用，收进 useMemo 才能让下面的选项合并稳定下来。
  const scopeIds = useMemo(() => scopeIdsValue ?? [], [scopeIdsValue]);
  const value = Number(Form.useWatch("value", form) ?? 0);
  const threshold = Number(Form.useWatch("threshold", form) ?? 0);

  const categoriesQuery = useBrandCategories({ shopId });
  // 商品按关键字服务端筛：适用范围上限 500 项，一次拉全既不现实也没必要。
  const productsQuery = useBrandProducts(
    { shopId },
    { keyword: productKeyword.trim() || undefined },
    1,
    50,
  );

  // 搜索结果里没有的已选 id 也要占位，否则下拉里会退化成裸数字，看不出漏了哪一项。
  const productOptions = useMemo(() => {
    const loaded = (productsQuery.data?.list ?? []).map((row) => ({
      value: row.id,
      label: `${row.title}${row.status === "ONLINE" ? "" : "（已下架）"}`,
    }));
    const known = new Set(loaded.map((item) => item.value));
    return [
      ...loaded,
      ...scopeIds
        .filter((id) => !known.has(id))
        .map((id) => ({ value: id, label: `商品 #${id}` })),
    ];
  }, [productsQuery.data, scopeIds]);

  const submit = async () => {
    const values = await form.validateFields();
    const fixed = values.validType === "FIXED";
    const [from, to] = values.range ?? [];
    if (fixed && (!from || !to)) {
      message.warning("固定有效期的券要填开始与结束时间");
      return;
    }
    const body: BrandCouponSaveBody = {
      shopId,
      id: coupon?.id,
      name: values.name.trim(),
      type: values.type,
      value: Number(values.value),
      threshold: Number(values.threshold ?? 0),
      totalCount: Number(values.totalCount),
      perLimit: Number(values.perLimit),
      validType: values.validType,
      startAt: fixed ? (from as Dayjs).toISOString() : "",
      endAt: fixed ? (to as Dayjs).toISOString() : "",
      validDays: Number(values.validDays),
      scope: values.scope,
      scopeIds: values.scope === "ALL" ? [] : (values.scopeIds ?? []),
      status: values.status,
    };
    await actions.saveCoupon.mutateAsync({ body });
    message.success(
      coupon
        ? "优惠券已保存"
        : "优惠券已创建，再到页面装修放「优惠券」组件，顾客才看得到领取入口",
    );
    onClose();
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={couponToForm(coupon)}
      style={{ maxWidth: 640 }}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="力度与门槛只统计适用范围内的商品"
        description="选了「指定分类 / 指定商品」时，凑单门槛与抵扣额都只按命中那部分商品的金额算，不会整单打折。改动会即时作用到顾客手里还没用的券，发出去再改要慎重。"
      />

      <Divider orientation="horizontal" titlePlacement="left" plain>
        券面
      </Divider>
      <Form.Item
        name="name"
        label="券名称"
        extra={`顾客在小程序里看到的就是这个名字，最多 ${COUPON_LIMITS.nameMax} 字`}
        rules={[{ required: true, whitespace: true, message: "请填写券名称" }]}
      >
        <Input maxLength={COUPON_LIMITS.nameMax} placeholder="例如：满 100 减 10 新客券" />
      </Form.Item>
      <Form.Item name="type" label="券类型">
        <Radio.Group
          optionType="button"
          options={BRAND_COUPON_TYPES.map((item) => ({
            value: item,
            label: brandLabel(meta, "couponType", item),
          }))}
        />
      </Form.Item>
      <Form.Item
        name="value"
        label={type === "DISCOUNT" ? "折扣（百分比）" : "减免金额（元）"}
        extra={
          type === "DISCOUNT"
            ? "填 88 表示 8.8 折、填 90 表示 9 折，只能是 1-99 的整数"
            : "范围内金额直接减掉的数，不会超过范围内商品金额"
        }
        rules={[
          { required: true, message: "请填写券的力度" },
          {
            validator: (_, raw: number) => {
              const num = Number(raw);
              if (!Number.isFinite(num)) return Promise.reject(new Error("请填写券的力度"));
              if (type !== "DISCOUNT") {
                return num > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error("满减金额必须大于 0"));
              }
              return Number.isInteger(num) && num >= 1 && num <= 99
                ? Promise.resolve()
                : Promise.reject(
                    new Error("折扣要填 1-99 之间的整数百分比（88 表示 8.8 折）"),
                  );
            },
          },
        ]}
      >
        <InputNumber
          style={{ width: "100%" }}
          min={type === "DISCOUNT" ? 1 : 0.01}
          max={COUPON_LIMITS.valueMax}
          precision={type === "DISCOUNT" ? 0 : 2}
          suffix={type === "DISCOUNT" ? "（88 = 8.8 折）" : "元"}
        />
      </Form.Item>
      <Form.Item
        name="threshold"
        label="使用门槛（元）"
        extra="满多少元可用，填 0 即无门槛；同样只按适用范围内的金额判定"
        rules={[{ required: true, message: "请填写使用门槛，无门槛填 0" }]}
      >
        <InputNumber
          style={{ width: "100%" }}
          min={0}
          max={COUPON_LIMITS.thresholdMax}
          precision={2}
          suffix="元"
        />
      </Form.Item>

      <Divider orientation="horizontal" titlePlacement="left" plain>
        发放量与有效期
      </Divider>
      <Space wrap align="start">
        <Form.Item
          name="totalCount"
          label="发放总量（张）"
          extra="领完即止，之后可以调高"
          rules={[{ required: true, message: "请填写发放总量" }]}
          style={{ width: 200 }}
        >
          <InputNumber style={{ width: "100%" }} min={1} max={COUPON_LIMITS.totalMax} precision={0} />
        </Form.Item>
        <Form.Item
          name="perLimit"
          label="每人限领（张）"
          rules={[{ required: true, message: "请填写每人限领张数" }]}
          style={{ width: 180 }}
        >
          <InputNumber
            style={{ width: "100%" }}
            min={1}
            max={COUPON_LIMITS.perLimitMax}
            precision={0}
          />
        </Form.Item>
      </Space>
      <Form.Item name="validType" label="有效期方式">
        <Radio.Group optionType="button" options={VALID_TYPE_OPTIONS} />
      </Form.Item>
      {validType === "FIXED" ? (
        <Form.Item
          name="range"
          label="领取与使用期限"
          extra="只有这段时间里能领；领到的券在最晚使用时间失效"
          rules={[{ required: true, message: "请选择开始与结束时间" }]}
        >
          <DatePicker.RangePicker
            style={{ width: "100%" }}
            showTime={{ format: "HH:mm" }}
            format="YYYY-MM-DD HH:mm"
          />
        </Form.Item>
      ) : (
        <Form.Item
          name="validDays"
          label="领取后有效天数"
          extra="从顾客点领取那一刻起算，对应「领取后 7 天内有效」这类玩法"
          rules={[{ required: true, message: "请填写有效天数" }]}
          style={{ maxWidth: 240 }}
        >
          <InputNumber
            style={{ width: "100%" }}
            min={1}
            max={COUPON_LIMITS.validDaysMax}
            precision={0}
            suffix="天"
          />
        </Form.Item>
      )}

      <Divider orientation="horizontal" titlePlacement="left" plain>
        适用范围
      </Divider>
      <Form.Item
        name="scope"
        label="范围类型"
        extra="切换范围类型会清空已选项：分类 id 与商品 id 是两套编号，不能串着留"
      >
        <Radio.Group
          optionType="button"
          onChange={() => form.setFieldValue("scopeIds", [])}
          options={BRAND_COUPON_SCOPES.map((item) => ({
            value: item,
            label: brandLabel(meta, "couponScope", item),
          }))}
        />
      </Form.Item>
      {scope === "CATEGORY" ? (
        <Form.Item
          name="scopeIds"
          label="适用分类"
          extra={`最多选 ${COUPON_LIMITS.scopeIdsMax} 项；父分类不会自动带上子分类，子类要一起勾上`}
          rules={[{ required: true, message: "请至少选择一个分类" }]}
        >
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            maxCount={COUPON_LIMITS.scopeIdsMax}
            placeholder={
              categoriesQuery.data?.length ? "选择分类" : "本店还没有分类，先去商品页建分类"
            }
            options={flattenCategories(categoriesQuery.data ?? [])}
          />
        </Form.Item>
      ) : null}
      {scope === "PRODUCT" ? (
        <Form.Item
          name="scopeIds"
          label="适用商品"
          extra={`输入商品名搜索后选中，最多 ${COUPON_LIMITS.scopeIdsMax} 个；已下架商品也能留在范围里`}
          rules={[{ required: true, message: "请至少选择一个商品" }]}
        >
          <Select
            mode="multiple"
            allowClear
            showSearch
            filterOption={false}
            maxCount={COUPON_LIMITS.scopeIdsMax}
            placeholder="输入商品标题关键字搜索"
            loading={productsQuery.isFetching}
            onSearch={setProductKeyword}
            options={productOptions}
            notFoundContent={productsQuery.isFetching ? "搜索中…" : "没有匹配的商品，换个关键字试试"}
          />
        </Form.Item>
      ) : null}
      {scope !== "ALL" ? (
        <span className="muted text-12">
          已选 {scopeIds.length} 项 · 本单里命中这些商品的金额才参与凑单与抵扣
        </span>
      ) : null}

      <Divider orientation="horizontal" titlePlacement="left" plain>
        发放状态
      </Divider>
      <Form.Item
        name="status"
        label="状态"
        extra="「已结束」是活动收尾、不再回到发放中；只是暂时收手用「已停发」"
      >
        <Select
          style={{ maxWidth: 220 }}
          options={BRAND_COUPON_STATUSES.map((item) => ({
            value: item,
            label: brandLabel(meta, "couponStatus", item),
          }))}
        />
      </Form.Item>

      <Form.Item label="当前配置">
        <Space wrap>
          <Tag color="blue">{threshold > 0 ? `满 ${moneyCny(threshold)}` : "无门槛"}</Tag>
          <Tag color="red">{value > 0 ? strengthOf(type, value) : "力度待填"}</Tag>
          <Tag>{validType === "FIXED" ? "固定时间段" : "领取后按天数生效"}</Tag>
          <Tag>{brandLabel(meta, "couponScope", scope)}</Tag>
          {coupon ? <Tag>已领 {coupon.receivedCount} 张</Tag> : <Tag color="green">新建</Tag>}
        </Space>
      </Form.Item>

      <Space wrap>
        <Button
          type="primary"
          loading={actions.saveCoupon.isPending}
          onClick={() => void submit()}
        >
          保存优惠券
        </Button>
        <Button onClick={onClose}>取消</Button>
        {coupon ? (
          <span className="muted text-12">
            发放 {coupon.totalCount} 张 · 已用 {coupon.usedCount} 张
          </span>
        ) : null}
      </Space>
    </Form>
  );
}

/** 分类树 → 带缩进的下选项（契约口径最深三级）。 */
function flattenCategories(
  nodes: BrandCategoryTree[],
  level = 0,
): { value: number; label: string }[] {
  return nodes.flatMap((node) => [
    {
      value: node.id,
      label: `${"　".repeat(level)}${node.name}${node.enabled ? "" : "（已停用）"}`,
    },
    ...(level < 2 ? flattenCategories(node.children, level + 1) : []),
  ]);
}

function TicketSection() {
  const { shopId, meta } = useBrandScope();
  const params = useSearchParams();

  const [couponId, setCouponId] = useState<number | undefined>(
    Number(params.get("couponId")) || undefined,
  );
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [keyword, setKeyword] = useState(params.get("keyword") ?? "");
  const [page, setPage] = useState(1);

  // 券下拉一次取 200 张（契约 pageSize 上限）：一家店自建的券就在几十张量级。
  const couponsQuery = useBrandCoupons({ shopId }, {}, 1, 200);
  const filter = useMemo(
    () => ({
      couponId,
      status: (status || undefined) as TicketStatus | undefined,
      keyword: keyword.trim() || undefined,
    }),
    [couponId, status, keyword],
  );
  const query = useBrandCouponTickets({ shopId }, filter, page);
  const rows = query.data?.list ?? [];
  const filtered = Boolean(couponId || status || keyword.trim());

  const columns: ColumnsType<BrandCouponTicket> = [
    {
      title: "券名",
      dataIndex: "couponName",
      width: 220,
      render: (value: string, row) => (
        <div>
          <div>{value}</div>
          <Button
            size="small"
            type="link"
            style={{ padding: 0, height: "auto" }}
            onClick={() => {
              setCouponId(row.couponId);
              setPage(1);
            }}
          >
            只看这张券
          </Button>
        </div>
      ),
    },
    {
      title: "顾客",
      dataIndex: "nickname",
      width: 200,
      render: (value: string, row) => (
        <Space size={4}>
          <span>{dash(value)}</span>
          <ActionLink
            path={withShop(
              `/brand-mall/customer?keyword=${encodeURIComponent(row.phone || value)}`,
              shopId,
            )}
          >
            看档案
          </ActionLink>
        </Space>
      ),
    },
    {
      title: "手机号",
      dataIndex: "phone",
      width: 130,
      render: (value: string) => dash(value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="ticket" value={value} />,
    },
    {
      title: "关联订单",
      dataIndex: "orderId",
      width: 120,
      render: (value: number) =>
        value > 0 ? <span>订单 #{value}</span> : <span className="muted">未使用</span>,
    },
    {
      title: "领取时间",
      dataIndex: "receivedAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "使用时间",
      dataIndex: "usedAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "过期时间",
      dataIndex: "expireAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
  ];

  return (
    <Panel
      title="领取明细"
      titleExtra={
        <span className="muted text-12">
          共 {query.data?.total ?? 0} 条
          {filtered ? (
            <Button
              size="small"
              type="link"
              onClick={() => {
                setCouponId(undefined);
                setStatus("");
                setKeyword("");
                setPage(1);
              }}
            >
              清除筛选
            </Button>
          ) : null}
        </span>
      }
      extra={<span className="muted text-12">一位顾客领一张记一条，核销后才会带上订单号</span>}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 240 }}
          placeholder="全部券"
          value={couponId}
          onChange={(value) => {
            setCouponId(value ?? undefined);
            setPage(1);
          }}
          options={(couponsQuery.data?.list ?? []).map((row) => ({
            value: row.id,
            label: row.name,
          }))}
        />
        <Select
          allowClear
          style={{ width: 140 }}
          placeholder="券状态"
          value={status || undefined}
          onChange={(value) => {
            setStatus(value ?? "");
            setPage(1);
          }}
          options={BRAND_TICKET_STATUSES.map((value) => ({
            value,
            label: brandLabel(meta, "ticket", value),
          }))}
        />
        <Input
          allowClear
          style={{ width: 220 }}
          prefix={<SearchOutlined aria-hidden />}
          placeholder="顾客昵称或手机号"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
        />
      </Space>
      <Table<BrandCouponTicket>
        rowKey="id"
        size="small"
        loading={query.isFetching}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1420 }}
        locale={{
          emptyText: (
            <EmptyState
              text={
                filtered
                  ? "没有符合条件的领取记录，换张券或清除筛选试试"
                  : "还没有顾客领券。券建好后要到页面装修里放「优惠券」组件并发布，顾客端才有领取入口。"
              }
              action={
                <ActionLink path={withShop("/brand-mall/decorate", shopId)}>去页面装修</ActionLink>
              }
            />
          ),
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total: query.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />
    </Panel>
  );
}
