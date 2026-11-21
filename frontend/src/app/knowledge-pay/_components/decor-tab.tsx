"use client";

// 首页装修页签：轮播图 / 公告 / 精选推荐三块内部页签，跳转字段统一按「协议:值」写法。
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
import type { KpBannerRow, KpLinkRow, KpNoticeRow } from "@enterprise/contracts";
import { knowledgePayApi } from "@/api/knowledge-pay";
import {
  EmptyState,
  Panel,
  PanelTabs,
} from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { ImageUploadField } from "./image-upload-field";

/** 小程序端 link.js 解析的跳转协议，文案与实现保持一致。 */
const LINK_PROTOCOL_TIP =
  "跳转协议：resource:<内容ID> 打开内容详情；notice:<公告ID> 打开公告；url:<https 链接> 用 web-view 打开网页（需在小程序后台配业务域名）；app:<appid>|<页面路径> 跳第三方小程序；none 或留空不跳转。";

const PAGE_SIZE = 20;

export function DecorTab() {
  const [tab, setTab] = useState("banner");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        {
          key: "banner",
          label: "轮播图",
          children: <BannerSection key="banner" />,
        },
        {
          key: "notice",
          label: "公告",
          children: <NoticeSection key="notice" />,
        },
        {
          key: "link",
          label: "精选推荐",
          children: <LinkSection key="link" />,
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// 轮播图
// ---------------------------------------------------------------------------

type BannerDraft = {
  id: number;
  title: string;
  image: string;
  link: string;
  sort: number;
  status: boolean;
};

const EMPTY_BANNER: BannerDraft = { id: 0, title: "", image: "", link: "none", sort: 0, status: true };

function BannerSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpBannerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<BannerDraft>(EMPTY_BANNER);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.banners();
      setRows(data?.list ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "轮播图加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft.image.trim()) {
      message.warning("请上传轮播图片；只填标题不填图保存不了");
      return;
    }
    setSaving(true);
    const body = {
      title: draft.title.trim(),
      image: draft.image.trim(),
      link: draft.link.trim() || "none",
      sort: Math.max(0, Math.min(9999, Math.round(draft.sort || 0))),
      status: draft.status,
    };
    try {
      if (draft.id) {
        await knowledgePayApi.updateBanner({ params: { id: String(draft.id) }, body });
      } else {
        await knowledgePayApi.saveBanner({ body });
      }
      message.success("轮播图已保存");
      setModalOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: KpBannerRow) => {
    try {
      await knowledgePayApi.removeBanner({ params: { id: String(row.id) } });
      message.success("轮播图已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<KpBannerRow> = [
    {
      title: "图片",
      dataIndex: "image",
      width: 90,
      render: (value: string) =>
        value ? (
          <Image src={value} alt="轮播图" width={64} height={64} style={{ borderRadius: 6, objectFit: "cover" }} />
        ) : (
          <span className="text-12 muted">—</span>
        ),
    },
    { title: "标题", dataIndex: "title", ellipsis: true, render: (value: string) => value || <span className="text-12 muted">未填</span> },
    {
      title: "跳转",
      dataIndex: "link",
      ellipsis: true,
      render: (value: string) => <span className="mono text-12">{value || "none"}</span>,
    },
    { title: "排序", dataIndex: "sort", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: boolean) => (value ? <Tag color="green">展示</Tag> : <Tag>隐藏</Tag>),
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
                image: row.image,
                link: row.link,
                sort: row.sort,
                status: row.status,
              });
              setModalOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="删除这张轮播图？" onConfirm={() => void remove(row)}>
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
      title="首页轮播图"
      titleExtra={<span className="text-12 muted">排序小在前；首页是否展示轮播由「基础设置 → 首页轮播图」开关控制</span>}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => {
            setDraft({ ...EMPTY_BANNER });
            setModalOpen(true);
          }}
        >
          新增轮播
        </Button>
      }
    >
      <Table<KpBannerRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: 780 }}
        locale={{ emptyText: <EmptyState text="还没有轮播图；传张图配个跳转就能上首页。" /> }}
      />

      <Modal
        open={modalOpen}
        title={draft.id ? "编辑轮播图" : "新增轮播图"}
        onCancel={() => setModalOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存"
        width={640}
        destroyOnHidden
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>轮播图片（必填）</div>
            <ImageUploadField value={draft.image} size={140} onChange={(url) => setDraft({ ...draft, image: url })} />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>标题（可选）</div>
            <Input
              value={draft.title}
              maxLength={120}
              placeholder="叠在图上或列表里展示的一句话"
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>跳转</div>
            <Input
              className="mono"
              value={draft.link}
              maxLength={512}
              placeholder="如 resource:12 / none"
              onChange={(event) => setDraft({ ...draft, link: event.target.value })}
            />
            <div className="text-12 muted" style={{ marginTop: 6 }}>{LINK_PROTOCOL_TIP}</div>
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
                <Switch checked={draft.status} onChange={(value) => setDraft({ ...draft, status: value })} />
                <span>{draft.status ? "展示" : "隐藏"}</span>
              </Space>
            </div>
          </div>
        </Space>
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 公告
// ---------------------------------------------------------------------------

type NoticeDraft = {
  id: number;
  title: string;
  content: string;
  status: boolean;
};

const EMPTY_NOTICE: NoticeDraft = { id: 0, title: "", content: "", status: true };

function NoticeSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpNoticeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<NoticeDraft>(EMPTY_NOTICE);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.notices({ query: { page, pageSize: PAGE_SIZE } });
      setRows(data?.list ?? []);
      setTotal(data?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "公告加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const title = draft.title.trim();
    if (!title) {
      message.warning("请填写公告标题");
      return;
    }
    setSaving(true);
    const body = { title, content: draft.content, status: draft.status };
    try {
      if (draft.id) {
        await knowledgePayApi.updateNotice({ params: { id: String(draft.id) }, body });
      } else {
        await knowledgePayApi.saveNotice({ body });
      }
      message.success("公告已保存");
      setModalOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: KpNoticeRow) => {
    try {
      await knowledgePayApi.removeNotice({ params: { id: String(row.id) } });
      message.success("公告已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<KpNoticeRow> = [
    { title: "标题", dataIndex: "title", width: 220, ellipsis: true },
    { title: "内容", dataIndex: "content", ellipsis: true, render: (value: string) => value || <span className="text-12 muted">未填</span> },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: boolean) => (value ? <Tag color="green">展示</Tag> : <Tag>隐藏</Tag>),
    },
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
              setDraft({ id: row.id, title: row.title, content: row.content, status: row.status });
              setModalOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="删除这条公告？" onConfirm={() => void remove(row)}>
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
      title="首页公告"
      titleExtra={<span className="text-12 muted">公告栏轮播展示最新公告；显隐由「基础设置 → 首页公告栏」开关控制</span>}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => {
            setDraft({ ...EMPTY_NOTICE });
            setModalOpen(true);
          }}
        >
          发布公告
        </Button>
      }
    >
      <Table<KpNoticeRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 820 }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false, onChange: setPage }}
        locale={{ emptyText: <EmptyState text="还没有公告；发一条上新或活动通知试试。" /> }}
      />

      <Modal
        open={modalOpen}
        title={draft.id ? "编辑公告" : "发布公告"}
        onCancel={() => setModalOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存"
        width={640}
        destroyOnHidden
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>标题</div>
            <Input
              value={draft.title}
              maxLength={120}
              placeholder="一句话说清重点"
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>内容</div>
            <Input.TextArea
              rows={8}
              maxLength={20000}
              value={draft.content}
              placeholder="公告正文，点开公告详情整页展示"
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            />
          </div>
          <Space>
            <Switch checked={draft.status} onChange={(value) => setDraft({ ...draft, status: value })} />
            <span>{draft.status ? "展示" : "隐藏"}</span>
          </Space>
        </Space>
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 精选推荐
// ---------------------------------------------------------------------------

type LinkDraft = {
  id: number;
  title: string;
  summary: string;
  cover: string;
  link: string;
  sort: number;
  status: boolean;
};

const EMPTY_LINK: LinkDraft = {
  id: 0,
  title: "",
  summary: "",
  cover: "",
  link: "",
  sort: 0,
  status: true,
};

function LinkSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpLinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<LinkDraft>(EMPTY_LINK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.links();
      setRows(data?.list ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "精选推荐加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const title = draft.title.trim();
    if (!title) {
      message.warning("请填写推荐位标题");
      return;
    }
    setSaving(true);
    const body = {
      title,
      summary: draft.summary.trim(),
      cover: draft.cover.trim(),
      link: draft.link.trim(),
      sort: Math.max(0, Math.min(9999, Math.round(draft.sort || 0))),
      status: draft.status,
    };
    try {
      if (draft.id) {
        await knowledgePayApi.updateLink({ params: { id: String(draft.id) }, body });
      } else {
        await knowledgePayApi.saveLink({ body });
      }
      message.success("推荐位已保存");
      setModalOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: KpLinkRow) => {
    try {
      await knowledgePayApi.removeLink({ params: { id: String(row.id) } });
      message.success("推荐位已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<KpLinkRow> = [
    {
      title: "封面",
      dataIndex: "cover",
      width: 80,
      render: (value: string) =>
        value ? (
          <Image src={value} alt="推荐位封面" width={48} height={48} style={{ borderRadius: 6, objectFit: "cover" }} />
        ) : (
          <span className="text-12 muted">—</span>
        ),
    },
    { title: "标题", dataIndex: "title", width: 180, ellipsis: true },
    { title: "摘要", dataIndex: "summary", ellipsis: true, render: (value: string) => value || <span className="text-12 muted">未填</span> },
    {
      title: "跳转",
      dataIndex: "link",
      ellipsis: true,
      render: (value: string) => <span className="mono text-12">{value || "—"}</span>,
    },
    { title: "排序", dataIndex: "sort", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: boolean) => (value ? <Tag color="green">展示</Tag> : <Tag>隐藏</Tag>),
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
                summary: row.summary,
                cover: row.cover,
                link: row.link,
                sort: row.sort,
                status: row.status,
              });
              setModalOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="删除这个推荐位？" onConfirm={() => void remove(row)}>
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
      title="精选推荐"
      titleExtra={
        <span className="text-12 muted">
          标题与栏目名在「基础设置 → 精选位标题」；热门位来自内容的「首页热门」标记
        </span>
      }
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => {
            setDraft({ ...EMPTY_LINK });
            setModalOpen(true);
          }}
        >
          新增推荐位
        </Button>
      }
    >
      <Table<KpLinkRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: 860 }}
        locale={{ emptyText: <EmptyState text="还没有精选推荐位。" /> }}
      />

      <Modal
        open={modalOpen}
        title={draft.id ? "编辑推荐位" : "新增推荐位"}
        onCancel={() => setModalOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存"
        width={640}
        destroyOnHidden
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div className="form-2col">
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>标题</div>
              <Input
                value={draft.title}
                maxLength={120}
                placeholder="推荐位名称"
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>摘要</div>
              <Input
                value={draft.summary}
                maxLength={255}
                placeholder="一句话卖点"
                onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
              />
            </div>
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>封面（可选）</div>
            <ImageUploadField value={draft.cover} onChange={(url) => setDraft({ ...draft, cover: url })} />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>跳转</div>
            <Input
              className="mono"
              value={draft.link}
              maxLength={512}
              placeholder="如 resource:12"
              onChange={(event) => setDraft({ ...draft, link: event.target.value })}
            />
            <div className="text-12 muted" style={{ marginTop: 6 }}>{LINK_PROTOCOL_TIP}</div>
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
                <Switch checked={draft.status} onChange={(value) => setDraft({ ...draft, status: value })} />
                <span>{draft.status ? "展示" : "隐藏"}</span>
              </Space>
            </div>
          </div>
        </Space>
      </Modal>
    </Panel>
  );
}
