"use client";

// 课程目录编辑器：一门课程下的章节课时（试看、时长、排序、上下架），课程详情页与学习页共用。
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Drawer,
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
  KP_MEDIA_TYPES,
  KP_MEDIA_TYPE_LABELS,
  type KpChapterRow,
  type KpLessonRow,
  type KpMediaType,
  type KpResourceRow,
} from "@enterprise/contracts";
import { knowledgePayApi } from "@/api/knowledge-pay";
import { EmptyState } from "@/components/ui/panel";

type LessonDraft = {
  id: number;
  chapterId: number;
  title: string;
  mediaType: KpMediaType;
  url: string;
  intro: string;
  durationSec: number;
  freeTrial: boolean;
  sort: number;
  status: boolean;
};

const EMPTY_DRAFT: LessonDraft = {
  id: 0,
  chapterId: 0,
  title: "",
  mediaType: "video",
  url: "",
  intro: "",
  durationSec: 0,
  freeTrial: false,
  sort: 0,
  status: true,
};

type ChapterDraft = {
  id: number;
  title: string;
  sort: number;
  status: boolean;
};

const EMPTY_CHAPTER: ChapterDraft = { id: 0, title: "", sort: 0, status: true };

function durationText(seconds: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  if (!total) return "—";
  const minute = Math.floor(total / 60);
  const second = total % 60;
  return `${minute}:${String(second).padStart(2, "0")}`;
}

export function LessonManager({
  resource,
  open,
  onClose,
  onChanged,
}: {
  resource: KpResourceRow | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpLessonRow[]>([]);
  const [chapters, setChapters] = useState<KpChapterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<LessonDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [chapterOpen, setChapterOpen] = useState(false);
  const [chapterDraft, setChapterDraft] = useState<ChapterDraft>(EMPTY_CHAPTER);
  const [savingChapter, setSavingChapter] = useState(false);

  const load = useCallback(async () => {
    if (!resource) return;
    setLoading(true);
    try {
      const [lessonData, chapterData] = await Promise.all([
        knowledgePayApi.lessons({ query: { resourceId: resource.id } }),
        knowledgePayApi.chapters({ query: { resourceId: resource.id } }),
      ]);
      setRows(lessonData?.list ?? []);
      setChapters(chapterData?.list ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "课时加载失败");
    } finally {
      setLoading(false);
    }
  }, [resource, message]);

  const saveChapter = async () => {
    if (!resource) return;
    if (!chapterDraft.title.trim()) {
      message.warning("请填写章节标题");
      return;
    }
    const body = {
      resourceId: resource.id,
      title: chapterDraft.title.trim(),
      sort: Math.max(0, Math.round(chapterDraft.sort || 0)),
      status: chapterDraft.status,
    };
    setSavingChapter(true);
    try {
      if (chapterDraft.id) {
        await knowledgePayApi.updateChapter({
          params: { id: String(chapterDraft.id) },
          body,
        });
      } else {
        await knowledgePayApi.saveChapter({ body });
      }
      message.success(chapterDraft.id ? "章节已更新" : "章节已创建");
      setChapterOpen(false);
      await load();
      onChanged();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "章节保存失败");
    } finally {
      setSavingChapter(false);
    }
  };

  const removeChapter = async (chapter: KpChapterRow) => {
    try {
      await knowledgePayApi.removeChapter({ params: { id: String(chapter.id) } });
      message.success("章节已删除，课时回落到未分章");
      await load();
      onChanged();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "章节删除失败");
    }
  };

  useEffect(() => {
    if (open && resource) void load();
  }, [open, resource, load]);

  const openEditor = (row?: KpLessonRow) => {
    if (row) {
      setDraft({
        id: row.id,
        chapterId: row.chapterId,
        title: row.title,
        mediaType: row.mediaType,
        url: row.url,
        intro: row.intro,
        durationSec: row.durationSec,
        freeTrial: row.freeTrial,
        sort: row.sort,
        status: row.status,
      });
    } else {
      setDraft({
        ...EMPTY_DRAFT,
        mediaType: resource?.mediaType ?? "video",
        sort: rows.length ? Math.max(...rows.map((item) => item.sort)) + 1 : 1,
      });
    }
    setEditOpen(true);
  };

  const save = async () => {
    if (!resource) return;
    const title = draft.title.trim();
    if (!title) {
      message.warning("请填写课时标题");
      return;
    }
    if (draft.mediaType !== "article" && !draft.url.trim()) {
      message.warning("音视频/图片课时需要填写 https 资源直链；图文课时可留空用正文");
      return;
    }
    const body = {
      resourceId: resource.id,
      chapterId: draft.chapterId,
      title,
      mediaType: draft.mediaType,
      url: draft.url.trim(),
      intro: draft.intro,
      durationSec: Math.max(0, Math.round(draft.durationSec || 0)),
      freeTrial: draft.freeTrial,
      sort: Math.max(0, Math.round(draft.sort || 0)),
      status: draft.status,
    };
    setSaving(true);
    try {
      if (draft.id) {
        await knowledgePayApi.updateLesson({
          params: { id: String(draft.id) },
          body,
        });
      } else {
        await knowledgePayApi.saveLesson({ body });
      }
      message.success(draft.id ? "课时已更新" : "课时已新增");
      setEditOpen(false);
      await load();
      onChanged();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: KpLessonRow) => {
    try {
      await knowledgePayApi.removeLesson({ params: { id: String(row.id) } });
      message.success("课时已删除");
      await load();
      onChanged();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<KpLessonRow> = [
    { title: "排序", dataIndex: "sort", width: 64 },
    {
      title: "章节",
      dataIndex: "chapterId",
      width: 120,
      render: (value: number) =>
        chapters.find((item) => item.id === value)?.title || (
          <span className="text-12 muted">未分章</span>
        ),
    },
    {
      title: "课时标题",
      dataIndex: "title",
      ellipsis: true,
      render: (value: string, row) => (
        <Space size={6}>
          <span>{value}</span>
          {row.freeTrial ? <Tag color="green">试看</Tag> : null}
        </Space>
      ),
    },
    {
      title: "形态",
      dataIndex: "mediaType",
      width: 80,
      render: (value: string) => KP_MEDIA_TYPE_LABELS[value] || value,
    },
    {
      title: "时长",
      dataIndex: "durationSec",
      width: 80,
      render: (value: number) => durationText(value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 80,
      render: (value: boolean) =>
        value ? <Tag color="green">上线</Tag> : <Tag>下架</Tag>,
    },
    {
      title: "操作",
      width: 140,
      render: (_value, row) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined aria-hidden />}
            onClick={() => openEditor(row)}
          >
            编辑
          </Button>
          <Popconfirm
            title="删除这个课时？学习进度会一并清除"
            onConfirm={() => void remove(row)}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined aria-hidden />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Drawer
      open={open}
      size={900}
      destroyOnHidden
      onClose={onClose}
      title={`课时管理${resource ? ` · ${resource.title}` : ""}`}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => openEditor()}
        >
          新增课时
        </Button>
      }
    >
      <div className="text-12 muted" style={{ marginBottom: 12 }}>
        课时按排序号从大到小展示；「试看」课时在用户未解锁时也可播放。图文课时的正文写在简介里。
      </div>
      <Space wrap size={6} style={{ marginBottom: 12 }}>
        <span className="text-12 muted">章节：</span>
        {chapters.map((chapter) => (
          <Tag
            key={chapter.id}
            color={chapter.status ? "blue" : "default"}
            style={{ cursor: "pointer" }}
            closable
            onClick={() => {
              setChapterDraft({
                id: chapter.id,
                title: chapter.title,
                sort: chapter.sort,
                status: chapter.status,
              });
              setChapterOpen(true);
            }}
            onClose={(event) => {
              event.preventDefault();
              void removeChapter(chapter);
            }}
          >
            {chapter.title}（{chapter.lessonCount}）
          </Tag>
        ))}
        <Button
          size="small"
          onClick={() => {
            setChapterDraft({
              ...EMPTY_CHAPTER,
              sort: chapters.length
                ? Math.max(...chapters.map((item) => item.sort)) + 1
                : 1,
            });
            setChapterOpen(true);
          }}
        >
          新增章节
        </Button>
      </Space>
      <Table<KpLessonRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: 700 }}
        locale={{
          emptyText: (
            <EmptyState text="还没有课时；点右上角「新增课时」添加第一讲。" />
          ),
        }}
      />

      <Modal
        open={editOpen}
        title={draft.id ? "编辑课时" : "新增课时"}
        onCancel={() => setEditOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存"
        width={720}
        destroyOnHidden
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>
              课时标题
            </div>
            <Input
              value={draft.title}
              maxLength={120}
              placeholder="如：第 1 讲 · 课程导论"
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>
              所属章节
            </div>
            <Select
              style={{ width: "100%" }}
              value={draft.chapterId}
              onChange={(value) => setDraft({ ...draft, chapterId: value })}
              options={[
                { value: 0, label: "未分章" },
                ...chapters.map((item) => ({ value: item.id, label: item.title })),
              ]}
            />
          </div>
          <div className="form-2col">
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>
                形态
              </div>
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
              <div className="text-12 muted" style={{ marginBottom: 4 }}>
                时长（秒，用于进度与完课判定）
              </div>
              <InputNumber
                min={0}
                max={86400}
                precision={0}
                style={{ width: "100%" }}
                value={draft.durationSec}
                onChange={(value) =>
                  setDraft({ ...draft, durationSec: Number(value) || 0 })
                }
              />
            </div>
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>
              资源地址
              {draft.mediaType === "article"
                ? "（图文课时可留空，正文写在下方简介）"
                : "（https 直链）"}
            </div>
            <Input
              className="mono"
              value={draft.url}
              maxLength={512}
              placeholder="如 https://cdn.example.com/lesson-01.mp4"
              onChange={(event) =>
                setDraft({ ...draft, url: event.target.value })
              }
            />
          </div>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>
              {draft.mediaType === "article" ? "图文正文" : "课时说明"}
            </div>
            <Input.TextArea
              rows={6}
              maxLength={60000}
              value={draft.intro}
              onChange={(event) =>
                setDraft({ ...draft, intro: event.target.value })
              }
            />
          </div>
          <div className="form-2col">
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>
                排序（大者靠前）
              </div>
              <InputNumber
                min={0}
                max={9999}
                precision={0}
                style={{ width: "100%" }}
                value={draft.sort}
                onChange={(value) =>
                  setDraft({ ...draft, sort: Number(value) || 0 })
                }
              />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>
                试看
              </div>
              <Space>
                <Switch
                  checked={draft.freeTrial}
                  onChange={(value) => setDraft({ ...draft, freeTrial: value })}
                />
                <span>{draft.freeTrial ? "未解锁也可播放" : "解锁后可见"}</span>
              </Space>
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>
                状态
              </div>
              <Space>
                <Switch
                  checked={draft.status}
                  onChange={(value) => setDraft({ ...draft, status: value })}
                />
                <span>{draft.status ? "上线" : "下架（终端不可见）"}</span>
              </Space>
            </div>
          </div>
        </Space>
      </Modal>

      <Modal
        open={chapterOpen}
        title={chapterDraft.id ? "编辑章节" : "新增章节"}
        onCancel={() => setChapterOpen(false)}
        onOk={() => void saveChapter()}
        confirmLoading={savingChapter}
        okText="保存"
        width={520}
        destroyOnHidden
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>章节标题</div>
            <Input
              value={chapterDraft.title}
              maxLength={120}
              placeholder="如：第一章 · 基础认知"
              onChange={(event) =>
                setChapterDraft({ ...chapterDraft, title: event.target.value })
              }
            />
          </div>
          <div className="form-2col">
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>排序（大者靠前）</div>
              <InputNumber
                min={0}
                max={9999}
                precision={0}
                style={{ width: "100%" }}
                value={chapterDraft.sort}
                onChange={(value) =>
                  setChapterDraft({ ...chapterDraft, sort: Number(value) || 0 })
                }
              />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>状态</div>
              <Space>
                <Switch
                  checked={chapterDraft.status}
                  onChange={(value) =>
                    setChapterDraft({ ...chapterDraft, status: value })
                  }
                />
                <span>{chapterDraft.status ? "展示中" : "已隐藏"}</span>
              </Space>
            </div>
          </div>
        </Space>
      </Modal>
    </Drawer>
  );
}
