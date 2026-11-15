"use client";

import { useMemo, useState } from "react";
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import {
  useGeoSiteCmsActions,
  useGeoSiteTemplates,
  type GeoSiteTemplateRow,
} from "@/query/geo-site";
import type { GeoSiteNode } from "./geo-site-elements";

/**
 * 模板库：把画布上做好的一页或选中的区块另存下来，之后在别的页面一键套用。
 *
 * 只有「有内容可存」时才给保存入口：整页模板取当前画布（含未保存的改动），
 * 区块模板取选中的那个元素，两者都在后端过一遍元素白名单，非法类型当场拒回。
 */

type Kind = "BLOCK" | "PAGE";

export function TemplatePanel({
  siteId,
  pageId,
  pageTitle,
  tree,
  selected,
  onApplied,
}: {
  siteId: number;
  /** 当前编辑的页面 id：套用是写在这一页上的，0 表示还没选定页面 */
  pageId: number;
  pageTitle: string;
  /** 画布当前内容（含未保存改动），整页模板取它 */
  tree: GeoSiteNode[];
  /** 画布选中元素：区块模板取它，未选中时为空 */
  selected: GeoSiteNode | null;
  /** 套用成功后把服务端返回的新草稿回灌画布，避免画面与库里内容不一致 */
  onApplied?: (content: unknown) => void;
}) {
  const { message } = App.useApp();
  const actions = useGeoSiteCmsActions();
  const [kind, setKind] = useState<Kind>("BLOCK");
  const [saveOpen, setSaveOpen] = useState<Kind | null>(null);
  const [form] = Form.useForm<{ name: string; note: string }>();
  const query = useGeoSiteTemplates(siteId);
  const rows = useMemo(
    () => (query.data ?? []).filter((row) => row.kind === kind),
    [query.data, kind],
  );

  const openSave = (target: Kind) => {
    const source = target === "PAGE" ? tree : selected ? [selected] : [];
    if (!source.length) {
      message.warning(
        target === "PAGE"
          ? "画布还是空的，先做好内容再另存整页模板"
          : "先在画布点选一个区块，再把它存成模板",
      );
      return;
    }
    form.resetFields();
    setSaveOpen(target);
  };

  const submitSave = async () => {
    const values = await form.validateFields();
    const content = saveOpen === "PAGE" ? tree : selected ? [selected] : [];
    await actions.templateSave.mutateAsync({
      body: {
        siteId,
        kind: saveOpen as Kind,
        name: values.name.trim(),
        note: (values.note || "").trim(),
        content,
      },
    });
    setSaveOpen(null);
    message.success("模板已保存，随时可以在其他页面套用");
  };

  const apply = async (row: GeoSiteTemplateRow) => {
    if (!pageId) {
      message.warning("请先在顶部选择一个页面，再套用模板");
      return;
    }
    const result = await actions.templateApply.mutateAsync({
      body: {
        templateId: row.id,
        pageId,
        mode: row.kind === "PAGE" ? "replace" : "append",
      },
    });
    // 服务端已经写完草稿，画布立刻跟着走：否则用户还得手动点一次保存才能看到结果
    onApplied?.(result?.content);
    message.success(
      row.kind === "PAGE"
        ? `已用「${row.name}」整页替换当前页面草稿，确认无误后记得发布`
        : `「${row.name}」已加到「${result?.title || pageTitle}」页尾，确认无误后记得发布`,
    );
  };

  return (
    <Panel
      title="模板库"
      titleExtra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          模板只是复制粘贴的便利，套用后写入当前页面的草稿，不发布不会影响线上。
        </Typography.Text>
      }
      extra={
        <Space size={6}>
          <Button
            icon={<SaveOutlined aria-hidden />}
            disabled={!selected}
            onClick={() => openSave("BLOCK")}
          >
            存选中区块
          </Button>
          <Button onClick={() => openSave("PAGE")}>存当前页面</Button>
        </Space>
      }
    >
      {query.error ? <Notice variant="error">{query.error.message}</Notice> : null}
      {!selected ? (
        <Notice variant="info">
          在画布里点选一个元素后，「存选中区块」才可用——这样存下来的模板就是一段可直接复用的区块。
        </Notice>
      ) : null}
      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={kind}
          options={[
            { value: "BLOCK", label: "区块模板" },
            { value: "PAGE", label: "整页模板" },
          ]}
          onChange={(value) => setKind(value as Kind)}
        />
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 720 }}
        columns={[
          {
            title: "名称",
            dataIndex: "name",
            width: 200,
            render: (_, row) => (
              <Space orientation="vertical" size={2}>
                <Typography.Text strong>{row.name}</Typography.Text>
                {row.note ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {row.note}
                  </Typography.Text>
                ) : null}
              </Space>
            ),
          },
          {
            title: "类型",
            dataIndex: "kind",
            width: 90,
            render: (_, row) => (
              <Tag color={row.kind === "PAGE" ? "blue" : "purple"}>
                {row.kindLabel}
              </Tag>
            ),
          },
          {
            title: "顶层区块",
            dataIndex: "elementCount",
            width: 90,
            render: (value: number) => `${value} 个`,
          },
          {
            title: "最近更新",
            dataIndex: "updatedAt",
            width: 160,
            render: (value: string) => fmtTime(value),
          },
          {
            title: "操作",
            key: "ops",
            width: 170,
            render: (_, row) => (
              <Space size={4}>
                <Tooltip
                  title={
                    pageId
                      ? row.kind === "PAGE"
                        ? "整页替换当前页面草稿"
                        : "追加到当前页面草稿末尾"
                      : "先在顶部选择页面"
                  }
                >
                  <Button
                    size="small"
                    type="primary"
                    loading={actions.templateApply.isPending}
                    disabled={!pageId}
                    onClick={() => void apply(row).catch(() => undefined)}
                  >
                    套用
                  </Button>
                </Tooltip>
                <Popconfirm
                  title="删除该模板？"
                  description="只删模板本身，已套用过的页面内容不受影响。"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={async () => {
                    await actions.templateRemove.mutateAsync({ body: { id: row.id } });
                    message.success("模板已删除");
                  }}
                >
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={!!saveOpen}
        title={saveOpen === "PAGE" ? "把当前页面存为整页模板" : "把选中区块存为模板"}
        okText="保存模板"
        okButtonProps={{ loading: actions.templateSave.isPending }}
        onCancel={() => setSaveOpen(null)}
        onOk={() => void submitSave().catch(() => undefined)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" key={saveOpen}>
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: "请填写模板名称" }]}
            extra="建议写成用途 + 形态，例如「三栏卖点区」「案例详情首屏」"
          >
            <Input maxLength={60} showCount placeholder="例如：三栏卖点区" />
          </Form.Item>
          <Form.Item name="note" label="备注（可选）">
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {saveOpen === "PAGE"
            ? `整页模板含画布当前 ${tree.length} 个顶层区块（含尚未保存的改动）。`
            : "区块模板只含选中的那一个元素及其子元素。"}
        </Typography.Text>
      </Modal>
    </Panel>
  );
}
