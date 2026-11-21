"use client";

// 内容分类页签：分类台的增删改查；分类下挂有付费内容时后端会拦截删除，报错文案直接展示。
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { KpCategoryRow } from "@enterprise/contracts";
import { knowledgePayApi } from "@/api/knowledge-pay";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { ImageUploadField } from "./image-upload-field";

type CategoryDraft = {
  id: number;
  title: string;
  cover: string;
  sort: number;
  status: boolean;
};

const EMPTY_DRAFT: CategoryDraft = { id: 0, title: "", cover: "", sort: 0, status: true };

export function CategoriesTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpCategoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<CategoryDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.categories();
      setRows(data?.list ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "分类加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  // 进入即加载；任何增删改成功后重新拉取，不放手动刷新按钮。
  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const title = draft.title.trim();
    if (!title) {
      message.warning("请填写分类名称");
      return;
    }
    setSaving(true);
    const body = {
      title,
      cover: draft.cover.trim(),
      sort: Math.max(0, Math.min(9999, Math.round(draft.sort || 0))),
      status: draft.status,
    };
    try {
      if (draft.id) {
        await knowledgePayApi.updateCategory({ params: { id: String(draft.id) }, body });
      } else {
        await knowledgePayApi.createCategory({ body });
      }
      message.success(draft.id ? "分类已更新" : "分类已创建");
      setModalOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: KpCategoryRow) => {
    try {
      await knowledgePayApi.removeCategory({ params: { id: String(row.id) } });
      message.success("分类已删除");
      await load();
    } catch (cause) {
      // 分类被内容引用等阻断性错误由后端给出可执行中文文案，原样展示。
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<KpCategoryRow> = [
    {
      title: "封面",
      dataIndex: "cover",
      width: 80,
      render: (value: string) =>
        value ? (
          <Image
            src={value}
            alt="分类封面"
            width={48}
            height={48}
            style={{ borderRadius: 6, objectFit: "cover" }}
          />
        ) : (
          <span className="text-12 muted">—</span>
        ),
    },
    { title: "标题", dataIndex: "title", ellipsis: true },
    { title: "排序", dataIndex: "sort", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: boolean) =>
        value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
    },
    { title: "内容数", dataIndex: "resourceCount", width: 90 },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 150,
      render: (_value, row) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined aria-hidden />}
            onClick={() => {
              setDraft({
                id: row.id,
                title: row.title,
                cover: row.cover,
                sort: row.sort,
                status: row.status,
              });
              setModalOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="删除这个分类？" onConfirm={() => void remove(row)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined aria-hidden />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="内容分类"
      titleExtra={
        <span className="text-12 muted">
          排序号越小越靠前；停用后小程序端隐藏该栏目，已有内容仍在
        </span>
      }
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => {
            setDraft({ ...EMPTY_DRAFT });
            setModalOpen(true);
          }}
        >
          新建分类
        </Button>
      }
    >
      <Table<KpCategoryRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: 760 }}
        locale={{ emptyText: <EmptyState text="还没有分类；先建栏目，再往里挂付费内容。" /> }}
      />

      <Modal
        open={modalOpen}
        title={draft.id ? "编辑分类" : "新建分类"}
        onCancel={() => setModalOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存"
        width={560}
        destroyOnHidden
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>分类名称</div>
            <Input
              value={draft.title}
              maxLength={60}
              placeholder="如：Excel 实战"
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>分类封面（可选）</div>
            <ImageUploadField
              value={draft.cover}
              onChange={(url) => setDraft({ ...draft, cover: url })}
            />
          </div>
          <div className="form-2col">
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>排序</div>
              <InputNumber
                min={0}
                max={9999}
                precision={0}
                value={draft.sort}
                style={{ width: "100%" }}
                onChange={(value) => setDraft({ ...draft, sort: Number(value) || 0 })}
              />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>状态</div>
              <Space>
                <Switch
                  checked={draft.status}
                  onChange={(value) => setDraft({ ...draft, status: value })}
                />
                <span>{draft.status ? "启用" : "停用"}</span>
              </Space>
            </div>
          </div>
        </Space>
      </Modal>
    </Panel>
  );
}
