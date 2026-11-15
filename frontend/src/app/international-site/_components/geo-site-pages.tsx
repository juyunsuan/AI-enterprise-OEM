"use client";

import type { GeoSiteLanguage } from "@enterprise/contracts";
import { useState } from "react";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  HomeOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  useGeoSiteCmsActions,
  useGeoSitePages,
  type GeoSitePageRow,
} from "@/query/geo-site";
import { Notice } from "@/components/ui/panel";

/**
 * 页面管理：一个站点对应多页，路径决定公开访问地址，类型决定取数方式。
 * 「编辑」把编辑器切到该页，其余操作（首页/发布/下线/排序/删除）都在这里闭环。
 */

const KIND_OPTIONS = [
  { value: "landing", label: "落地页" },
  { value: "articleList", label: "文章列表" },
  { value: "productList", label: "产品列表" },
  { value: "articleDetail", label: "文章详情模板" },
  { value: "productDetail", label: "产品详情模板" },
  { value: "blank", label: "空白页" },
  { value: "custom", label: "自定义" },
];

const LIST_KINDS = new Set(["articleList", "productList"]);

type CreateForm = {
  title: string;
  path?: string;
  kind: string;
  contentType?: string;
  template?: string;
  pageSize?: number;
  lang?: string;
};

export function PagePanel({
  siteId,
  currentId,
  onPick,
}: {
  siteId: number;
  currentId: number;
  onPick: (pageId: number) => void;
}) {
  const { message } = App.useApp();
  const query = useGeoSitePages(siteId);
  const actions = useGeoSiteCmsActions();
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState<GeoSitePageRow | null>(null);
  const [langFilter, setLangFilter] = useState<GeoSiteLanguage | "">("");
  const [form] = Form.useForm<CreateForm>();
  const [copyForm] = Form.useForm<{ lang: string; title?: string }>();
  const pages = query.data?.pages ?? [];
  const templates = query.data?.templates ?? [];
  const defaultLanguage = query.data?.defaultLanguage ?? "zh-CN";
  const languages = query.data?.languages ?? [defaultLanguage];
  const languageOptions = query.data?.languageOptions ?? [];
  const labelOf = (code: string) =>
    languageOptions.find((item) => item.code === code)?.label || code;
  const shownPages = langFilter
    ? pages.filter((row) => row.lang === langFilter)
    : pages;
  const kind = Form.useWatch("kind", form);
  const move = async (index: number, delta: number) => {
    const next = [...pages];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await actions.pageReorder.mutateAsync({
      body: { siteId, ids: next.map((row) => row.id) },
    });
  };

  const templateOptions = Array.from(new Set(templates.map((item) => item.group))).map(
    (group) => ({
      label: group,
      options: templates
        .filter((item) => item.group === group)
        .map((item) => ({ value: item.key, label: item.label })),
    }),
  );

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Notice variant="info">
        页面路径决定访问地址：默认语言（{labelOf(defaultLanguage)}）不带前缀，其余语言落在
        /语言码/ 下。留空路径 = 该语言首页；列表 / 详情类页面由内容库按语言自动取数。
        已发布的页面要重新发布站点后才会进入线上快照。
      </Notice>
      <Space wrap>
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ kind: "custom", lang: defaultLanguage });
            setOpen(true);
          }}
        >
          新建页面
        </Button>
        <Select
          allowClear
          placeholder="全部语言"
          style={{ minWidth: 160 }}
          value={langFilter || undefined}
          onChange={(value) => setLangFilter(value || "")}
          options={languages.map((code) => ({ value: code, label: labelOf(code) }))}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          共 {shownPages.length} 个页面
          {langFilter ? `（${labelOf(langFilter)}）` : ""}
        </Typography.Text>
      </Space>
      <Table<GeoSitePageRow>
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={shownPages}
        pagination={false}
        scroll={{ x: 980 }}
        rowClassName={(row) => (row.id === currentId ? "gs-row-current" : "")}
        columns={[
          {
            title: "标题",
            dataIndex: "title",
            render: (value: string, row) => (
              <Space size={6}>
                {row.isHome ? <Tag color="blue">首页</Tag> : null}
                <Typography.Text strong={row.id === currentId}>
                  {value}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: "语言",
            dataIndex: "langLabel",
            width: 100,
            render: (value: string, row) => (
              <Tag color={row.lang === defaultLanguage ? "blue" : "default"}>
                {value}
              </Tag>
            ),
          },
          {
            title: "路径",
            dataIndex: "path",
            width: 180,
            render: (value: string, row) => (
              <Tooltip title={`站内地址 ${row.href || "/"}`}>
                <Typography.Text code>
                  {value ? `/${value}` : "（首页）"}
                </Typography.Text>
              </Tooltip>
            ),
          },
          {
            title: "类型",
            dataIndex: "kindLabel",
            width: 130,
            render: (value: string, row) =>
              LIST_KINDS.has(row.kind) && row.contentType
                ? `${value}·${row.contentType === "product" ? "产品" : "文章"}`
                : value,
          },
          {
            title: "状态",
            key: "status",
            width: 150,
            render: (_, row) => (
              <Space size={4}>
                <Tag color={row.published ? "green" : "default"}>
                  {row.published ? "已发布" : "未发布"}
                </Tag>
                {row.hasContent ? null : <Tag>空</Tag>}
                {row.scriptCount ? <Tag color="purple">JS {row.scriptCount}</Tag> : null}
              </Space>
            ),
          },
          {
            title: "操作",
            key: "ops",
            width: 430,
            render: (_, row) => {
              const index = pages.findIndex((item) => item.id === row.id);
              return (
                <Space size={4} wrap>
                  <Button
                    size="small"
                    type={row.id === currentId ? "default" : "primary"}
                    disabled={row.id === currentId}
                    onClick={() => onPick(row.id)}
                  >
                    {row.id === currentId ? "编辑中" : "编辑"}
                  </Button>
                  {row.published ? (
                    <Button
                      size="small"
                      loading={actions.pageOffline.isPending}
                      onClick={async () => {
                        await actions.pageOffline.mutateAsync({ body: { id: row.id } });
                        message.success("页面已下线，公开地址返回 404");
                      }}
                    >
                      下线
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      loading={actions.pagePublish.isPending}
                      onClick={async () => {
                        await actions.pagePublish.mutateAsync({ body: { id: row.id } });
                        message.success("页面已发布");
                      }}
                    >
                      发布
                    </Button>
                  )}
                  {languages.length > 1 ? (
                    <Button
                      size="small"
                      icon={<CopyOutlined aria-hidden />}
                      onClick={() => {
                        const target =
                          languages.find((code) => code !== row.lang) ??
                          defaultLanguage;
                        copyForm.resetFields();
                        copyForm.setFieldsValue({
                          lang: target,
                          title: row.title,
                        });
                        setCopying(row);
                      }}
                    >
                      复制
                    </Button>
                  ) : null}
                  {row.isHome ? null : (
                    <Popconfirm
                      title="设为首页？"
                      description={`切换为「${row.langLabel}」的首页：该语言根路径改指向此页，其他语言首页不变。`}
                      onConfirm={async () => {
                        await actions.pageSetHome.mutateAsync({ body: { id: row.id } });
                        message.success("已切换首页");
                      }}
                    >
                      <Button size="small" icon={<HomeOutlined aria-hidden />}>
                        设首页
                      </Button>
                    </Popconfirm>
                  )}
                  <Tooltip
                    title={langFilter ? "按语言筛选时不可排序（排序写入全局顺序）" : "上移"}
                  >
                    <Button
                      size="small"
                      icon={<ArrowUpOutlined aria-hidden />}
                      disabled={Boolean(langFilter) || index <= 0}
                      onClick={() => move(index, -1)}
                    />
                  </Tooltip>
                  <Tooltip
                    title={langFilter ? "按语言筛选时不可排序（排序写入全局顺序）" : "下移"}
                  >
                    <Button
                      size="small"
                      icon={<ArrowDownOutlined aria-hidden />}
                      disabled={
                        Boolean(langFilter) ||
                        index < 0 ||
                        index >= pages.length - 1
                      }
                      onClick={() => move(index, 1)}
                    />
                  </Tooltip>
                  {row.isHome ? (
                    <Tooltip title="首页不能删除">
                      <Button size="small" danger disabled>
                        删除
                      </Button>
                    </Tooltip>
                  ) : (
                    <Popconfirm
                      title="删除该页面？"
                      description="删除草稿与线上快照，指向它的菜单会自动落回首页。"
                      onConfirm={async () => {
                        await actions.pageRemove.mutateAsync({ body: { id: row.id } });
                        message.success("页面已删除");
                      }}
                    >
                      <Button size="small" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              );
            },
          },
        ]}
      />

      <Modal
        title="新建页面"
        open={open}
        destroyOnHidden
        okText="创建并编辑"
        onCancel={() => setOpen(false)}
        onOk={async () => {
          const values = await form.validateFields();
          const created = await actions.pageCreate.mutateAsync({
            body: {
              siteId,
              title: values.title.trim(),
              path: (values.path || "").trim(),
              kind: values.kind as
                | "landing"
                | "articleList"
                | "articleDetail"
                | "productList"
                | "productDetail"
                | "blank"
                | "custom",
              contentType: values.contentType || "",
              template: values.template || "",
              pageSize: values.pageSize || undefined,
              lang: (values.lang || defaultLanguage) as GeoSiteLanguage,
            },
          });
          setOpen(false);
          if (created?.id) {
            onPick(created.id);
            message.success("页面已创建，可直接编辑");
          }
        }}
      >
        <Form form={form} layout="vertical" initialValues={{ kind: "custom" }}>
          <Form.Item name="lang" label="页面语言" rules={[{ required: true }]}>
            <Select
              options={languages.map((code) => ({ value: code, label: labelOf(code) }))}
            />
          </Form.Item>
          <Form.Item
            name="title"
            label="页面标题"
            rules={[{ required: true, message: "请填写页面标题" }]}
          >
            <Input maxLength={120} placeholder="例如：产品中心" />
          </Form.Item>
          <Form.Item
            name="path"
            label="访问路径"
            extra={
              <>
                相对该语言的站点根目录，不带斜杠开头。默认语言的地址是
                /路径，其他语言是 /语言码/路径；留空则由标题自动生成。
              </>
            }
          >
            <Input maxLength={180} placeholder="留空则由标题自动生成" />
          </Form.Item>
          <Form.Item name="kind" label="页面类型">
            <Select options={KIND_OPTIONS} />
          </Form.Item>
          {kind && LIST_KINDS.has(kind) ? (
            <Form.Item
              name="contentType"
              label="取数内容"
              extra="列表页从内容库自动取数，按发布时间倒序"
              rules={[{ required: true, message: "列表页要选内容类型" }]}
            >
              <Select
                options={[
                  { value: "article", label: "文章" },
                  { value: "product", label: "产品" },
                ]}
              />
            </Form.Item>
          ) : null}
          {kind && LIST_KINDS.has(kind) ? (
            <Form.Item name="pageSize" label="每页条数">
              <InputNumber min={1} max={60} placeholder="默认 9" style={{ width: 160 }} />
            </Form.Item>
          ) : null}
          <Form.Item
            name="template"
            label="起始模板"
            extra="模板只铺版式，创建后仍可自由拖拽改结构"
          >
            <Select
              allowClear
              placeholder="不使用模板（空白页）"
              options={templateOptions}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={copying ? `复制「${copying.title}」到其他语言` : "复制页面"}
        open={Boolean(copying)}
        destroyOnHidden
        okText="复制"
        okButtonProps={{ loading: actions.pageCopyToLanguage.isPending }}
        onCancel={() => setCopying(null)}
        onOk={async () => {
          if (!copying) return;
          const values = await copyForm.validateFields();
          const created = await actions.pageCopyToLanguage.mutateAsync({
            body: {
              id: copying.id,
              lang: values.lang as GeoSiteLanguage,
              title: (values.title || "").trim() || undefined,
            },
          });
          setCopying(null);
          if (created?.id) onPick(created.id);
          message.success("已复制为新语言的草稿页面");
        }}
      >
        <Form form={copyForm} layout="vertical">
          <Form.Item
            name="lang"
            label="目标语言"
            extra="只复制版式与静态区块；内容库条目仍按语言各自绑定，复制后需要重新发布站点。"
            rules={[{ required: true, message: "请选择目标语言" }]}
          >
            <Select
              options={languages
                .filter((code) => code !== copying?.lang)
                .map((code) => ({ value: code, label: labelOf(code) }))}
            />
          </Form.Item>
          <Form.Item name="title" label="新页面标题">
            <Input maxLength={120} placeholder="留空则沿用原标题" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
