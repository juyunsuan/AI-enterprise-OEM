"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { CardShopContent, CardShopContentKind } from "@enterprise/contracts";
import { cardShopApi } from "@/api/card-shop";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { StatusTag } from "./common";
import { useCardShopScope } from "./scope";

type ContentDraft = {
  kind: CardShopContentKind;
  title: string;
  summary: string;
  coverImage: string;
  content: string;
  link: string;
  popAuto: boolean;
  sort: number;
  status: boolean;
};

const EMPTY: ContentDraft = {
  kind: "NOTICE",
  title: "",
  summary: "",
  coverImage: "",
  content: "",
  link: "",
  popAuto: false,
  sort: 0,
  status: true,
};

/** 公告 / 资讯 / 单页：公告对应首页公告栏，可设为进店弹出。 */
export function ContentTab() {
  const { siteId, meta } = useCardShopScope();
  const { message } = App.useApp();
  const [rows, setRows] = useState<CardShopContent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [kind, setKind] = useState("");
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ContentDraft>(EMPTY);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const result = await cardShopApi.contentList({
        query: {
          siteId,
          kind: (kind || undefined) as CardShopContentKind | undefined,
          keyword: keyword.trim() || undefined,
          page,
          pageSize,
        },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "内容读取失败");
    } finally {
      setLoading(false);
    }
  }, [siteId, kind, keyword, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft.title.trim()) {
      message.warning("请填写标题");
      return;
    }
    setSaving(true);
    try {
      await cardShopApi.contentSave({ body: { ...draft, siteId, id: editingId } });
      message.success(editingId ? "内容已更新" : "内容已创建");
      setOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: CardShopContent) => {
    try {
      await cardShopApi.contentRemove({ body: { siteId, id: row.id } });
      message.success("内容已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<CardShopContent> = [
    {
      title: "类型",
      dataIndex: "kind",
      width: 90,
      render: (value: string) => <StatusTag meta={meta} kind="content" value={value} />,
    },
    {
      title: "标题",
      dataIndex: "title",
      ellipsis: true,
      render: (_: string, row) => (
        <span>
          {row.title}
          {row.popAuto ? <Tag style={{ marginLeft: 6 }}>进店弹出</Tag> : null}
        </span>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: boolean) => (value ? <Tag color="green">已发布</Tag> : <Tag>草稿</Tag>),
    },
    { title: "排序", dataIndex: "sort", width: 80 },
    { title: "更新时间", dataIndex: "updatedAt", width: 160, render: (value: string) => fmtTime(value) },
    {
      title: "操作",
      width: 160,
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingId(row.id);
              setDraft({
                kind: row.kind,
                title: row.title,
                summary: row.summary,
                coverImage: row.coverImage,
                content: row.content,
                link: row.link,
                popAuto: row.popAuto,
                sort: row.sort,
                status: row.status,
              });
              setOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="删除该内容？" onConfirm={() => void remove(row)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="公告与内容"
        titleExtra={<span className="muted text-12">公告进首页公告栏，资讯/单页进「资讯」栏目</span>}
        extra={
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingId(0);
              setDraft({ ...EMPTY });
              setOpen(true);
            }}
          >
            新建内容
          </Button>
        }
      >
        <Space size={8} wrap style={{ marginBottom: 12 }}>
          <Select
            allowClear
            placeholder="类型"
            style={{ width: 140 }}
            value={kind || undefined}
            options={[
              { value: "NOTICE", label: "公告" },
              { value: "ARTICLE", label: "资讯" },
              { value: "PAGE", label: "单页" },
            ]}
            onChange={(value) => {
              setPage(1);
              setKind(value || "");
            }}
          />
          <Input.Search
            allowClear
            placeholder="标题"
            style={{ width: 220 }}
            onSearch={(value) => {
              setPage(1);
              setKeyword(value);
            }}
          />
        </Space>
        {rows.length || loading ? (
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            dataSource={rows}
            columns={columns}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (value) => `共 ${value} 条`,
              onChange: (nextPage, nextSize) => {
                setPage(nextPage);
                setPageSize(nextSize);
              },
            }}
          />
        ) : (
          <EmptyState text="还没有内容；公告用来在小程序首页发通知" />
        )}
      </Panel>

      <Modal
        title={editingId ? "编辑内容" : "新建内容"}
        open={open}
        width={720}
        onCancel={() => setOpen(false)}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <Space size={12} wrap>
            <Form.Item label="类型">
              <Select
                style={{ width: 150 }}
                value={draft.kind}
                options={[
                  { value: "NOTICE", label: "公告" },
                  { value: "ARTICLE", label: "资讯" },
                  { value: "PAGE", label: "单页" },
                ]}
                onChange={(value) => setDraft((prev) => ({ ...prev, kind: value }))}
              />
            </Form.Item>
            <Form.Item label="排序">
              <InputNumber
                min={0}
                max={9999}
                style={{ width: 120 }}
                value={draft.sort}
                onChange={(value) => setDraft((prev) => ({ ...prev, sort: Number(value || 0) }))}
              />
            </Form.Item>
            <Form.Item label="发布">
              <Switch
                checked={draft.status}
                onChange={(checked) => setDraft((prev) => ({ ...prev, status: checked }))}
              />
            </Form.Item>
            <Form.Item label="进店弹出（仅公告）">
              <Switch
                checked={draft.popAuto}
                onChange={(checked) => setDraft((prev) => ({ ...prev, popAuto: checked }))}
              />
            </Form.Item>
          </Space>
          <Form.Item label="标题" required>
            <Input
              maxLength={200}
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            />
          </Form.Item>
          <Form.Item label="摘要">
            <Input
              maxLength={300}
              value={draft.summary}
              onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))}
            />
          </Form.Item>
          <Form.Item label="封面图地址">
            <Input
              maxLength={500}
              value={draft.coverImage}
              onChange={(event) => setDraft((prev) => ({ ...prev, coverImage: event.target.value }))}
            />
          </Form.Item>
          <Form.Item label="正文（HTML，落库前走净化）">
            <Input.TextArea
              rows={8}
              maxLength={200000}
              value={draft.content}
              onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
            />
          </Form.Item>
          <Form.Item label="跳转链接" extra="留空按详情页展示">
            <Input
              maxLength={500}
              value={draft.link}
              onChange={(event) => setDraft((prev) => ({ ...prev, link: event.target.value }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
