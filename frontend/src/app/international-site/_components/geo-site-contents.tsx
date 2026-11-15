"use client";

import type { GeoSiteLanguage } from "@enterprise/contracts";
import { useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  useGeoSiteCmsActions,
  useGeoSiteContent,
  useGeoSiteContents,
  useGeoSitePages,
  type GeoSiteContentRow,
} from "@/query/geo-site";
import { newId, type GeoSiteNode } from "./geo-site-elements";
import { Notice } from "@/components/ui/panel";

/**
 * 站点内容库：文章与产品两类，正文存成与页面同构的元素树。
 * 列表 / 详情页由渲染层自动取这里的数据，站长只管写内容，不用回头改页面。
 */

type Kind = "article" | "product";

const BLOCK_TYPES = [
  { value: "h2", label: "小标题" },
  { value: "p", label: "段落" },
  { value: "list", label: "要点列表" },
  { value: "image", label: "图片" },
  { value: "button", label: "按钮" },
];

type Block = {
  id: string;
  type: string;
  text: string;
  image: string;
  href: string;
};

const BLOCK_STYLE: Record<string, Record<string, string | number>> = {
  h2: { fontSize: 26, lineHeight: 1.35, color: "#0f172a", margin: "22px 0 10px" },
  p: { fontSize: 15, lineHeight: 1.85, color: "#475569", margin: "0 0 12px" },
  list: { paddingLeft: 20, lineHeight: 1.9, color: "#475569" },
  image: { width: "100%", borderRadius: 12, margin: "8px 0 14px" },
  button: {
    display: "inline-block",
    padding: "12px 28px",
    fontSize: 15,
    color: "#ffffff",
    background: "#2563eb",
    borderRadius: 999,
    margin: "6px 0 14px",
  },
};

function blockOf(type: string): Block {
  return {
    id: newId(),
    type,
    text: type === "list" ? "第一条要点\n第二条要点" : type === "image" ? "" : "在这里写内容",
    image: "",
    href: type === "button" ? "#contact" : "",
  };
}

/** 元素 → 编辑块：认得的类型还原成块，认不出的原样留下并在保存时追加回树尾。 */
function splitBody(elements: GeoSiteNode[]): { blocks: Block[]; kept: GeoSiteNode[] } {
  const blocks: Block[] = [];
  const kept: GeoSiteNode[] = [];
  const content = (node: GeoSiteNode) =>
    node.content && !Array.isArray(node.content)
      ? (node.content as Record<string, unknown>)
      : {};
  for (const node of elements) {
    const data = content(node);
    if (
      node.type === "h2" ||
      node.type === "p" ||
      node.type === "list" ||
      node.type === "button"
    ) {
      blocks.push({
        id: node.id,
        type: node.type,
        text: String(data.innerText ?? ""),
        image: "",
        href: String(data.href ?? ""),
      });
    } else if (node.type === "image") {
      blocks.push({
        id: node.id,
        type: "image",
        text: String(data.altText ?? ""),
        image: String(data.imageUrl ?? ""),
        href: String(data.destinationUrl ?? ""),
      });
    } else {
      kept.push(node);
    }
  }
  return { blocks, kept };
}

function bodyOf(blocks: Block[], kept: GeoSiteNode[]): GeoSiteNode[] {
  const built = blocks.map((block) => ({
    id: block.id || newId(),
    name: block.type,
    type: block.type,
    category: block.type === "p" || block.type === "h2" ? "text" : "basic",
    styles: BLOCK_STYLE[block.type] || {},
    content:
      block.type === "image"
        ? { imageUrl: block.image, altText: block.text, destinationUrl: block.href }
        : block.type === "button"
          ? { innerText: block.text, href: block.href }
          : { innerText: block.text },
  })) as GeoSiteNode[];
  return [...built, ...kept];
}

type MetaForm = {
  title: string;
  slug?: string;
  summary?: string;
  category?: string;
  coverImage?: string;
  tags?: string[];
  authorName?: string;
  price?: number;
  unit?: string;
  priceOnAsk?: boolean;
  buyUrl?: string;
  featured?: boolean;
};

export function ContentPanel({ siteId }: { siteId: number }) {
  const { message } = App.useApp();
  const [kind, setKind] = useState<Kind>("article");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [lang, setLang] = useState<GeoSiteLanguage | "">("");
  const bootstrap = useGeoSitePages(siteId);
  const defaultLanguage = bootstrap.data?.defaultLanguage ?? "zh-CN";
  const languages = bootstrap.data?.languages ?? [defaultLanguage];
  const languageOptions = bootstrap.data?.languageOptions ?? [];
  const activeLang = lang || defaultLanguage;
  const labelOf = (code: string) =>
    languageOptions.find((item) => item.code === code)?.label || code;
  const [editing, setEditing] = useState<{ id: number } | null>(null);
  const query = useGeoSiteContents(siteId, kind, {
    status,
    q,
    page,
    lang: activeLang,
  });
  const detail = useGeoSiteContent(editing?.id ?? 0, kind);
  const actions = useGeoSiteCmsActions();
  const [form] = Form.useForm<MetaForm>();
  const [blocks, setBlocks] = useState<Block[]>([blockOf("p")]);
  const [kept, setKept] = useState<GeoSiteNode[]>([]);
  const rows = query.data?.items ?? [];

  useEffect(() => {
    const data = detail.data;
    if (!data || data.id !== editing?.id) return;
    form.setFieldsValue({
      title: data.title,
      slug: data.slug,
      summary: data.summary,
      category: data.category,
      coverImage: data.coverImage,
      tags: data.tags,
      authorName: data.authorName,
      price: (data as { price?: number }).price,
      unit: (data as { unit?: string }).unit,
      priceOnAsk: (data as { priceOnAsk?: boolean }).priceOnAsk,
      buyUrl: (data as { buyUrl?: string }).buyUrl,
      featured: (data as { featured?: boolean }).featured,
    });
    const split = splitBody((data.body ?? []) as GeoSiteNode[]);
    setBlocks(split.blocks.length ? split.blocks : [blockOf("p")]);
    setKept(split.kept);
  }, [detail.data, editing?.id, form]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ priceOnAsk: false, featured: false });
    setBlocks([blockOf("p")]);
    setKept([]);
    setEditing({ id: 0 });
  };

  const patchBlock = (index: number, next: Partial<Block>) =>
    setBlocks((current) =>
      current.map((row, i) => (i === index ? { ...row, ...next } : row)),
    );

  const moveBlock = (index: number, delta: number) =>
    setBlocks((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = async () => {
    const values = await form.validateFields();
    const meta = {
      kind,
      title: values.title.trim(),
      slug: (values.slug || "").trim(),
      summary: (values.summary || "").trim(),
      category: (values.category || "").trim(),
      coverImage: (values.coverImage || "").trim(),
      tags: values.tags ?? [],
      authorName: (values.authorName || "").trim(),
      price: Number(values.price ?? 0),
      unit: (values.unit || "").trim(),
      priceOnAsk: !!values.priceOnAsk,
      buyUrl: (values.buyUrl || "").trim(),
      featured: !!values.featured,
    };
    const body = bodyOf(blocks.filter((row) => String(row.text || row.image).trim()), kept);
    const id = editing?.id
      ? editing.id
      : Number(
          (
            await actions.contentCreate.mutateAsync({
              body: { siteId, lang: activeLang, ...meta },
            })
          )?.id,
        );
    if (!id) return;
    await actions.contentUpdate.mutateAsync({ body: { id, ...meta } });
    await actions.contentSaveBody.mutateAsync({ body: { id, kind, content: body } });
    setEditing(null);
    message.success("内容已保存草稿，发布后进入列表页与详情页");
  };

  const columns = useMemo(
    () => [
      {
        title: "标题",
        dataIndex: "title",
        render: (value: string, row: GeoSiteContentRow) => (
          <Space orientation="vertical" size={0}>
            <Typography.Text strong>{value}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              /{row.slug || "（未生成别名）"}
              {row.category ? ` · ${row.category}` : ""}
              {kind === "product"
                ? ` · ${(row as { priceOnAsk?: boolean }).priceOnAsk
                    ? "按需报价"
                    : `${(row as { price?: number }).price ?? 0}${(row as { unit?: string }).unit || "元"}`}`
                : ""}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "语言",
        dataIndex: "langLabel",
        width: 100,
        render: (value: string, row: GeoSiteContentRow) => (
          <Tag color={row.lang === defaultLanguage ? "blue" : "default"}>
            {value || row.lang}
          </Tag>
        ),
      },
      {
        title: "状态",
        dataIndex: "status",
        width: 110,
        render: (value: string) => (
          <Tag color={value === "PUBLISHED" ? "green" : "default"}>
            {value === "PUBLISHED" ? "已发布" : "草稿"}
          </Tag>
        ),
      },
      { title: "浏览", dataIndex: "viewCount", width: 80 },
      {
        title: "更新",
        dataIndex: "updatedAt",
        width: 160,
        render: (value: string) => new Date(value).toLocaleString(),
      },
      {
        title: "操作",
        key: "ops",
        width: 220,
        render: (_: unknown, row: GeoSiteContentRow) => (
          <Space size={4}>
            <Button
              size="small"
              onClick={() => setEditing({ id: row.id })}
            >
              编辑
            </Button>
            {row.status === "PUBLISHED" ? (
              <Button
                size="small"
                loading={actions.contentOffline.isPending}
                onClick={async () => {
                  await actions.contentOffline.mutateAsync({ body: { id: row.id, kind } });
                  message.success("已下线");
                }}
              >
                下线
              </Button>
            ) : (
              <Button
                size="small"
                type="primary"
                loading={actions.contentPublish.isPending}
                onClick={async () => {
                  await actions.contentPublish.mutateAsync({ body: { id: row.id, kind } });
                  message.success("已发布，列表页即刻收录");
                }}
              >
                发布
              </Button>
            )}
            <Popconfirm
              title="删除该内容？"
              description="删除后已发布快照一并失效，指向它的菜单会落回列表页。"
              onConfirm={async () => {
                await actions.contentRemove.mutateAsync({ body: { id: row.id, kind } });
              }}
            >
              <Button size="small" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [actions, kind, message, defaultLanguage],
  );

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap>
        <Segmented
          options={[
            { value: "article", label: "文章" },
            { value: "product", label: "产品" },
          ]}
          value={kind}
          onChange={(value) => {
            setKind(value as Kind);
            setPage(1);
          }}
        />
        <Input.Search
          allowClear
          style={{ width: 220 }}
          placeholder="按标题搜索"
          onSearch={(value) => {
            setQ(value);
            setPage(1);
          }}
        />
        <Select
          style={{ width: 130 }}
          value={status}
          options={[
            { value: "", label: "全部状态" },
            { value: "PUBLISHED", label: "已发布" },
            { value: "DRAFT", label: "草稿" },
          ]}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <Select
          style={{ width: 150 }}
          value={activeLang}
          options={languages.map((code) => ({ value: code, label: labelOf(code) }))}
          onChange={(value) => {
            setLang(value);
            setPage(1);
          }}
        />
        <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={openCreate}>
          新建{kind === "article" ? "文章" : "产品"}
        </Button>
      </Space>
      <Notice variant="info">
        文章与产品按语言各自成库：列表页只收录当前语言的已发布内容，详情页同样按语言取数，缺译时不会回落到其他语言。发布后由「{kind === "article" ? "文章" : "产品"}
        列表页」自动取数展示，详情页套用站点的详情模板。
      </Notice>
      <Table<GeoSiteContentRow>
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 860 }}
        pagination={{
          current: query.data?.page ?? page,
          pageSize: query.data?.pageSize ?? 20,
          total: query.data?.total ?? 0,
          showSizeChanger: false,
          onChange: (next) => setPage(next),
        }}
      />

      <Drawer
        title={
          editing?.id
            ? `编辑${kind === "article" ? "文章" : "产品"}`
            : `新建${kind === "article" ? "文章" : "产品"} · ${labelOf(activeLang)}`
        }
        open={!!editing}
        width={760}
        onClose={() => setEditing(null)}
        extra={
          <Space>
            <Button onClick={() => setEditing(null)}>取消</Button>
            <Button type="primary" loading={actions.contentSaveBody.isPending} onClick={save}>
              保存草稿
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: "请填写标题" }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Space size={12} style={{ display: "flex" }} align="start">
            <Form.Item name="slug" label="访问别名" extra="留空由标题自动生成，只用小写字母数字与连字符">
              <Input style={{ width: 300 }} maxLength={120} />
            </Form.Item>
            <Form.Item name="category" label="分类">
              <Input style={{ width: 200 }} maxLength={60} />
            </Form.Item>
          </Space>
          <Form.Item name="summary" label="摘要" extra="列表卡片与搜索结果展示，建议 80 字内">
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          <Form.Item name="coverImage" label="封面图链接">
            <Input maxLength={1000} placeholder="https://…" />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" maxCount={12} placeholder="回车确认，最多 12 个" />
          </Form.Item>
          {kind === "article" ? (
            <Form.Item name="authorName" label="作者署名">
              <Input style={{ width: 300 }} maxLength={60} />
            </Form.Item>
          ) : (
            <Space size={12} wrap align="start">
              <Form.Item name="price" label="价格">
                <InputNumber style={{ width: 140 }} min={0} />
              </Form.Item>
              <Form.Item name="unit" label="单位">
                <Input style={{ width: 120 }} maxLength={20} placeholder="元/年" />
              </Form.Item>
              <Form.Item name="priceOnAsk" label="按需报价" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="featured" label="首页推荐" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="buyUrl" label="购买/咨询链接">
                <Input style={{ width: 320 }} maxLength={1000} placeholder="https://…" />
              </Form.Item>
            </Space>
          )}
        </Form>

        <Typography.Title level={5}>正文</Typography.Title>
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          {blocks.map((block, index) => (
            <div
              key={block.id || index}
              style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}
            >
              <Space size={6} style={{ marginBottom: 8 }} wrap>
                <Select
                  size="small"
                  style={{ width: 120 }}
                  value={block.type}
                  options={BLOCK_TYPES}
                  onChange={(value) => patchBlock(index, { type: value })}
                />
                <Tooltip title="上移">
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined aria-hidden />}
                    disabled={index <= 0}
                    onClick={() => moveBlock(index, -1)}
                  />
                </Tooltip>
                <Tooltip title="下移">
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined aria-hidden />}
                    disabled={index >= blocks.length - 1}
                    onClick={() => moveBlock(index, 1)}
                  />
                </Tooltip>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined aria-hidden />}
                  onClick={() => setBlocks((current) => current.filter((_, i) => i !== index))}
                />
              </Space>
              {block.type === "image" ? (
                <Space orientation="vertical" size={6} style={{ width: "100%" }}>
                  <Input
                    placeholder="图片链接 https://…"
                    value={block.image}
                    onChange={(event) => patchBlock(index, { image: event.target.value })}
                  />
                  <Input
                    placeholder="图片说明（alt）"
                    value={block.text}
                    onChange={(event) => patchBlock(index, { text: event.target.value })}
                  />
                </Space>
              ) : block.type === "button" ? (
                <Space size={6} style={{ display: "flex" }} align="start">
                  <Input
                    placeholder="按钮文字"
                    value={block.text}
                    onChange={(event) => patchBlock(index, { text: event.target.value })}
                  />
                  <Input
                    style={{ width: 260 }}
                    placeholder="跳转地址"
                    value={block.href}
                    onChange={(event) => patchBlock(index, { href: event.target.value })}
                  />
                </Space>
              ) : (
                <Input.TextArea
                  autoSize={{ minRows: block.type === "p" ? 2 : 1, maxRows: 10 }}
                  value={block.text}
                  placeholder={block.type === "list" ? "一行一条要点" : "写内容"}
                  onChange={(event) => patchBlock(index, { text: event.target.value })}
                />
              )}
            </div>
          ))}
          <Space>
            {BLOCK_TYPES.map((item) => (
              <Button
                key={item.value}
                size="small"
                icon={<PlusOutlined aria-hidden />}
                onClick={() => setBlocks((current) => [...current, blockOf(item.value)])}
              >
                {item.label}
              </Button>
            ))}
          </Space>
        </Space>
      </Drawer>
    </Space>
  );
}
