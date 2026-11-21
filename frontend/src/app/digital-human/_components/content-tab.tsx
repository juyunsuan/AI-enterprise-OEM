"use client";

// 内容位页签：轮播、图文栏目、推广海报版式、AI 写作模板与生成记录。
import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Image,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  DH_ARTICLE_CONTENT_TYPES,
  DH_ARTICLE_CONTENT_TYPE_LABELS,
  DH_ARTICLE_TYPES,
  DH_ARTICLE_TYPE_LABELS,
  DH_WRITE_KINDS,
  DH_WRITE_KIND_LABELS,
  type DhAiRecordRow,
  type DhArticleInput,
  type DhArticleRow,
  type DhPosterInput,
  type DhPosterRow,
  type DhSwiperInput,
  type DhSwiperRow,
  type DhWriteTopicInput,
  type DhWriteTopicRow,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { ImageUploadField, PAGE_SIZE, usePagedList } from "./shared";

type ArticleType = (typeof DH_ARTICLE_TYPES)[number];
type ArticleContentType = (typeof DH_ARTICLE_CONTENT_TYPES)[number];
type WriteKind = (typeof DH_WRITE_KINDS)[number];

export function ContentTab() {
  const [tab, setTab] = useState("swipers");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "swipers", label: "首页轮播", children: <SwiperSection key="swipers" /> },
        { key: "articles", label: "图文栏目", children: <ArticleSection key="articles" /> },
        { key: "posters", label: "推广海报", children: <PosterSection key="posters" /> },
        { key: "writeTopics", label: "写作模板", children: <WriteTopicSection key="topics" /> },
        { key: "aiRecords", label: "AI 记录", children: <AiRecordSection key="records" /> },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// 轮播
// ---------------------------------------------------------------------------

type SwiperDraft = DhSwiperInput & { id?: number };

function SwiperSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<DhSwiperRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<SwiperDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await digitalHumanApi.swipers()) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "轮播加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.saveSwiper({ body: draft });
      message.success("轮播已保存");
      setDraft(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: DhSwiperRow) => {
    Modal.confirm({
      title: "删除轮播",
      content: "确定删除这张轮播图？",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removeSwiper({ body: { id: row.id } });
          message.success("已删除");
          await load();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhSwiperRow> = [
    {
      title: "图片",
      width: 160,
      render: (_, row) => (
        <Image src={row.image} alt={row.title} width={120} height={48} style={{ objectFit: "cover", borderRadius: 6 }} />
      ),
    },
    { title: "标题", dataIndex: "title" },
    {
      title: "跳转",
      dataIndex: "link",
      render: (value: string) => <span className="mono text-12">{value || "none"}</span>,
    },
    { title: "排序", dataIndex: "sort", width: 70 },
    {
      title: "启用",
      dataIndex: "enabled",
      width: 80,
      render: (value: boolean) => (value ? "是" : "否"),
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) => (
        <Space size={4}>
          <Button
            size="small"
            onClick={() =>
              setDraft({
                id: row.id,
                title: row.title,
                image: row.image,
                link: row.link,
                sort: row.sort,
                enabled: row.enabled,
              })
            }
          >
            编辑
          </Button>
          <Button size="small" danger onClick={() => remove(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="首页轮播"
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setDraft({ title: "", image: "", link: "none", sort: 0, enabled: true })}
        >
          新增轮播
        </Button>
      }
    >
      <Notice variant="info">
        跳转写法：<span className="mono">article:&lt;图文ID&gt;</span>、
        <span className="mono">work:&lt;作品ID&gt;</span>、
        <span className="mono">url:&lt;https 链接&gt;</span>、
        <span className="mono">page:&lt;路径&gt;</span>、<span className="mono">none</span> 不跳转。
      </Notice>
      <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={false} style={{ marginTop: 12 }} />

      <Modal
        open={Boolean(draft)}
        title={draft?.id ? "编辑轮播" : "新增轮播"}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <label>
              图片
              <ImageUploadField value={draft.image} onChange={(image) => setDraft({ ...draft, image })} size={160} />
            </label>
            <label>
              标题
              <Input
                value={draft.title}
                maxLength={120}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label>
              跳转
              <Input
                value={draft.link}
                maxLength={500}
                onChange={(event) => setDraft({ ...draft, link: event.target.value })}
              />
            </label>
            <Space size={10}>
              <label>
                排序
                <InputNumber
                  min={0}
                  max={9999}
                  value={draft.sort}
                  onChange={(value) => setDraft({ ...draft, sort: Number(value ?? 0) })}
                />
              </label>
              <Space size={6}>
                <Switch
                  checked={draft.enabled}
                  onChange={(enabled) => setDraft({ ...draft, enabled })}
                />
                启用
              </Space>
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 图文
// ---------------------------------------------------------------------------

type ArticleDraft = DhArticleInput & { id?: number };

function ArticleSection() {
  const { message } = App.useApp();
  const [type, setType] = useState<"" | ArticleType>("");
  const [draft, setDraft] = useState<ArticleDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.articles({
        query: { page, pageSize: PAGE_SIZE, ...(type ? { type } : {}) },
      }),
    [type],
  );
  const list = usePagedList<DhArticleRow>(fetcher);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.saveArticle({ body: draft });
      message.success("图文已保存");
      setDraft(null);
      list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: DhArticleRow) => {
    Modal.confirm({
      title: "删除图文",
      content: `确定删除「${row.title}」？`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removeArticle({ body: { id: row.id } });
          message.success("已删除");
          list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhArticleRow> = [
    {
      title: "标题",
      dataIndex: "title",
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <span>{value}</span>
          <span className="muted text-12">
            {DH_ARTICLE_CONTENT_TYPE_LABELS[row.contentType] || row.contentType}
          </span>
        </Space>
      ),
    },
    {
      title: "栏目",
      dataIndex: "type",
      width: 110,
      render: (value: string) => DH_ARTICLE_TYPE_LABELS[value] || value,
    },
    { title: "摘要", dataIndex: "summary", ellipsis: true },
    { title: "排序", dataIndex: "sort", width: 70 },
    {
      title: "状态",
      width: 90,
      render: (_, row) => (
        <Tag color={row.enabled ? "green" : "default"}>{row.enabled ? "启用" : "停用"}</Tag>
      ),
    },
    {
      title: "更新",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) => (
        <Space size={4}>
          <Button
            size="small"
            onClick={() =>
              setDraft({
                id: row.id,
                type: (row.type as ArticleType) || "help",
                contentType: row.contentType,
                title: row.title,
                cover: row.cover,
                summary: row.summary,
                body: row.body,
                link: row.link,
                sort: row.sort,
                enabled: row.enabled,
              })
            }
          >
            编辑
          </Button>
          <Button size="small" danger onClick={() => remove(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="图文栏目"
      extra={
        <Space>
          <Select
            value={type}
            style={{ width: 130 }}
            options={[
              { value: "", label: "全部栏目" },
              ...DH_ARTICLE_TYPES.map((value) => ({
                value,
                label: DH_ARTICLE_TYPE_LABELS[value],
              })),
            ]}
            onChange={(value: "" | ArticleType) => {
              setType(value);
              list.setPage(1);
            }}
          />
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setDraft({
                type: "help",
                contentType: "article",
                title: "",
                cover: "",
                summary: "",
                body: "",
                link: "",
                sort: 0,
                enabled: true,
              })
            }
          >
            新增图文
          </Button>
        </Space>
      }
    >
      {list.rows.length === 0 && !list.loading ? (
        <EmptyState text="还没有图文：教程/公告/关于/隐私/协议五个入口在小程序「我的」页。" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={list.loading}
          columns={columns}
          dataSource={list.rows}
          pagination={{
            current: list.page,
            pageSize: PAGE_SIZE,
            total: list.total,
            showSizeChanger: false,
            onChange: list.setPage,
          }}
        />
      )}

      <Modal
        open={Boolean(draft)}
        title={draft?.id ? "编辑图文" : "新增图文"}
        width={640}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <Space size={10} wrap>
              <label>
                栏目
                <Select
                  style={{ width: 130 }}
                  value={draft.type}
                  options={DH_ARTICLE_TYPES.map((value) => ({
                    value,
                    label: DH_ARTICLE_TYPE_LABELS[value],
                  }))}
                  onChange={(value: ArticleType) => setDraft({ ...draft, type: value })}
                />
              </label>
              <label>
                形态
                <Select
                  style={{ width: 110 }}
                  value={draft.contentType}
                  options={DH_ARTICLE_CONTENT_TYPES.map((value) => ({
                    value,
                    label: DH_ARTICLE_CONTENT_TYPE_LABELS[value],
                  }))}
                  onChange={(value: ArticleContentType) =>
                    setDraft({ ...draft, contentType: value })
                  }
                />
              </label>
              <label>
                排序
                <InputNumber
                  min={0}
                  max={9999}
                  value={draft.sort}
                  onChange={(value) => setDraft({ ...draft, sort: Number(value ?? 0) })}
                />
              </label>
            </Space>
            <label>
              标题
              <Input
                value={draft.title}
                maxLength={120}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label>
              封面
              <ImageUploadField value={draft.cover} onChange={(cover) => setDraft({ ...draft, cover })} />
            </label>
            <label>
              摘要
              <Input
                value={draft.summary}
                maxLength={300}
                onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
              />
            </label>
            {draft.contentType === "link" ? (
              <label>
                外链地址
                <Input
                  value={draft.link}
                  maxLength={500}
                  onChange={(event) => setDraft({ ...draft, link: event.target.value })}
                />
              </label>
            ) : (
              <label>
                {draft.contentType === "video" ? "视频地址" : "正文（HTML）"}
                <Input.TextArea
                  value={draft.body}
                  rows={draft.contentType === "video" ? 2 : 10}
                  maxLength={200000}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
              </label>
            )}
            <Space size={6}>
              <Switch
                checked={draft.enabled}
                onChange={(enabled) => setDraft({ ...draft, enabled })}
              />
              启用
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 海报
// ---------------------------------------------------------------------------

type PosterDraft = DhPosterInput & { id?: number };

const EMPTY_POSTER: PosterDraft = {
  name: "",
  bgUrl: "",
  avatarX: 40,
  avatarY: 60,
  avatarSize: 120,
  qrX: 40,
  qrY: 420,
  qrSize: 180,
  sort: 0,
  enabled: true,
};

function PosterSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<DhPosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<PosterDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await digitalHumanApi.posters()) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "海报加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.savePoster({ body: draft });
      message.success("海报已保存");
      setDraft(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: DhPosterRow) => {
    Modal.confirm({
      title: "删除海报",
      content: `确定删除「${row.name || `#${row.id}`}」？`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removePoster({ body: { id: row.id } });
          message.success("已删除");
          await load();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhPosterRow> = [
    {
      title: "背景",
      width: 120,
      render: (_, row) => (
        <Image src={row.bgUrl} alt={row.name} width={80} height={120} style={{ objectFit: "cover", borderRadius: 6 }} />
      ),
    },
    { title: "名称", dataIndex: "name", render: (value: string) => value || "—" },
    {
      title: "头像位",
      width: 140,
      render: (_, row) => (
        <span className="text-12">
          x{row.avatarX} y{row.avatarY} · {row.avatarSize}px
        </span>
      ),
    },
    {
      title: "小程序码位",
      width: 140,
      render: (_, row) => (
        <span className="text-12">
          x{row.qrX} y{row.qrY} · {row.qrSize}px
        </span>
      ),
    },
    { title: "排序", dataIndex: "sort", width: 70 },
    {
      title: "操作",
      width: 150,
      render: (_, row) => (
        <Space size={4}>
          <Button
            size="small"
            onClick={() =>
              setDraft({
                id: row.id,
                name: row.name,
                bgUrl: row.bgUrl,
                avatarX: row.avatarX,
                avatarY: row.avatarY,
                avatarSize: row.avatarSize,
                qrX: row.qrX,
                qrY: row.qrY,
                qrSize: row.qrSize,
                sort: row.sort,
                enabled: row.enabled,
              })
            }
          >
            编辑
          </Button>
          <Button size="small" danger onClick={() => remove(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="推广海报"
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setDraft({ ...EMPTY_POSTER })}
        >
          新增版式
        </Button>
      }
    >
      <Notice variant="info">
        只存版式坐标：会员头像与站点小程序码在端上 canvas 合成，服务端不装图形库。
      </Notice>
      <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={false} style={{ marginTop: 12 }} />

      <Modal
        open={Boolean(draft)}
        title={draft?.id ? "编辑海报版式" : "新增海报版式"}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <label>
              背景图
              <ImageUploadField value={draft.bgUrl} onChange={(bgUrl) => setDraft({ ...draft, bgUrl })} size={120} />
            </label>
            <label>
              名称
              <Input
                value={draft.name}
                maxLength={80}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <Space size={10} wrap>
              <label>
                头像 X
                <InputNumber
                  min={0}
                  max={2000}
                  value={draft.avatarX}
                  onChange={(value) => setDraft({ ...draft, avatarX: Number(value ?? 0) })}
                />
              </label>
              <label>
                头像 Y
                <InputNumber
                  min={0}
                  max={4000}
                  value={draft.avatarY}
                  onChange={(value) => setDraft({ ...draft, avatarY: Number(value ?? 0) })}
                />
              </label>
              <label>
                头像尺寸
                <InputNumber
                  min={0}
                  max={2000}
                  value={draft.avatarSize}
                  onChange={(value) => setDraft({ ...draft, avatarSize: Number(value ?? 0) })}
                />
              </label>
            </Space>
            <Space size={10} wrap>
              <label>
                码 X
                <InputNumber
                  min={0}
                  max={2000}
                  value={draft.qrX}
                  onChange={(value) => setDraft({ ...draft, qrX: Number(value ?? 0) })}
                />
              </label>
              <label>
                码 Y
                <InputNumber
                  min={0}
                  max={4000}
                  value={draft.qrY}
                  onChange={(value) => setDraft({ ...draft, qrY: Number(value ?? 0) })}
                />
              </label>
              <label>
                码尺寸
                <InputNumber
                  min={0}
                  max={2000}
                  value={draft.qrSize}
                  onChange={(value) => setDraft({ ...draft, qrSize: Number(value ?? 0) })}
                />
              </label>
            </Space>
            <Space size={10}>
              <label>
                排序
                <InputNumber
                  min={0}
                  max={9999}
                  value={draft.sort}
                  onChange={(value) => setDraft({ ...draft, sort: Number(value ?? 0) })}
                />
              </label>
              <Space size={6}>
                <Switch
                  checked={draft.enabled}
                  onChange={(enabled) => setDraft({ ...draft, enabled })}
                />
                启用
              </Space>
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 写作模板
// ---------------------------------------------------------------------------

type WriteTopicDraft = DhWriteTopicInput & { id?: number };

function WriteTopicSection() {
  const { message } = App.useApp();
  const [kind, setKind] = useState<"" | WriteKind>("");
  const [rows, setRows] = useState<DhWriteTopicRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<WriteTopicDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await digitalHumanApi.writeTopics({ query: kind ? { kind } : {} })) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "模板加载失败");
    } finally {
      setLoading(false);
    }
  }, [kind, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.saveWriteTopic({ body: draft });
      message.success("模板已保存");
      setDraft(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: DhWriteTopicRow) => {
    Modal.confirm({
      title: "删除模板",
      content: `确定删除「${row.title}」？`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removeWriteTopic({ body: { id: row.id } });
          message.success("已删除");
          await load();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhWriteTopicRow> = [
    { title: "标题", dataIndex: "title", width: 180 },
    {
      title: "类型",
      dataIndex: "kind",
      width: 130,
      render: (value: string) => DH_WRITE_KIND_LABELS[value] || value,
    },
    { title: "分类", dataIndex: "category", width: 110 },
    { title: "内容", dataIndex: "content", ellipsis: true },
    {
      title: "状态",
      width: 110,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Tag color={row.enabled ? "green" : "default"}>{row.enabled ? "启用" : "停用"}</Tag>
          {row.siteId === 0 ? <span className="muted text-12">平台内置</span> : null}
        </Space>
      ),
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) =>
        row.siteId === 0 ? (
          <span className="muted text-12">只读</span>
        ) : (
          <Space size={4}>
            <Button
              size="small"
              onClick={() =>
                setDraft({
                  id: row.id,
                  kind: row.kind,
                  title: row.title,
                  category: row.category,
                  content: row.content,
                  modelTier: row.modelTier,
                  sort: row.sort,
                  enabled: row.enabled,
                })
              }
            >
              编辑
            </Button>
            <Button size="small" danger onClick={() => remove(row)}>
              删除
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <Panel
      title="AI 写作模板"
      extra={
        <Space>
          <Select
            value={kind}
            style={{ width: 150 }}
            options={[
              { value: "", label: "全部类型" },
              ...DH_WRITE_KINDS.map((value) => ({
                value,
                label: DH_WRITE_KIND_LABELS[value],
              })),
            ]}
            onChange={(value: "" | WriteKind) => setKind(value)}
          />
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setDraft({
                kind: kind || "write_model",
                title: "",
                category: "",
                content: "",
                modelTier: "",
                sort: 0,
                enabled: true,
              })
            }
          >
            新增模板
          </Button>
        </Space>
      }
    >
      <Notice variant="info">
        写作模板支持 <span className="mono">[PROMPT]</span>（用户输入）与 <span className="mono">[WORDS]</span>（目标字数）占位符；平台内置模板只读，可另存为本站模板。克隆引导文案与朗读示例的「内容」会直接展示在小程序里：分类填 <span className="mono">body</span> 显示在形象克隆页，其他分类显示在声音克隆页。
      </Notice>
      <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={false} style={{ marginTop: 12 }} />

      <Modal
        open={Boolean(draft)}
        title={draft?.id ? "编辑模板" : "新增模板"}
        width={620}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <Space size={10} wrap>
              <label>
                类型
                <Select
                  style={{ width: 150 }}
                  value={draft.kind}
                  options={DH_WRITE_KINDS.map((value) => ({
                    value,
                    label: DH_WRITE_KIND_LABELS[value],
                  }))}
                  onChange={(value: WriteKind) => setDraft({ ...draft, kind: value })}
                />
              </label>
              <label>
                分类
                <Input
                  value={draft.category}
                  maxLength={60}
                  style={{ width: 140 }}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                />
              </label>
              <label>
                排序
                <InputNumber
                  min={0}
                  max={9999}
                  value={draft.sort}
                  onChange={(value) => setDraft({ ...draft, sort: Number(value ?? 0) })}
                />
              </label>
            </Space>
            <label>
              标题
              <Input
                value={draft.title}
                maxLength={120}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label>
              内容
              <Input.TextArea
                value={draft.content}
                rows={8}
                maxLength={20000}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              />
            </label>
            <label>
              模型档位
              <Input
                value={draft.modelTier}
                maxLength={64}
                placeholder="留空用站点默认文本模型"
                onChange={(event) => setDraft({ ...draft, modelTier: event.target.value })}
              />
            </label>
            <Space size={6}>
              <Switch
                checked={draft.enabled}
                onChange={(enabled) => setDraft({ ...draft, enabled })}
              />
              启用
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// AI 记录
// ---------------------------------------------------------------------------

function AiRecordSection() {
  const [memberId, setMemberId] = useState("");

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.aiRecords({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(Number(memberId) > 0 ? { memberId: Number(memberId) } : {}),
        },
      }),
    [memberId],
  );
  const list = usePagedList<DhAiRecordRow>(fetcher);

  const columns: ColumnsType<DhAiRecordRow> = [
    { title: "会员", width: 150, render: (_, row) => `${row.nickname || "微信用户"}（${row.memberId}）` },
    { title: "模板", dataIndex: "topicId", width: 90, render: (value: number) => (value ? `#${value}` : "自由输入") },
    { title: "输入", dataIndex: "prompt", ellipsis: true },
    { title: "输出", dataIndex: "response", ellipsis: true },
    { title: "字数", dataIndex: "wordCount", width: 80 },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
  ];

  return (
    <Panel
      title="AI 生成记录"
      extra={
        <Input
          placeholder="会员 ID"
          value={memberId}
          style={{ width: 120 }}
          onChange={(event) => setMemberId(event.target.value)}
          onPressEnter={() => list.setPage(1)}
        />
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={list.loading}
        columns={columns}
        dataSource={list.rows}
        pagination={{
          current: list.page,
          pageSize: PAGE_SIZE,
          total: list.total,
          showSizeChanger: false,
          onChange: list.setPage,
        }}
      />
    </Panel>
  );
}
