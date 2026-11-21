"use client";
// 评价页签：放行/隐藏决定小程序端是否展示并计入技师评分，回复直接展示在评价下方。
import {
  ONSITE_REVIEW_STATUSES,
  type OnsiteReviewRow,
  type OnsiteReviewStatus,
} from "@enterprise/contracts";
import {
  Button,
  Drawer,
  Form,
  Image,
  Input,
  Modal,
  Rate,
  Select,
  Space,
  Tag,
} from "antd";
import type { TableProps } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  useOnsiteReviewActions,
  useOnsiteReviews,
  useOnsiteStaff,
} from "@/query/onsite";
import { Notice, Panel } from "@/components/ui/panel";
import { DataTable, Descriptions, FilterBar } from "./list-kit";
import { StatusTag, statusOptions, timeText, withShop } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

export function ReviewPanel() {
  const { shopId, shop } = useOnsiteScope();
  const router = useRouter();
  const params = useSearchParams();
  const actions = useOnsiteReviewActions();
  const [status, setStatus] = useState("all");
  const [staffId, setStaffId] = useState("");
  const [rating, setRating] = useState("");
  const [page, setPage] = useState(1);
  const [replying, setReplying] = useState<OnsiteReviewRow | null>(null);
  const [detailId, setDetailId] = useState(0);
  const [form] = Form.useForm<{ reply: string }>();

  // 站内通知深链 /onsite/review?reviewId=…：命中本页数据后自动打开该条评价。
  const noticeId = Number(params.get("reviewId") || 0);
  const [noticeHit, setNoticeHit] = useState(false);

  const query = useOnsiteReviews(
    { shopId },
    { status, staffId, rating },
    page,
  );
  const rows = query.data?.list ?? [];
  const staffRows = useOnsiteStaff({ shopId }, {}, 1, 200).data?.list ?? [];
  const detail = rows.find((row) => row.id === detailId) ?? null;

  // 依赖 query.data 而非每次渲染新建的 rows 数组，命中后自动打开详情抽屉。
  useEffect(() => {
    if (!noticeId || noticeHit) return;
    const hit = (query.data?.list ?? []).find((row) => row.id === noticeId);
    if (hit) {
      setDetailId(hit.id);
      setNoticeHit(true);
    }
  }, [noticeId, noticeHit, query.data]);

  const clearFilters = () => {
    setStatus("all");
    setStaffId("");
    setRating("");
    setPage(1);
  };

  const release = async (row: OnsiteReviewRow, next: OnsiteReviewStatus) => {
    await actions.setReviewStatus.mutateAsync({
      params: { id: String(shopId) },
      body: { id: row.id, status: next },
    });
  };

  const submitReply = async () => {
    if (!replying) return;
    const values = await form.validateFields();
    await actions.replyReview.mutateAsync({
      params: { id: String(shopId) },
      body: { id: replying.id, reply: values.reply.trim() },
    });
    setReplying(null);
  };

  const columns: TableProps<OnsiteReviewRow>["columns"] = [
    {
      title: "评分",
      dataIndex: "rating",
      width: 150,
      render: (value: number) => <Rate disabled value={value} count={5} />,
    },
    {
      title: "内容",
      dataIndex: "content",
      width: 320,
      render: (value: string, row) => (
        <Space orientation="vertical" size={2} style={{ maxWidth: 320 }}>
          <span>{value || <span className="muted">（顾客未写文字）</span>}</span>
          <Space size={4} wrap>
            {row.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
            {row.images.length ? (
              <span className="muted text-12">{row.images.length} 张图</span>
            ) : null}
          </Space>
          <span className="muted text-12">
            {row.anonymous ? "匿名顾客" : row.customerNickname || `顾客 #${row.customerId}`}
          </span>
        </Space>
      ),
    },
    { title: "技师", dataIndex: "staffName", width: 120 },
    {
      title: "订单号",
      dataIndex: "orderNo",
      width: 180,
      render: (value: string) =>
        value ? (
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() =>
              router.push(
                withShop(`/onsite/order?keyword=${encodeURIComponent(value)}`, shopId),
              )
            }
          >
            {value}
          </Button>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag kind="review" value={value} />,
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => timeText(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 240,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => setDetailId(row.id)}>
            详情
          </Button>
          <Button
            size="small"
            type="link"
            onClick={() => setReplying(row)}
          >
            {row.reply ? "修改回复" : "回复"}
          </Button>
          <Button
            size="small"
            type="link"
            disabled={row.status === "PUBLISHED"}
            loading={actions.setReviewStatus.isPending}
            onClick={() => void release(row, "PUBLISHED")}
          >
            放行
          </Button>
          <Button
            size="small"
            type="link"
            danger
            disabled={row.status === "HIDDEN"}
            loading={actions.setReviewStatus.isPending}
            onClick={() => void release(row, "HIDDEN")}
          >
            隐藏
          </Button>
        </Space>
      ),
    },
  ];

  const trade = shop?.trade;

  return (
    <Panel title="顾客评价">
      {noticeId > 0 && !noticeHit ? (
        <Notice variant="warn">
          站内通知指向的评价（#{noticeId}）不在当前列表这一页。
          <Button size="small" type="link" onClick={clearFilters}>
            清除筛选并回到第 1 页
          </Button>
          或直接翻页查找。
        </Notice>
      ) : null}
      {trade ? (
        <Notice variant="info">
          {trade.reviewAuditFirst
            ? "本店已开启「评价先审后展示」：顾客新提交的评价先是「待审核」，你点「放行」后才在小程序展示并计入技师评分。"
            : "本店未开启「评价先审后展示」：顾客提交的评价直接展示并计分，你只能事后「隐藏」。"}
          {!trade.reviewEnabled
            ? "注意：当前交易设置不允许顾客评价已完成订单，小程序端不会出现评价入口。"
            : ""}
          <Button
            size="small"
            type="link"
            onClick={() => router.push(withShop("/onsite/setting", shopId))}
          >
            去店铺设置调整
          </Button>
        </Notice>
      ) : null}
      <FilterBar>
        <Select
          style={{ width: 140 }}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={statusOptions("review", ONSITE_REVIEW_STATUSES)}
        />
        <Select
          allowClear
          style={{ width: 160 }}
          placeholder="全部技师"
          value={staffId || undefined}
          onChange={(value) => {
            setStaffId(value ?? "");
            setPage(1);
          }}
          options={staffRows.map((row) => ({ value: String(row.id), label: row.name }))}
        />
        <Select
          allowClear
          style={{ width: 120 }}
          placeholder="全部评分"
          value={rating || undefined}
          onChange={(value) => {
            setRating(value ?? "");
            setPage(1);
          }}
          options={[5, 4, 3, 2, 1].map((value) => ({
            value: String(value),
            label: `${value} 星`,
          }))}
        />
      </FilterBar>
      <DataTable<OnsiteReviewRow>
        rows={rows}
        columns={columns}
        total={query.data?.total}
        page={page}
        loading={query.isFetching}
        scroll={{ x: 1300 }}
        onPage={setPage}
      />

      {replying ? (
        <Modal
          open
          destroyOnHidden
          title={`回复评价 · ${replying.anonymous ? "匿名顾客" : replying.customerNickname || `顾客 #${replying.customerId}`}`}
          okText="提交回复"
          confirmLoading={actions.replyReview.isPending}
          onCancel={() => setReplying(null)}
          onOk={() => void submitReply()}
        >
          <Form form={form} layout="vertical" key={replying.id} initialValues={{ reply: replying.reply }}>
            <Form.Item
              name="reply"
              label="回复内容"
              extra="回复会展示在小程序该条评价下方，顾客能收到站内通知；最多 1000 字"
              rules={[{ required: true, whitespace: true, message: "请填写回复内容" }]}
            >
              <Input.TextArea rows={4} maxLength={1000} showCount />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}

      <Drawer
        open={detail !== null}
        size={640}
        destroyOnHidden
        title="评价详情"
        onClose={() => setDetailId(0)}
      >
        {detail ? <ReviewDetail row={detail} shopId={shopId} /> : null}
      </Drawer>
    </Panel>
  );
}

function ReviewDetail({ row, shopId }: { row: OnsiteReviewRow; shopId: number }) {
  const router = useRouter();
  return (
    <Space orientation="vertical" size={14} style={{ width: "100%" }}>
      <Descriptions
        items={[
          { label: "综合评分", value: <Rate disabled value={row.rating} count={5} /> },
          { label: "服务质量", value: `${row.serviceRating} 星` },
          { label: "服务态度", value: `${row.attitudeRating} 星` },
          {
            label: "顾客",
            value: row.anonymous ? "匿名顾客" : row.customerNickname || `顾客 #${row.customerId}`,
          },
          { label: "技师", value: row.staffName || `#${row.staffId}` },
          { label: "订单号", value: row.orderNo || "—" },
          { label: "状态", value: <StatusTag kind="review" value={row.status} /> },
          { label: "评价时间", value: timeText(row.createdAt) },
        ]}
      />
      <div>
        <div className="muted text-12">评价内容</div>
        <div>{row.content || "（顾客未写文字）"}</div>
      </div>
      {row.tags.length ? (
        <Space size={4} wrap>
          {row.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Space>
      ) : null}
      {row.images.length ? (
        <Space size={6} wrap>
          {row.images.map((url, index) => (
            <Image key={`${url}-${index}`} src={url} width={72} height={72} style={{ objectFit: "cover", borderRadius: 6 }} alt="" />
          ))}
        </Space>
      ) : null}
      {row.items.length ? (
        <Descriptions
          items={row.items.map((item) => ({
            label: item.title,
            value: `${item.rating} 星`,
          }))}
        />
      ) : null}
      <div>
        <div className="muted text-12">商家回复</div>
        <div>
          {row.reply || <span className="muted">暂未回复</span>}
          {row.repliedAt ? <span className="muted text-12">（{timeText(row.repliedAt)}）</span> : null}
        </div>
      </div>
      {row.appealCount > 0 ? (
        <Notice variant="warn">
          该评价有 {row.appealCount} 条技师申诉待裁决。
          <Button
            size="small"
            type="link"
            onClick={() => router.push(withShop("/onsite/review?panel=appeal", shopId))}
          >
            去处理申诉
          </Button>
        </Notice>
      ) : null}
    </Space>
  );
}
