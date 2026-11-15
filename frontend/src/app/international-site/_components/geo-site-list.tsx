"use client";

import type { GeoSiteLanguage } from "@enterprise/contracts";
import {
  CheckCircleFilled,
  CloudUploadOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  GlobalOutlined,
  LinkOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { useState, type CSSProperties } from "react";
import { useGeoProjects } from "@/query/geo";
import { useGeoSiteActions, useGeoSiteMeta, useGeoSites } from "@/query/geo-site";
import { EmptyState, Notice } from "@/components/ui/panel";
import { GeoSiteEditor } from "./geo-site-editor";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "default",
  PUBLISHED: "green",
  SUSPENDED: "red",
};

/** 模板缩略图所需的最小信息，与后端 templateViews() 同构。 */
type TemplateOption = {
  key: string;
  name: string;
  desc: string;
  tag: string;
  theme: "light" | "dark";
  accent: string;
  heroBg: string;
  sections: string[];
  elements: number;
};

/**
 * 首屏是否偏深色：heroBg 可能是一串渐变，取所有色标求平均亮度，
 * 用来决定缩略图上的骨架条用深色还是浅色，避免「深字压深底」看不清。
 */
function heroIsDark(heroBg: string): boolean {
  const stops = heroBg.match(/#[0-9a-fA-F]{6}/g);
  if (!stops?.length) return false;
  const channels = stops.map((stop) => [
    parseInt(stop.slice(1, 3), 16),
    parseInt(stop.slice(3, 5), 16),
    parseInt(stop.slice(5, 7), 16),
  ]);
  const flat = channels.flat();
  const mean = flat.reduce((sum, value) => sum + value, 0) / flat.length;
  return mean < 140;
}

function TemplateThumb({ item }: { item: TemplateOption }) {
  const dark = heroIsDark(item.heroBg);
  const bar = (width: string, opacity: number): CSSProperties => ({
    width,
    height: 5,
    borderRadius: 3,
    background: dark
      ? `rgba(255,255,255,${opacity})`
      : `rgba(15,23,42,${opacity})`,
  });
  return (
    <div
      style={{
        height: 86,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid rgba(15,23,42,0.08)",
        background: item.theme === "dark" ? "#0b1020" : "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: item.heroBg,
          padding: "12px 12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          alignItems: dark ? "center" : "flex-start",
        }}
      >
        <div style={bar(dark ? "70%" : "58%", 0.72)} />
        <div style={bar(dark ? "48%" : "40%", 0.3)} />
        <div
          style={{
            width: 34,
            height: 8,
            marginTop: 3,
            borderRadius: 6,
            background: item.accent,
          }}
        />
      </div>
      <div style={{ flex: 1, padding: 8, display: "flex", gap: 5 }}>
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{
              flex: 1,
              borderRadius: 4,
              border: "1px solid rgba(15,23,42,0.08)",
              background: item.theme === "dark" ? "#121a2e" : "#f8fafc",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 模板选择：两列卡片 + 版式缩略图，让用户在套用之前就看清配色与包含的区块。
 * 键盘可达：整组是 radiogroup，方向键在卡片间移动，空格/回车选中。
 */
function TemplatePicker({
  options,
  value,
  onChange,
}: {
  options: TemplateOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const focusable = (index: number) =>
    options.forEach((_, position) => {
      const node = document.getElementById(`geo-tpl-${position}`);
      if (position === index) node?.focus();
    });
  return (
    <div
      role="radiogroup"
      aria-label="起始模板"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 10,
        maxHeight: "56vh",
        overflowY: "auto",
        padding: 2,
      }}
    >
      {options.map((item, index) => {
        const active = item.key === value;
        return (
          <div
            key={item.key}
            id={`geo-tpl-${index}`}
            role="radio"
            aria-checked={active}
            tabIndex={active || (!value && index === 0) ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                onChange(item.key);
                return;
              }
              const next =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? index + 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? index - 1
                    : -1;
              if (next >= 0 && next < options.length) {
                event.preventDefault();
                onChange(options[next].key);
                focusable(next);
              }
            }}
            style={{
              cursor: "pointer",
              padding: 10,
              borderRadius: 10,
              textAlign: "left",
              background: active ? "#f5f7ff" : "#ffffff",
              border: active
                ? `2px solid ${item.accent || "#4f46e5"}`
                : "1px solid rgba(15,23,42,0.12)",
              boxShadow: active ? "0 6px 18px rgba(15,23,42,0.10)" : "none",
            }}
          >
            <TemplateThumb item={item} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 8,
              }}
            >
              <span style={{ fontWeight: 600 }}>{item.name}</span>
              <Tag
                style={{ margin: 0 }}
                color={item.theme === "dark" ? "geekblue" : "default"}
              >
                {item.tag}
              </Tag>
              {active ? (
                <CheckCircleFilled
                  aria-hidden
                  style={{ marginLeft: "auto", color: item.accent || "#4f46e5" }}
                />
              ) : null}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              {item.desc}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#94a3b8",
                marginTop: 6,
                lineHeight: 1.7,
              }}
            >
              {item.sections.join(" · ")} · {item.elements} 个元素
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * GEO 建站列表：站点、访问地址、域名与本月积分一屏可见，点「编辑」进全屏建站器。
 * 数据进入即加载，写操作后由 React Query 失效重拉，不放手动刷新按钮。
 */
export function GeoSiteView() {
  const { message, modal } = App.useApp();
  const meta = useGeoSiteMeta();
  const sites = useGeoSites();
  const projects = useGeoProjects();
  const actions = useGeoSiteActions();
  const [editorId, setEditorId] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [template, setTemplate] = useState("");
  const [form] = Form.useForm();

  const rows = sites.data ?? [];
  const info = meta.data;
  const templates = info?.templates ?? [];
  const languageOptions = info?.languageOptions ?? [];
  const languageLabel = (code: string) =>
    languageOptions.find((item) => item.code === code)?.label || code;
  const capReached = !!info && info.remaining <= 0;
  const openEditor = (id: number) => setEditorId(id);

  const openCreate = () => {
    setTemplate(templates[0]?.key ?? "");
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const values = (await form.validateFields()) as {
      title: string;
      geoProjectId?: number;
      defaultLanguage?: string;
      languages?: string[];
    };
    const defaultLanguage = (values.defaultLanguage || "zh-CN") as GeoSiteLanguage;
    const enabled = Array.from(
      new Set<GeoSiteLanguage>([
        defaultLanguage,
        ...((values.languages ?? []) as GeoSiteLanguage[]),
      ]),
    );
    const created = await actions.create.mutateAsync({
      body: { ...values, template, defaultLanguage, languages: enabled },
    });
    setCreateOpen(false);
    message.success("站点已创建，可直接拖拽元素搭建");
    if (created?.id) openEditor(created.id);
  };

  const publish = async (id: number) => {
    await actions.publish.mutateAsync({ body: { id } });
    message.success("已发布，公开地址即刻生效");
  };

  const unpublish = (title: string, id: number) => {
    modal.confirm({
      title: "下线站点？",
      content: `「${title}」的公开地址立即返回「尚未发布」，草稿、域名与账单都保留，可随时重新发布。`,
      okText: "确认下线",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.unpublish.mutateAsync({ body: { id } });
        message.success("站点已下线");
      },
    });
  };

  const duplicate = async (id: number) => {
    const copy = await actions.duplicate.mutateAsync({ body: { id } });
    message.success(`已复制为「${copy?.title ?? "新站点"}」`);
  };

  const removeSite = (title: string, id: number) => {
    modal.confirm({
      title: "删除站点？",
      content: `「${title}」的页面内容、域名绑定与站点设置一并删除；已扣的积分流水仍可在积分中心查询。此操作不可恢复。`,
      okText: "确认删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.remove.mutateAsync({ body: { id } });
        message.success("站点已删除");
      },
    });
  };

  if (editorId) {
    return <GeoSiteEditor siteId={editorId} onClose={() => setEditorId(0)} />;
  }

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      {sites.isError || meta.isError ? (
        <Notice variant="warn">
          {(sites.error as Error)?.message ??
            (meta.error as Error)?.message ??
            "站点数据读取失败"}
        </Notice>
      ) : null}
      {capReached ? (
        <Notice variant="warn">
          站点数量已达上限 {info?.maxSites} 个：请删除不再使用的站点，平台管理员可在
          <a href="/admin/geo-site" target="_blank" rel="noopener noreferrer">
            「平台管理 · GEO 建站设置」
          </a>
          调整上限。
        </Notice>
      ) : info?.pricingEnabled ? (
        <Notice variant="info">
          每个账号每月前 {info.freeSites} 个站点免费，超出按 {info.monthPrice} 积分/月
          在每月 1 日自动出账；欠费宽限 {info.graceHours} 小时后停服，充值后自动恢复。
          余额与充值在
          <a href="/points" target="_blank" rel="noopener noreferrer">
            「积分中心」
          </a>
          查看。
        </Notice>
      ) : (
        <Notice variant="info">
          平台当前未启用建站积分计费，站点不扣积分。
        </Notice>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          共 {info?.total ?? rows.length} 个站点，剩余额度{" "}
          {info?.remaining ?? info?.maxSites ?? "-"}
          {info?.rootDomain ? ` · 站点默认发布在 *.${info.rootDomain}` : ""}
        </Typography.Text>
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          disabled={!templates.length}
          onClick={openCreate}
        >
          新建站点
        </Button>
      </div>

      <Table
        rowKey="id"
        size="small"
        loading={sites.isPending}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1180 }}
        locale={{
          emptyText: (
            <EmptyState
              icon={<GlobalOutlined aria-hidden />}
              text="还没有站点：新建站点后拖拽元素搭页面，绑定自己的域名即可对外发布"
              action={
                <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={openCreate}>
                  新建站点
                </Button>
              }
            />
          ),
        }}
        columns={[
          {
            title: "站点",
            dataIndex: "title",
            width: 240,
            render: (_, row) => (
              <Space orientation="vertical" size={2}>
                <Typography.Text strong>{row.title}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {row.slug}
                  {row.geoProjectBrand ? ` · ${row.geoProjectBrand}` : ""}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: "状态",
            dataIndex: "status",
            width: 130,
            render: (_, row) => (
              <Space orientation="vertical" size={2}>
                <Tag color={STATUS_COLOR[row.status] || "default"}>{row.statusLabel}</Tag>
                {row.offReason ? (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    平台处置：{row.offReason}
                  </Typography.Text>
                ) : null}
                {row.billingNote ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {row.billingNote}
                  </Typography.Text>
                ) : null}
              </Space>
            ),
          },
          {
            title: "语言",
            key: "languages",
            width: 170,
            render: (_, row) => (
              <Space orientation="vertical" size={2}>
                <Tag color="blue" style={{ margin: 0 }}>
                  默认 {languageLabel(row.defaultLanguage)}
                </Tag>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {(row.languages ?? []).length} 种语言
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: "访问地址",
            key: "entry",
            width: 260,
            render: (_, row) => (
              <Space orientation="vertical" size={2}>
                <Space size={4}>
                  <Typography.Text style={{ fontSize: 12 }} copyable={{ text: row.url }}>
                    {row.url.replace(/^https?:\/\//, "")}
                  </Typography.Text>
                  <Button
                    size="small"
                    type="text"
                    icon={<LinkOutlined aria-hidden />}
                    onClick={() =>
                      window.open(row.url, "_blank", "noopener,noreferrer")
                    }
                  />
                </Space>
                {row.primaryDomain ? (
                  <Tag color="blue" style={{ fontSize: 12 }}>
                    主域名 {row.primaryDomain}
                  </Tag>
                ) : null}
              </Space>
            ),
          },
          {
            title: "域名",
            key: "domains",
            width: 100,
            render: (_, row) =>
              row.domainCount
                ? `${row.domainCount} 个（生效 ${row.activeDomainCount}）`
                : "未绑定",
          },
          {
            title: "本月积分",
            dataIndex: "monthlyPoints",
            width: 100,
            render: (value: number) => `${value} 积分`,
          },
          {
            title: "最近更新",
            dataIndex: "updatedAt",
            width: 150,
            render: (value: string) =>
              new Date(value).toLocaleString("zh-CN", { hour12: false }),
          },
          {
            title: "操作",
            key: "ops",
            width: 250,
            fixed: "right",
            render: (_, row) => (
              <Space size={4}>
                <Button
                  size="small"
                  type="primary"
                  icon={<EditOutlined aria-hidden />}
                  onClick={() => openEditor(row.id)}
                >
                  编辑
                </Button>
                {row.status === "PUBLISHED" ? (
                  <Button
                    size="small"
                    icon={<CloudUploadOutlined aria-hidden />}
                    onClick={() => unpublish(row.title, row.id)}
                  >
                    下线
                  </Button>
                ) : (
                  <Button
                    size="small"
                    loading={actions.publish.isPending}
                    onClick={() => void publish(row.id)}
                  >
                    发布
                  </Button>
                )}
                <Button
                  size="small"
                  icon={<CopyOutlined aria-hidden />}
                  loading={actions.duplicate.isPending}
                  onClick={() => void duplicate(row.id)}
                />
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined aria-hidden />}
                  onClick={() => removeSite(row.title, row.id)}
                />
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={createOpen}
        title="新建国际独立站"
        width={860}
        okText="创建并进入编辑"
        confirmLoading={actions.create.isPending}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate().catch(() => undefined)}
        afterOpenChange={(open) => {
          if (!open) return;
          form.resetFields();
          form.setFieldsValue({
            defaultLanguage: "zh-CN",
            languages: ["zh-CN"],
          });
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="站点名称 *"
            rules={[{ required: true, message: "请填写站点名称" }]}
          >
            <Input maxLength={120} placeholder="例如：星链传媒 · 品牌官网" />
          </Form.Item>
          <Form.Item
            name="defaultLanguage"
            label="默认语言 *"
            extra="默认语言直接挂在站点根路径，且作为菜单、内容的兜底语言。创建后可在站点设置里调整。"
            rules={[{ required: true, message: "请选择默认语言" }]}
          >
            <Select
              options={languageOptions.map((item) => ({
                value: item.code,
                label: item.label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="languages"
            label="启用的语言"
            extra="除默认语言外其他语言发布在 /语言码/ 路径下；取消某个语言后，该语言页面不再对外渲染。"
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="至少包含默认语言"
              options={languageOptions.map((item) => ({
                value: item.code,
                label: item.label,
              }))}
            />
          </Form.Item>
          <Form.Item name="geoProjectId" label="关联 GEO 项目（可选）">
            <Select
              allowClear
              placeholder="关联后报告与选题可一键带到站点"
              loading={projects.isPending}
              options={(projects.data ?? []).map((item) => ({
                value: item.id,
                label: item.brand,
              }))}
            />
          </Form.Item>
          <Form.Item label="起始模板">
            <TemplatePicker
              options={templates}
              value={template}
              onChange={setTemplate}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
