"use client";
import { SearchOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Avatar,
  Button,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  List,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BRAND_BILL_TYPE_LABELS,
  BRAND_CUSTOMER_SOURCES,
  BRAND_CUSTOMER_STATUSES,
  BRAND_SCRM_BRIDGE_REASON_LABELS,
  type BrandCustomer,
  type BrandCustomerAddress,
  type BrandCustomerBill,
  type BrandCustomerDetail,
  type BrandOrderRow,
} from "@enterprise/contracts";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";
import {
  useBrandCustomer,
  useBrandCustomerActions,
  useBrandCustomers,
  useBrandCustomerScrm,
} from "@/query/brand-mall";
import { BrandShell, useBrandScope } from "../_components/brand-shell";
import {
  ActionLink,
  Money,
  StatusTag,
  dash,
  brandLabel,
  withShop,
} from "../_components/brand-common";

/** 契约里 `orderFilter` 是内联枚举、没导出类型别名，这里按同口径声明。 */
type CustomerOrderFilter = "ALL" | "HAS_ORDER" | "NO_ORDER";
type CustomerStatus = BrandCustomer["status"];
type CustomerSource = BrandCustomer["source"];

/** 微信回传的性别口径：0 未填、1 男、2 女，契约里只是 number、没有文案字典。 */
const GENDER_LABELS: Record<number, string> = { 0: "未填写", 1: "男", 2: "女" };

const ORDER_FILTERS: { value: CustomerOrderFilter; label: string }[] = [
  { value: "ALL", label: "全部顾客" },
  { value: "HAS_ORDER", label: "下过单" },
  { value: "NO_ORDER", label: "未下单" },
];

export default function BrandCustomerPage() {
  return (
    <BrandShell
      active="customer"
      title="顾客管理"
      desc="顾客是扫小程序码进来自动建档的私域用户，和你本站的登录账号是两套数据：这里看 TA 在本店的积分、券、地址与订单，改等级、写备注、拉黑都在这一处。拉黑只挡小程序端下单，不影响你后台的历史数据。"
    >
      <CustomerSection />
    </BrandShell>
  );
}

function CustomerSection() {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const { shopId, meta } = useBrandScope();
  const params = useSearchParams();
  const actions = useBrandCustomerActions();

  const [keyword, setKeyword] = useState(params.get("keyword") ?? "");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [orderFilter, setOrderFilter] = useState<CustomerOrderFilter>("ALL");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(0);

  // 空串 = 不筛；转成契约的可选枚举只在 filter 这一处发生。
  const filter = useMemo(
    () => ({
      keyword: keyword.trim() || undefined,
      status: (status || undefined) as CustomerStatus | undefined,
      source: (source || undefined) as CustomerSource | undefined,
      orderFilter: orderFilter === "ALL" ? undefined : orderFilter,
    }),
    [keyword, status, source, orderFilter],
  );

  const query = useBrandCustomers({ shopId }, filter, page);
  const rows = query.data?.list ?? [];
  const filtered = Boolean(keyword.trim() || status || source || orderFilter !== "ALL");

  const resetFilters = () => {
    setKeyword("");
    setStatus("");
    setSource("");
    setOrderFilter("ALL");
    setPage(1);
  };

  const setStatusOf = (row: BrandCustomer, next: CustomerStatus) => {
    const apply = async () => {
      await actions.update.mutateAsync({ body: { shopId, id: row.id, status: next } });
      message.success(
        next === "BLOCKED"
          ? `已拉黑「${row.nickname || `顾客 #${row.id}`}」`
          : "已恢复正常，顾客可以重新下单",
      );
    };
    if (next === "ACTIVE") {
      void apply();
      return;
    }
    modal.confirm({
      title: `拉黑「${row.nickname || `顾客 #${row.id}`}」`,
      content:
        "拉黑后该顾客在小程序端无法登录、也无法下单与领券，已有的积分、优惠券和历史订单都保留。随时可以恢复。",
      okText: "确认拉黑",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: apply,
    });
  };

  const columns: ColumnsType<BrandCustomer> = [
    {
      title: "顾客",
      dataIndex: "nickname",
      width: 220,
      render: (_, row) => (
        <Space align="center">
          <Avatar src={row.avatar || undefined}>{row.nickname.slice(0, 1) || "客"}</Avatar>
          <div style={{ minWidth: 0 }}>
            <div>{dash(row.nickname)}</div>
            <span className="muted text-12">#{row.id}</span>
          </div>
        </Space>
      ),
    },
    { title: "手机号", dataIndex: "phone", width: 130, render: (value: string) => dash(value) },
    { title: "等级", dataIndex: "level", width: 100, render: (value: string) => dash(value) },
    { title: "积分", dataIndex: "points", width: 90 },
    {
      title: "余额",
      dataIndex: "balance",
      width: 100,
      render: (value: number) => <Money value={value} />,
    },
    { title: "订单数", dataIndex: "orderCount", width: 90 },
    {
      title: "累计消费",
      dataIndex: "orderAmount",
      width: 120,
      render: (value: number) => <Money value={value} />,
    },
    {
      title: "来源",
      dataIndex: "source",
      width: 100,
      render: (value: string) => brandLabel(meta, "customerSource", value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <StatusTag meta={meta} kind="customer" value={value} />,
    },
    {
      title: "最近登录",
      dataIndex: "lastLoginAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 180,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => setDetailId(row.id)}>
            档案
          </Button>
          <Button
            size="small"
            type="link"
            loading={actions.update.isPending}
            onClick={() =>
              void setStatusOf(row, row.status === "BLOCKED" ? "ACTIVE" : "BLOCKED")
            }
          >
            {row.status === "BLOCKED" ? "恢复" : "拉黑"}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="顾客列表"
      titleExtra={
        <span className="muted text-12">
          共 {query.data?.total ?? 0} 位
          {filtered ? (
            <Button size="small" type="link" onClick={resetFilters}>
              清除筛选
            </Button>
          ) : null}
        </span>
      }
      extra={
        <span className="muted text-12">
          累计消费按已付款订单统计；余额是二期储值字段，现在恒为 ¥0.00
        </span>
      }
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          style={{ width: 220 }}
          prefix={<SearchOutlined aria-hidden />}
          placeholder="昵称或手机号"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
        />
        <Select
          allowClear
          style={{ width: 130 }}
          placeholder="状态"
          value={status || undefined}
          onChange={(value) => {
            setStatus(value ?? "");
            setPage(1);
          }}
          options={BRAND_CUSTOMER_STATUSES.map((value) => ({
            value,
            label: brandLabel(meta, "customer", value),
          }))}
        />
        <Select
          allowClear
          style={{ width: 130 }}
          placeholder="来源"
          value={source || undefined}
          onChange={(value) => {
            setSource(value ?? "");
            setPage(1);
          }}
          options={BRAND_CUSTOMER_SOURCES.map((value) => ({
            value,
            label: brandLabel(meta, "customerSource", value),
          }))}
        />
        <Select
          style={{ width: 140 }}
          value={orderFilter}
          onChange={(value) => {
            setOrderFilter(value);
            setPage(1);
          }}
          options={ORDER_FILTERS}
        />
      </Space>
      <Table<BrandCustomer>
        rowKey="id"
        size="small"
        loading={query.isFetching}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1620 }}
        locale={{
          emptyText: filtered ? (
            <EmptyState text="没有符合当前条件的顾客，换个关键字或清除筛选试试" />
          ) : (
            <EmptyState
              text="还没有顾客建档。顾客扫小程序码进入商城就会自动出现在这里；先把小程序发出去、页面装修好，才会有人来。"
              action={
                <Space wrap>
                  <Button
                    type="primary"
                    onClick={() => router.push(withShop("/brand-mall/publish", shopId))}
                  >
                    去发布小程序
                  </Button>
                  <ActionLink path={withShop("/brand-mall/decorate", shopId)}>去装修首页</ActionLink>
                </Space>
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
      <CustomerDrawer
        open={detailId > 0}
        shopId={shopId}
        customerId={detailId}
        onClose={() => setDetailId(0)}
      />
    </Panel>
  );
}

function CustomerDrawer({
  open,
  shopId,
  customerId,
  onClose,
}: {
  open: boolean;
  shopId: number;
  customerId: number;
  onClose: () => void;
}) {
  const detail = useBrandCustomer({ shopId }, customerId);
  return (
    <Drawer
      open={open}
      size={820}
      destroyOnHidden
      onClose={onClose}
      title="顾客档案"
    >
      {!open ? null : detail.data ? (
        <CustomerProfile key={`${shopId}-${customerId}`} detail={detail.data} shopId={shopId} />
      ) : detail.isError ? (
        <Alert
          type="error"
          showIcon
          message={`顾客档案读取失败：${detail.error.message || "请稍后重试"}`}
        />
      ) : (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin />
        </div>
      )}
    </Drawer>
  );
}

function CustomerProfile({
  detail,
  shopId,
}: {
  detail: BrandCustomerDetail;
  shopId: number;
}) {
  const { message, modal } = App.useApp();
  const { meta } = useBrandScope();
  const actions = useBrandCustomerActions();
  const [form] = Form.useForm<{ level: string; remark: string }>();

  const saveProfile = async () => {
    const values = await form.validateFields();
    await actions.update.mutateAsync({
      body: { shopId, id: detail.id, level: values.level.trim(), remark: values.remark.trim() },
    });
    message.success("顾客资料已保存");
  };

  const setStatus = (next: CustomerStatus) => {
    const apply = async () => {
      await actions.update.mutateAsync({ body: { shopId, id: detail.id, status: next } });
      message.success(next === "BLOCKED" ? "已拉黑，该顾客无法再下单" : "已恢复正常");
    };
    if (next === "ACTIVE") {
      void apply();
      return;
    }
    modal.confirm({
      title: `拉黑「${detail.nickname || `顾客 #${detail.id}`}」`,
      content:
        "拉黑后该顾客在小程序端无法登录、也无法下单与领券，已有的积分、优惠券和历史订单都保留。随时可以恢复。",
      okText: "确认拉黑",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: apply,
    });
  };

  const orderColumns: ColumnsType<BrandOrderRow> = [
    {
      title: "订单号",
      dataIndex: "orderNo",
      width: 200,
      render: (value: string) => (
        <ActionLink path={withShop(`/brand-mall/order?keyword=${encodeURIComponent(value)}`, shopId)}>
          {value}
        </ActionLink>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <StatusTag meta={meta} kind="order" value={value} />,
    },
    { title: "商品", dataIndex: "itemSummary", ellipsis: true },
    {
      title: "实付",
      dataIndex: "payAmount",
      width: 110,
      render: (value: number) => <Money value={value} />,
    },
    {
      title: "下单时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
  ];

  const billColumns: ColumnsType<BrandCustomerBill> = [
    {
      title: "类型",
      dataIndex: "type",
      width: 110,
      render: (value: string) => (
        <Tag color={value.startsWith("POINT") ? "blue" : "purple"}>
          {BRAND_BILL_TYPE_LABELS[value] ?? value}
        </Tag>
      ),
    },
    {
      title: "积分变动",
      dataIndex: "points",
      width: 100,
      render: (value: number) => (
        <span style={{ color: value < 0 ? "#cf1322" : "#389e0d" }}>
          {value > 0 ? `+${value}` : value}
        </span>
      ),
    },
    { title: "变动后", dataIndex: "pointsAfter", width: 90 },
    {
      title: "说明",
      dataIndex: "remark",
      render: (value: string, row) => (
        <div>
          <div>{dash(value)}</div>
          {row.relatedId > 0 ? (
            <span className="muted text-12">
              {row.relatedType} #{row.relatedId}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        title="基本信息"
        items={[
          {
            key: "nickname",
            label: "昵称",
            children: (
              <Space align="center">
                <Avatar size="small" src={detail.avatar || undefined}>
                  {detail.nickname.slice(0, 1) || "客"}
                </Avatar>
                {dash(detail.nickname)}
              </Space>
            ),
          },
          { key: "phone", label: "手机号", children: dash(detail.phone) },
          {
            key: "gender",
            label: "性别",
            children: GENDER_LABELS[detail.gender] ?? String(detail.gender),
          },
          { key: "source", label: "来源", children: brandLabel(meta, "customerSource", detail.source) },
          { key: "points", label: "积分", children: String(detail.points) },
          { key: "balance", label: "余额", children: <Money value={detail.balance} /> },
          { key: "orders", label: "订单数", children: String(detail.orderCount) },
          { key: "amount", label: "累计消费", children: <Money value={detail.orderAmount} /> },
          {
            key: "coupon",
            label: "未使用券",
            children: (
              <Space size={4}>
                {detail.couponCount}
                {detail.phone || detail.nickname ? (
                  <ActionLink
                    path={withShop(
                      `/brand-mall/marketing?tab=tickets&keyword=${encodeURIComponent(detail.phone || detail.nickname)}`,
                      shopId,
                    )}
                  >
                    看领券明细
                  </ActionLink>
                ) : null}
              </Space>
            ),
          },
          {
            key: "status",
            label: "状态",
            children: <StatusTag meta={meta} kind="customer" value={detail.status} />,
          },
          { key: "lastLogin", label: "最近登录", children: fmtTime(detail.lastLoginAt) },
          { key: "created", label: "注册时间", children: fmtTime(detail.createdAt) },
        ]}
      />

      <CustomerScrmBlock shopId={shopId} customerId={detail.id} />

      <Divider orientation="horizontal" titlePlacement="left" plain>
        运营备注
      </Divider>
      <Form
        form={form}
        layout="vertical"
        key={`profile-${detail.id}`}
        initialValues={{ level: detail.level, remark: detail.remark }}
      >
        <Form.Item
          name="level"
          label="会员等级"
          extra="自由文本（如 银卡 / 金卡 / VIP），只用于你这边识别顾客，不参与自动改价"
        >
          <Input maxLength={30} placeholder="留空即未设置等级" />
        </Form.Item>
        <Form.Item name="remark" label="备注" extra="最多 500 字，只有你本站看得到">
          <Input.TextArea rows={3} maxLength={500} showCount placeholder="例如：企业采购、要求开票、售后敏感" />
        </Form.Item>
        <Space wrap>
          <Button
            type="primary"
            loading={actions.update.isPending}
            onClick={() => void saveProfile()}
          >
            保存资料
          </Button>
          {detail.status === "BLOCKED" ? (
            <Button loading={actions.update.isPending} onClick={() => setStatus("ACTIVE")}>
              恢复正常
            </Button>
          ) : (
            <Button danger loading={actions.update.isPending} onClick={() => setStatus("BLOCKED")}>
              拉黑该顾客
            </Button>
          )}
        </Space>
      </Form>

      <Divider orientation="horizontal" titlePlacement="left" plain>
        地址簿（{detail.addresses.length}）
      </Divider>
      {detail.addresses.length ? (
        <List
          size="small"
          bordered
          dataSource={detail.addresses}
          renderItem={(row: BrandCustomerAddress) => (
            <List.Item>
              <Space orientation="vertical" size={2} style={{ width: "100%" }}>
                <Space size={6} wrap>
                  <strong>{dash(row.realName)}</strong>
                  <span className="muted text-12">{dash(row.phone)}</span>
                  {row.isDefault ? <Tag color="blue">默认</Tag> : null}
                  {row.tag ? <Tag>{row.tag}</Tag> : null}
                </Space>
                <span className="text-12">
                  {[row.province, row.city, row.district, row.detail].filter(Boolean).join(" ") ||
                    "地址不完整"}
                </span>
              </Space>
            </List.Item>
          )}
        />
      ) : (
        <span className="muted text-12">
          这位顾客还没存过收货地址，一般在小程序下单时第一次填写。
        </span>
      )}

      <Divider orientation="horizontal" titlePlacement="left" plain>
        近期订单
      </Divider>
      <Table<BrandOrderRow>
        rowKey="id"
        size="small"
        columns={orderColumns}
        dataSource={detail.recentOrders}
        pagination={false}
        scroll={{ x: 780 }}
        locale={{ emptyText: <EmptyState text="还没有订单，顾客在小程序下单后这里会出现最近 10 笔。" /> }}
      />

      <Divider orientation="horizontal" titlePlacement="left" plain>
        积分流水（最近 50 条）
      </Divider>
      <Table<BrandCustomerBill>
        rowKey="id"
        size="small"
        columns={billColumns}
        dataSource={detail.bills}
        pagination={false}
        scroll={{ x: 700 }}
        locale={{
          emptyText: <EmptyState text="还没有积分变动。订单完成、抵扣与退款返还会各记一条。" />,
        }}
      />
      <span className="muted text-12">
        需要给这位顾客发券或看 TA 的券：
        <ActionLink path={withShop("/brand-mall/marketing", shopId)}>去优惠券</ActionLink>
        ，累计消费 {moneyCny(detail.orderAmount)} 已含退款中的订单。
      </span>
    </div>
  );
}

/**
 * 企微画像：只读。未接入 SCRM 时整块给一句说明而不是报错——
 * 商城与 SCRM 独立开关，没接 SCRM 是常态而不是故障。
 */
function CustomerScrmBlock({ shopId, customerId }: { shopId: number; customerId: number }) {
  const query = useBrandCustomerScrm({ shopId }, customerId);
  const scrm = query.data;
  if (query.isError || !scrm) return null;

  const bridge = scrm.bridge;
  return (
    <>
      <Divider orientation="horizontal" titlePlacement="left" plain>
        企业微信画像
      </Divider>
      {!bridge.ok && !scrm.bound ? (
        <span className="muted text-12">
          {BRAND_SCRM_BRIDGE_REASON_LABELS[bridge.reason]}：{dash(bridge.hint)}
          <ActionLink path="/marketing-tools?tab=wecom-scrm">去接入</ActionLink>
        </span>
      ) : !scrm.bound ? (
        <span className="muted text-12">
          还没匹配到企微客户（unionId 与手机号都没对上）。在 SCRM 侧补完客户资料后，
          到「店铺设置 · 企业微信对接」一键重投即可补发。
        </span>
      ) : (
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 2 }}
          items={[
            {
              key: "tags",
              label: "SCRM 标签",
              children: scrm.tags.length ? (
                <Space size={4} wrap>
                  {scrm.tags.map((tag) => (
                    <Tag key={tag} color="geekblue">
                      {tag}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <span className="muted text-12">还没有标签</span>
              ),
            },
            {
              key: "bind",
              label: "绑定方式",
              children:
                scrm.bindSource === "MANUAL"
                  ? "店主人工绑定"
                  : scrm.bindSource === "AUTO_MOBILE"
                    ? "手机号自动匹配"
                    : "unionId 自动匹配",
            },
            {
              key: "last",
              label: "最近互动",
              children: scrm.lastInteractionAt ? fmtTime(scrm.lastInteractionAt) : "暂无互动",
            },
            { key: "contact", label: "企微客户", children: `#${scrm.contactId}` },
          ]}
        />
      )}
    </>
  );
}

