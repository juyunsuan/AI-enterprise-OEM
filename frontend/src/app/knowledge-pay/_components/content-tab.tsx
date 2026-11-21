"use client";

// 付费内容页签：五种形态 × 三种解锁方式的内容库，筛选 + 服务端分页 + 弹窗编辑。
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  KP_ACCESS_MODES,
  KP_ACCESS_MODE_LABELS,
  KP_AUDIT_STATUSES,
  KP_AUDIT_STATUS_LABELS,
  KP_MEDIA_TYPES,
  KP_MEDIA_TYPE_LABELS,
  type KpAccessMode,
  type KpAuditStatus,
  type KpCategoryRow,
  type KpMediaType,
  type KpResourceRow,
  type KpTeacherRow,
} from "@enterprise/contracts";
import { knowledgePayApi } from "@/api/knowledge-pay";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { ImageUploadField } from "./image-upload-field";
import { LessonManager } from "./lesson-manager";

const PAGE_SIZE = 20;

type ResourceDraft = {
  id: number;
  categoryId: number;
  mediaType: KpMediaType;
  accessMode: KpAccessMode;
  price: number;
  cashPriceCents: number;
  teacherId: number;
  title: string;
  cover: string;
  intro: string;
  url: string;
  teacherName: string;
  teacherTitle: string;
  teacherAvatar: string;
  teacherIntro: string;
  auditStatus: KpAuditStatus;
  auditNote: string;
  hot: boolean;
  sort: number;
  status: boolean;
};

const EMPTY_DRAFT: ResourceDraft = {
  id: 0,
  categoryId: 0,
  mediaType: "video",
  accessMode: "points",
  price: 0,
  cashPriceCents: 0,
  teacherId: 0,
  title: "",
  cover: "",
  intro: "",
  url: "",
  teacherName: "",
  teacherTitle: "",
  teacherAvatar: "",
  teacherIntro: "",
  auditStatus: "published",
  auditNote: "",
  hot: false,
  sort: 0,
  status: true,
};

const MEDIA_TAG_COLORS: Record<string, string> = {
  video: "blue",
  audio: "purple",
  article: "cyan",
  image: "magenta",
  live: "orange",
};

export function ContentTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpResourceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<KpCategoryRow[]>([]);
  const [teachers, setTeachers] = useState<KpTeacherRow[]>([]);

  // 筛选条件：Select 一改就重拉（进入即加载、变更后自动重拉），关键词点搜索才生效。
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [categoryId, setCategoryId] = useState(0);
  const [mediaType, setMediaType] = useState("all");
  const [accessMode, setAccessMode] = useState("all");
  const [status, setStatus] = useState("all");
  const [auditStatus, setAuditStatus] = useState("all");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<ResourceDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  // 课时管理抽屉：当前操作的课程与开关。
  const [lessonCourse, setLessonCourse] = useState<KpResourceRow | null>(null);
  const [lessonOpen, setLessonOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [categoryData, teacherData] = await Promise.all([
          knowledgePayApi.categories(),
          knowledgePayApi.teachers(),
        ]);
        setCategories(categoryData?.list ?? []);
        setTeachers(teacherData?.list ?? []);
      } catch (cause) {
        message.error(cause instanceof Error ? cause.message : "基础数据加载失败");
      }
    })();
  }, [message]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.resources({
        query: {
          page,
          pageSize: PAGE_SIZE,
          keyword: appliedKeyword,
          categoryId,
          mediaType,
          accessMode,
          status,
          auditStatus,
        },
      });
      setRows(data?.list ?? []);
      setTotal(data?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "内容加载失败");
    } finally {
      setLoading(false);
    }
  }, [appliedKeyword, categoryId, mediaType, accessMode, status, auditStatus, page, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const title = draft.title.trim();
    if (!title) {
      message.warning("请填写内容标题");
      return;
    }
    if (draft.accessMode === "points" && (!draft.price || draft.price <= 0)) {
      message.warning("积分购买的课程需要填写大于 0 的积分价；不想收费可改为「免费获取」");
      return;
    }
    setSaving(true);
    const body = {
      categoryId: draft.categoryId,
      mediaType: draft.mediaType,
      accessMode: draft.accessMode,
      price:
        draft.accessMode === "points"
          ? Math.max(1, Math.min(999999, Math.round(draft.price || 0)))
          : 0,
      cashPriceCents: Math.max(0, Math.round(draft.cashPriceCents || 0)),
      teacherId: draft.teacherId,
      title,
      cover: draft.cover.trim(),
      intro: draft.intro,
      url: draft.url.trim(),
      teacherName: draft.teacherName.trim(),
      teacherTitle: draft.teacherTitle.trim(),
      teacherAvatar: draft.teacherAvatar.trim(),
      teacherIntro: draft.teacherIntro,
      auditStatus: draft.auditStatus,
      auditNote: draft.auditNote.trim(),
      hot: draft.hot,
      sort: Math.max(0, Math.min(9999, Math.round(draft.sort || 0))),
      status: draft.status,
    };
    try {
      if (draft.id) {
        await knowledgePayApi.updateResource({ params: { id: String(draft.id) }, body });
      } else {
        await knowledgePayApi.createResource({ body });
      }
      message.success(draft.id ? "课程已更新" : "课程已创建");
      setModalOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: KpResourceRow) => {
    try {
      await knowledgePayApi.removeResource({ params: { id: String(row.id) } });
      message.success("课程已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  /** 列表内快捷审核：只改审核态，正文仍去编辑弹窗改。 */
  const quickAudit = async (row: KpResourceRow, auditStatus: KpAuditStatus) => {
    try {
      await knowledgePayApi.auditResource({
        params: { id: String(row.id) },
        body: { auditStatus, auditNote: row.auditNote || "" },
      });
      message.success(`已标记为「${KP_AUDIT_STATUS_LABELS[auditStatus]}」`);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "审核失败");
    }
  };

  const columns: ColumnsType<KpResourceRow> = [
    {
      title: "封面",
      dataIndex: "cover",
      width: 80,
      render: (value: string) =>
        value ? (
          <Image
            src={value}
            alt="内容封面"
            width={48}
            height={48}
            style={{ borderRadius: 6, objectFit: "cover" }}
          />
        ) : (
          <span className="text-12 muted">—</span>
        ),
    },
    {
      title: "标题",
      dataIndex: "title",
      ellipsis: true,
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <span>{value}</span>
          {row.hot ? <Tag color="red" style={{ marginTop: 2 }}>热门</Tag> : null}
        </Space>
      ),
    },
    {
      title: "分类",
      dataIndex: "categoryTitle",
      width: 130,
      render: (value: string) => value || <span className="text-12 muted">未分类</span>,
    },
    {
      title: "讲师",
      dataIndex: "teacherName",
      width: 110,
      render: (value: string) => value || <span className="text-12 muted">—</span>,
    },
    {
      title: "形态",
      dataIndex: "mediaType",
      width: 90,
      render: (value: string) => (
        <Tag color={MEDIA_TAG_COLORS[value]}>{KP_MEDIA_TYPE_LABELS[value] || value}</Tag>
      ),
    },
    {
      title: "解锁",
      dataIndex: "accessMode",
      width: 130,
      render: (value: string, row) => (
        <span>
          {KP_ACCESS_MODE_LABELS[value] || value}
          {value === "points" ? ` · ${row.price} 积分` : ""}
          {row.cashPriceCents > 0
            ? ` · ¥${(row.cashPriceCents / 100).toFixed(2)}`
            : ""}
        </span>
      ),
    },
    {
      title: "课时 / 评分",
      width: 110,
      render: (_value, row) => (
        <span className="text-12">
          {row.lessonCount} 节
          {row.ratingCount ? ` · ★${row.ratingAvg}` : ""}
        </span>
      ),
    },
    { title: "浏览", dataIndex: "viewCount", width: 80 },
    { title: "解锁数", dataIndex: "orderCount", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: boolean) =>
        value ? <Tag color="green">在线</Tag> : <Tag>已下架</Tag>,
    },
    {
      title: "审核",
      dataIndex: "auditStatus",
      width: 120,
      render: (value: string, row) => (
        <Select
          size="small"
          value={value as KpAuditStatus}
          style={{ width: 104 }}
          onChange={(next) => void quickAudit(row, next as KpAuditStatus)}
          options={KP_AUDIT_STATUSES.map((item) => ({
            value: item,
            label: KP_AUDIT_STATUS_LABELS[item],
          }))}
        />
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 210,
      render: (_value, row) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setLessonCourse(row);
              setLessonOpen(true);
            }}
          >
            课时
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined aria-hidden />}
            onClick={() => {
              setDraft({
                id: row.id,
                categoryId: row.categoryId,
                mediaType: row.mediaType,
                accessMode: row.accessMode,
                price: row.price,
                title: row.title,
                cover: row.cover,
                intro: row.intro,
                url: row.url,
                teacherName: row.teacherName,
                teacherTitle: row.teacherTitle,
                teacherAvatar: row.teacherAvatar,
                teacherIntro: row.teacherIntro,
                cashPriceCents: row.cashPriceCents,
                teacherId: row.teacherId,
                auditStatus: row.auditStatus as KpAuditStatus,
                auditNote: row.auditNote,
                hot: row.hot,
                sort: row.sort,
                status: row.status,
              });
              setModalOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="删除这条课程？课时、进度与评价会一并清除" onConfirm={() => void remove(row)}>
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
      title="课程内容"
      titleExtra={
        <span className="text-12 muted">
          课程由课时组成：先建课程，再点「课时」编排目录；试看课时未解锁也能播放
        </span>
      }
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => {
            setDraft({ ...EMPTY_DRAFT, categoryId: categories[0]?.id ?? 0 });
            setModalOpen(true);
          }}
        >
          新建课程
        </Button>
      }
    >
      <Space wrap size={8} style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="标题关键词"
          style={{ width: 220 }}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            if (!event.target.value) {
              setAppliedKeyword("");
              setPage(1);
            }
          }}
          onSearch={(value) => {
            setAppliedKeyword(value.trim());
            setPage(1);
          }}
        />
        <Select
          style={{ width: 140 }}
          value={categoryId}
          onChange={(value) => {
            setCategoryId(value);
            setPage(1);
          }}
          options={[
            { value: 0, label: "全部分类" },
            ...categories.map((item) => ({ value: item.id, label: item.title })),
          ]}
        />
        <Select
          style={{ width: 120 }}
          value={mediaType}
          onChange={(value) => {
            setMediaType(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部形态" },
            ...KP_MEDIA_TYPES.map((item) => ({ value: item, label: KP_MEDIA_TYPE_LABELS[item] })),
          ]}
        />
        <Select
          style={{ width: 130 }}
          value={accessMode}
          onChange={(value) => {
            setAccessMode(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部解锁方式" },
            ...KP_ACCESS_MODES.map((item) => ({
              value: item,
              label: KP_ACCESS_MODE_LABELS[item],
            })),
          ]}
        />
        <Select
          style={{ width: 120 }}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部状态" },
            { value: "online", label: "在线" },
            { value: "offline", label: "已下架" },
          ]}
        />
        <Select
          style={{ width: 130 }}
          value={auditStatus}
          onChange={(value) => {
            setAuditStatus(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部审核态" },
            ...KP_AUDIT_STATUSES.map((item) => ({
              value: item,
              label: KP_AUDIT_STATUS_LABELS[item],
            })),
          ]}
        />
      </Space>

      <Table<KpResourceRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1480 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: setPage,
        }}
        locale={{ emptyText: <EmptyState text="还没有课程；点「新建课程」上架第一门。" /> }}
      />

      <Modal
        open={modalOpen}
        title={draft.id ? "编辑课程" : "新建课程"}
        onCancel={() => setModalOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存"
        width={720}
        destroyOnHidden
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>标题</div>
            <Input
              value={draft.title}
              maxLength={120}
              placeholder="内容标题，展示在列表与详情页"
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </div>
          <div className="form-2col">
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>分类</div>
              <Select
                style={{ width: "100%" }}
                value={draft.categoryId}
                onChange={(value) => setDraft({ ...draft, categoryId: value })}
                options={[
                  { value: 0, label: "未分类" },
                  ...categories.map((item) => ({ value: item.id, label: item.title })),
                ]}
              />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>形态</div>
              <Select
                style={{ width: "100%" }}
                value={draft.mediaType}
                onChange={(value) => setDraft({ ...draft, mediaType: value })}
                options={KP_MEDIA_TYPES.map((item) => ({
                  value: item,
                  label: KP_MEDIA_TYPE_LABELS[item],
                }))}
              />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>解锁方式</div>
              <Select
                style={{ width: "100%" }}
                value={draft.accessMode}
                onChange={(value) => setDraft({ ...draft, accessMode: value })}
                options={KP_ACCESS_MODES.map((item) => ({
                  value: item,
                  label: KP_ACCESS_MODE_LABELS[item],
                }))}
              />
            </div>
            {draft.accessMode === "points" ? (
              <div>
                <div className="text-12 muted" style={{ marginBottom: 4 }}>积分价（必填，大于 0）</div>
                <InputNumber
                  min={1}
                  max={999999}
                  precision={0}
                  style={{ width: "100%" }}
                  value={draft.price}
                  onChange={(value) => setDraft({ ...draft, price: Number(value) || 0 })}
                />
              </div>
            ) : null}
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>微信支付价（元，0 不开放）</div>
              <InputNumber
                min={0}
                max={999999.99}
                precision={2}
                style={{ width: "100%" }}
                value={draft.cashPriceCents / 100}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    cashPriceCents: Math.max(0, Math.round(Number(value || 0) * 100)),
                  })
                }
              />
            </div>
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>封面（可选）</div>
            <ImageUploadField
              value={draft.cover}
              size={120}
              onChange={(url) => setDraft({ ...draft, cover: url })}
            />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>关联讲师（可选）</div>
            <Select
              allowClear
              style={{ width: "100%" }}
              value={draft.teacherId || undefined}
              placeholder="从「讲师管理」选择；也可只填下方纯文本"
              onChange={(value) => {
                const teacher = teachers.find((item) => item.id === value);
                setDraft({
                  ...draft,
                  teacherId: Number(value) || 0,
                  teacherName: teacher?.name ?? draft.teacherName,
                  teacherTitle: teacher?.title ?? draft.teacherTitle,
                  teacherAvatar: teacher?.avatar ?? draft.teacherAvatar,
                  teacherIntro: teacher?.intro ?? draft.teacherIntro,
                });
              }}
              options={teachers.map((item) => ({ value: item.id, label: `${item.name}${item.title ? ` · ${item.title}` : ""}` }))}
            />
          </div>
          <div className="form-2col">
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>讲师姓名（可选）</div>
              <Input
                value={draft.teacherName}
                maxLength={60}
                placeholder="展示在课程详情页的讲师卡"
                onChange={(event) => setDraft({ ...draft, teacherName: event.target.value })}
              />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>讲师头衔</div>
              <Input
                value={draft.teacherTitle}
                maxLength={60}
                placeholder="如：资深运营专家 / 10 年从业"
                onChange={(event) => setDraft({ ...draft, teacherTitle: event.target.value })}
              />
            </div>
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>讲师头像（可选）</div>
            <ImageUploadField
              value={draft.teacherAvatar}
              size={72}
              onChange={(url) => setDraft({ ...draft, teacherAvatar: url })}
            />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>讲师简介</div>
            <Input.TextArea
              rows={2}
              maxLength={2000}
              value={draft.teacherIntro}
              placeholder="讲师背景与擅长领域，展示在详情页"
              onChange={(event) => setDraft({ ...draft, teacherIntro: event.target.value })}
            />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>
              课程级资源地址{draft.mediaType === "article" ? "（图文类可留空，简介即正文）" : "（无课时的单讲课程才需要；有课时可留空）"}
            </div>
            <Input
              className="mono"
              value={draft.url}
              maxLength={512}
              placeholder={
                draft.mediaType === "article"
                  ? "留空则详情页只渲染简介正文"
                  : "如 https://cdn.example.com/course-01.mp4"
              }
              onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>
              {draft.mediaType === "article" ? "正文" : "简介"}
            </div>
            <Input.TextArea
              rows={6}
              maxLength={60000}
              value={draft.intro}
              placeholder={
                draft.mediaType === "article"
                  ? "图文正文内容"
                  : "一两句话说清内容价值，展示在列表与详情页"
              }
              onChange={(event) => setDraft({ ...draft, intro: event.target.value })}
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
              <div className="text-12 muted" style={{ marginBottom: 4 }}>首页热门位</div>
              <Space>
                <Switch checked={draft.hot} onChange={(value) => setDraft({ ...draft, hot: value })} />
                <span>{draft.hot ? "展示在首页热门推荐" : "不置顶"}</span>
              </Space>
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>状态</div>
              <Space>
                <Switch
                  checked={draft.status}
                  onChange={(value) => setDraft({ ...draft, status: value })}
                />
                <span>{draft.status ? "在线" : "已下架（终端不可见）"}</span>
              </Space>
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>上架审核</div>
              <Select
                style={{ width: "100%" }}
                value={draft.auditStatus}
                onChange={(value) => setDraft({ ...draft, auditStatus: value as KpAuditStatus })}
                options={KP_AUDIT_STATUSES.map((item) => ({
                  value: item,
                  label: KP_AUDIT_STATUS_LABELS[item],
                }))}
              />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>审核备注</div>
              <Input
                value={draft.auditNote}
                maxLength={255}
                placeholder="驳回原因或审核说明"
                onChange={(event) => setDraft({ ...draft, auditNote: event.target.value })}
              />
            </div>
          </div>
        </Space>
      </Modal>

      <LessonManager
        resource={lessonCourse}
        open={lessonOpen}
        onClose={() => setLessonOpen(false)}
        onChanged={() => void load()}
      />
    </Panel>
  );
}
