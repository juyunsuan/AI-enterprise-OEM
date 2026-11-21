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
import { useEffect, useState } from "react";
import {
  HEALTH_AGREEMENT_LABELS,
  HEALTH_DIY_BLOCKS,
  HEALTH_DIY_BLOCK_LABELS,
  HEALTH_ON_STATUSES,
  type HealthAgreementRow,
  type HealthBannerRow,
  type HealthDiyPageRow,
  type HealthNoticeRow,
  type HealthServiceEntryRow,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { Panel, PanelTabs } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";
import { fmtTime } from "@/lib/datetime";
import { DataTable, FilterBar, LoadError, OnOffTag, useHealthResource } from "./health-common";
import { useHealthShopId } from "./health-scope";

/**
 * 装修与协议：轮播、公告、页面组件、服务入口、协议须知。
 * 保存即写店铺配置，小程序端启动时拉最新一份，不用重新出包。
 */

type OnStatus = (typeof HEALTH_ON_STATUSES)[number];

type BannerForm = {
  title: string;
  image: string;
  linkType: string;
  linkValue: string;
  sort: number;
  status: OnStatus;
  startAt: string;
  endAt: string;
};

const ON_OFF_OPTIONS: { value: OnStatus; label: string }[] = [
  { value: "ON", label: "启用" },
  { value: "OFF", label: "停用" },
];

const LINK_TYPES: { value: string; label: string }[] = [
  { value: "NONE", label: "不跳转" },
  { value: "ARTICLE", label: "科普文章" },
  { value: "GOODS", label: "商品" },
  { value: "SERVICE", label: "服务" },
  { value: "PRACTITIONER", label: "医护主页" },
  { value: "PAGE", label: "小程序页面" },
  { value: "WEBVIEW", label: "外部网页" },
];

const LINK_VALUE_HINTS: Record<string, string> = {
  NONE: "留空即可",
  ARTICLE: "填文章编号（文章列表地址栏可见）",
  GOODS: "填商品编号",
  SERVICE: "填服务编号",
  PRACTITIONER: "填医护编号",
  PAGE: "填页面路径，如 /pages/index/index",
  WEBVIEW: "填完整网址 https://…",
};

const IMAGE = {
  width: 72,
  height: 44,
  borderRadius: 6,
  objectFit: "cover" as const,
  background: "#fafafa",
};

const NEW_BANNER: BannerForm = {
  title: "",
  image: "",
  linkType: "NONE",
  linkValue: "",
  sort: 0,
  status: "ON",
  startAt: "",
  endAt: "",
};

export function DecorateTab() {
  const shopId = useHealthShopId();
  const [tab, setTab] = useState("banner");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "banner", label: "轮播", children: <BannerSection shopId={shopId} /> },
        { key: "notice", label: "公告", children: <NoticeSection shopId={shopId} /> },
        { key: "diy", label: "页面装修", children: <DiySection shopId={shopId} /> },
        { key: "entry", label: "服务入口", children: <EntrySection shopId={shopId} /> },
        { key: "agreement", label: "协议须知", children: <AgreementSection shopId={shopId} /> },
      ]}
    />
  );
}

/* ------------------------------ 轮播 ------------------------------ */

function BannerSection({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const list = useHealthResource(() => healthApi.bannerList({ query: { shopId } }), [shopId]);
  const [editing, setEditing] = useState<{ row: HealthBannerRow | null } | null>(null);
  const rows = list.data ?? [];

  const removeRow = (row: HealthBannerRow) => {
    modal.confirm({
      title: `删除轮播「${row.title || row.image}」`,
      content: "删除后首页立即少一张图，图片本身不会从存储里清除。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await healthApi.bannerRemove({ body: { shopId, id: row.id } });
          message.success("轮播已删除");
          await list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: TableProps<HealthBannerRow>["columns"] = [
    {
      title: "图片",
      dataIndex: "image",
      width: 100,
      render: (value: string) =>
        value ? <RawImg src={value} alt="" style={IMAGE} /> : <span className="muted">—</span>,
    },
    {
      title: "标题",
      dataIndex: "title",
      width: 200,
      render: (value: string) => value || <span className="muted">纯图位</span>,
    },
    {
      title: "跳转",
      dataIndex: "linkType",
      width: 220,
      render: (value: string, row) => (
        <div>
          <div>{LINK_TYPES.find((item) => item.value === value)?.label ?? value}</div>
          {value && value !== "NONE" ? (
            <div className="muted text-12">{row.linkValue || "未填目标"}</div>
          ) : null}
        </div>
      ),
    },
    { title: "排序", dataIndex: "sort", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "有效期",
      dataIndex: "startAt",
      width: 210,
      render: (_, row) =>
        row.startAt || row.endAt ? (
          <span className="text-12">
            {row.startAt ? fmtTime(row.startAt) : "不限"} 至 {row.endAt ? fmtTime(row.endAt) : "不限"}
          </span>
        ) : (
          <span className="muted">长期有效</span>
        ),
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button
            size="small"
            type="link"
            icon={<EditOutlined aria-hidden />}
            onClick={() => setEditing({ row })}
          >
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
      title="首页轮播"
      titleBadge={list.data ? `${list.data.length}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ row: null })}
        >
          新建轮播
        </Button>
      }
    >
      <FilterBar>
        <span className="muted text-12">
          排序值越小越靠前；设了有效期就在区间内展示，留空表示长期有效。图片建议 750×350。
        </span>
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthBannerRow> rows={rows} columns={columns} page={1} loading={list.loading} />
      <Modal
        open={editing !== null}
        title={editing?.row ? "编辑轮播" : "新建轮播"}
        width={560}
        destroyOnHidden
        footer={null}
        onCancel={() => setEditing(null)}
      >
        {editing ? (
          <BannerFormBlock
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

function BannerFormBlock({
  shopId,
  row,
  onClose,
  onSaved,
}: {
  shopId: number;
  row: HealthBannerRow | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<BannerForm>();
  const [saving, setSaving] = useState(false);
  const linkType = Form.useWatch("linkType", form) ?? "NONE";
  const image = Form.useWatch("image", form) ?? "";

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.bannerSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          title: values.title.trim(),
          image: values.image.trim(),
          linkType: values.linkType,
          linkValue: (values.linkValue ?? "").trim(),
          sort: Number(values.sort ?? 0),
          status: values.status,
          startAt: (values.startAt ?? "").trim(),
          endAt: (values.endAt ?? "").trim(),
        },
      });
      message.success(row ? "轮播已保存" : "轮播已创建，启用后首页展示");
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
      initialValues={
        row
          ? {
              title: row.title,
              image: row.image,
              linkType: row.linkType || "NONE",
              linkValue: row.linkValue,
              sort: row.sort,
              status: row.status,
              startAt: row.startAt,
              endAt: row.endAt,
            }
          : NEW_BANNER
      }
    >
      <Form.Item name="title" label="标题" extra="仅后台识别与备用文案，可留空">
        <Input maxLength={60} />
      </Form.Item>
      <Form.Item
        name="image"
        label="图片直链"
        rules={[{ required: true, whitespace: true, message: "请填写图片直链" }]}
      >
        <Input maxLength={500} placeholder="https://…" />
      </Form.Item>
      {image ? (
        <RawImg
          src={image}
          alt=""
          style={{ width: 220, height: 104, objectFit: "cover", borderRadius: 8, marginBottom: 16 }}
        />
      ) : null}
      <Space wrap align="start">
        <Form.Item name="linkType" label="点击跳转" style={{ width: 180 }}>
          <Select options={LINK_TYPES} />
        </Form.Item>
        {linkType === "NONE" ? null : (
          <Form.Item
            name="linkValue"
            label="跳转目标"
            extra={LINK_VALUE_HINTS[linkType] ?? ""}
            rules={[{ required: true, whitespace: true, message: "填了跳转类型就要给目标" }]}
            style={{ width: 280 }}
          >
            <Input maxLength={500} />
          </Form.Item>
        )}
      </Space>
      <Space wrap align="start">
        <Form.Item name="sort" label="排序值" extra="越小越靠前" style={{ width: 140 }}>
          <InputNumber min={0} max={999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="status" label="状态" style={{ width: 130 }}>
          <Select options={ON_OFF_OPTIONS} />
        </Form.Item>
        <Form.Item name="startAt" label="开始时间" extra="留空不限" style={{ width: 180 }}>
          <Input maxLength={32} placeholder="YYYY-MM-DD HH:mm" />
        </Form.Item>
        <Form.Item name="endAt" label="结束时间" extra="留空不限" style={{ width: 180 }}>
          <Input maxLength={32} placeholder="YYYY-MM-DD HH:mm" />
        </Form.Item>
      </Space>
      <Space>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          保存轮播
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}

/* ------------------------------ 公告 ------------------------------ */

type NoticeForm = { title: string; content: string; sort: number; status: OnStatus };

function NoticeSection({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const list = useHealthResource(() => healthApi.noticeList({ query: { shopId } }), [shopId]);
  const [editing, setEditing] = useState<{ row: HealthNoticeRow | null } | null>(null);
  const rows = list.data ?? [];

  const removeRow = (row: HealthNoticeRow) => {
    modal.confirm({
      title: `删除公告「${row.title}」`,
      content: "删除后小程序首页公告位立即撤下该条。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await healthApi.noticeRemove({ body: { shopId, id: row.id } });
          message.success("公告已删除");
          await list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: TableProps<HealthNoticeRow>["columns"] = [
    { title: "标题", dataIndex: "title", width: 240 },
    { title: "内容", dataIndex: "content", width: 380 },
    { title: "排序", dataIndex: "sort", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      fixed: "right",
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
      title="公告"
      titleBadge={list.data ? `${list.data.length}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ row: null })}
        >
          新建公告
        </Button>
      }
    >
      <FilterBar>
        <span className="muted text-12">
          公告展示在首页滚动条，适合停诊通知、活动说明与服务时间调整。
        </span>
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthNoticeRow> rows={rows} columns={columns} page={1} loading={list.loading} />
      <Modal
        open={editing !== null}
        title={editing?.row ? "编辑公告" : "新建公告"}
        width={560}
        destroyOnHidden
        footer={null}
        onCancel={() => setEditing(null)}
      >
        {editing ? (
          <NoticeFormBlock
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

function NoticeFormBlock({
  shopId,
  row,
  onClose,
  onSaved,
}: {
  shopId: number;
  row: HealthNoticeRow | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<NoticeForm>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.noticeSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          title: values.title.trim(),
          content: values.content.trim(),
          sort: Number(values.sort ?? 0),
          status: values.status,
        },
      });
      message.success(row ? "公告已保存" : "公告已创建");
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
        title: row?.title ?? "",
        content: row?.content ?? "",
        sort: row?.sort ?? 0,
        status: row?.status ?? "ON",
      }}
    >
      <Form.Item
        name="title"
        label="标题"
        rules={[{ required: true, whitespace: true, message: "请填写公告标题" }]}
      >
        <Input maxLength={80} />
      </Form.Item>
      <Form.Item
        name="content"
        label="内容"
        rules={[{ required: true, whitespace: true, message: "请填写公告内容" }]}
      >
        <Input.TextArea rows={4} maxLength={2000} showCount />
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
          保存公告
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}

/* ------------------------------ 页面装修 ------------------------------ */

type DiyBlock = HealthDiyPageRow["blocks"][number];

const BLOCK_KEYS = new Set<string>(HEALTH_DIY_BLOCKS);

const DEFAULT_BLOCKS: DiyBlock[] = [
  { key: "search", visible: true, sort: 0, config: {} },
  { key: "banner", visible: true, sort: 1, config: {} },
  { key: "notice", visible: true, sort: 2, config: {} },
  { key: "quickEntries", visible: true, sort: 3, config: {} },
];

/** 组件 JSON 的兜底校验：key 必须在支持列表里，config 必须是对象，数量不超过 20。 */
function parseBlocks(text: string): DiyBlock[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("组件列表必须是 JSON 数组");
  if (!value.length || value.length > 20) throw new Error("组件数量需在 1—20 之间");
  return value.map((item, index) => {
    const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const key = String(record.key ?? "");
    if (!BLOCK_KEYS.has(key)) {
      throw new Error(`第 ${index + 1} 项的 key 不在支持列表：${key || "空"}`);
    }
    const config = record.config;
    if (config !== undefined && (config === null || typeof config !== "object" || Array.isArray(config))) {
      throw new Error(`第 ${index + 1} 项的 config 必须是对象`);
    }
    const sort = Number(record.sort);
    return {
      key: key as DiyBlock["key"],
      visible: record.visible !== false,
      sort: Number.isFinite(sort) ? sort : index,
      config: (config ?? {}) as Record<string, unknown>,
    };
  });
}

function DiySection({ shopId }: { shopId: number }) {
  const list = useHealthResource(() => healthApi.diyPageList({ query: { shopId } }), [shopId]);
  const [editing, setEditing] = useState<{ row: HealthDiyPageRow | null } | null>(null);
  const rows = list.data ?? [];

  const columns: TableProps<HealthDiyPageRow>["columns"] = [
    {
      title: "页面",
      dataIndex: "pageKey",
      width: 140,
      render: (value: string) => <Tag>{value}</Tag>,
    },
    { title: "标题", dataIndex: "title", width: 200 },
    {
      title: "组件",
      dataIndex: "blocks",
      width: 320,
      render: (value: DiyBlock[]) => (
        <Space size={4} wrap>
          {value.length
            ? value.map((block) => (
                <Tag key={block.key} color={block.visible ? "blue" : "default"}>
                  {(HEALTH_DIY_BLOCK_LABELS[block.key] ?? block.key) + (block.visible ? "" : "（隐藏）")}
                </Tag>
              ))
            : <span className="muted">未配置</span>}
        </Space>
      ),
    },
    {
      title: "发布",
      dataIndex: "publishedAt",
      width: 160,
      render: (value: string) =>
        value ? <span className="text-12">{fmtTime(value)}</span> : <span className="muted">未发布</span>,
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
      title="页面装修"
      titleBadge={list.data ? `${list.data.length}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ row: null })}
        >
          新建页面
        </Button>
      }
    >
      <FilterBar>
        <span className="muted text-12">
          常用页面：首页 home、我的 mine。组件按数组顺序排列，visible=false 表示端上不渲染。
        </span>
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthDiyPageRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={list.loading}
        rowKey="pageKey"
      />
      <Modal
        open={editing !== null}
        title={editing?.row ? `编辑页面 · ${editing.row.pageKey}` : "新建页面"}
        width={720}
        destroyOnHidden
        footer={null}
        onCancel={() => setEditing(null)}
      >
        {editing ? (
          <DiyFormBlock
            key={editing.row?.pageKey ?? "new"}
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

function DiyFormBlock({
  shopId,
  row,
  onClose,
  onSaved,
}: {
  shopId: number;
  row: HealthDiyPageRow | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ pageKey: string; blocks: string; publish: boolean }>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    let blocks: DiyBlock[];
    try {
      blocks = parseBlocks(values.blocks);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "组件 JSON 不合法");
      return;
    }
    setSaving(true);
    try {
      await healthApi.diyPageSave({
        body: { shopId, pageKey: values.pageKey.trim(), blocks, publish: values.publish },
      });
      message.success(values.publish ? "页面已保存并发布" : "页面已保存（未发布）");
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
        pageKey: row?.pageKey ?? "home",
        blocks: JSON.stringify(row?.blocks?.length ? row.blocks : DEFAULT_BLOCKS, null, 2),
        publish: Boolean(row?.publishedAt),
      }}
    >
      <Space wrap align="start">
        <Form.Item
          name="pageKey"
          label="页面键"
          extra="首页 home，我的 mine"
          rules={[{ required: true, whitespace: true, message: "请填写页面键" }]}
          style={{ width: 180 }}
        >
          <Input maxLength={30} disabled={Boolean(row)} />
        </Form.Item>
        <Form.Item
          name="publish"
          label="发布"
          valuePropName="checked"
          extra="发布后小程序端立即生效"
          style={{ width: 140 }}
        >
          <Switch />
        </Form.Item>
      </Space>
      <Form.Item
        name="blocks"
        label="组件列表（JSON）"
        extra={`支持的 key：${HEALTH_DIY_BLOCKS.map((key) => HEALTH_DIY_BLOCK_LABELS[key] ?? key).join("、")}`}
        rules={[{ required: true, whitespace: true, message: "请填写组件 JSON" }]}
      >
        <Input.TextArea rows={14} style={{ fontFamily: "monospace", fontSize: 12 }} />
      </Form.Item>
      <div className="muted text-12" style={{ marginBottom: 12 }}>
        示例：{`[{"key":"banner","visible":true,"sort":0,"config":{}}]`}；保存前会校验 key 与 config，不合法不会提交。
      </div>
      <Space>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          保存页面
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}

/* ------------------------------ 服务入口 ------------------------------ */

function EntrySection({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const list = useHealthResource(() => healthApi.serviceEntryList({ query: { shopId } }), [shopId]);
  const [draft, setDraft] = useState<HealthServiceEntryRow[]>([]);
  const [saving, setSaving] = useState(false);

  // 服务端整组下发，本地只改「展示 / 排序」，保存时整组回写。
  useEffect(() => {
    if (list.data) setDraft(list.data);
  }, [list.data]);

  const patch = (key: string, next: Partial<Pick<HealthServiceEntryRow, "visible" | "sort">>) => {
    setDraft((rows) => rows.map((row) => (row.key === key ? { ...row, ...next } : row)));
  };

  const save = async () => {
    setSaving(true);
    try {
      await healthApi.serviceEntrySave({
        body: {
          shopId,
          entries: draft.map((row) => ({
            key: row.key,
            visible: row.visible,
            sort: Number(row.sort ?? 0),
          })),
        },
      });
      message.success("服务入口已保存，小程序端下次启动生效");
      await list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const columns: TableProps<HealthServiceEntryRow>["columns"] = [
    { title: "入口", dataIndex: "label", width: 160 },
    {
      title: "键",
      dataIndex: "key",
      width: 140,
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: "可用性",
      dataIndex: "blockedReason",
      width: 240,
      render: (value: string, row) =>
        value ? (
          <span style={{ color: "#cf1322" }} className="text-12">
            不可用：{value}
          </span>
        ) : (
          <span className="muted text-12">{row.dependsOn ? `依赖：${row.dependsOn}` : "可用"}</span>
        ),
    },
    {
      title: "展示",
      dataIndex: "visible",
      width: 100,
      render: (value: boolean, row) => (
        <Switch size="small" checked={value} onChange={(next) => patch(row.key, { visible: next })} />
      ),
    },
    {
      title: "排序",
      dataIndex: "sort",
      width: 120,
      render: (value: number, row) => (
        <InputNumber
          size="small"
          min={0}
          max={999}
          precision={0}
          value={value}
          onChange={(next) => patch(row.key, { sort: Number(next ?? 0) })}
        />
      ),
    },
  ];

  return (
    <Panel
      title="服务入口"
      titleBadge={list.data ? `${list.data.length}` : undefined}
      extra={
        <Button type="primary" size="small" loading={saving} onClick={() => void save()}>
          保存整组
        </Button>
      }
    >
      <FilterBar>
        <span className="muted text-12">
          入口开关是能力开关，关掉只影响端上是否出现，不删除任何数据；依赖条件不满足的入口端上置灰并说明原因。
        </span>
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthServiceEntryRow>
        rows={draft}
        columns={columns}
        page={1}
        loading={list.loading}
        rowKey="key"
      />
    </Panel>
  );
}

/* ------------------------------ 协议须知 ------------------------------ */

function AgreementSection({ shopId }: { shopId: number }) {
  const list = useHealthResource(() => healthApi.agreementList({ query: { shopId } }), [shopId]);
  const [editing, setEditing] = useState<{ row: HealthAgreementRow | null } | null>(null);
  const rows = list.data ?? [];

  const columns: TableProps<HealthAgreementRow>["columns"] = [
    {
      title: "协议",
      dataIndex: "label",
      width: 180,
      render: (value: string, row) => value || HEALTH_AGREEMENT_LABELS[row.key] || row.key,
    },
    { title: "标题", dataIndex: "title", width: 240 },
    {
      title: "内容",
      dataIndex: "content",
      width: 380,
      render: (value: string) => (
        <span className="muted text-12">{value ? `${value.slice(0, 60)}…` : "未填写"}</span>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 150,
      render: (value: string) => fmtTime(value),
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
      title="协议须知"
      titleBadge={list.data ? `${list.data.length}` : undefined}
      extra={<span className="muted text-12">建档 / 下单前端上强制勾选</span>}
    >
      <FilterBar>
        <span className="muted text-12">
          服务协议、隐私政策、就诊须知等为固定键位，端上会在建档与下单前强制展示并要求勾选；保存后立即生效。
        </span>
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthAgreementRow> rows={rows} columns={columns} page={1} loading={list.loading} rowKey="key" />
      <Modal
        open={editing !== null}
        title="编辑协议"
        width={760}
        destroyOnHidden
        footer={null}
        onCancel={() => setEditing(null)}
      >
        {editing?.row ? (
          <AgreementFormBlock
            key={editing.row.key}
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

function AgreementFormBlock({
  shopId,
  row,
  onClose,
  onSaved,
}: {
  shopId: number;
  row: HealthAgreementRow;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ title: string; content: string }>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.agreementSave({
        body: { shopId, key: row.key, title: values.title.trim(), content: values.content },
      });
      message.success("协议已保存，小程序端建档/下单前会展示并要求勾选");
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
      initialValues={{ title: row.title, content: row.content }}
    >
      <div className="muted text-12" style={{ marginBottom: 12 }}>
        键位：{row.key}（{HEALTH_AGREEMENT_LABELS[row.key] ?? row.label}），键位固定不可改。
      </div>
      <Form.Item
        name="title"
        label="标题"
        rules={[{ required: true, whitespace: true, message: "请填写协议标题" }]}
      >
        <Input maxLength={80} />
      </Form.Item>
      <Form.Item
        name="content"
        label="正文"
        extra="支持 HTML 片段，端上用 rich-text 渲染；最长 6 万字"
        rules={[{ required: true, whitespace: true, message: "请填写协议正文" }]}
      >
        <Input.TextArea rows={14} maxLength={60000} showCount />
      </Form.Item>
      <Space>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          保存协议
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}
