"use client";

import type { GeoSiteLanguage } from "@enterprise/contracts";
import { useMemo, useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  useGeoSiteCmsActions,
  useGeoSiteMenus,
  useGeoSitePages,
  useGeoSitePickers,
  type GeoSiteMenuRow,
} from "@/query/geo-site";
import { Notice } from "@/components/ui/panel";

/**
 * 菜单管理：顶部导航与页脚导航各一棵两级树。
 * 链接目标可以直接选站点页面 / 内容库文章产品，也可以填外部地址或页内锚点——
 * 指向页面的菜单在页面改名或换路径后自动跟着变，不需要回头维护菜单。
 */

const TARGET_OPTIONS = [
  { value: "PAGE", label: "站点页面" },
  { value: "ARTICLE", label: "文章" },
  { value: "PRODUCT", label: "产品" },
  { value: "URL", label: "外部链接" },
  { value: "ANCHOR", label: "页内锚点" },
];

const LOCATIONS = [
  { value: "HEADER", label: "顶部导航" },
  { value: "FOOTER", label: "页脚导航" },
];

/** 契约里 children 是 unknown[]（递归 schema 会把 openapi 生成打爆），这里按同型收敛。 */
type MenuNode = Omit<GeoSiteMenuRow, "children"> & { children: MenuNode[] };

function asTree(rows: GeoSiteMenuRow[] | undefined, location: string): MenuNode[] {
  return (rows ?? [])
    .filter((row) => row.location === location)
    .map((row) => ({
      ...(row as Omit<GeoSiteMenuRow, "children">),
      children: asTree((row.children ?? []) as GeoSiteMenuRow[], location),
    }));
}

type MenuForm = {
  label: string;
  targetType: string;
  targetId?: number;
  url?: string;
  visible: boolean;
  openNewTab: boolean;
};

export function MenuPanel({
  siteId,
  onOpenPage,
}: {
  siteId: number;
  onOpenPage?: (pageId: number) => void;
}) {
  const { message } = App.useApp();
  const [location, setLocation] = useState("HEADER");
  const [lang, setLang] = useState<GeoSiteLanguage | "">("");
  const bootstrap = useGeoSitePages(siteId);
  const defaultLanguage = bootstrap.data?.defaultLanguage ?? "zh-CN";
  const languages = bootstrap.data?.languages ?? [defaultLanguage];
  const languageOptions = bootstrap.data?.languageOptions ?? [];
  const activeLang = lang || defaultLanguage;
  const labelOf = (code: string) =>
    languageOptions.find((item) => item.code === code)?.label || code;
  const menus = useGeoSiteMenus(siteId, activeLang);
  const pickers = useGeoSitePickers(siteId);
  const actions = useGeoSiteCmsActions();
  const [editing, setEditing] = useState<{ row?: MenuNode; parentId: number } | null>(
    null,
  );
  const [form] = Form.useForm<MenuForm>();
  const tree = useMemo(
    () => asTree(menus.data ?? [], location),
    [menus.data, location],
  );
  const targetType = Form.useWatch("targetType", form);

  const targetOptions = useMemo(() => {
    const rows = pickers.data;
    const pageLabel = (item: NonNullable<typeof rows>["pages"][number]) =>
      `${item.isHome ? "首页" : item.title}（${item.href || "/"}）`;
    return {
      PAGE: (rows?.pages ?? [])
        .filter((item) => item.lang === activeLang)
        .map((item) => ({ value: item.id, label: pageLabel(item) })),
      ARTICLE: (rows?.articles ?? [])
        .filter((item) => item.lang === activeLang)
        .map((item) => ({
          value: item.id,
          label: `${item.title}${item.category ? ` · ${item.category}` : ""}`,
        })),
      PRODUCT: (rows?.products ?? [])
        .filter((item) => item.lang === activeLang)
        .map((item) => ({
          value: item.id,
          label: `${item.title}${item.category ? ` · ${item.category}` : ""}`,
        })),
    } as Record<string, { value: number; label: string }[]>;
  }, [pickers.data, activeLang]);

  const openCreate = (parentId = 0) => {
    form.resetFields();
    form.setFieldsValue({ targetType: "PAGE", visible: true, openNewTab: false });
    setEditing({ parentId });
  };

  const openEdit = (row: MenuNode) => {
    form.setFieldsValue({
      label: row.label,
      targetType: row.targetType,
      targetId: row.targetId || undefined,
      url: row.url,
      visible: row.visible,
      openNewTab: row.openNewTab,
    });
    setEditing({ row, parentId: row.parentId });
  };

  const submit = async () => {
    const values = await form.validateFields();
    const body = {
      label: values.label.trim(),
      targetType: values.targetType as
        | "PAGE"
        | "ARTICLE"
        | "PRODUCT"
        | "URL"
        | "ANCHOR",
      targetId: values.targetId ?? 0,
      url: (values.url || "").trim(),
      visible: values.visible,
      openNewTab: values.openNewTab,
    };
    if (editing?.row) {
      await actions.menuUpdate.mutateAsync({ body: { id: editing.row.id, ...body } });
      message.success("菜单已更新，发布站点后生效");
    } else {
      await actions.menuCreate.mutateAsync({
        body: {
          siteId,
          lang: activeLang,
          location: location as "HEADER" | "FOOTER",
          parentId: editing?.parentId ?? 0,
          ...body,
        },
      });
      message.success("菜单已添加，发布站点后生效");
    }
    setEditing(null);
  };

  /** 同级重排：整层按新顺序重发 sort，一次请求落库（后端只认 id/parentId/sort）。 */
  const reorder = async (siblings: MenuNode[], index: number, delta: number) => {
    const next = [...siblings];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const items = next.map((row, sort) => ({
      id: row.id,
      parentId: row.parentId,
      sort,
    }));
    // 另一层没动的项也按原样提交，避免 saveTree 把没列出的节点当成要挪位的
    const untouched = (menus.data ?? [])
      .filter(
        (row) =>
          row.location === location &&
          (row.lang ?? defaultLanguage) === activeLang &&
          !items.some((item) => item.id === row.id),
      )
      .map((row) => ({ id: row.id, parentId: row.parentId, sort: row.sort }));
    await actions.menuSaveTree.mutateAsync({
      body: {
        siteId,
        location: location as "HEADER" | "FOOTER",
        lang: activeLang,
        items: [...items, ...untouched],
      },
    });
  };

  const renderNode = (row: MenuNode, siblings: MenuNode[], index: number) => (
    <Space key={row.id} size={6} style={{ display: "flex", justifyContent: "space-between" }}>
      <Space size={6} wrap>
        <Typography.Text>{row.label}</Typography.Text>
        {!row.visible ? <Tag>已隐藏</Tag> : null}
        {row.openNewTab ? <Tag color="blue">新窗口</Tag> : null}
        {row.parentId ? <Tag color="purple">二级</Tag> : null}
        {row.targetType === "PAGE" && onOpenPage ? (
          <Button size="small" type="link" onClick={() => onOpenPage(row.targetId)}>
            打开页面
          </Button>
        ) : null}
      </Space>
      <Space size={4}>
        <Tooltip title="上移">
          <Button
            size="small"
            icon={<ArrowUpOutlined aria-hidden />}
            disabled={index <= 0}
            onClick={() => reorder(siblings, index, -1)}
          />
        </Tooltip>
        <Tooltip title="下移">
          <Button
            size="small"
            icon={<ArrowDownOutlined aria-hidden />}
            disabled={index >= siblings.length - 1}
            onClick={() => reorder(siblings, index, 1)}
          />
        </Tooltip>
        <Button size="small" onClick={() => openEdit(row)}>
          编辑
        </Button>
        {row.parentId ? null : (
          <Button size="small" onClick={() => openCreate(row.id)}>
            子项
          </Button>
        )}
        <Switch
          size="small"
          checked={row.visible}
          loading={actions.menuUpdate.isPending}
          onChange={async (checked) => {
            await actions.menuUpdate.mutateAsync({ body: { id: row.id, visible: checked } });
          }}
        />
        <Popconfirm
          title="删除该菜单？"
          description="二级项会一起删除。"
          onConfirm={async () => {
            await actions.menuRemove.mutateAsync({ body: { id: row.id } });
          }}
        >
          <Button size="small" danger>
            删除
          </Button>
        </Popconfirm>
      </Space>
    </Space>
  );

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap>
        <Segmented
          options={LOCATIONS}
          value={location}
          onChange={(value) => setLocation(String(value))}
        />
        <Select
          style={{ minWidth: 160 }}
          value={activeLang}
          onChange={(value) => setLang(value)}
          options={languages.map((code) => ({ value: code, label: labelOf(code) }))}
        />
      </Space>
      <Notice variant="info">
        菜单按语言各维护一套，改完记得点「发布」；访客语言缺菜单时，前台整层回落到默认语言（
        {labelOf(defaultLanguage)}）的菜单。顶部最多两级，页脚为单级平铺。
      </Notice>
      <Space>
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => openCreate(0)}
        >
          添加菜单项
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {labelOf(activeLang)} · {LOCATIONS.find((item) => item.value === location)?.label}共{" "}
          {tree.length} 项
        </Typography.Text>
      </Space>
      {menus.isPending ? null : tree.length === 0 ? (
        <Empty
          description={`「${labelOf(activeLang)}」还没有菜单项，发布站点后该语言前台只显示品牌名`}
        />
      ) : (
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          {tree.map((row, index) => (
            <div key={row.id}>
              {renderNode(row, tree, index)}
              {row.children.length ? (
                <div style={{ marginLeft: 24, marginTop: 6 }}>
                  <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                    {row.children.map((child, childIndex) =>
                      renderNode(child, row.children, childIndex),
                    )}
                  </Space>
                </div>
              ) : null}
            </div>
          ))}
        </Space>
      )}

      <Modal
        title={editing?.row ? "编辑菜单项" : "添加菜单项"}
        open={!!editing}
        destroyOnHidden
        okText="保存"
        onCancel={() => setEditing(null)}
        onOk={submit}
      >
        <Form form={form} layout="vertical">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            当前语言：{labelOf(activeLang)}
            {editing?.row ? "" : "（新建菜单项会写入该语言）"}
          </Typography.Text>
          <Form.Item
            name="label"
            label="菜单文字"
            rules={[{ required: true, message: "请填写菜单文字" }]}
          >
            <Input maxLength={60} placeholder="例如：产品中心" />
          </Form.Item>
          <Form.Item name="targetType" label="链接到">
            <Select options={TARGET_OPTIONS} />
          </Form.Item>
          {targetType === "URL" || targetType === "ANCHOR" ? (
            <Form.Item
              name="url"
              label={targetType === "ANCHOR" ? "页内锚点" : "外部地址"}
              rules={[
                {
                  required: true,
                  message: targetType === "ANCHOR" ? "锚点要以 # 开头" : "请填写 https 地址",
                },
              ]}
              extra={
                targetType === "ANCHOR"
                  ? "在当前页面内定位，需与元素生成的 id 一致"
                  : "只支持 http/https 绝对地址"
              }
            >
              <Input maxLength={500} placeholder={targetType === "ANCHOR" ? "#contact" : "https://…"} />
            </Form.Item>
          ) : (
            <Form.Item
              name="targetId"
              label="选择目标"
              rules={[{ required: true, message: "请选择要链接的内容" }]}
              extra={
                targetType === "PAGE"
                  ? "列表 / 详情页要选对应类型的页面，否则导航点进去取不到数"
                  : "只有已发布的文章 / 产品才能被访客访问"
              }
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="选择页面 / 文章 / 产品"
                options={targetOptions[targetType || "PAGE"] ?? []}
              />
            </Form.Item>
          )}
          <Space size={16}>
            <Form.Item name="visible" valuePropName="checked" label="显示">
              <Checkbox>在导航中显示</Checkbox>
            </Form.Item>
            <Form.Item name="openNewTab" valuePropName="checked" label="打开方式">
              <Checkbox>新标签页打开</Checkbox>
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
