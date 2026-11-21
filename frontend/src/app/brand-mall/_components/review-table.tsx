"use client";
import { Button, Form, Input, Modal, Rate, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import type { BrandMeta, BrandReview } from "@enterprise/contracts";
import { EmptyState } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useBrandGoodsActions, useBrandReviews } from "@/query/brand-mall";
import { ActionLink, StatusTag, dash, withShop } from "./brand-common";
import { RawImg } from "@/components/ui/raw-img";

/**
 * 顾客评价：回复会推给顾客（小程序详情页展示），显示/隐藏决定别的顾客能否看到。
 * 状态用契约里的 PENDING/PUBLISHED/HIDDEN 三态。
 */
export function ReviewTable({
  shopId,
  meta,
}: {
  shopId: number;
  meta: BrandMeta | null;
}) {
  const actions = useBrandGoodsActions();
  const [status, setStatus] = useState("");
  const [rating, setRating] = useState<number>();
  const [page, setPage] = useState(1);
  const [replying, setReplying] = useState<BrandReview | null>(null);
  const [form] = Form.useForm<{ reply: string }>();

  const query = useBrandReviews(
    { shopId },
    {
      status: (status || undefined) as "PENDING" | "PUBLISHED" | "HIDDEN" | undefined,
      rating,
    },
    page,
  );
  const rows = query.data?.list ?? [];

  const columns: ColumnsType<BrandReview> = [
    {
      title: "商品",
      dataIndex: "productTitle",
      width: 240,
      render: (value: string, row) => (
        <Space align="start">
          {row.coverImage ? (
            <RawImg
              src={row.coverImage}
              alt=""
              style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }}
            />
          ) : null}
          <div>
            <div>{dash(value)}</div>
            <div className="muted text-12">
              <ActionLink path={withShop(`/brand-mall/goods?keyword=${encodeURIComponent(value ?? "")}`, shopId)}>
                看商品
              </ActionLink>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: "顾客",
      dataIndex: "nickname",
      width: 160,
      render: (value: string, row) => (
        <div>
          <div>{dash(value)}</div>
          <span className="muted text-12">订单 #{row.orderId}</span>
        </div>
      ),
    },
    {
      title: "评分",
      dataIndex: "rating",
      width: 120,
      render: (value: number) => <Rate disabled value={value} count={5} />,
    },
    { title: "内容", dataIndex: "content", width: 300, render: (value: string) => dash(value) },
    {
      title: "图片",
      dataIndex: "images",
      width: 120,
      render: (value: string[]) =>
        value.length ? (
          <Space size={2}>
            {value.slice(0, 3).map((url, index) => (
              <RawImg
                key={`${url}-${index}`}
                src={url}
                alt=""
                style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }}
              />
            ))}
            {value.length > 3 ? <span className="muted text-12">+{value.length - 3}</span> : null}
          </Space>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      title: "卖家回复",
      dataIndex: "reply",
      width: 220,
      render: (value: string, row) =>
        value ? (
          <div>
            <div>{value}</div>
            <span className="muted text-12">{fmtTime(row.replyAt)}</span>
          </div>
        ) : (
          <span className="muted text-12">未回复</span>
        ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag kind="review" value={value} />,
    },
    { title: "评价时间", dataIndex: "createdAt", width: 150, render: (value: string) => fmtTime(value) },
    {
      title: "操作",
      key: "actions",
      width: 220,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button
            size="small"
            type="link"
            onClick={() => {
              form.setFieldValue("reply", row.reply ?? "");
              setReplying(row);
            }}
          >
            {row.reply ? "修改回复" : "回复"}
          </Button>
          <Button
            size="small"
            type="link"
            disabled={row.status === "PUBLISHED"}
            onClick={() =>
              void actions.setReviewStatus.mutateAsync({
                body: { shopId, id: row.id, status: "PUBLISHED" },
              })
            }
          >
            公开
          </Button>
          <Button
            size="small"
            type="link"
            disabled={row.status === "HIDDEN"}
            onClick={() =>
              void actions.setReviewStatus.mutateAsync({
                body: { shopId, id: row.id, status: "HIDDEN" },
              })
            }
          >
            隐藏
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          allowClear
          style={{ width: 150 }}
          placeholder="展示状态"
          value={status || undefined}
          onChange={(value) => {
            setStatus(value ?? "");
            setPage(1);
          }}
          options={[
            { value: "PENDING", label: "待处理" },
            { value: "PUBLISHED", label: "已公开" },
            { value: "HIDDEN", label: "已隐藏" },
          ]}
        />
        <Select
          allowClear
          style={{ width: 140 }}
          placeholder="评分"
          value={rating}
          onChange={(value) => {
            setRating(value);
            setPage(1);
          }}
          options={[5, 4, 3, 2, 1].map((value) => ({ value, label: `${value} 星` }))}
        />
        <Tag>{meta ? "评价随店铺数据走，切店自动换列表" : "评价列表"}</Tag>
      </Space>
      <Table<BrandReview>
        rowKey="id"
        size="small"
        loading={query.isFetching}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1500 }}
        locale={{
          emptyText: (
            <EmptyState text="还没有顾客评价。订单完成后顾客在小程序「我的订单」里评价。" />
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
      {replying ? (
        <Modal
          open
          destroyOnHidden
          title={`回复评价 · ${replying.productTitle}`}
          okText="提交回复"
          onCancel={() => setReplying(null)}
          onOk={async () => {
            const values = await form.validateFields();
            await actions.replyReview.mutateAsync({
              body: { shopId, id: replying.id, reply: values.reply.trim() },
            });
            setReplying(null);
          }}
          confirmLoading={actions.replyReview.isPending}
        >
          <Form form={form} layout="vertical" key={replying.id} initialValues={{ reply: replying.reply }}>
            <Form.Item
              name="reply"
              label="回复内容"
              extra="回复会显示在小程序商品详情页，顾客能收到订阅消息（若已配模板）"
              rules={[{ required: true, message: "请填写回复内容" }]}
            >
              <Input.TextArea rows={3} maxLength={500} showCount />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}
    </>
  );
}
