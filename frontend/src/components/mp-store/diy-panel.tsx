"use client";

import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SendOutlined,
  UpOutlined,
  DownOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type {
  MpDiyNode,
  MpDiyPage,
  MpDiyPageRow,
  MpDiyPageSaveBody,
  MpDiyWidget,
  MpDiyWidgetMeta,
} from "@enterprise/contracts";
import {
  MP_DIY_PAGE_TYPE_LABELS,
  MP_DIY_PAGE_TYPES,
  MP_DIY_STATUS_LABELS,
} from "@enterprise/contracts";
import { Notice, Panel } from "@/components/ui/panel";

export type MpDiyApiAdapter = {
  widgets: () => Promise<MpDiyWidgetMeta[] | null>;
  list: () => Promise<MpDiyPageRow[] | null>;
  detail: (id: number) => Promise<MpDiyPage | null>;
  save: (body: MpDiyPageSaveBody) => Promise<MpDiyPage | null>;
  publish: (id: number) => Promise<MpDiyPage | null>;
  remove: (id: number) => Promise<{ ok: boolean; message: string } | null>;
};

type Draft = {
  id: number;
  shopId: number;
  name: string;
  type: MpDiyPageSaveBody["type"];
  coverImage: string;
  isDefault: boolean;
  sortOrder: number;
  components: MpDiyNode[];
  styles: Record<string, unknown>;
};

const PROP_LABELS: Record<string, string> = {
  title: "标题",
  subtitle: "副标题",
  content: "内容",
  image: "图片地址",
  images: "图片列表",
  link: "跳转链接",
  linkType: "跳转类型",
  limit: "数量上限",
  columns: "每行列数",
  style: "版式",
  showIntro: "显示店铺简介",
  showFollow: "显示关注按钮",
  placeholder: "占位文案",
  text: "文案",
  height: "高度",
  background: "背景色",
  shopId: "店铺编号（0=全部）",
};

const EMPTY_DRAFT: Draft = {
  id: 0,
  shopId: 0,
  name: "",
  type: "HOME",
  coverImage: "",
  isDefault: false,
  sortOrder: 0,
  components: [],
  styles: {},
};

/**
 * 多店铺商城装修面板：市场级（shopId=0）与店铺级共用一套页面模型。
 *
 * 组件类型只能取自后端下发白名单；属性表单按默认值类型生成，
 * 数组/对象类属性用 JSON 编辑，避免为 14 个组件各写一套表单还应接不暇。
 * 只有「发布」会把草稿快照成 C 端可见版本，草稿改动不影响线上。
 */
export function MpDiyPanel({
  title,
  api,
  emptyHint,
}: {
  title: string;
  api: MpDiyApiAdapter;
  emptyHint: string;
}) {
  const { message, modal } = App.useApp();
  const [pages, setPages] = useState<MpDiyPageRow[]>([]);
  const [widgets, setWidgets] = useState<MpDiyWidgetMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [selected, setSelected] = useState(-1);
  const [adding, setAdding] = useState<MpDiyWidget | "">("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [rows, metas] = await Promise.all([api.list(), api.widgets()]);
      setPages(rows ?? []);
      setWidgets(metas ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "装修页读取失败");
    } finally {
      setLoading(false);
    }
    // api 由调用方模块级常量提供，引用稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setDraft({ ...EMPTY_DRAFT });
    setSelected(-1);
    setOpen(true);
  };

  const openEdit = async (id: number) => {
    try {
      const page = await api.detail(id);
      if (!page) throw new Error("页面不存在或已被删除");
      setDraft({
        id: page.id,
        shopId: page.shopId,
        name: page.name,
        type: page.type,
        coverImage: page.coverImage,
        isDefault: page.isDefault,
        sortOrder: page.sortOrder,
        components: page.components,
        styles: page.styles,
      });
      setSelected(-1);
      setOpen(true);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "页面读取失败");
    }
  };

  const metaOf = (type: string) => widgets.find((item) => item.type === type);

  const addWidget = () => {
    if (!adding) return;
    const meta = metaOf(adding);
    if (meta) {
      setDraft((prev) => ({
        ...prev,
        components: [
          ...prev.components,
          { type: meta.type, props: { ...meta.defaultProps } },
        ],
      }));
      setSelected(draft.components.length);
    }
    setAdding("");
  };

  const move = (index: number, delta: number) => {
    setDraft((prev) => {
      const next = [...prev.components];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, components: next };
    });
    setSelected((prev) => (prev === index ? index + delta : prev));
  };

  const updateProps = (index: number, props: Record<string, unknown>) => {
    setDraft((prev) => ({
      ...prev,
      components: prev.components.map((item, i) =>
        i === index ? { ...item, props } : item,
      ),
    }));
  };

  const save = async (publish: boolean) => {
    if (!draft.name.trim()) {
      message.warning("请先填写页面名称");
      return;
    }
    if (publish && draft.components.length === 0) {
      message.warning("至少放一个组件后才能发布");
      return;
    }
    setSaving(true);
    try {
      const saved = await api.save({
        id: draft.id,
        shopId: draft.shopId,
        name: draft.name.trim(),
        type: draft.type,
        components: draft.components,
        styles: draft.styles,
        coverImage: draft.coverImage,
        isDefault: draft.isDefault,
        sortOrder: draft.sortOrder,
      });
      if (!saved) throw new Error("保存失败，请重试");
      if (publish) await api.publish(saved.id);
      message.success(publish ? "已发布，C 端将立即看到新版本" : "草稿已保存");
      setOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const publish = async (row: MpDiyPageRow) => {
    try {
      await api.publish(row.id);
      message.success("已发布");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "发布失败");
    }
  };

  const remove = (row: MpDiyPageRow) => {
    modal.confirm({
      title: `删除装修页「${row.name}」`,
      content: "删除后不可恢复；默认页不能删除，需先把其他页面设为默认。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.remove(row.id);
          message.success("已删除");
          await load();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<MpDiyPageRow> = [
    { title: "页面名称", dataIndex: "name", render: (value, row) => (
      <Space size={6}>
        <span>{value}</span>
        {row.isDefault ? <Tag color="blue">默认</Tag> : null}
      </Space>
    ) },
    {
      title: "类型",
      dataIndex: "type",
      width: 100,
      render: (value) => MP_DIY_PAGE_TYPE_LABELS[value] ?? value,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value) => (
        <Tag color={value === "PUBLISHED" ? "green" : "default"}>
          {MP_DIY_STATUS_LABELS[value] ?? value}
        </Tag>
      ),
    },
    { title: "组件数", dataIndex: "componentCount", width: 90 },
    {
      title: "最近发布",
      dataIndex: "publishedAt",
      width: 170,
      render: (value: string) => value || "—",
    },
    {
      title: "操作",
      width: 260,
      render: (_, row) => (
        <Space size={6} wrap>
          <Button size="small" icon={<EditOutlined />} onClick={() => void openEdit(row.id)}>
            编辑
          </Button>
          <Button
            size="small"
            icon={<SendOutlined />}
            disabled={row.status === "PUBLISHED" && row.componentCount === 0}
            onClick={() => void publish(row)}
          >
            发布
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={row.isDefault}
            onClick={() => remove(row)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const activeNode = selected >= 0 ? draft.components[selected] : undefined;
  const activeMeta = activeNode ? metaOf(activeNode.type) : undefined;

  return (
    <>
      <Panel
        title={title}
        titleExtra={
          <span className="muted text-12">
            草稿改动不影响线上，点「发布」后才快照为 C 端版本
          </span>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
            新建页面
          </Button>
        }
      >
        {error ? <Notice variant="error">{error}</Notice> : null}
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={pages}
          pagination={false}
          locale={{ emptyText: <Empty description={emptyHint} /> }}
        />
      </Panel>

      <Drawer
        open={open}
        size="large"
        destroyOnHidden
        title={draft.id ? "编辑装修页" : "新建装修页"}
        onClose={() => setOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button loading={saving} onClick={() => void save(false)}>
              保存草稿
            </Button>
            <Button type="primary" loading={saving} onClick={() => void save(true)}>
              保存并发布
            </Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <Form.Item label="页面名称" required>
            <Input
              value={draft.name}
              maxLength={40}
              placeholder="如：首页、年货节活动页"
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </Form.Item>
          <Space size={16} style={{ display: "flex", flexWrap: "wrap" }}>
            <Form.Item label="页面类型">
              <Select
                style={{ width: 150 }}
                value={draft.type}
                options={MP_DIY_PAGE_TYPES.map((type) => ({
                  value: type,
                  label: MP_DIY_PAGE_TYPE_LABELS[type] ?? type,
                }))}
                onChange={(type) => setDraft((prev) => ({ ...prev, type }))}
              />
            </Form.Item>
            <Form.Item label="排序">
              <InputNumber
                min={0}
                max={9999}
                value={draft.sortOrder}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, sortOrder: Number(value ?? 0) }))
                }
              />
            </Form.Item>
            <Form.Item label="设为默认页">
              <Switch
                checked={draft.isDefault}
                onChange={(checked) =>
                  setDraft((prev) => ({ ...prev, isDefault: checked }))
                }
              />
            </Form.Item>
          </Space>
          <Form.Item label="主题色（styles.themeColor，可留空）">
            <Input
              value={String(draft.styles.themeColor ?? "")}
              placeholder="#ff5000"
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  styles: { ...prev.styles, themeColor: event.target.value },
                }))
              }
            />
          </Form.Item>
        </Form>

        <Panel
          title={`组件（${draft.components.length}）`}
          titleExtra={<span className="muted text-12">上下移动调整展示顺序</span>}
          extra={
            <Space size={6}>
              <Select
                style={{ width: 190 }}
                value={adding || undefined}
                placeholder="选择要添加的组件"
                options={widgets.map((item) => ({
                  value: item.type,
                  label: `${item.groupLabel} · ${item.name}`,
                }))}
                onChange={(value) => setAdding(value)}
              />
              <Button onClick={addWidget} disabled={!adding}>
                添加
              </Button>
            </Space>
          }
        >
          {draft.components.length === 0 ? (
            <Empty description="还没有组件，从右上角选择后添加" />
          ) : (
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              {draft.components.map((node, index) => (
                <div
                  key={`${node.type}-${index}`}
                  onClick={() => setSelected(index)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border:
                      selected === index
                        ? "1px solid var(--ant-color-primary)"
                        : "1px solid rgba(5,5,5,0.08)",
                    cursor: "pointer",
                  }}
                >
                  <span>
                    {index + 1}. {metaOf(node.type)?.name ?? node.type}
                  </span>
                  <Space size={4}>
                    <Button
                      size="small"
                      type="text"
                      icon={<UpOutlined />}
                      disabled={index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        move(index, -1);
                      }}
                    />
                    <Button
                      size="small"
                      type="text"
                      icon={<DownOutlined />}
                      disabled={index === draft.components.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        move(index, 1);
                      }}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDraft((prev) => ({
                          ...prev,
                          components: prev.components.filter((_, i) => i !== index),
                        }));
                        setSelected(-1);
                      }}
                    />
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </Panel>

        {activeNode ? (
          <div style={{ marginTop: 16 }}>
            <Panel
              title={`组件参数 · ${activeMeta?.name ?? activeNode.type}`}
              titleExtra={<span className="muted text-12">数组/对象类参数按 JSON 填写</span>}
            >
              <PropsEditor
                props={activeNode.props}
                onChange={(props) => updateProps(selected, props)}
              />
            </Panel>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

function PropsEditor({
  props,
  onChange,
}: {
  props: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const keys = Object.keys(props);
  if (keys.length === 0) {
    return <span className="muted text-12">该组件没有可配置参数</span>;
  }
  return (
    <Space orientation="vertical" size={10} style={{ width: "100%" }}>
      {keys.map((key) => {
        const value = props[key];
        const label = PROP_LABELS[key] ?? key;
        if (typeof value === "boolean") {
          return (
            <Space key={key} size={8}>
              <Switch
                checked={value}
                onChange={(checked) => onChange({ ...props, [key]: checked })}
              />
              <span>{label}</span>
            </Space>
          );
        }
        if (typeof value === "number") {
          return (
            <Space key={key} size={8}>
              <span style={{ display: "inline-block", width: 170 }}>{label}</span>
              <InputNumber
                value={value}
                onChange={(next) => onChange({ ...props, [key]: Number(next ?? 0) })}
              />
            </Space>
          );
        }
        if (typeof value === "string") {
          return (
            <Space key={key} size={8} style={{ width: "100%" }}>
              <span style={{ display: "inline-block", width: 170 }}>{label}</span>
              <Input
                style={{ width: 320 }}
                value={value}
                onChange={(event) => onChange({ ...props, [key]: event.target.value })}
              />
            </Space>
          );
        }
        return (
          <div key={key}>
            <div style={{ marginBottom: 4 }}>{label}</div>
            <Input.TextArea
              key={JSON.stringify(value)}
              defaultValue={JSON.stringify(value, null, 2)}
              autoSize={{ minRows: 2, maxRows: 8 }}
              onBlur={(event) => {
                try {
                  onChange({ ...props, [key]: JSON.parse(event.target.value) });
                } catch {
                  // 非法 JSON 不写回草稿，保留原值等用户改好
                }
              }}
            />
          </div>
        );
      })}
    </Space>
  );
}
