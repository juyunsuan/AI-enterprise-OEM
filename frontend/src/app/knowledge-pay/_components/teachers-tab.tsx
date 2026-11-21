"use client";

// 讲师管理：课程可关联讲师，小程序提供讲师主页与课程合集。
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
import type { KpTeacherRow } from "@enterprise/contracts";
import { knowledgePayApi } from "@/api/knowledge-pay";
import { EmptyState, Panel } from "@/components/ui/panel";
import { ImageUploadField } from "./image-upload-field";

type Draft = {
  id: number;
  name: string;
  title: string;
  avatar: string;
  intro: string;
  sort: number;
  status: boolean;
};

const EMPTY: Draft = {
  id: 0,
  name: "",
  title: "",
  avatar: "",
  intro: "",
  sort: 0,
  status: true,
};

export function TeachersTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpTeacherRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.teachers();
      setRows(data?.list ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "讲师加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft.name.trim()) {
      message.warning("请填写讲师姓名");
      return;
    }
    const body = {
      name: draft.name.trim(),
      title: draft.title.trim(),
      avatar: draft.avatar.trim(),
      intro: draft.intro,
      sort: Math.max(0, Math.round(draft.sort || 0)),
      status: draft.status,
    };
    setSaving(true);
    try {
      if (draft.id) {
        await knowledgePayApi.updateTeacher({ params: { id: String(draft.id) }, body });
      } else {
        await knowledgePayApi.saveTeacher({ body });
      }
      message.success(draft.id ? "讲师已更新" : "讲师已创建");
      setOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: KpTeacherRow) => {
    try {
      await knowledgePayApi.removeTeacher({ params: { id: String(row.id) } });
      message.success("讲师已删除，关联课程已解绑");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<KpTeacherRow> = [
    {
      title: "头像",
      dataIndex: "avatar",
      width: 80,
      render: (value: string) =>
        value ? (
          <Image src={value} alt="讲师头像" width={44} height={44} preview={false} style={{ borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <span className="text-12 muted">—</span>
        ),
    },
    {
      title: "讲师",
      dataIndex: "name",
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <span>{value}</span>
          <span className="text-12 muted">{row.title || "—"}</span>
        </Space>
      ),
    },
    { title: "课程数", dataIndex: "courseCount", width: 90 },
    { title: "排序", dataIndex: "sort", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: boolean) => (value ? <Tag color="green">展示中</Tag> : <Tag>已隐藏</Tag>),
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
                name: row.name,
                title: row.title,
                avatar: row.avatar,
                intro: row.intro,
                sort: row.sort,
                status: row.status,
              });
              setOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="删除讲师？关联课程会解绑，但课程本身保留" onConfirm={() => void remove(row)}>
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
      title="讲师管理"
      titleExtra={<span className="text-12 muted">课程编辑里选择讲师；小程序讲师主页展示其全部已上架课程</span>}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => {
            setDraft(EMPTY);
            setOpen(true);
          }}
        >
          新建讲师
        </Button>
      }
    >
      <Table<KpTeacherRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        locale={{ emptyText: <EmptyState text="还没有讲师；先建讲师，再在课程里关联。" /> }}
      />

      <Modal
        open={open}
        title={draft.id ? "编辑讲师" : "新建讲师"}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存"
        width={680}
        destroyOnHidden
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div className="form-2col">
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>姓名</div>
              <Input value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>头衔</div>
              <Input value={draft.title} maxLength={60} placeholder="如：资深运营专家" onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </div>
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>头像</div>
            <ImageUploadField value={draft.avatar} size={88} onChange={(url) => setDraft({ ...draft, avatar: url })} />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>简介</div>
            <Input.TextArea rows={4} maxLength={2000} value={draft.intro} onChange={(event) => setDraft({ ...draft, intro: event.target.value })} />
          </div>
          <div className="form-2col">
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>排序</div>
              <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} value={draft.sort} onChange={(value) => setDraft({ ...draft, sort: Number(value) || 0 })} />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>状态</div>
              <Space>
                <Switch checked={draft.status} onChange={(value) => setDraft({ ...draft, status: value })} />
                <span>{draft.status ? "展示中" : "已隐藏"}</span>
              </Space>
            </div>
          </div>
        </Space>
      </Modal>
    </Panel>
  );
}
