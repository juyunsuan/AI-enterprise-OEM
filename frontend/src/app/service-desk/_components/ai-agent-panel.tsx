"use client";

import {
  AutoComplete,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  TimePicker,
  Tooltip,
  Upload,
  message,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { ServiceDeskAiAgent } from "@enterprise/contracts";
import { contentApi } from "@/api/content";
import { kbApi } from "@/api/kb";
import { serviceDeskApi } from "@/api/collab";
import { Panel } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";

/**
 * 纯AI客服员工：AI客服团队里的一类员工，与真人坐席并列。
 * 人设、模型、知识库范围、转人工口径都挂在这个员工身上；
 * 「接待设置」里的账号级 AI 配置只是默认值，员工自带的配置优先。
 */

type GroupOption = { id: number; name: string };

/** 表单口径：TimePicker 只吃 dayjs，时段单独拆成三个控件再拼回 workingHours。 */
type AiAgentFormValues = {
  name: string;
  intro?: string;
  avatar?: string;
  groupId?: number;
  mode?: "AUTO" | "BOT";
  persona?: string;
  aiChannelId?: number;
  aiModel?: string;
  kbSpaceIds?: number[];
  handoffKeywords?: string[];
  handoffGroupId?: number;
  maxConcurrent?: number;
  days?: number[];
  start?: dayjs.Dayjs | null;
  end?: dayjs.Dayjs | null;
  greetingText?: string;
};

/** 时段 days 口径与后端一致：0=周日 … 6=周六；空数组＝每天。 */
const WEEK_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" },
];

const MODE_HINT: Record<string, string> = {
  AUTO: "AI 先接待，命中转人工关键词或答不上来时交给真人",
  BOT: "全程由 AI 接待，不转人工",
};

const AVATAR_TYPES = /\.(png|jpe?g|webp|gif)$/i;

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(String(reader.result || "").replace(/^data:[^,]+,/, ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });

function asHhmm(value: unknown) {
  if (value && typeof value === "object" && "format" in value) {
    return (value as dayjs.Dayjs).format("HH:mm");
  }
  return "";
}

/** 在岗状态：停用红、时段外橙、在岗绿。 */
function DutyTag({ row }: { row: ServiceDeskAiAgent }) {
  if (row.status !== "ON") return <Tag color="red">已停用</Tag>;
  if (row.onDuty) return <Tag color="green">在岗</Tag>;
  return (
    <Tooltip title={`接待时段：${workingHoursText(row)}`}>
      <Tag color="orange">时段外</Tag>
    </Tooltip>
  );
}

function workingHoursText(row: ServiceDeskAiAgent) {
  const days = row.workingHours?.days || [];
  const dayText = days.length
    ? days
        .slice()
        .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
        .map((item) => WEEK_OPTIONS.find((option) => option.value === item)?.label || "")
        .filter(Boolean)
        .join("、")
    : "每天";
  const start = row.workingHours?.start || "";
  const end = row.workingHours?.end || "";
  return start && end ? `${dayText} ${start}–${end}` : `${dayText} 全天`;
}

export function AiAgentsPanel({ groups }: { groups: GroupOption[] }) {
  const [rows, setRows] = useState<ServiceDeskAiAgent[]>([]);
  const [spaces, setSpaces] = useState<
    { id: number; name: string; status: string }[]
  >([]);
  const [channels, setChannels] = useState<{ id: number; name: string }[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceDeskAiAgent | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState<ServiceDeskAiAgent | null>(null);
  const [form] = Form.useForm<AiAgentFormValues>();

  const load = async () => {
    try {
      setRows((await serviceDeskApi.aiAgents()) || []);
    } catch (error) {
      message.error((error as Error).message || "加载失败");
    }
  };

  useEffect(() => {
    void load();
    // 知识库空间与模型渠道都用各自模块既有的列表，不另发接口
    void kbApi
      .listSpaces()
      .then((data) =>
        setSpaces(
          (data || []).map((item) => ({
            id: item.id,
            name: item.name,
            status: item.status,
          })),
        ),
      )
      .catch(() => setSpaces([]));
    void contentApi
      .settings()
      .then((data) =>
        setChannels(
          (data?.channels || [])
            .filter((item) => item.available)
            .map((item) => ({ id: item.id, name: item.name })),
        ),
      )
      .catch(() => setChannels([]));
  }, []);

  const watchedChannelId = Form.useWatch("aiChannelId", form);
  const watchedAvatar = String(Form.useWatch("avatar", form) || "");
  useEffect(() => {
    const channelId = Number(watchedChannelId || 0);
    if (!channelId) {
      setModels([]);
      return;
    }
    let cancelled = false;
    void contentApi
      .models({ query: { channelId } })
      .then((data) => {
        if (cancelled) return;
        setModels(
          (data?.models || [])
            .filter((item) => item.kind === "text")
            .map((item) => item.id),
        );
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [watchedChannelId]);

  const openEditor = (row: ServiceDeskAiAgent | null) => {
    setEditing(row);
    form.setFieldsValue({
      name: row?.name || "",
      intro: row?.intro || "",
      avatar: row?.avatar || "",
      groupId: row?.groupId ?? 0,
      mode: (row?.mode === "BOT" ? "BOT" : "AUTO") as "AUTO" | "BOT",
      persona: row?.persona || "",
      aiChannelId: row?.aiChannelId ?? 0,
      aiModel: row?.aiModel || "",
      kbSpaceIds: row?.kbSpaceIds || [],
      handoffKeywords: row?.handoffKeywords || [],
      handoffGroupId: row?.handoffGroupId ?? 0,
      maxConcurrent: row?.maxConcurrent ?? 50,
      days: row?.workingHours?.days || [],
      start: row?.workingHours?.start ? dayjs(row.workingHours.start, "HH:mm") : null,
      end: row?.workingHours?.end ? dayjs(row.workingHours.end, "HH:mm") : null,
      greetingText: row?.greetingText || "",
    });
    setOpen(true);
  };

  const save = async () => {
    let values: AiAgentFormValues;
    try {
      values = await form.validateFields();
    } catch {
      // 必填项缺失时字段下方已有提示
      return;
    }
    try {
      setSaving(true);
      await serviceDeskApi.saveAiAgent({
        body: {
          id: editing?.id ?? 0,
          name: String(values.name || "").trim(),
          avatar: String(values.avatar || ""),
          intro: String(values.intro || ""),
          groupId: Number(values.groupId || 0),
          mode: values.mode === "BOT" ? "BOT" : "AUTO",
          persona: String(values.persona || ""),
          aiChannelId: Number(values.aiChannelId || 0),
          aiModel: String(values.aiModel || "").trim(),
          kbSpaceIds: (values.kbSpaceIds || []).map(Number).filter(Boolean),
          handoffKeywords: (values.handoffKeywords || [])
            .map((item) => String(item).trim())
            .filter(Boolean)
            .slice(0, 20),
          handoffGroupId: Number(values.handoffGroupId || 0),
          maxConcurrent: Number(values.maxConcurrent || 50),
          workingHours: {
            days: (values.days || []).map(Number),
            start: asHhmm(values.start),
            end: asHhmm(values.end),
          },
          greetingText: String(values.greetingText || ""),
        },
      });
      setOpen(false);
      message.success(editing ? "已更新 AI 客服" : "已新增 AI 客服");
      void load();
    } catch (error) {
      message.error((error as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: ServiceDeskAiAgent) => {
    try {
      await serviceDeskApi.setAiAgentStatus({
        params: { id: String(row.id) },
        body: { status: row.status === "ON" ? "DISABLED" : "ON" },
      });
      message.success(row.status === "ON" ? "已停用" : "已启用");
      void load();
    } catch (error) {
      message.error((error as Error).message || "状态切换失败");
    }
  };

  const remove = (row: ServiceDeskAiAgent) => {
    Modal.confirm({
      title: `删除「${row.name}」？`,
      content: "删除后这位 AI 客服不再接待；正在接待的会话需要先处理。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await serviceDeskApi.removeAiAgent({ params: { id: String(row.id) } });
          message.success("已删除");
          void load();
        } catch (error) {
          // 仍在接待会话时后端会拦下来，原因原样展示给店主
          message.error((error as Error).message || "删除失败");
          throw error;
        }
      },
    });
  };

  const spaceOptions = useMemo(() => {
    const bound = new Set(editing?.kbSpaceIds || []);
    return spaces
      .filter((item) => item.status !== "ARCHIVED" || bound.has(item.id))
      .map((item) => ({ value: item.id, label: item.name }));
  }, [spaces, editing]);

  const groupOptions = useMemo(
    () => [
      { value: 0, label: "不分组" },
      ...groups.map((item) => ({ value: item.id, label: item.name })),
    ],
    [groups],
  );

  return (
    <>
      <Panel
        title="AI 客服"
        titleExtra="与真人坐席并列的一类员工：自带人设、模型、知识库范围与转人工口径。"
        extra={
          <Space>
            <Button onClick={() => void load()}>刷新</Button>
            <Button type="primary" onClick={() => openEditor(null)}>
              新增 AI 客服
            </Button>
          </Space>
        }
      >
        {rows.length ? (
          <div className="muted text-12" style={{ marginBottom: 10 }}>
            共接待{" "}
            {rows.reduce((sum, row) => sum + row.handledCount, 0)} 场 · 转人工{" "}
            {rows.reduce((sum, row) => sum + row.handoffCount, 0)} 场 ·{" "}
            {(() => {
              const rated = rows.filter((row) => row.ratingCount > 0);
              if (!rated.length) return "暂无满意度评价";
              const total = rated.reduce((sum, row) => sum + row.ratingCount, 0);
              const score = rated.reduce(
                (sum, row) => sum + row.ratingAvg * row.ratingCount,
                0,
              );
              return `平均满意度 ${(score / total).toFixed(1)} 分（${total} 次评价）`;
            })()}
          </div>
        ) : null}
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: "还没有 AI 客服，点「新增 AI 客服」建一位" }}
          columns={[
            {
              title: "名称",
              dataIndex: "name",
              render: (_: unknown, row: ServiceDeskAiAgent) => (
                <Space size={8}>
                  {row.avatar ? (
                    <RawImg
                      src={row.avatar}
                      alt=""
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  ) : null}
                  <Tooltip title={row.intro || "没有简介"}>
                    <span>{row.name}</span>
                  </Tooltip>
                </Space>
              ),
            },
            {
              title: "接待口径",
              dataIndex: "modeLabel",
              width: 170,
              render: (value: string, row: ServiceDeskAiAgent) => (
                <Tooltip title={MODE_HINT[row.mode]}>
                  <span>{value}</span>
                </Tooltip>
              ),
            },
            {
              title: "在岗状态",
              width: 110,
              render: (_: unknown, row: ServiceDeskAiAgent) => (
                <DutyTag row={row} />
              ),
            },
            {
              title: "接待台账",
              width: 230,
              render: (_: unknown, row: ServiceDeskAiAgent) => (
                <span className="text-12">
                  接待 {row.handledCount} 场 · 转人工 {row.handoffCount} 场（
                  {Math.round(row.handoffRate * 100)}%）· 满意度{" "}
                  {row.ratingCount
                    ? `${row.ratingAvg.toFixed(1)} 分 / ${row.ratingCount} 次评价`
                    : "暂无评价"}
                </span>
              ),
            },
            {
              title: "接待时段",
              width: 150,
              render: (_: unknown, row: ServiceDeskAiAgent) => (
                <span className="text-12">{workingHoursText(row)}</span>
              ),
            },
            {
              title: "在处理 / 并发上限",
              width: 150,
              render: (_: unknown, row: ServiceDeskAiAgent) =>
                `${row.activeCount} / ${row.maxConcurrent}`,
            },
            {
              title: "知识库",
              render: (_: unknown, row: ServiceDeskAiAgent) =>
                row.kbSpaces.length ? (
                  <Tooltip title={row.kbSpaces.join("、")}>
                    <span>{row.kbSpaces.join("、")}</span>
                  </Tooltip>
                ) : (
                  <span className="muted">按账号级设置</span>
                ),
            },
            {
              title: "操作",
              width: 240,
              render: (_: unknown, row: ServiceDeskAiAgent) => (
                <Space size={0}>
                  <Button type="link" size="small" onClick={() => openEditor(row)}>
                    编辑
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => void toggleStatus(row)}
                  >
                    {row.status === "ON" ? "停用" : "启用"}
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setAsking(row)}
                  >
                    试问
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    danger
                    onClick={() => remove(row)}
                  >
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        open={open}
        width={760}
        title={editing ? `编辑 AI 客服「${editing.name}」` : "新增 AI 客服"}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
        okText="保存"
        okButtonProps={{ loading: saving }}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 12 }}
          initialValues={{ mode: "AUTO", groupId: 0, maxConcurrent: 50 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item
              name="name"
              label="名称"
              rules={[{ required: true, message: "请填写名称" }]}
            >
              <Input placeholder="例如：小A 售前顾问" maxLength={60} />
            </Form.Item>
            <Form.Item name="intro" label="简介（悬浮在名字上显示）">
              <Input placeholder="例如：负责产品与价格咨询" maxLength={200} />
            </Form.Item>
          </div>
          <Form.Item label="头像">
            <Space align="start">
              {watchedAvatar ? (
                <RawImg
                  src={watchedAvatar}
                  alt=""
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : null}
              <Form.Item name="avatar" noStyle>
                <Input
                  style={{ width: 300 }}
                  placeholder="图片地址（可留空，或用右侧上传）"
                />
              </Form.Item>
              <Upload
                accept="image/png,image/jpeg,image/webp,image/gif"
                showUploadList={false}
                beforeUpload={(file) => {
                  void uploadAvatar(file);
                  return false;
                }}
              >
                <Button loading={uploading}>上传头像</Button>
              </Upload>
            </Space>
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item name="groupId" label="归属客服组">
              <Select options={groupOptions} />
            </Form.Item>
            <Form.Item name="maxConcurrent" label="同时接待上限">
              <InputNumber min={1} max={500} style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <Form.Item name="mode" label="接待口径">
            <Radio.Group>
              <Space orientation="vertical" size={4}>
                <Radio value="AUTO">AI 先接（可转人工）</Radio>
                <div className="muted text-12">{MODE_HINT.AUTO}</div>
                <Radio value="BOT">纯AI接待（不转人工）</Radio>
                <div className="muted text-12">{MODE_HINT.BOT}</div>
              </Space>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="persona"
            label="人设与回答口径"
            tooltip="这位 AI 员工是谁、按什么口径回答；AI 每次回复都会照这段话来"
          >
            <Input.TextArea
              rows={4}
              placeholder="例如：你是本店的售前顾问小A，语气亲切简洁，只按知识库回答；知识库里没有的不要编造，引导访客留下联系方式。"
            />
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item
              name="aiChannelId"
              label="模型渠道"
              tooltip="选「按账号 AI 设置」＝沿用接待设置里的渠道；选定某个渠道后，这位 AI 客服固定用它"
            >
              <Select
                options={[
                  { value: 0, label: "按账号 AI 设置" },
                  ...channels.map((item) => ({
                    value: item.id,
                    label: item.name,
                  })),
                ]}
              />
            </Form.Item>
            <Form.Item
              name="aiModel"
              label="模型"
              tooltip="留空＝按账号 AI 设置的默认模型；也可以直接填模型名"
            >
              <AutoComplete
                allowClear
                placeholder="留空用默认模型"
                options={models.map((item) => ({ value: item }))}
                filterOption={(input, option) =>
                  String(option?.value || "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </div>
          <Form.Item
            name="kbSpaceIds"
            label="知识库范围"
            tooltip="不选＝沿用接待设置里的账号级知识库；多选时按所选空间的资料回答"
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="可留空（按账号级设置）"
              options={spaceOptions}
            />
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item
              name="handoffKeywords"
              label="转人工关键词"
              tooltip="访客消息里出现这些词就转给真人（仅「AI 先接」口径生效）"
            >
              <Select
                mode="tags"
                allowClear
                placeholder="输入后回车，例如：退款、投诉、人工"
                tokenSeparators={[",", "，", "、", " "]}
              />
            </Form.Item>
            <Form.Item
              name="handoffGroupId"
              label="转人工兜底客服组"
              tooltip="转人工时优先交给这一组的在线客服；不分组则全局自动分配"
            >
              <Select
                options={[
                  { value: 0, label: "不指定（全局自动分配）" },
                  ...groups.map((item) => ({ value: item.id, label: item.name })),
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item
            label="接待时段"
            tooltip="不勾选日期且不填时间＝全天在岗"
            style={{ marginBottom: 8 }}
          >
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              <Form.Item name="days" noStyle>
                <Checkbox.Group
                  options={WEEK_OPTIONS.map((item) => ({
                    label: item.label,
                    value: item.value,
                  }))}
                />
              </Form.Item>
              <Space align="center">
                <Form.Item name="start" noStyle>
                  <TimePicker format="HH:mm" minuteStep={5} placeholder="开始" style={{ width: 120 }} />
                </Form.Item>
                <span className="muted">至</span>
                <Form.Item name="end" noStyle>
                  <TimePicker format="HH:mm" minuteStep={5} placeholder="结束" style={{ width: 120 }} />
                </Form.Item>
                <span className="muted text-12">两头都留空＝全天</span>
              </Space>
            </Space>
          </Form.Item>
          <Form.Item
            name="greetingText"
            label="欢迎语"
            tooltip="访客进入这位 AI 客服的窗口时先说的话；留空用接待设置里的欢迎语"
          >
            <Input.TextArea rows={2} placeholder="例如：您好，这里是本店 AI 客服，可以直接问产品、价格与售后。" />
          </Form.Item>
        </Form>
      </Modal>
      <AskAiAgentModal agent={asking} onClose={() => setAsking(null)} />
    </>
  );

  async function uploadAvatar(file: File) {
    if (!AVATAR_TYPES.test(file.name)) {
      message.warning("头像仅支持 PNG / JPG / WEBP / GIF");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      message.warning("头像不能超过 2MB");
      return;
    }
    setUploading(true);
    try {
      const result = await serviceDeskApi.uploadIcon({
        body: {
          name: file.name,
          contentType: file.type || "application/octet-stream",
          contentBase64: await readBase64(file),
        },
      });
      if (result?.url) form.setFieldValue("avatar", result.url);
    } catch (error) {
      message.error((error as Error).message || "头像上传失败");
    } finally {
      setUploading(false);
    }
  }
}

/** 试问：给这位 AI 员工提一句，验人设与知识库效果；不会写进会话记录。 */
function AskAiAgentModal({
  agent,
  onClose,
}: {
  agent: ServiceDeskAiAgent | null;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<
    {
      question: string;
      answer: string;
      references: { title: string; ref: string }[];
      handoff: boolean;
    }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (agent) {
      setQuestion("");
      setTurns([]);
      setError("");
    }
  }, [agent]);

  const ask = async () => {
    if (!agent || !question.trim()) return;
    const text = question.trim();
    try {
      setBusy(true);
      setError("");
      const history = turns.flatMap((item) => [
        { role: "user" as const, content: item.question },
        { role: "assistant" as const, content: item.answer },
      ]);
      const data = await serviceDeskApi.askAiAgent({
        body: { agentId: agent.id, question: text, history: history.slice(-20) },
      });
      if (data) {
        setTurns((prev) => [
          ...prev,
          {
            question: text,
            answer: data.answer || "（没有返回内容）",
            references: data.references || [],
            handoff: Boolean(data.handoff),
          },
        ]);
      }
      setQuestion("");
    } catch (caught) {
      setError((caught as Error).message || "试问失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(agent)}
      width={680}
      title={agent ? `试问「${agent.name}」` : "试问"}
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      <div className="muted text-12" style={{ marginBottom: 12 }}>
        这里只用来验人设与知识库效果，不会写入会话记录，也不影响访客端的真实接待。
      </div>
      {error ? <div className="text-12" style={{ color: "#d4380d" }}>{error}</div> : null}
      {turns.length ? (
        <Space orientation="vertical" size={12} style={{ width: "100%", marginBottom: 12 }}>
          {turns.map((item, index) => (
            <div key={index}>
              <div style={{ fontWeight: 600 }}>{item.question}</div>
              <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                {item.answer}
              </div>
              {item.references.length ? (
                <div className="text-12 muted">
                  {item.references.map((ref) => (
                    <div key={`${ref.title}-${ref.ref}`}>
                      参考：{ref.title}
                      {ref.ref ? `（${ref.ref}）` : ""}
                    </div>
                  ))}
                </div>
              ) : null}
              {item.handoff ? (
                <div className="text-12" style={{ color: "#d46b08" }}>
                  该问题按口径建议转人工
                </div>
              ) : null}
            </div>
          ))}
        </Space>
      ) : null}
      <Space.Compact style={{ width: "100%" }}>
        <Input.TextArea
          value={question}
          autoSize={{ minRows: 2, maxRows: 4 }}
          placeholder="以访客的口吻问一句，例如：你们这款产品怎么收费？"
          onChange={(event) => setQuestion(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              void ask();
            }
          }}
        />
        <Button type="primary" loading={busy} onClick={() => void ask()}>
          提问
        </Button>
      </Space.Compact>
    </Modal>
  );
}
