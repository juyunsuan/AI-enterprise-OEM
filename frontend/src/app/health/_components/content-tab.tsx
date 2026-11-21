"use client";

import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import {
  HEALTH_AUTHOR_KINDS,
  HEALTH_AUTHOR_KIND_LABELS,
  HEALTH_BROADCAST_CHANNELS,
  HEALTH_BROADCAST_CHANNELS_LABELS,
  HEALTH_CONTENT_KINDS,
  HEALTH_CONTENT_KIND_LABELS,
  HEALTH_CROWD_KINDS,
  HEALTH_CROWD_KIND_LABELS,
  HEALTH_ON_STATUSES,
  type HealthAnswerRow,
  type HealthArticleCategoryRow,
  type HealthArticleRow,
  type HealthArticleSaveBody,
  type HealthBroadcastCreateBody,
  type HealthBroadcastRow,
  type HealthCannedRow,
  type HealthCrowdGroupRow,
  type HealthHotKeywordRow,
  type HealthPostCommentRow,
  type HealthPostRow,
  type HealthPostTagRow,
  type HealthQuestionRow,
  type HealthSearchLogRow,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { Panel, PanelTabs } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";
import { fmtTime } from "@/lib/datetime";
import {
  DataTable,
  Descriptions,
  FilterBar,
  LoadError,
  OnOffTag,
  StatusTag,
  cny,
  labelOf,
  useHealthResource,
} from "./health-common";
import { useHealthMeta, useHealthShopId } from "./health-scope";

/**
 * 内容与社区：科普、病友圈、公开问答都走「先审核、后上线」。
 * 这里只做运营与审核动作（通过/驳回/下架/删除），不产出任何诊疗结论，
 * 文案也避免「确诊」一类表述，顾客端的健康判断始终由医护完成。
 */

const PAGE_SIZE = 20;

type OnStatus = (typeof HEALTH_ON_STATUSES)[number];

const AUDIT_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "全部审核态" },
  { value: "PENDING", label: "待审核" },
  { value: "APPROVED", label: "已通过" },
  { value: "REJECTED", label: "已驳回" },
  { value: "OFFLINE", label: "已下架" },
];

const ON_OFF_OPTIONS: { value: OnStatus; label: string }[] = [
  { value: "ON", label: "启用" },
  { value: "OFF", label: "停用" },
];

const VISIBILITY_OPTIONS = [
  { value: "PUBLIC", label: "公开" },
  { value: "MEMBER", label: "会员专享" },
  { value: "CROWD", label: "指定人群" },
  { value: "SIGNED", label: "已签约" },
];

const QUESTION_STATUS_LABELS: Record<string, string> = {
  OPEN: "待回答",
  ANSWERED: "已回答",
  ADOPTED: "已采纳",
  CLOSED: "已关闭",
};

const BROADCAST_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  SENT: "已发送",
  FAILED: "发送失败",
  CANCELLED: "已取消",
};

const EXTRA_TONE: Record<string, string> = {
  OPEN: "gold",
  ANSWERED: "blue",
  ADOPTED: "green",
  CLOSED: "default",
  DRAFT: "default",
  SENT: "green",
  FAILED: "red",
  CANCELLED: "default",
};

export function ContentTab() {
  const shopId = useHealthShopId();
  const [tab, setTab] = useState("article");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "article", label: "科普文章", children: <ArticleSection shopId={shopId} /> },
        { key: "category", label: "文章分类", children: <CategorySection shopId={shopId} /> },
        { key: "post", label: "病友圈", children: <PostSection shopId={shopId} /> },
        { key: "tag", label: "话题标签", children: <PostTagSection shopId={shopId} /> },
        { key: "question", label: "公开问答", children: <QuestionSection shopId={shopId} /> },
        { key: "broadcast", label: "群发触达", children: <BroadcastSection shopId={shopId} /> },
        { key: "hot", label: "热词", children: <HotKeywordSection shopId={shopId} /> },
        { key: "searchLog", label: "搜索日志", children: <SearchLogSection shopId={shopId} /> },
        { key: "canned", label: "常用语", children: <CannedSection shopId={shopId} /> },
      ]}
    />
  );
}

/* ------------------------------ 科普文章 ------------------------------ */

type ArticleForm = Omit<HealthArticleSaveBody, "shopId" | "id">;

const NEW_ARTICLE: ArticleForm = {
  title: "",
  kind: "ARTICLE",
  categoryId: 0,
  cover: "",
  mediaUrl: "",
  content: "",
  summary: "",
  authorKind: "SHOP",
  authorId: 0,
  visibility: "PUBLIC",
  crowdKinds: [],
  recommend: false,
  status: "ON",
};

type AuditTarget = { kind: "article" | "post" | "comment" | "answer"; id: number; label: string };

function ArticleSection({ shopId }: { shopId: number }) {
  const meta = useHealthMeta();
  const { message, modal } = App.useApp();
  const [kind, setKind] = useState("all");
  const [categoryId, setCategoryId] = useState(0);
  const [authorKind, setAuthorKind] = useState("all");
  const [auditStatus, setAuditStatus] = useState("all");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ article: HealthArticleRow | null; content: string } | null>(
    null,
  );
  const [viewing, setViewing] = useState<{ article: HealthArticleRow; content: string } | null>(null);
  const [audit, setAudit] = useState<AuditTarget | null>(null);

  const categories = useHealthResource(
    () => healthApi.articleCategories({ query: { shopId } }),
    [shopId],
  );
  const list = useHealthResource(
    () =>
      healthApi.articles({
        query: { shopId, page, pageSize: PAGE_SIZE, kind, categoryId, authorKind, auditStatus, keyword },
      }),
    [shopId, page, kind, categoryId, authorKind, auditStatus, keyword],
  );
  const rows = list.data?.list ?? [];

  const loadDetail = async (row: HealthArticleRow) => {
    try {
      const detail = await healthApi.articleDetail({ query: { shopId, id: row.id } });
      if (!detail) throw new Error("文章详情为空");
      return detail;
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "文章详情读取失败");
      return null;
    }
  };

  const openEdit = async (row: HealthArticleRow | null) => {
    if (!row) {
      setEditing({ article: null, content: "" });
      return;
    }
    const detail = await loadDetail(row);
    if (detail) setEditing({ article: detail.article, content: detail.content });
  };

  const openView = async (row: HealthArticleRow) => {
    const detail = await loadDetail(row);
    if (detail) setViewing({ article: detail.article, content: detail.content });
  };

  const removeRow = (row: HealthArticleRow) => {
    modal.confirm({
      title: `删除文章「${row.title}」`,
      content: "删除后小程序端立即不再展示，阅读与点赞统计一并消失；只是暂时不想展示请改「停用」。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await healthApi.articleRemove({ body: { shopId, id: row.id } });
          message.success("文章已删除");
          await list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: TableProps<HealthArticleRow>["columns"] = [
    {
      title: "标题",
      dataIndex: "title",
      width: 280,
      render: (_, row) => (
        <div>
          <div>{row.title}</div>
          <div className="muted text-12">{row.summary || "没有摘要"}</div>
        </div>
      ),
    },
    {
      title: "形式",
      dataIndex: "kind",
      width: 90,
      render: (value: string) => labelOf(meta, "contentKinds", value),
    },
    { title: "分类", dataIndex: "categoryName", width: 120, render: (value: string) => value || "—" },
    { title: "作者", dataIndex: "authorName", width: 120 },
    {
      title: "审核",
      dataIndex: "auditStatus",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    { title: "阅读", dataIndex: "readCount", width: 80 },
    { title: "点赞", dataIndex: "likeCount", width: 80 },
    {
      title: "发布时间",
      dataIndex: "publishedAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 230,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => void openView(row)}>
            详情
          </Button>
          <Button
            size="small"
            type="link"
            icon={<EditOutlined aria-hidden />}
            onClick={() => void openEdit(row)}
          >
            编辑
          </Button>
          <Button
            size="small"
            type="link"
            onClick={() => setAudit({ kind: "article", id: row.id, label: row.title })}
          >
            审核
          </Button>
          <Button size="small" type="link" danger onClick={() => removeRow(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="科普文章"
      titleBadge={list.data ? `${list.data.total}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => void openEdit(null)}
        >
          新建文章
        </Button>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <span className="muted text-12">
          文章必须先「审核通过」才会在小程序端展示；内容只做健康科普与就医指引，不写诊断结论或用药建议。
        </span>
      </div>
      <FilterBar
        action={
          <Button
            size="small"
            type="link"
            onClick={() => {
              setKind("all");
              setCategoryId(0);
              setAuthorKind("all");
              setAuditStatus("all");
              setKeywordInput("");
              setKeyword("");
              setPage(1);
            }}
          >
            清除筛选
          </Button>
        }
      >
        <Select
          style={{ width: 120 }}
          value={kind}
          onChange={(value: string) => {
            setKind(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部形式" },
            ...HEALTH_CONTENT_KINDS.map((value) => ({
              value,
              label: labelOf(meta, "contentKinds", value),
            })),
          ]}
        />
        <Select
          style={{ width: 150 }}
          value={categoryId}
          onChange={(value: number) => {
            setCategoryId(value);
            setPage(1);
          }}
          options={[
            { value: 0, label: "全部分类" },
            ...(categories.data ?? []).map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <Select
          style={{ width: 140 }}
          value={authorKind}
          onChange={(value: string) => {
            setAuthorKind(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部作者" },
            ...HEALTH_AUTHOR_KINDS.map((value) => ({
              value,
              label: HEALTH_AUTHOR_KIND_LABELS[value] ?? value,
            })),
          ]}
        />
        <Select
          style={{ width: 130 }}
          value={auditStatus}
          onChange={(value: string) => {
            setAuditStatus(value);
            setPage(1);
          }}
          options={AUDIT_OPTIONS}
        />
        <Input.Search
          allowClear
          style={{ width: 200 }}
          placeholder="标题或摘要关键字"
          value={keywordInput}
          onChange={(event) => {
            setKeywordInput(event.target.value);
            if (!event.target.value) setKeyword("");
          }}
          onSearch={(value) => {
            setKeyword(value.trim());
            setPage(1);
          }}
        />
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthArticleRow>
        rows={rows}
        columns={columns}
        total={list.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={list.loading}
        onPage={setPage}
        scroll={{ x: 1400 }}
      />
      <ArticleModal
        shopId={shopId}
        editing={editing}
        categories={categories.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={list.reload}
      />
      <Modal
        open={viewing !== null}
        title="文章详情"
        width={760}
        destroyOnHidden
        footer={null}
        onCancel={() => setViewing(null)}
      >
        {viewing ? (
          <div style={{ display: "grid", gap: 14 }}>
            <Descriptions
              items={[
                { label: "标题", value: viewing.article.title },
                {
                  label: "内容形式",
                  value: labelOf(meta, "contentKinds", viewing.article.kind),
                },
                { label: "分类", value: viewing.article.categoryName || "未分类" },
                { label: "作者", value: viewing.article.authorName },
                {
                  label: "可见范围",
                  value:
                    VISIBILITY_OPTIONS.find((item) => item.value === viewing.article.visibility)
                      ?.label ?? viewing.article.visibility,
                },
                {
                  label: "审核",
                  value: (
                    <StatusTag
                      meta={meta}
                      kind="auditStatuses"
                      value={viewing.article.auditStatus}
                    />
                  ),
                },
                { label: "状态", value: <OnOffTag value={viewing.article.status} /> },
                {
                  label: "数据",
                  value: `阅读 ${viewing.article.readCount} · 点赞 ${viewing.article.likeCount} · 评论 ${viewing.article.commentCount} · 收藏 ${viewing.article.collectCount}`,
                },
                { label: "审核说明", value: viewing.article.auditReason || "—" },
                { label: "发布时间", value: fmtTime(viewing.article.publishedAt) },
              ]}
            />
            <div>
              <div className="muted text-12">正文（源码预览）</div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  maxHeight: 360,
                  overflow: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                {viewing.content || "—"}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
      <AuditDialog
        shopId={shopId}
        target={audit}
        onClose={() => setAudit(null)}
        onDone={list.reload}
      />
    </Panel>
  );
}

function ArticleModal({
  shopId,
  editing,
  categories,
  onClose,
  onSaved,
}: {
  shopId: number;
  editing: { article: HealthArticleRow | null; content: string } | null;
  categories: HealthArticleCategoryRow[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  return (
    <Modal
      open={editing !== null}
      title={editing?.article ? "编辑文章" : "新建文章"}
      width={820}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      {editing ? (
        <ArticleFormBlock
          key={editing.article?.id ?? "new"}
          shopId={shopId}
          article={editing.article}
          content={editing.content}
          categories={categories}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Modal>
  );
}

function ArticleFormBlock({
  shopId,
  article,
  content,
  categories,
  onClose,
  onSaved,
}: {
  shopId: number;
  article: HealthArticleRow | null;
  content: string;
  categories: HealthArticleCategoryRow[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ArticleForm>();
  const [saving, setSaving] = useState(false);
  const kind = Form.useWatch("kind", form) ?? "ARTICLE";
  const cover = Form.useWatch("cover", form) ?? "";
  const visibility = Form.useWatch("visibility", form) ?? "PUBLIC";
  const initial: ArticleForm = article
    ? {
        title: article.title,
        kind: article.kind,
        categoryId: article.categoryId,
        cover: article.cover,
        mediaUrl: article.mediaUrl,
        content,
        summary: article.summary,
        authorKind: article.authorKind,
        authorId: article.authorId,
        visibility: article.visibility,
        crowdKinds: article.crowdKinds,
        recommend: article.recommend,
        status: article.status,
      }
    : NEW_ARTICLE;

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.articleSave({
        body: {
          ...values,
          shopId,
          id: article?.id ?? 0,
          categoryId: Number(values.categoryId ?? 0),
          authorId: Number(values.authorId ?? 0),
        },
      });
      message.success(article ? "文章已保存" : "文章已创建，审核通过后才会在端上展示");
      await onSaved();
      onClose();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form form={form} layout="vertical" initialValues={initial}>
      <Form.Item
        name="title"
        label="文章标题"
        rules={[{ required: true, whitespace: true, message: "请填写文章标题" }]}
      >
        <Input maxLength={120} />
      </Form.Item>
      <Space wrap align="start">
        <Form.Item name="kind" label="内容形式" style={{ width: 150 }}>
          <Select
            options={HEALTH_CONTENT_KINDS.map((value) => ({
              value,
              label: HEALTH_CONTENT_KIND_LABELS[value] ?? value,
            }))}
          />
        </Form.Item>
        <Form.Item name="categoryId" label="所属分类" style={{ width: 180 }}>
          <Select
            options={[
              { value: 0, label: "不分类" },
              ...categories.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
        </Form.Item>
        <Form.Item
          name="status"
          label="上线状态"
          extra="审核通过后按此开关展示"
          style={{ width: 140 }}
        >
          <Select options={ON_OFF_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="recommend"
          label="推荐位"
          valuePropName="checked"
          extra="进首页推荐"
          style={{ width: 120 }}
        >
          <Switch />
        </Form.Item>
      </Space>
      <Space wrap align="start">
        <Form.Item name="authorKind" label="作者身份" style={{ width: 160 }}>
          <Select
            options={HEALTH_AUTHOR_KINDS.map((value) => ({
              value,
              label: HEALTH_AUTHOR_KIND_LABELS[value] ?? value,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="authorId"
          label="作者编号"
          extra="医护/机构/团队编号，店铺官方留 0"
          style={{ width: 200 }}
        >
          <InputNumber min={0} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="visibility" label="可见范围" style={{ width: 160 }}>
          <Select options={VISIBILITY_OPTIONS} />
        </Form.Item>
        {visibility === "CROWD" ? (
          <Form.Item
            name="crowdKinds"
            label="指定人群"
            extra="可多选，最多 8 个"
            style={{ width: 320 }}
          >
            <Select
              mode="multiple"
              allowClear
              maxCount={8}
              optionFilterProp="label"
              options={HEALTH_CROWD_KINDS.map((value) => ({
                value,
                label: HEALTH_CROWD_KIND_LABELS[value] ?? value,
              }))}
            />
          </Form.Item>
        ) : null}
      </Space>
      <Form.Item
        name="cover"
        label="封面图直链"
        extra="列表缩略图与分享卡片，建议 750×420"
      >
        <Input maxLength={500} placeholder="https://…" />
      </Form.Item>
      {cover ? (
        <RawImg
          src={cover}
          alt=""
          style={{ width: 200, height: 112, objectFit: "cover", borderRadius: 8, marginBottom: 16 }}
        />
      ) : null}
      {kind === "ARTICLE" ? null : (
        <Form.Item
          name="mediaUrl"
          label="音视频直链"
          extra="视频/音频/直播回放的播放地址，图文可留空"
        >
          <Input maxLength={1000} placeholder="https://…" />
        </Form.Item>
      )}
      <Form.Item name="summary" label="摘要" extra="列表页展示的一句话">
        <Input maxLength={300} />
      </Form.Item>
      <Form.Item
        name="content"
        label="正文"
        extra="支持 HTML 片段，小程序用 rich-text 渲染；不写诊断结论与个体化用药建议"
      >
        <Input.TextArea rows={8} maxLength={60000} showCount />
      </Form.Item>
      <Space wrap>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          保存文章
        </Button>
        <Button onClick={onClose}>取消</Button>
        <span className="muted text-12">保存后到列表里点「审核」通过，端上才会出现</span>
      </Space>
    </Form>
  );
}

/* ------------------------------ 文章分类 ------------------------------ */

type CategoryForm = { name: string; sort: number; status: OnStatus };

function CategorySection({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const list = useHealthResource(
    () => healthApi.articleCategories({ query: { shopId } }),
    [shopId],
  );
  const [editing, setEditing] = useState<{ row: HealthArticleCategoryRow | null } | null>(null);
  const rows = list.data ?? [];

  const removeRow = (row: HealthArticleCategoryRow) => {
    modal.confirm({
      title: `删除分类「${row.name}」`,
      content: row.articleCount
        ? `该分类下有 ${row.articleCount} 篇文章，删除后文章会失去分类归属（文章本身保留）。`
        : "分类下没有文章，删除后不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await healthApi.articleCategoryRemove({ body: { shopId, id: row.id } });
          message.success("分类已删除");
          await list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: TableProps<HealthArticleCategoryRow>["columns"] = [
    { title: "分类名", dataIndex: "name", width: 220 },
    { title: "文章数", dataIndex: "articleCount", width: 100 },
    { title: "排序", dataIndex: "sort", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      render: (_, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => setEditing({ row })}>
            编辑
          </Button>
          <Button size="small" type="link" danger onClick={() => removeRow(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="文章分类"
      titleBadge={list.data ? `${list.data.length}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ row: null })}
        >
          新建分类
        </Button>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <span className="muted text-12">分类只决定文章在小程序里的归类与筛选，停用的分类不再出现在前端。</span>
      </div>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthArticleCategoryRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={list.loading}
      />
      <Modal
        open={editing !== null}
        title={editing?.row ? "编辑分类" : "新建分类"}
        width={460}
        destroyOnHidden
        footer={null}
        onCancel={() => setEditing(null)}
      >
        {editing ? (
          <CategoryFormBlock
            key={editing.row?.id ?? "new"}
            shopId={shopId}
            row={editing.row}
            onClose={() => setEditing(null)}
            onSaved={list.reload}
          />
        ) : null}
      </Modal>
    </Panel>
  );
}

function CategoryFormBlock({
  shopId,
  row,
  onClose,
  onSaved,
}: {
  shopId: number;
  row: HealthArticleCategoryRow | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CategoryForm>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.articleCategorySave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name.trim(),
          sort: Number(values.sort ?? 0),
          status: values.status,
        },
      });
      message.success(row ? "分类已保存" : "分类已创建");
      await onSaved();
      onClose();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ name: row?.name ?? "", sort: row?.sort ?? 0, status: row?.status ?? "ON" }}
    >
      <Form.Item
        name="name"
        label="分类名称"
        rules={[{ required: true, whitespace: true, message: "请填写分类名称" }]}
      >
        <Input maxLength={40} />
      </Form.Item>
      <Space wrap align="start">
        <Form.Item name="sort" label="排序值" extra="越小越靠前" style={{ width: 150 }}>
          <InputNumber min={0} max={999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="status" label="状态" style={{ width: 140 }}>
          <Select options={ON_OFF_OPTIONS} />
        </Form.Item>
      </Space>
      <Space>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          保存
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}

/* ------------------------------ 病友圈 ------------------------------ */

function PostSection({ shopId }: { shopId: number }) {
  const meta = useHealthMeta();
  const { message, modal } = App.useApp();
  const [auditStatus, setAuditStatus] = useState("all");
  const [tagId, setTagId] = useState(0);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<{ post: HealthPostRow; comments: HealthPostCommentRow[] } | null>(
    null,
  );
  const [audit, setAudit] = useState<AuditTarget | null>(null);

  const tags = useHealthResource(() => healthApi.postTags({ query: { shopId } }), [shopId]);
  const list = useHealthResource(
    () =>
      healthApi.posts({
        query: { shopId, page, pageSize: PAGE_SIZE, postIdAudit: auditStatus, tagId },
      }),
    [shopId, page, auditStatus, tagId],
  );
  const rows = list.data?.list ?? [];

  const openDetail = async (row: HealthPostRow) => {
    try {
      const data = await healthApi.postDetail({ query: { shopId, id: row.id } });
      if (!data) throw new Error("帖子详情为空");
      setDetail({ post: data.post, comments: data.comments });
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "帖子详情读取失败");
    }
  };

  const refreshDetail = async (postId: number) => {
    const data = await healthApi.postDetail({ query: { shopId, id: postId } });
    if (!data) throw new Error("帖子详情为空");
    setDetail({ post: data.post, comments: data.comments });
    await list.reload();
  };

  const removePost = (row: HealthPostRow) => {
    modal.confirm({
      title: `删除帖子「${row.title}」`,
      content: "帖子与它的评论会从小程序端移除，删除后不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await healthApi.postRemove({ body: { shopId, id: row.id } });
          message.success("帖子已删除");
          setDetail(null);
          await list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const removeComment = (comment: HealthPostCommentRow, postId: number) => {
    modal.confirm({
      title: "删除这条评论",
      content: "删除后评论区立即少一条回复，且不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await healthApi.postCommentRemove({ body: { shopId, id: comment.id } });
          message.success("评论已删除");
          await refreshDetail(postId);
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: TableProps<HealthPostRow>["columns"] = [
    {
      title: "标题 / 内容",
      dataIndex: "title",
      width: 300,
      render: (_, row) => (
        <div>
          <div>{row.title || "（无标题）"}</div>
          <div className="muted text-12">{row.content.slice(0, 60)}</div>
        </div>
      ),
    },
    {
      title: "标签",
      dataIndex: "tagNames",
      width: 180,
      render: (value: string[]) => (
        <Space size={4} wrap>
          {value.length ? value.map((tag) => <Tag key={tag}>{tag}</Tag>) : <span className="muted">—</span>}
        </Space>
      ),
    },
    { title: "作者", dataIndex: "authorName", width: 120 },
    {
      title: "审核",
      dataIndex: "auditStatus",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    { title: "点赞", dataIndex: "likeCount", width: 80 },
    { title: "评论", dataIndex: "commentCount", width: 80 },
    { title: "举报", dataIndex: "reportCount", width: 80 },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 190,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => void openDetail(row)}>
            详情
          </Button>
          <Button
            size="small"
            type="link"
            onClick={() => setAudit({ kind: "post", id: row.id, label: row.title || "病友圈帖子" })}
          >
            审核
          </Button>
          <Button size="small" type="link" danger onClick={() => removePost(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const commentColumns: TableProps<HealthPostCommentRow>["columns"] = [
    { title: "作者", dataIndex: "authorName", width: 120 },
    { title: "内容", dataIndex: "content", width: 300 },
    {
      title: "审核",
      dataIndex: "auditStatus",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      render: (_, row) => (
        <Space size={0} wrap>
          <Button
            size="small"
            type="link"
            onClick={() => setAudit({ kind: "comment", id: row.id, label: "帖子评论" })}
          >
            审核
          </Button>
          <Button
            size="small"
            type="link"
            danger
            onClick={() => detail && removeComment(row, detail.post.id)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel title="病友圈" titleBadge={list.data ? `${list.data.total}` : undefined}>
      <div style={{ marginBottom: 12 }}>
        <span className="muted text-12">
          顾客发帖与评论默认「待审核」，通过后才在端上展示；社区内容只做经验交流，不得出现诊断结论或疗效承诺。
        </span>
      </div>
      <FilterBar>
        <Select
          style={{ width: 130 }}
          value={auditStatus}
          onChange={(value: string) => {
            setAuditStatus(value);
            setPage(1);
          }}
          options={AUDIT_OPTIONS}
        />
        <Select
          style={{ width: 160 }}
          value={tagId}
          onChange={(value: number) => {
            setTagId(value);
            setPage(1);
          }}
          options={[
            { value: 0, label: "全部话题" },
            ...(tags.data ?? []).map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <span className="muted text-12">举报数异常升高的帖子建议先下线再核实。</span>
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthPostRow>
        rows={rows}
        columns={columns}
        total={list.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={list.loading}
        onPage={setPage}
        scroll={{ x: 1300 }}
      />
      <Modal
        open={detail !== null}
        title="帖子详情与评论"
        width={820}
        destroyOnHidden
        footer={null}
        onCancel={() => setDetail(null)}
      >
        {detail ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div className="muted text-12">标题</div>
              <div>{detail.post.title || "（无标题）"}</div>
            </div>
            <div>
              <div className="muted text-12">正文</div>
              <div>{detail.post.content || "—"}</div>
            </div>
            <div className="muted text-12">
              {detail.post.authorName} · {fmtTime(detail.post.createdAt)} · 点赞 {detail.post.likeCount} ·
              评论 {detail.post.commentCount} · 举报 {detail.post.reportCount}
            </div>
            <div>
              <div className="muted text-12" style={{ marginBottom: 6 }}>
                评论（{detail.comments.length}）
              </div>
              <DataTable<HealthPostCommentRow>
                rows={detail.comments}
                columns={commentColumns}
                page={1}
                scroll={{ x: 800 }}
              />
            </div>
          </div>
        ) : null}
      </Modal>
      <AuditDialog
        shopId={shopId}
        target={audit}
        onClose={() => setAudit(null)}
        onDone={async () => {
          if (!detail) {
            await list.reload();
            return;
          }
          await refreshDetail(detail.post.id);
        }}
      />
    </Panel>
  );
}

/* ------------------------------ 话题标签 ------------------------------ */

type PostTagForm = { name: string; sort: number; status: OnStatus };

function PostTagSection({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const list = useHealthResource(() => healthApi.postTags({ query: { shopId } }), [shopId]);
  const [editing, setEditing] = useState<{ row: HealthPostTagRow | null } | null>(null);
  const rows = list.data ?? [];

  const columns: TableProps<HealthPostTagRow>["columns"] = [
    { title: "标签", dataIndex: "name", width: 220 },
    { title: "帖子数", dataIndex: "postCount", width: 100 },
    { title: "排序", dataIndex: "sort", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      key: "actions",
      width: 100,
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => setEditing({ row })}>
          编辑
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="话题标签"
      titleBadge={list.data ? `${list.data.length}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ row: null })}
        >
          新建标签
        </Button>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <span className="muted text-12">
          标签用于病友圈聚合与筛选；停用的标签不再出现在发帖选择器里，历史帖子保留标签名。
        </span>
      </div>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthPostTagRow> rows={rows} columns={columns} page={1} loading={list.loading} />
      <Modal
        open={editing !== null}
        title={editing?.row ? "编辑标签" : "新建标签"}
        width={460}
        destroyOnHidden
        footer={null}
        onCancel={() => setEditing(null)}
      >
        {editing ? (
          <PostTagFormBlock
            key={editing.row?.id ?? "new"}
            shopId={shopId}
            row={editing.row}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              await list.reload();
              message.success("标签已保存");
            }}
          />
        ) : null}
      </Modal>
    </Panel>
  );
}

function PostTagFormBlock({
  shopId,
  row,
  onClose,
  onSaved,
}: {
  shopId: number;
  row: HealthPostTagRow | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PostTagForm>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.postTagSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name.trim(),
          sort: Number(values.sort ?? 0),
          status: values.status,
        },
      });
      await onSaved();
      onClose();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ name: row?.name ?? "", sort: row?.sort ?? 0, status: row?.status ?? "ON" }}
    >
      <Form.Item
        name="name"
        label="标签名"
        rules={[{ required: true, whitespace: true, message: "请填写标签名" }]}
      >
        <Input maxLength={30} />
      </Form.Item>
      <Space wrap align="start">
        <Form.Item name="sort" label="排序值" extra="越小越靠前" style={{ width: 150 }}>
          <InputNumber min={0} max={999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="status" label="状态" style={{ width: 140 }}>
          <Select options={ON_OFF_OPTIONS} />
        </Form.Item>
      </Space>
      <Space>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          保存
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}

/* ------------------------------ 公开问答 ------------------------------ */

function QuestionSection({ shopId }: { shopId: number }) {
  const meta = useHealthMeta();
  const { message, modal } = App.useApp();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<{ question: HealthQuestionRow; answers: HealthAnswerRow[] } | null>(
    null,
  );
  const [audit, setAudit] = useState<AuditTarget | null>(null);

  const list = useHealthResource(
    () =>
      healthApi.questions({ query: { shopId, page, pageSize: PAGE_SIZE, questionStatus: status } }),
    [shopId, page, status],
  );
  const rows = list.data?.list ?? [];

  const openDetail = async (row: HealthQuestionRow) => {
    try {
      const data = await healthApi.questionDetail({ query: { shopId, id: row.id } });
      if (!data) throw new Error("问答详情为空");
      setDetail({ question: data.question, answers: data.answers });
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "问答详情读取失败");
    }
  };

  const refreshDetail = async (questionId: number) => {
    const data = await healthApi.questionDetail({ query: { shopId, id: questionId } });
    if (!data) throw new Error("问答详情为空");
    setDetail({ question: data.question, answers: data.answers });
    await list.reload();
  };

  const removeAnswer = (answer: HealthAnswerRow, questionId: number) => {
    modal.confirm({
      title: "删除这条回答",
      content: "删除后顾客端立即看不到该回答，采纳状态不会回滚。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await healthApi.answerRemove({ body: { shopId, id: answer.id } });
          message.success("回答已删除");
          await refreshDetail(questionId);
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: TableProps<HealthQuestionRow>["columns"] = [
    {
      title: "问题",
      dataIndex: "title",
      width: 300,
      render: (_, row) => (
        <div>
          <div>{row.title}</div>
          <div className="muted text-12">{row.detail.slice(0, 60)}</div>
        </div>
      ),
    },
    { title: "提问人", dataIndex: "customerName", width: 120 },
    {
      title: "人群",
      dataIndex: "crowdKind",
      width: 110,
      render: (value: string) => labelOf(meta, "crowdKinds", value),
    },
    {
      title: "悬赏",
      dataIndex: "bountyCents",
      width: 100,
      render: (value: number) => cny(value),
    },
    { title: "回答", dataIndex: "answerCount", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => (
        <Tag color={EXTRA_TONE[value] ?? "default"}>{QUESTION_STATUS_LABELS[value] ?? value}</Tag>
      ),
    },
    {
      title: "提问时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 100,
      fixed: "right",
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => void openDetail(row)}>
          详情
        </Button>
      ),
    },
  ];

  const answerColumns: TableProps<HealthAnswerRow>["columns"] = [
    { title: "回答者", dataIndex: "practitionerName", width: 140 },
    { title: "内容", dataIndex: "content", width: 320 },
    {
      title: "审核",
      dataIndex: "auditStatus",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    {
      title: "采纳",
      dataIndex: "adopted",
      width: 80,
      render: (value: boolean) => (value ? <Tag color="green">已采纳</Tag> : <span className="muted">—</span>),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      render: (_, row) => (
        <Space size={0} wrap>
          <Button
            size="small"
            type="link"
            onClick={() => setAudit({ kind: "answer", id: row.id, label: "问答回答" })}
          >
            审核
          </Button>
          <Button
            size="small"
            type="link"
            danger
            onClick={() => detail && removeAnswer(row, detail.question.id)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel title="公开问答" titleBadge={list.data ? `${list.data.total}` : undefined}>
      <div style={{ marginBottom: 12 }}>
        <span className="muted text-12">
          医护回答需审核通过（答复建议先审核）后才在问答墙展示；问答只提供一般健康信息，不构成诊断意见。
        </span>
      </div>
      <FilterBar>
        <Select
          style={{ width: 140 }}
          value={status}
          onChange={(value: string) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部状态" },
            ...Object.entries(QUESTION_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthQuestionRow>
        rows={rows}
        columns={columns}
        total={list.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={list.loading}
        onPage={setPage}
        scroll={{ x: 1100 }}
      />
      <Modal
        open={detail !== null}
        title="问答详情"
        width={820}
        destroyOnHidden
        footer={null}
        onCancel={() => setDetail(null)}
      >
        {detail ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div className="muted text-12">问题</div>
              <div>{detail.question.title}</div>
              <div className="muted text-12" style={{ marginTop: 4 }}>
                {detail.question.detail || "—"}
              </div>
            </div>
            <div className="muted text-12">
              提问人 {detail.question.customerName} · 悬赏 {cny(detail.question.bountyCents)} · 状态{" "}
              {QUESTION_STATUS_LABELS[detail.question.status] ?? detail.question.status}
            </div>
            <div>
              <div className="muted text-12" style={{ marginBottom: 6 }}>
                回答（{detail.answers.length}）
              </div>
              <DataTable<HealthAnswerRow>
                rows={detail.answers}
                columns={answerColumns}
                page={1}
                scroll={{ x: 900 }}
              />
            </div>
          </div>
        ) : null}
      </Modal>
      <AuditDialog
        shopId={shopId}
        target={audit}
        onClose={() => setAudit(null)}
        onDone={async () => {
          if (!detail) {
            await list.reload();
            return;
          }
          await refreshDetail(detail.question.id);
        }}
      />
    </Panel>
  );
}

/* ------------------------------ 群发触达 ------------------------------ */

type BroadcastForm = Omit<HealthBroadcastCreateBody, "shopId">;

const NEW_BROADCAST: BroadcastForm = {
  title: "",
  content: "",
  channel: "IN_APP",
  templateKey: "",
  crowdGroupIds: [],
  page: "",
  scheduledAt: "",
};

function BroadcastSection({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const groups = useHealthResource(
    () => healthApi.crowdGroups({ query: { shopId } }),
    [shopId],
  );
  const list = useHealthResource(
    () => healthApi.broadcasts({ query: { shopId, page, pageSize: PAGE_SIZE } }),
    [shopId, page],
  );
  const rows = list.data?.list ?? [];

  const cancelRow = (row: HealthBroadcastRow) => {
    modal.confirm({
      title: `取消群发「${row.title}」`,
      content: "只有还没发送的草稿可以取消；已发送的任务无法撤回。",
      okText: "取消任务",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await healthApi.broadcastCancel({ body: { shopId, id: row.id } });
          message.success("群发任务已取消");
          await list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "取消失败");
        }
      },
    });
  };

  const columns: TableProps<HealthBroadcastRow>["columns"] = [
    {
      title: "标题 / 内容",
      dataIndex: "title",
      width: 280,
      render: (_, row) => (
        <div>
          <div>{row.title}</div>
          <div className="muted text-12">{row.content.slice(0, 60)}</div>
        </div>
      ),
    },
    {
      title: "渠道",
      dataIndex: "channel",
      width: 130,
      render: (value: string) => HEALTH_BROADCAST_CHANNELS_LABELS[value] ?? value,
    },
    {
      title: "人群",
      dataIndex: "crowdNames",
      width: 160,
      render: (value: string[]) =>
        value.length ? value.join("、") : <span className="muted">全部顾客</span>,
    },
    { title: "目标", dataIndex: "targetCount", width: 80 },
    { title: "已发", dataIndex: "sentCount", width: 80 },
    {
      title: "失败",
      dataIndex: "failedCount",
      width: 80,
      render: (value: number) => (value ? <span style={{ color: "#cf1322" }}>{value}</span> : 0),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => (
        <Tag color={EXTRA_TONE[value] ?? "default"}>{BROADCAST_STATUS_LABELS[value] ?? value}</Tag>
      ),
    },
    {
      title: "计划时间",
      dataIndex: "scheduledAt",
      width: 150,
      render: (value: string) => (value ? fmtTime(value) : "立即"),
    },
    {
      title: "操作",
      key: "actions",
      width: 100,
      fixed: "right",
      render: (_, row) => (
        <Button
          size="small"
          type="link"
          danger
          disabled={row.status !== "DRAFT"}
          onClick={() => cancelRow(row)}
        >
          取消
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="群发触达"
      titleBadge={list.data ? `${list.data.total}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setCreating(true)}
        >
          新建群发
        </Button>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <span className="muted text-12">
          站内消息即时落公告并记为已发送；微信订阅消息按顾客授权逐人发送，失败数如实回显。触达文案同样不写诊断结论。
        </span>
      </div>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthBroadcastRow>
        rows={rows}
        columns={columns}
        total={list.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={list.loading}
        onPage={setPage}
        scroll={{ x: 1200 }}
      />
      <Modal
        open={creating}
        title="新建群发"
        width={620}
        destroyOnHidden
        footer={null}
        onCancel={() => setCreating(false)}
      >
        {creating ? (
          <BroadcastFormBlock
            shopId={shopId}
            groups={groups.data ?? []}
            onClose={() => setCreating(false)}
            onSaved={list.reload}
          />
        ) : null}
      </Modal>
    </Panel>
  );
}

function BroadcastFormBlock({
  shopId,
  groups,
  onClose,
  onSaved,
}: {
  shopId: number;
  groups: HealthCrowdGroupRow[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<BroadcastForm>();
  const [saving, setSaving] = useState(false);
  const channel = Form.useWatch("channel", form) ?? "IN_APP";

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.broadcastCreate({
        body: {
          shopId,
          title: values.title.trim(),
          content: values.content.trim(),
          channel: values.channel,
          templateKey: (values.templateKey ?? "").trim(),
          crowdGroupIds: values.crowdGroupIds ?? [],
          page: (values.page ?? "").trim(),
          scheduledAt: (values.scheduledAt ?? "").trim(),
        },
      });
      message.success("群发任务已创建；定时任务到点发送，未填时间立即发送");
      await onSaved();
      onClose();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form form={form} layout="vertical" initialValues={NEW_BROADCAST}>
      <Form.Item
        name="title"
        label="标题"
        rules={[{ required: true, whitespace: true, message: "请填写标题" }]}
      >
        <Input maxLength={60} />
      </Form.Item>
      <Form.Item
        name="content"
        label="内容"
        rules={[{ required: true, whitespace: true, message: "请填写内容" }]}
      >
        <Input.TextArea rows={4} maxLength={500} showCount />
      </Form.Item>
      <Space wrap align="start">
        <Form.Item name="channel" label="渠道" style={{ width: 180 }}>
          <Select
            options={HEALTH_BROADCAST_CHANNELS.map((value) => ({
              value,
              label: HEALTH_BROADCAST_CHANNELS_LABELS[value] ?? value,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="templateKey"
          label="模板键"
          extra="订阅消息模板标识"
          style={{ width: 200 }}
        >
          <Input maxLength={40} disabled={channel !== "SUBSCRIBE"} />
        </Form.Item>
        <Form.Item
          name="scheduledAt"
          label="计划发送时间"
          extra="留空立即发送"
          style={{ width: 220 }}
        >
          <Input maxLength={32} placeholder="YYYY-MM-DD HH:mm" />
        </Form.Item>
      </Space>
      <Form.Item
        name="crowdGroupIds"
        label="人群分组"
        extra="不选即全部可触达顾客"
        style={{ width: "100%" }}
      >
        <Select
          mode="multiple"
          allowClear
          optionFilterProp="label"
          placeholder={groups.length ? "选择人群分组" : "还没有分组，去「就诊人与档案 → 人群分组」新建"}
          options={groups.map((item) => ({ value: item.id, label: `${item.name}（${item.memberCount} 人）` }))}
        />
      </Form.Item>
      <Form.Item name="page" label="落地页" extra="点击消息后打开的小程序页面路径，可留空">
        <Input maxLength={200} placeholder="/pages/index/index?tab=article" />
      </Form.Item>
      <Space>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          创建群发
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}

/* ------------------------------ 热词 ------------------------------ */

type HotKeywordForm = { keyword: string; status: OnStatus };

function HotKeywordSection({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const list = useHealthResource(() => healthApi.hotKeywords({ query: { shopId } }), [shopId]);
  const [editing, setEditing] = useState<{ row: HealthHotKeywordRow | null } | null>(null);
  const rows = list.data ?? [];

  const removeRow = (row: HealthHotKeywordRow) => {
    modal.confirm({
      title: `删除热词「${row.keyword}」`,
      content: "删除后搜索框不再展示这个词，历史搜索统计保留。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await healthApi.hotKeywordRemove({ body: { shopId, id: row.id } });
          message.success("热词已删除");
          await list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: TableProps<HealthHotKeywordRow>["columns"] = [
    { title: "关键词", dataIndex: "keyword", width: 220 },
    {
      title: "来源",
      dataIndex: "manual",
      width: 110,
      render: (value: boolean) => (value ? <Tag color="blue">手动配置</Tag> : <Tag>搜索统计</Tag>),
    },
    { title: "搜索次数", dataIndex: "searchCount", width: 110 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      render: (_, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => setEditing({ row })}>
            编辑
          </Button>
          <Button size="small" type="link" danger onClick={() => removeRow(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="搜索热词"
      titleBadge={list.data ? `${list.data.length}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ row: null })}
        >
          添加热词
        </Button>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <span className="muted text-12">
          手动热词优先展示，未配置的词按真实搜索次数补位；停用即从搜索框撤下。
        </span>
      </div>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthHotKeywordRow> rows={rows} columns={columns} page={1} loading={list.loading} />
      <Modal
        open={editing !== null}
        title={editing?.row ? "编辑热词" : "添加热词"}
        width={440}
        destroyOnHidden
        footer={null}
        onCancel={() => setEditing(null)}
      >
        {editing ? (
          <HotKeywordFormBlock
            key={editing.row?.id ?? "new"}
            shopId={shopId}
            row={editing.row}
            onClose={() => setEditing(null)}
            onSaved={list.reload}
          />
        ) : null}
      </Modal>
    </Panel>
  );
}

function HotKeywordFormBlock({
  shopId,
  row,
  onClose,
  onSaved,
}: {
  shopId: number;
  row: HealthHotKeywordRow | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<HotKeywordForm>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.hotKeywordSave({
        body: { shopId, id: row?.id ?? 0, keyword: values.keyword.trim(), status: values.status },
      });
      message.success(row ? "热词已保存" : "热词已添加");
      await onSaved();
      onClose();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ keyword: row?.keyword ?? "", status: row?.status ?? "ON" }}
    >
      <Form.Item
        name="keyword"
        label="关键词"
        rules={[{ required: true, whitespace: true, message: "请填写关键词" }]}
      >
        <Input maxLength={30} />
      </Form.Item>
      <Form.Item name="status" label="状态" style={{ width: 140 }}>
        <Select options={ON_OFF_OPTIONS} />
      </Form.Item>
      <Space>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          保存
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}

/* ------------------------------ 搜索日志 ------------------------------ */

function SearchLogSection({ shopId }: { shopId: number }) {
  const [days, setDays] = useState(7);
  const [zeroOnly, setZeroOnly] = useState(false);
  const list = useHealthResource(
    () =>
      healthApi.searchLogs({
        query: { shopId, days, zeroOnly: zeroOnly ? 1 : 0 },
      }),
    [shopId, days, zeroOnly],
  );
  const rows = list.data ?? [];

  const columns: TableProps<HealthSearchLogRow>["columns"] = [
    { title: "关键词", dataIndex: "keyword", width: 240 },
    { title: "搜索次数", dataIndex: "count", width: 110 },
    {
      title: "零结果次数",
      dataIndex: "zeroResultCount",
      width: 120,
      render: (value: number) =>
        value ? <span style={{ color: "#d46b08" }}>{value}</span> : <span className="muted">0</span>,
    },
    {
      title: "最近搜索",
      dataIndex: "lastAt",
      width: 160,
      render: (value: string) => fmtTime(value),
    },
  ];

  return (
    <Panel title="搜索日志" titleBadge={list.data ? `${list.data.length}` : undefined}>
      <FilterBar>
        <Select
          style={{ width: 130 }}
          value={days}
          onChange={(value: number) => setDays(value)}
          options={[
            { value: 1, label: "近 1 天" },
            { value: 7, label: "近 7 天" },
            { value: 30, label: "近 30 天" },
          ]}
        />
        <span className="text-12">
          <Switch size="small" checked={zeroOnly} onChange={setZeroOnly} /> 只看零结果
        </span>
        <span className="muted text-12">零结果多的词说明顾客在找的内容还没上架，可补文章或商品。</span>
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthSearchLogRow> rows={rows} columns={columns} page={1} loading={list.loading} rowKey="keyword" />
    </Panel>
  );
}

/* ------------------------------ 常用语 ------------------------------ */

type CannedForm = { groupKey: string; content: string; sort: number; status: OnStatus };

function CannedSection({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const [groupKey, setGroupKey] = useState("");
  const [editing, setEditing] = useState<{ row: HealthCannedRow | null } | null>(null);
  const list = useHealthResource(
    () => healthApi.cannedList({ query: { shopId, groupKey } }),
    [shopId, groupKey],
  );
  const rows = list.data ?? [];

  const removeRow = (row: HealthCannedRow) => {
    modal.confirm({
      title: "删除常用语",
      content: "删除后医护在问诊会话里不再能一键选用，已发出的消息不受影响。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await healthApi.cannedRemove({ body: { shopId, id: row.id } });
          message.success("常用语已删除");
          await list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: TableProps<HealthCannedRow>["columns"] = [
    { title: "分组", dataIndex: "groupKey", width: 130 },
    { title: "内容", dataIndex: "content", width: 380 },
    { title: "排序", dataIndex: "sort", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      render: (_, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => setEditing({ row })}>
            编辑
          </Button>
          <Button size="small" type="link" danger onClick={() => removeRow(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="常用语"
      titleBadge={list.data ? `${list.data.length}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ row: null })}
        >
          新建常用语
        </Button>
      }
    >
      <FilterBar>
        <Input
          allowClear
          style={{ width: 220 }}
          placeholder="按分组键筛选，如 DEFAULT"
          value={groupKey}
          onChange={(event) => setGroupKey(event.target.value.trim())}
        />
        <span className="muted text-12">
          常用语供医护问诊时一键引用；内容只做流程说明与引导，不给个体化诊断建议。
        </span>
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthCannedRow> rows={rows} columns={columns} page={1} loading={list.loading} />
      <Modal
        open={editing !== null}
        title={editing?.row ? "编辑常用语" : "新建常用语"}
        width={560}
        destroyOnHidden
        footer={null}
        onCancel={() => setEditing(null)}
      >
        {editing ? (
          <CannedFormBlock
            key={editing.row?.id ?? "new"}
            shopId={shopId}
            row={editing.row}
            defaultGroupKey={groupKey || "DEFAULT"}
            onClose={() => setEditing(null)}
            onSaved={list.reload}
          />
        ) : null}
      </Modal>
    </Panel>
  );
}

function CannedFormBlock({
  shopId,
  row,
  defaultGroupKey,
  onClose,
  onSaved,
}: {
  shopId: number;
  row: HealthCannedRow | null;
  defaultGroupKey: string;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CannedForm>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.cannedSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          groupKey: values.groupKey.trim() || "DEFAULT",
          content: values.content.trim(),
          sort: Number(values.sort ?? 0),
          status: values.status,
        },
      });
      message.success(row ? "常用语已保存" : "常用语已创建");
      await onSaved();
      onClose();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        groupKey: row?.groupKey ?? defaultGroupKey,
        content: row?.content ?? "",
        sort: row?.sort ?? 0,
        status: row?.status ?? "ON",
      }}
    >
      <Space wrap align="start">
        <Form.Item name="groupKey" label="分组键" extra="同类场景共用一个键" style={{ width: 200 }}>
          <Input maxLength={40} />
        </Form.Item>
        <Form.Item name="sort" label="排序值" extra="越小越靠前" style={{ width: 150 }}>
          <InputNumber min={0} max={999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="status" label="状态" style={{ width: 140 }}>
          <Select options={ON_OFF_OPTIONS} />
        </Form.Item>
      </Space>
      <Form.Item
        name="content"
        label="内容"
        rules={[{ required: true, whitespace: true, message: "请填写常用语内容" }]}
      >
        <Input.TextArea rows={4} maxLength={500} showCount />
      </Form.Item>
      <Space>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          保存
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}

/* ------------------------------ 审核弹窗 ------------------------------ */

function AuditDialog({
  shopId,
  target,
  onClose,
  onDone,
}: {
  shopId: number;
  target: AuditTarget | null;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  return (
    <Modal
      open={target !== null}
      title="内容审核"
      width={480}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      {target ? (
        <AuditFormBlock
          key={`${target.kind}-${target.id}`}
          shopId={shopId}
          target={target}
          onClose={onClose}
          onDone={onDone}
        />
      ) : null}
    </Modal>
  );
}

function AuditFormBlock({
  shopId,
  target,
  onClose,
  onDone,
}: {
  shopId: number;
  target: AuditTarget;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ decision: "APPROVE" | "REJECT"; reason: string }>();
  const [saving, setSaving] = useState(false);
  const rejected = Form.useWatch("decision", form) === "REJECT";

  const submit = async () => {
    const values = await form.validateFields();
    const approved = values.decision !== "REJECT";
    setSaving(true);
    try {
      const body = {
        shopId,
        id: target.id,
        approved,
        reason: (values.reason ?? "").trim(),
      };
      if (target.kind === "article") await healthApi.articleAudit({ body });
      else if (target.kind === "post") await healthApi.postAudit({ body });
      else if (target.kind === "comment") await healthApi.postCommentAudit({ body });
      else await healthApi.answerAudit({ body });
      message.success(approved ? "已通过审核" : "已驳回");
      await onDone();
      onClose();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "审核失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form form={form} layout="vertical" initialValues={{ decision: "APPROVE", reason: "" }}>
      <div className="muted text-12" style={{ marginBottom: 12 }}>
        审核对象：{target.label}
      </div>
      <Form.Item name="decision" label="审核结论" style={{ width: 180 }}>
        <Select
          options={[
            { value: "APPROVE", label: "通过" },
            { value: "REJECT", label: "驳回" },
          ]}
        />
      </Form.Item>
      <Form.Item
        name="reason"
        label="审核说明"
        extra={rejected ? "驳回时写清原因，作者能看到" : "通过时可留空"}
        rules={rejected ? [{ required: true, whitespace: true, message: "请填写驳回原因" }] : []}
      >
        <Input.TextArea rows={3} maxLength={200} showCount />
      </Form.Item>
      <Space>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          提交审核
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}
