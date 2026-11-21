"use client";
import { SearchOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Descriptions,
  Divider,
  Drawer,
  Image,
  Input,
  Space,
  Spin,
  Table,
  Tag,
  Timeline,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  BRAND_REFUND_TICKET_STATUSES,
  BRAND_REFUND_TICKET_STATUS_LABELS,
  type BrandMeta,
  type BrandRefund,
  type BrandRefundTicketStatus,
} from "@enterprise/contracts";
import { EmptyState, Panel, PillTabs } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";
import { fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";
import { useBrandRefund, useBrandRefunds, useBrandOrderActions } from "@/query/brand-mall";
import { BrandShell, useBrandScope } from "../_components/brand-shell";
import {
  ActionLink,
  StatusTag,
  countOf,
  dash,
  brandLabel,
  withShop,
} from "../_components/brand-common";
import { PromptModal } from "../_components/prompt-modal";

/** 契约里售后单号关键字上限 60、拒绝理由 1~200（必填）。 */
const KEYWORD_MAX = 60;
const REJECT_REASON_MAX = 200;

/** 页签：全部 + 契约的售后单状态枚举（待处理/已同意/已拒绝/已退款/已取消）。 */
type RefundTab = {
  key: string;
  label: string;
  status?: BrandRefundTicketStatus;
  /** statusCounts 的候选键，按序取第一个非 0 的（契约只声明了 string→number 表）。 */
  countKeys: string[];
};

const REFUND_TABS: RefundTab[] = [
  { key: "ALL", label: "全部", countKeys: ["ALL", "TOTAL"] },
  ...BRAND_REFUND_TICKET_STATUSES.map((status) => ({
    key: status,
    label: BRAND_REFUND_TICKET_STATUS_LABELS[status] ?? status,
    status,
    countKeys: [status],
  })),
];

export default function BrandRefundPage() {
  return (
    <BrandShell
      active="refund"
      title="售后管理"
      desc="顾客在小程序「我的订单」里发起的退款/退货申请都到这里。点「同意退款」会通过你自己的微信商户号原路退回，钱直接从商户余额进顾客微信，平台不经手也不可撤销；不同意就点「拒绝」并写清理由，理由会展示给顾客。"
    >
      <RefundSection />
    </BrandShell>
  );
}

function RefundSection() {
  const { message, modal } = App.useApp();
  const { shopId, shop, meta } = useBrandScope();
  const params = useSearchParams();
  const actions = useBrandOrderActions();

  const [tab, setTab] = useState(() => {
    const wanted = params.get("status") ?? "";
    return REFUND_TABS.some((item) => item.key === wanted) ? wanted : "ALL";
  });
  const [keyword, setKeyword] = useState(params.get("keyword") ?? "");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(0);
  const [rejecting, setRejecting] = useState<BrandRefund | null>(null);

  const activeTab = REFUND_TABS.find((item) => item.key === tab) ?? REFUND_TABS[0];
  const filter = useMemo(
    () => ({ keyword: keyword.trim() || undefined, status: activeTab.status }),
    [keyword, activeTab],
  );

  const query = useBrandRefunds({ shopId }, filter, page);
  const rows = query.data?.list ?? [];
  const counts = query.data?.statusCounts;
  const filtered = Boolean(keyword.trim());

  const agreeRefund = (row: BrandRefund) => {
    modal.confirm({
      title: `同意退款 · ${row.refundNo}`,
      okText: "确认退款",
      okButtonProps: { danger: true },
      content: (
        <Space orientation="vertical" size={6}>
          <div>
            将向顾客 <strong>{dash(row.nickname)}</strong> 原路退回{" "}
            <strong>{moneyCny(row.amount)}</strong>（该订单实付 {moneyCny(row.orderPayAmount)}）。
          </div>
          <div className="muted text-12">
            退款从你本人的微信商户号余额发起，到账顾客微信后无法撤销，请先核对金额与退货情况。
          </div>
          {row.type === "RETURN_REFUND" ? (
            <div className="muted text-12">
              这是「退货退款」：确认前请核实顾客的退回快递（{dash(row.returnExpress)}）是否已收到。
            </div>
          ) : null}
          {shop && !shop.payReady ? (
            <Alert
              type="warning"
              showIcon
              message={
                <span className="text-12">
                  本店还没配好微信商户参数，同意后无法原路退款。
                  <ActionLink path={withShop("/brand-mall/publish", shopId)}>
                    去「小程序发布」配置收款
                  </ActionLink>
                  ，或先与顾客约定线下退款。
                </span>
              }
            />
          ) : null}
        </Space>
      ),
      onOk: async () => {
        await actions.agreeRefund.mutateAsync({ body: { shopId, id: row.id } });
        message.success(`售后 ${row.refundNo} 已同意，退款 ${moneyCny(row.amount)} 发起中`);
      },
    });
  };

  const rejectRefund = async (row: BrandRefund, reason: string) => {
    await actions.rejectRefund.mutateAsync({
      body: { shopId, id: row.id, rejectReason: reason.slice(0, REJECT_REASON_MAX) },
    });
    message.success(`售后 ${row.refundNo} 已拒绝，理由已同步给顾客`);
    setRejecting(null);
  };

  const columns: ColumnsType<BrandRefund> = [
    {
      title: "售后单号",
      dataIndex: "refundNo",
      width: 190,
      render: (value: string) => dash(value),
    },
    {
      title: "关联订单",
      dataIndex: "orderNo",
      width: 190,
      render: (value: string) => (
        <div>
          <div>{dash(value)}</div>
          <ActionLink
            path={withShop(`/brand-mall/order?keyword=${encodeURIComponent(value ?? "")}`, shopId)}
          >
            看订单
          </ActionLink>
        </div>
      ),
    },
    {
      title: "商品",
      dataIndex: "title",
      width: 260,
      render: (_, row) => (
        <Space align="start">
          {row.image ? (
            <RawImg
              src={row.image}
              alt=""
              style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 6,
                background: "#fafafa",
                display: "inline-block",
              }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div>{dash(row.title)}</div>
            <div className="muted text-12">
              {dash(row.skuName)} · {row.quantity} 件
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: "买家",
      dataIndex: "nickname",
      width: 160,
      render: (_, row) => (
        <div>
          <div>{dash(row.nickname)}</div>
          <div className="muted text-12">{dash(row.customerPhone)}</div>
        </div>
      ),
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 110,
      render: (value: string) => <StatusTag meta={meta} kind="returnType" value={value} />,
    },
    {
      title: "申请金额",
      dataIndex: "amount",
      width: 150,
      render: (value: number, row) => (
        <div>
          <div>{moneyCny(value)}</div>
          <div className="muted text-12">订单实付 {moneyCny(row.orderPayAmount)}</div>
        </div>
      ),
    },
    {
      title: "原因",
      dataIndex: "reason",
      width: 220,
      render: (_, row) => (
        <div>
          <div>{dash(row.reason)}</div>
          {row.desc ? <div className="muted text-12">{row.desc}</div> : null}
          {row.images.length ? (
            <div className="muted text-12">{row.images.length} 张凭证</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => <StatusTag meta={meta} kind="refundTicket" value={value} />,
    },
    {
      title: "申请时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 220,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => setDetailId(row.id)}>
            查看详情
          </Button>
          {row.status === "PENDING" ? (
            <>
              <Button
                size="small"
                type="link"
                onClick={() => agreeRefund(row)}
              >
                同意退款
              </Button>
              <Button size="small" type="link" danger onClick={() => setRejecting(row)}>
                拒绝
              </Button>
            </>
          ) : null}
          {row.status === "REJECTED" && row.rejectReason ? (
            <span className="muted text-12">理由：{row.rejectReason}</span>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="售后申请"
      titleExtra={
        filtered ? (
          <span className="muted text-12">
            已按条件筛选
            <Button
              size="small"
              type="link"
              onClick={() => {
                setKeyword("");
                setTab("ALL");
                setPage(1);
              }}
            >
              清除筛选
            </Button>
          </span>
        ) : null
      }
      extra={
        <PillTabs
          size="small"
          variant="soft"
          value={tab}
          onChange={(key) => {
            setTab(key);
            setPage(1);
          }}
          items={REFUND_TABS.map((item) => ({
            key: item.key,
            label: item.label,
            count: tabCount(item, counts, query.data?.total ?? 0, item.key === tab),
          }))}
        />
      }
    >
      {shop && !shop.payReady ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            <span>
              本店还没配置微信商户收款参数，「同意退款」没法原路退钱。
              <ActionLink path={withShop("/brand-mall/publish", shopId)}>
                去「小程序发布」补齐微信支付配置
              </ActionLink>
              ，或先与顾客约定线下退款再点同意。
            </span>
          }
        />
      ) : null}
      {meta && !meta.payAllowed ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="平台当前关闭了在线收款，这几笔售后请与顾客线下退款处理后再同意。"
        />
      ) : null}
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          style={{ width: 260 }}
          maxLength={KEYWORD_MAX}
          prefix={<SearchOutlined aria-hidden />}
          placeholder="售后单号 / 订单号 / 买家昵称 / 手机号"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
        />
      </Space>
      <Table<BrandRefund>
        rowKey="id"
        size="small"
        loading={query.isFetching}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1720 }}
        locale={{
          emptyText: query.isError ? (
            <EmptyState text={query.error.message || "售后列表读取失败，请稍后重试"} />
          ) : filtered || activeTab.key !== "ALL" ? (
            <EmptyState text="当前页签或关键字下没有售后单，切回「全部」看看" />
          ) : (
            <EmptyState text="还没有售后申请。顾客在小程序「我的订单 → 申请退款/退货」发起后，会出现在这里等你处理。" />
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

      <RefundDetailDrawer
        open={detailId > 0}
        shopId={shopId}
        refundId={detailId}
        meta={meta}
        onClose={() => setDetailId(0)}
        onAgree={(row) => agreeRefund(row)}
        onReject={(row) => setRejecting(row)}
      />
      <PromptModal
        open={Boolean(rejecting)}
        danger
        required
        title={`拒绝售后 · ${rejecting?.refundNo ?? ""}`}
        label="拒绝理由"
        extra={`必填，最多 ${REJECT_REASON_MAX} 字；理由会原样展示给顾客，请写清「为什么不行、接下来怎么办」`}
        maxLength={REJECT_REASON_MAX}
        placeholder="例如：已超过 7 天无理由期限，且商品已使用，已与顾客电话说明"
        okText="确认拒绝"
        confirmLoading={actions.rejectRefund.isPending}
        onCancel={() => setRejecting(null)}
        onSubmit={(value) => {
          // 契约要求 rejectReason 非空，弹窗规则之外再兜一道，避免空串打到后端才报错。
          const reason = value.trim();
          if (!rejecting || !reason) {
            message.warning("请填写拒绝理由");
            return Promise.resolve();
          }
          return rejectRefund(rejecting, reason);
        }}
      />
    </Panel>
  );
}

/**
 * `statusCounts` 在契约里只是 string→number 表、没固定汇总键名：先按候选键取，
 * 都取不到时只给当前页签退回列表 total，其余页签不显示数字，免得摆个假的 0 误导处理顺序。
 */
function tabCount(
  tab: RefundTab,
  counts: Record<string, number> | undefined,
  activeTotal: number,
  isActive: boolean,
): number | undefined {
  for (const key of tab.countKeys) {
    const value = countOf(counts, key);
    if (value) return value;
  }
  if (tab.key === "ALL") {
    const sum = BRAND_REFUND_TICKET_STATUSES.reduce(
      (acc, status) => acc + countOf(counts, status),
      0,
    );
    if (sum) return sum;
  }
  return isActive && activeTotal ? activeTotal : undefined;
}

function RefundDetailDrawer({
  open,
  shopId,
  refundId,
  meta,
  onClose,
  onAgree,
  onReject,
}: {
  open: boolean;
  shopId: number;
  refundId: number;
  meta: BrandMeta | null;
  onClose: () => void;
  onAgree: (row: BrandRefund) => void;
  onReject: (row: BrandRefund) => void;
}) {
  const detail = useBrandRefund({ shopId }, refundId);
  return (
    <Drawer open={open} size={760} destroyOnHidden onClose={onClose} title="售后详情">
      {!open ? null : detail.data ? (
        <RefundDetailBody
          key={`${shopId}-${refundId}`}
          detail={detail.data}
          meta={meta}
          shopId={shopId}
          onAgree={onAgree}
          onReject={onReject}
        />
      ) : detail.isError ? (
        <Alert
          type="error"
          showIcon
          message={`售后详情读取失败：${detail.error.message || "请稍后重试"}`}
        />
      ) : (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin />
        </div>
      )}
    </Drawer>
  );
}

function RefundDetailBody({
  detail,
  meta,
  shopId,
  onAgree,
  onReject,
}: {
  detail: BrandRefund;
  meta: BrandMeta | null;
  shopId: number;
  onAgree: (row: BrandRefund) => void;
  onReject: (row: BrandRefund) => void;
}) {
  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      {detail.status === "PENDING" ? (
        <Space wrap>
          <Button type="primary" danger onClick={() => onAgree(detail)}>
            同意退款 {moneyCny(detail.amount)}
          </Button>
          <Button onClick={() => onReject(detail)}>拒绝</Button>
          <span className="muted text-12">同意即从你的微信商户号原路退款，不可撤销</span>
        </Space>
      ) : null}

      <Descriptions
        size="small"
        bordered
        column={2}
        items={[
          { key: "no", label: "售后单号", children: detail.refundNo },
          {
            key: "status",
            label: "状态",
            children: <StatusTag meta={meta} kind="refundTicket" value={detail.status} />,
          },
          {
            key: "order",
            label: "关联订单",
            children: (
              <Space size={4}>
                <span>{dash(detail.orderNo)}</span>
                <ActionLink
                  path={withShop(
                    `/brand-mall/order?keyword=${encodeURIComponent(detail.orderNo ?? "")}`,
                    shopId,
                  )}
                >
                  看订单
                </ActionLink>
              </Space>
            ),
          },
          {
            key: "type",
            label: "售后类型",
            children: <StatusTag meta={meta} kind="returnType" value={detail.type} />,
          },
          {
            key: "buyer",
            label: "买家",
            children: `${dash(detail.nickname)}（${dash(detail.customerPhone)}）`,
          },
          { key: "created", label: "申请时间", children: fmtTime(detail.createdAt) },
          {
            key: "amount",
            label: "申请退款金额",
            children: <strong>{moneyCny(detail.amount)}</strong>,
          },
          { key: "pay", label: "该订单实付", children: moneyCny(detail.orderPayAmount) },
          {
            key: "returnExpress",
            label: "退回快递",
            children: dash(detail.returnExpress),
          },
          {
            key: "refunded",
            label: "退款完成时间",
            children: detail.refundedAt ? fmtTime(detail.refundedAt) : "未退款",
          },
        ]}
      />

      <div>
        <Divider orientation="horizontal" titlePlacement="left" plain>
          申请商品
        </Divider>
        <Space align="start">
          {detail.image ? (
            <RawImg
              src={detail.image}
              alt=""
              style={{ width: 56, height: 56, borderRadius: 6, objectFit: "cover" }}
            />
          ) : null}
          <div>
            <div>{dash(detail.title)}</div>
            <div className="muted text-12">
              {dash(detail.skuName)} · {detail.quantity} 件
            </div>
          </div>
        </Space>
      </div>

      <div>
        <Divider orientation="horizontal" titlePlacement="left" plain>
          申请说明
        </Divider>
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          <div>
            <Tag>{dash(detail.reason)}</Tag>
          </div>
          <div>{dash(detail.desc)}</div>
          {detail.images.length ? (
            // 凭证是顾客上传的 OSS 直链，用 PreviewGroup 一次看全，域名随租户变化所以不开 CDN
            <Image.PreviewGroup>
              <Space wrap size={8}>
                {detail.images.map((url, index) => (
                  <Image
                    key={`${url}-${index}`}
                    src={url}
                    width={92}
                    height={92}
                    style={{ objectFit: "cover", borderRadius: 6 }}
                    alt={`凭证 ${index + 1}`}
                  />
                ))}
              </Space>
            </Image.PreviewGroup>
          ) : (
            <span className="muted text-12">顾客没有上传凭证图片。</span>
          )}
        </Space>
      </div>

      {detail.adminRemark || detail.rejectReason ? (
        <div>
          <Divider orientation="horizontal" titlePlacement="left" plain>
            处理结论
          </Divider>
          <Descriptions
            size="small"
            bordered
            column={1}
            items={[
              ...(detail.rejectReason
                ? [
                    {
                      key: "reject",
                      label: "拒绝理由（顾客可见）",
                      children: detail.rejectReason,
                    },
                  ]
                : []),
              ...(detail.adminRemark
                ? [{ key: "admin", label: "店铺备注", children: detail.adminRemark }]
                : []),
            ]}
          />
        </div>
      ) : null}

      <div>
        <Divider orientation="horizontal" titlePlacement="left" plain>
          处理进度
        </Divider>
        <Timeline items={refundTimeline(detail, meta)} />
      </div>
    </Space>
  );
}

/**
 * 契约的售后单没有日志数组（只有 createdAt / refundedAt / status / 两个理由字段），
 * 所以时间线按状态从这些字段推出来，够用且不依赖后端再加接口。
 */
type TimelineItem = {
  key: string;
  color: "blue" | "red" | "green" | "gray";
  title: string;
  content: ReactNode;
};

function refundTimeline(detail: BrandRefund, meta: BrandMeta | null): TimelineItem[] {
  const items: TimelineItem[] = [
    {
      key: "created",
      color: "blue",
      title: "顾客提交申请",
      content: (
        <span className="muted text-12">
          {dash(detail.reason)} · 申请 {moneyCny(detail.amount)} · {fmtTime(detail.createdAt)}
        </span>
      ),
    },
  ];
  const note = (text: string) => <span className="muted text-12">{text}</span>;

  if (detail.status === "PENDING") {
    items.push({
      key: "pending",
      color: "gray",
      title: "等待店铺处理",
      content: note("超时不处理会影响顾客复购，也可能被微信客服介入"),
    });
  }
  if (detail.status === "AGREED") {
    items.push({
      key: "agreed",
      color: "blue",
      title: "店铺已同意",
      content: note(`${dash(detail.adminRemark)} · 等待微信退款回执`),
    });
  }
  if (detail.status === "REFUNDED") {
    if (detail.adminRemark) {
      items.push({
        key: "agreed",
        color: "blue",
        title: "店铺已同意",
        content: note(dash(detail.adminRemark)),
      });
    }
    items.push({
      key: "refunded",
      color: "green",
      title: "退款已原路退回",
      content: note(`${moneyCny(detail.amount)} · ${fmtTime(detail.refundedAt)}`),
    });
  }
  if (detail.status === "REJECTED") {
    items.push({
      key: "rejected",
      color: "red",
      title: "店铺已拒绝",
      content: note(dash(detail.rejectReason)),
    });
  }
  if (detail.status === "CANCELLED") {
    items.push({
      key: "cancelled",
      color: "gray",
      title: "顾客撤销申请",
      content: note("订单按原状态继续，无需处理"),
    });
  }
  items.push({
    key: "current",
    color: "gray",
    title: `当前：${brandLabel(meta, "refundTicket", detail.status)}`,
    content: note(`最后更新 ${fmtTime(detail.refundedAt || detail.createdAt)}`),
  });
  return items;
}
