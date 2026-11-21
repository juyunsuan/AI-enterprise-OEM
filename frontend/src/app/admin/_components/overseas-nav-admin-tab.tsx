"use client";

import Image from "next/image";

import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  OverseasNavCategoryNode,
  OverseasNavCategoryRow,
  OverseasNavItemNode,
} from "@enterprise/contracts";
import { overseasNavApi } from "@/api/overseas-nav";
import styles from "./overseas-nav-admin-tab.module.css";

/** 接口返回扁平分类与条目，组回两级树供左侧分类栏渲染。 */
function buildTree(
  rows: OverseasNavCategoryRow[],
  items: OverseasNavItemNode[],
): OverseasNavCategoryNode[] {
  const nodes = rows.map((row) => ({
    ...row,
    items: [] as OverseasNavItemNode[],
    children: [] as OverseasNavCategoryNode[],
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const item of items) {
    byId.get(item.categoryId)?.items.push(item);
  }
  const roots: OverseasNavCategoryNode[] = [];
  for (const node of nodes) {
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      if (parent) parent.children.push(node);
      continue;
    }
    roots.push(node);
  }
  return roots;
}

type CategoryOption = {
  id: number;
  label: string;
  parentId: number | null;
  node: OverseasNavCategoryNode;
};

type CategoryForm = {
  id?: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
  visible: boolean;
};

type ItemForm = {
  id?: number;
  categoryId: number;
  title: string;
  description: string;
  url: string;
  logoUrl: string;
  sortOrder: number;
  visible: boolean;
};

const MAX_ITEMS = 1000000;

function normalizeUrl(raw: string) {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function SiteLogo({ logoUrl, title }: { logoUrl: string; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);
  if (!logoUrl || failed) {
    return (
      <div className={styles.logoFallback} aria-hidden>
        {(title || "?").slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <Image
      className={styles.logo}
      src={logoUrl}
      alt=""
      width={40}
      height={40}
      unoptimized
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/** 出海导航后台：左侧两级分类，右侧站点表格；支持 Logo、标题、简介、URL、排序、显隐与分类调整。 */
export function OverseasNavAdminTab() {
  const [rawCategories, setRawCategories] = useState<OverseasNavCategoryRow[]>([]);
  const [rawItems, setRawItems] = useState<OverseasNavItemNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [catForm, setCatForm] = useState<CategoryForm | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await overseasNavApi.adminTree();
      setRawCategories(data?.categories || []);
      setRawItems(data?.items || []);
    } catch (error) {
      message.error((error as Error).message || "读取出海导航失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => buildTree(rawCategories, rawItems),
    [rawCategories, rawItems],
  );

  const options = useMemo(() => {
    const rows: CategoryOption[] = [];
    for (const root of categories) {
      rows.push({ id: root.id, label: root.name, parentId: null, node: root });
      for (const child of root.children) {
        rows.push({
          id: child.id,
          label: `${root.name} / ${child.name}`,
          parentId: root.id,
          node: child,
        });
      }
    }
    return rows;
  }, [categories]);

  useEffect(() => {
    if (!options.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !options.some((option) => option.id === selectedId)) {
      setSelectedId(options[0].id);
    }
  }, [options, selectedId]);

  const selected = options.find((option) => option.id === selectedId) || null;
  const totalItems = useMemo(
    () =>
      categories.reduce((sum, root) => {
        const own = root.items.length;
        const children = root.children.reduce(
          (count, child) => count + child.items.length,
          0,
        );
        return sum + own + children;
      }, 0),
    [categories],
  );

  const items = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    const rows = selected?.node.items || [];
    if (!text) return rows;
    return rows.filter((item) =>
      `${item.title} ${item.description} ${item.url}`.toLowerCase().includes(text),
    );
  }, [selected, keyword]);

  const openNewRoot = () => {
    setCatForm({
      name: "",
      parentId: null,
      sortOrder: categories.length,
      visible: true,
    });
  };

  const openNewChild = (root: OverseasNavCategoryNode) => {
    setCatForm({
      name: "",
      parentId: root.id,
      sortOrder: root.children.length,
      visible: true,
    });
  };

  const openEditCategory = (node: OverseasNavCategoryNode) => {
    setCatForm({
      id: node.id,
      name: node.name,
      parentId: node.parentId,
      sortOrder: node.sortOrder,
      visible: node.visible,
    });
  };

  const saveCategory = async () => {
    if (!catForm) return;
    const name = catForm.name.trim();
    if (!name) {
      message.warning("请填写分类名称");
      return;
    }
    setSaving(true);
    try {
      await overseasNavApi.saveCategory({
        body: {
          ...(catForm.id ? { id: catForm.id } : {}),
          name,
          parentId: catForm.parentId,
          sortOrder: catForm.sortOrder,
          visible: catForm.visible,
        },
      });
      message.success("分类已保存");
      setCatForm(null);
      await load();
    } catch (error) {
      message.error((error as Error).message || "保存分类失败");
    } finally {
      setSaving(false);
    }
  };

  const removeCategory = (node: OverseasNavCategoryNode) => {
    const itemCount =
      node.items.length +
      node.children.reduce((sum, child) => sum + child.items.length, 0);
    Modal.confirm({
      title: `删除分类「${node.name}」？`,
      content:
        node.children.length || itemCount
          ? `该分类下的 ${node.children.length} 个子分类与 ${itemCount} 个站点会一并删除，且不可恢复。`
          : "删除后不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await overseasNavApi.removeCategory({ params: { id: String(node.id) } });
          message.success("分类已删除");
          if (selectedId === node.id) setSelectedId(null);
          await load();
        } catch (error) {
          message.error((error as Error).message || "删除分类失败");
        }
      },
    });
  };

  const openNewItem = () => {
    if (!selected) {
      message.warning("请先在左侧选择分类");
      return;
    }
    setItemForm({
      categoryId: selected.id,
      title: "",
      description: "",
      url: "",
      logoUrl: "",
      sortOrder: selected.node.items.length,
      visible: true,
    });
  };

  const openEditItem = (item: OverseasNavItemNode) => {
    setItemForm({
      id: item.id,
      categoryId: item.categoryId,
      title: item.title,
      description: item.description,
      url: item.url,
      logoUrl: item.logoUrl,
      sortOrder: item.sortOrder,
      visible: item.visible,
    });
  };

  const saveItem = async () => {
    if (!itemForm) return;
    const title = itemForm.title.trim();
    const url = normalizeUrl(itemForm.url);
    if (!title) {
      message.warning("请填写站点标题");
      return;
    }
    if (!url) {
      message.warning("请填写 http(s) 开头且有效的网址");
      return;
    }
    setSaving(true);
    try {
      await overseasNavApi.saveItem({
        body: {
          ...(itemForm.id ? { id: itemForm.id } : {}),
          categoryId: itemForm.categoryId,
          title,
          description: itemForm.description.trim(),
          url,
          logoUrl: itemForm.logoUrl.trim(),
          sortOrder: itemForm.sortOrder,
          visible: itemForm.visible,
        },
      });
      message.success("站点已保存");
      setItemForm(null);
      await load();
    } catch (error) {
      message.error((error as Error).message || "保存站点失败");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = (item: OverseasNavItemNode) => {
    Modal.confirm({
      title: `删除站点「${item.title}」？`,
      content: "删除后不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await overseasNavApi.removeItem({ params: { id: String(item.id) } });
          message.success("站点已删除");
          await load();
        } catch (error) {
          message.error((error as Error).message || "删除站点失败");
        }
      },
    });
  };

  const parentOptions = [
    { value: 0, label: "无（一级分类）" },
    ...categories
      .filter((root) => root.id !== catForm?.id)
      .map((root) => ({ value: root.id, label: root.name })),
  ];

  return (
    <div className={styles.layout}>
      <div className={styles.side}>
        <div className={styles.sideHead}>
          <span className={styles.title}>分类</span>
          <Space size={4}>
            <Tooltip title="刷新">
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={() => void load()}
              />
            </Tooltip>
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined />}
              onClick={openNewRoot}
            >
              一级分类
            </Button>
          </Space>
        </div>
        {categories.length ? (
          categories.map((root) => (
            <div key={root.id}>
              <div
                className={`${styles.catRow} ${
                  selectedId === root.id ? styles.catRowActive : ""
                }`}
                onClick={() => {
                  setSelectedId(root.id);
                  setPage(1);
                }}
              >
                <span className={styles.catName}>{root.name}</span>
                {!root.visible ? <Tag>隐藏</Tag> : null}
                <span
                  className={styles.catActions}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Tooltip title="新增子分类">
                    <Button
                      size="small"
                      type="text"
                      icon={<PlusOutlined />}
                      onClick={() => openNewChild(root)}
                    />
                  </Tooltip>
                  <Tooltip title="编辑分类">
                    <Button
                      size="small"
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => openEditCategory(root)}
                    />
                  </Tooltip>
                  <Tooltip title="删除分类">
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeCategory(root)}
                    />
                  </Tooltip>
                </span>
              </div>
              {root.children.map((child) => (
                <div
                  key={child.id}
                  className={`${styles.catRow} ${styles.catChild} ${
                    selectedId === child.id ? styles.catRowActive : ""
                  }`}
                  onClick={() => {
                    setSelectedId(child.id);
                    setPage(1);
                  }}
                >
                  <span className={styles.catName}>{child.name}</span>
                  {!child.visible ? <Tag>隐藏</Tag> : null}
                  <span
                    className={styles.catActions}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Tooltip title="编辑分类">
                      <Button
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => openEditCategory(child)}
                      />
                    </Tooltip>
                    <Tooltip title="删除分类">
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeCategory(child)}
                      />
                    </Tooltip>
                  </span>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className={styles.empty}>还没有分类</div>
        )}
      </div>

      <div className={styles.main}>
        <div className={styles.toolbar}>
          <h3 className={styles.title}>{selected ? selected.label : "站点"}</h3>
          <span className={styles.meta}>
            {selected ? `${selected.node.items.length} 个站点` : ""} · 全站{" "}
            {totalItems} 个
          </span>
          <div style={{ flex: 1 }} />
          <Input.Search
            allowClear
            placeholder="搜索标题 / 简介 / 网址"
            style={{ width: 240 }}
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!selected}
            onClick={openNewItem}
          >
            新增站点
          </Button>
        </div>

        {selected ? (
          <Table
            rowKey="id"
            size="middle"
            loading={loading}
            dataSource={items}
            pagination={{
              current: page,
              pageSize: 12,
              onChange: setPage,
              showSizeChanger: false,
            }}
            columns={[
              {
                title: "站点",
                dataIndex: "title",
                render: (_: unknown, row: OverseasNavItemNode) => (
                  <Space>
                    <SiteLogo logoUrl={row.logoUrl} title={row.title} />
                    <span className={styles.nameCell}>
                      <span className={styles.nameTitle}>{row.title}</span>
                      <span className={styles.nameDesc}>
                        {row.description || "—"}
                      </span>
                    </span>
                  </Space>
                ),
              },
              {
                title: "网址",
                dataIndex: "url",
                width: 240,
                render: (value: string) => (
                  <a href={value} target="_blank" rel="noopener noreferrer">
                    {value}
                  </a>
                ),
              },
              { title: "排序", dataIndex: "sortOrder", width: 70 },
              {
                title: "状态",
                dataIndex: "visible",
                width: 80,
                render: (value: boolean) =>
                  value ? <Tag color="green">显示</Tag> : <Tag>隐藏</Tag>,
              },
              {
                title: "操作",
                width: 150,
                render: (_: unknown, row: OverseasNavItemNode) => (
                  <Space size={4}>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEditItem(row)}
                    >
                      编辑
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeItem(row)}
                    />
                  </Space>
                ),
              },
            ]}
          />
        ) : (
          <div className={styles.empty}>先在左侧选择分类</div>
        )}
      </div>

      <Modal
        open={Boolean(catForm)}
        title={catForm?.id ? "编辑分类" : "新增分类"}
        confirmLoading={saving}
        onCancel={() => setCatForm(null)}
        onOk={() => void saveCategory()}
        okText="保存"
        cancelText="取消"
      >
        {catForm ? (
          <Space orientation="vertical" style={{ width: "100%" }} size={12}>
            <label>
              <div className={styles.meta}>分类名称</div>
              <Input
                maxLength={100}
                value={catForm.name}
                onChange={(event) =>
                  setCatForm({ ...catForm, name: event.target.value })
                }
                placeholder="例如：海外网络"
              />
            </label>
            <label>
              <div className={styles.meta}>父分类</div>
              <Select
                style={{ width: "100%" }}
                options={parentOptions}
                value={catForm.parentId ?? 0}
                onChange={(value) =>
                  setCatForm({ ...catForm, parentId: value === 0 ? null : value })
                }
              />
            </label>
            <Space size={24}>
              <label>
                <div className={styles.meta}>排序（越小越前）</div>
                <InputNumber
                  min={0}
                  max={MAX_ITEMS}
                  value={catForm.sortOrder}
                  onChange={(value) =>
                    setCatForm({ ...catForm, sortOrder: Number(value) || 0 })
                  }
                />
              </label>
              <label>
                <div className={styles.meta}>显示</div>
                <Switch
                  checked={catForm.visible}
                  onChange={(checked) =>
                    setCatForm({ ...catForm, visible: checked })
                  }
                />
              </label>
            </Space>
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(itemForm)}
        title={itemForm?.id ? "编辑站点" : "新增站点"}
        confirmLoading={saving}
        onCancel={() => setItemForm(null)}
        onOk={() => void saveItem()}
        okText="保存"
        cancelText="取消"
        width={620}
      >
        {itemForm ? (
          <Space orientation="vertical" style={{ width: "100%" }} size={12}>
            <label>
              <div className={styles.meta}>分类</div>
              <Select
                showSearch
                optionFilterProp="label"
                style={{ width: "100%" }}
                options={options.map((option) => ({
                  value: option.id,
                  label: option.label,
                }))}
                value={itemForm.categoryId}
                onChange={(value) =>
                  setItemForm({ ...itemForm, categoryId: value })
                }
              />
            </label>
            <label>
              <div className={styles.meta}>标题</div>
              <Input
                maxLength={200}
                value={itemForm.title}
                onChange={(event) =>
                  setItemForm({ ...itemForm, title: event.target.value })
                }
                placeholder="例如：IpDeep 全球代理 IP"
              />
            </label>
            <label>
              <div className={styles.meta}>简介</div>
              <Input.TextArea
                rows={3}
                maxLength={500}
                value={itemForm.description}
                onChange={(event) =>
                  setItemForm({ ...itemForm, description: event.target.value })
                }
                placeholder="一句话说明这个站点能做什么"
              />
            </label>
            <label>
              <div className={styles.meta}>网址</div>
              <Input
                maxLength={500}
                value={itemForm.url}
                onChange={(event) =>
                  setItemForm({ ...itemForm, url: event.target.value })
                }
                placeholder="https://example.com"
              />
            </label>
            <label>
              <div className={styles.meta}>Logo 地址（可空，留空显示首字母）</div>
              <Input
                maxLength={500}
                value={itemForm.logoUrl}
                onChange={(event) =>
                  setItemForm({ ...itemForm, logoUrl: event.target.value })
                }
                placeholder="https://example.com/logo.png"
              />
            </label>
            <Space size={24}>
              <label>
                <div className={styles.meta}>排序（越小越前）</div>
                <InputNumber
                  min={0}
                  max={MAX_ITEMS}
                  value={itemForm.sortOrder}
                  onChange={(value) =>
                    setItemForm({ ...itemForm, sortOrder: Number(value) || 0 })
                  }
                />
              </label>
              <label>
                <div className={styles.meta}>显示</div>
                <Switch
                  checked={itemForm.visible}
                  onChange={(checked) =>
                    setItemForm({ ...itemForm, visible: checked })
                  }
                />
              </label>
            </Space>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
}