"use client";

// 发现页导航 + 自定义单页：导航可跳课程/单页/外链/他方小程序；单页给关于我们、协议与活动用。
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
import type { KpNavRow, KpPageRow } from "@enterprise/contracts";
import { knowledgePayApi } from "@/api/knowledge-pay";
import { EmptyState, Panel, PanelTabs } from "@/components/ui/panel";
import { ImageUploadField } from "./image-upload-field";

export function NavPageTab() {
  const [tab, setTab] = useState("navs");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "navs", label: "发现页导航", children: <NavSection key="navs" /> },
        { key: "pages", label: "自定义单页", children: <PageSection key="pages" /> },
      ]}
    />
  );
}

type NavDraft = {
  id: number;
  title: string;
  icon: string;
  link: string;
  sort: number;
  status: boolean;
};

const EMPTY_NAV: NavDraft = { id: 0, title: "", icon: "", link: "none", sort: 0, status: true };

function NavSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpNavRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NavDraft>(EMPTY_NAV);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.navs();
      setRows(data?.list ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "导航加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft.title.trim()) {
      message.warning("请填写导航标题");
      return;
    }
    const body = {
      title: draft.title.trim(),
      icon: draft.icon.trim(),
      link: draft.link.trim() || "none",
      sort: Math.max(0, Math.round(draft.sort || 0)),
      status: draft.status,
    };
    setSaving(true);
    try {
      if (draft.id) {
        await knowledgePayApi.updateNav({ params: { id: String(draft.id) }, body });
      } else {
        await knowledgePayApi.saveNav({ body });
      }
      message.success(draft.id ? "导航已更新" : "导航已创建");
      setOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: KpNavRow) => {
    try {
      await knowledgePayApi.removeNav({ params: { id: String(row.id) } });
      message.success("导航已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<KpNavRow> = [
    {
      title: "图标",
      dataIndex: "icon",
      width: 70,
      render: (value: string) =>
        value ? <Image src={value} alt="导航图标" width={36} height={36} preview={false} style={{ borderRadius: 8, objectFit: "cover" }} /> : <span className="text-12 muted">—</span>,
    },
    { title: "标题", dataIndex: "title" },
    { title: "跳转", dataIndex: "link", ellipsis: true, render: (value: string) => <span className="mono text-12">{value || "none"}</span> },
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
              setDraft({ id: row.id, title: row.title, icon: row.icon, link: row.link, sort: row.sort, status: row.status });
              setOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="删除这个导航？" onConfirm={() => void remove(row)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined aria-hidden />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="发现页导航"
      titleExtra={<span className="text-12 muted">协议写法：resource:&lt;课程ID&gt;、page:&lt;单页ID&gt;、url:&lt;https&gt;、app:&lt;appid&gt;|&lt;path&gt;、none</span>}
      extra={
        <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => { setDraft(EMPTY_NAV); setOpen(true); }}>
          新建导航
        </Button>
      }
    >
      <Table<KpNavRow> rowKey="id" size="small" loading={loading} dataSource={rows} columns={columns} pagination={false} locale={{ emptyText: <EmptyState text="还没有导航；小程序「发现」页会按这里渲染。" /> }} />

      <Modal open={open} title={draft.id ? "编辑导航" : "新建导航"} onCancel={() => setOpen(false)} onOk={() => void save()} confirmLoading={saving} okText="保存" width={640} destroyOnHidden>
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>标题</div>
            <Input value={draft.title} maxLength={60} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>图标（可选）</div>
            <ImageUploadField value={draft.icon} size={64} onChange={(url) => setDraft({ ...draft, icon: url })} />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>跳转</div>
            <Input className="mono" value={draft.link} maxLength={512} onChange={(event) => setDraft({ ...draft, link: event.target.value })} />
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

type PageDraft = {
  id: number;
  title: string;
  slug: string;
  content: string;
  sort: number;
  status: boolean;
};

const EMPTY_PAGE: PageDraft = { id: 0, title: "", slug: "", content: "", sort: 0, status: true };

function PageSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpPageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PageDraft>(EMPTY_PAGE);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.pages();
      setRows(data?.list ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "单页加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft.title.trim()) {
      message.warning("请填写页面标题");
      return;
    }
    const body = {
      title: draft.title.trim(),
      slug: draft.slug.trim(),
      content: draft.content,
      sort: Math.max(0, Math.round(draft.sort || 0)),
      status: draft.status,
    };
    setSaving(true);
    try {
      if (draft.id) {
        await knowledgePayApi.updatePage({ params: { id: String(draft.id) }, body });
      } else {
        await knowledgePayApi.savePage({ body });
      }
      message.success(draft.id ? "页面已更新" : "页面已创建");
      setOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: KpPageRow) => {
    try {
      await knowledgePayApi.removePage({ params: { id: String(row.id) } });
      message.success("页面已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<KpPageRow> = [
    { title: "标题", dataIndex: "title" },
    { title: "标识", dataIndex: "slug", width: 160, render: (value: string) => <span className="mono text-12">{value || "—"}</span> },
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
              setDraft({ id: row.id, title: row.title, slug: row.slug, content: row.content, sort: row.sort, status: row.status });
              setOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="删除这个页面？导航若指向它会失效" onConfirm={() => void remove(row)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined aria-hidden />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="自定义单页"
      titleExtra={<span className="text-12 muted">正文按富文本渲染；导航用 page:&lt;页面ID&gt; 跳转</span>}
      extra={
        <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => { setDraft(EMPTY_PAGE); setOpen(true); }}>
          新建页面
        </Button>
      }
    >
      <Table<KpPageRow> rowKey="id" size="small" loading={loading} dataSource={rows} columns={columns} pagination={false} locale={{ emptyText: <EmptyState text="还没有单页；可建「关于我们」「用户协议」等。" /> }} />

      <Modal open={open} title={draft.id ? "编辑页面" : "新建页面"} onCancel={() => setOpen(false)} onOk={() => void save()} confirmLoading={saving} okText="保存" width={760} destroyOnHidden>
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div className="form-2col">
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>页面标题</div>
              <Input value={draft.title} maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>标识（可选，字母数字）</div>
              <Input className="mono" value={draft.slug} maxLength={60} placeholder="about / terms" onChange={(event) => setDraft({ ...draft, slug: event.target.value })} />
            </div>
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>正文</div>
            <Input.TextArea rows={10} maxLength={60000} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
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
