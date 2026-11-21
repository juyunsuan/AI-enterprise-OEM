"use client";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Spin,
  Switch,
  Tag,
} from "antd";
import { useState } from "react";
import type { BrandCategoryTree } from "@enterprise/contracts";
import { useBrandCategories, useBrandGoodsActions } from "@/query/brand-mall";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { ImageUrlField } from "@/components/ui/image-field";

/**
 * 分类树：选分类筛右侧商品，同时就地增删改与排序。
 *
 * 排序按契约口径提交「同级 id 的新顺序」（后端按下标写 sortOrder），
 * 所以上下移动只重排同一层；换父级走编辑表单里的层级归属。
 */
type EditTarget = {
  node: BrandCategoryTree | null;
  /** 0 = 顶级；新建子分类时是被点的父分类 id。 */
  parentId: number;
};

const LIMITS = { nameMax: 30, iconMax: 500, imageMax: 500, sortOrderMax: 9999, levelMax: 3 };

export function CategoryTree({
  shopId,
  selected,
  onSelect,
}: {
  shopId: number;
  selected: number;
  onSelect: (categoryId: number) => void;
}) {
  const { message, modal } = App.useApp();
  const actions = useBrandGoodsActions();
  const query = useBrandCategories({ shopId });
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const tree = query.data ?? [];

  const save = async (values: CategoryFormValues) => {
    await actions.saveCategory.mutateAsync({
      body: {
        shopId,
        id: editing?.node?.id,
        parentId: editing?.parentId ?? 0,
        name: values.name.trim(),
        icon: values.icon ?? "",
        image: values.image ?? "",
        sortOrder: values.sortOrder ?? 0,
        enabled: values.enabled,
      },
    });
    message.success(editing?.node ? "分类已更新" : "分类已新建");
    setEditing(null);
  };

  const remove = (node: BrandCategoryTree) => {
    modal.confirm({
      title: `删除分类「${node.name}」`,
      content: node.children.length
        ? "该分类下还有子分类：请先删完子分类，或改用停用。分类里的商品不会被删，只会变成未分类。"
        : "分类里的商品不会被删，只会变成未分类。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.removeCategory.mutateAsync({ body: { shopId, id: node.id } });
        if (selected === node.id) onSelect(0);
        message.success("分类已删除");
      },
    });
  };

  const move = (siblings: BrandCategoryTree[], index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= siblings.length) return;
    const next = [...siblings];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    void actions.sortCategories.mutateAsync({
      body: { shopId, ids: next.map((item) => item.id) },
    });
  };

  return (
    <Panel
      title="商品分类"
      extra={
        <Button
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ node: null, parentId: 0 })}
        >
          新建顶级
        </Button>
      }
    >
      {query.isPending && !query.data ? (
        <div style={{ padding: 16, textAlign: "center" }}>
          <Spin />
        </div>
      ) : query.isError ? (
        <Notice variant="error">分类读取失败：{query.error.message || "请稍后重试"}</Notice>
      ) : !tree.length ? (
        <EmptyState
          text="还没有分类。建好分类，小程序的分类页与商品筛选才有归属。"
          action={
            <Button type="primary" onClick={() => setEditing({ node: null, parentId: 0 })}>
              新建第一个分类
            </Button>
          }
        />
      ) : (
        <Space orientation="vertical" size={2} style={{ width: "100%" }}>
          <Row
            depth={0}
            label="全部分类"
            active={selected === 0}
            onSelect={() => onSelect(0)}
          />
          <CategoryRows
            nodes={tree}
            level={0}
            selected={selected}
            onSelect={onSelect}
            onEdit={(node) => setEditing({ node, parentId: node.parentId })}
            onAddChild={(node) => setEditing({ node: null, parentId: node.id })}
            onRemove={remove}
            onMove={move}
          />
        </Space>
      )}
      {editing ? (
        <CategoryForm
          key={editing.node?.id ?? `new-${editing.parentId}`}
          target={editing}
          saving={actions.saveCategory.isPending}
          onCancel={() => setEditing(null)}
          onSave={(values) => void save(values)}
        />
      ) : null}
    </Panel>
  );
}

function CategoryRows({
  nodes,
  level,
  selected,
  onSelect,
  onEdit,
  onAddChild,
  onRemove,
  onMove,
}: {
  nodes: BrandCategoryTree[];
  level: number;
  selected: number;
  onSelect: (categoryId: number) => void;
  onEdit: (node: BrandCategoryTree) => void;
  onAddChild: (node: BrandCategoryTree) => void;
  onRemove: (node: BrandCategoryTree) => void;
  onMove: (siblings: BrandCategoryTree[], index: number, offset: number) => void;
}) {
  return (
    <>
      {nodes.map((node, index) => (
        <div key={node.id}>
          <Row
            depth={level}
            label={node.name}
            count={node.productCount}
            disabled={!node.enabled}
            active={selected === node.id}
            onSelect={() => onSelect(node.id === selected ? 0 : node.id)}
            actions={
              <>
                {level + 1 < LIMITS.levelMax ? (
                  <Button
                    size="small"
                    type="text"
                    aria-label="新建子分类"
                    title="新建子分类"
                    icon={<PlusOutlined aria-hidden />}
                    onClick={() => onAddChild(node)}
                  />
                ) : null}
                <Button
                  size="small"
                  type="text"
                  aria-label="编辑分类"
                  title="编辑"
                  icon={<EditOutlined aria-hidden />}
                  onClick={() => onEdit(node)}
                />
                <Button
                  size="small"
                  type="text"
                  aria-label="上移"
                  title="上移"
                  icon={<ArrowUpOutlined aria-hidden />}
                  disabled={index === 0}
                  onClick={() => onMove(nodes, index, -1)}
                />
                <Button
                  size="small"
                  type="text"
                  aria-label="下移"
                  title="下移"
                  icon={<ArrowDownOutlined aria-hidden />}
                  disabled={index === nodes.length - 1}
                  onClick={() => onMove(nodes, index, 1)}
                />
                <Button
                  size="small"
                  type="text"
                  danger
                  aria-label="删除分类"
                  title="删除"
                  icon={<DeleteOutlined aria-hidden />}
                  onClick={() => onRemove(node)}
                />
              </>
            }
          />
          {node.children.length ? (
            <CategoryRows
              nodes={node.children}
              level={level + 1}
              selected={selected}
              onSelect={onSelect}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onRemove={onRemove}
              onMove={onMove}
            />
          ) : null}
        </div>
      ))}
    </>
  );
}

function Row({
  depth,
  label,
  count,
  disabled,
  active,
  onSelect,
  actions,
}: {
  depth: number;
  label: string;
  count?: number;
  disabled?: boolean;
  active: boolean;
  onSelect: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        paddingLeft: 8 + depth * 16,
        borderRadius: 6,
        cursor: "pointer",
        background: active ? "rgba(22, 119, 255, 0.08)" : "transparent",
        color: active ? "var(--brand, #1677ff)" : undefined,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      {disabled ? <Tag>已停用</Tag> : null}
      {count !== undefined ? (
        <span className="muted text-12">{count}</span>
      ) : null}
      <Space size={0} onClick={(event) => event.stopPropagation()}>
        {actions}
      </Space>
    </div>
  );
}

type CategoryFormValues = {
  name: string;
  icon: string;
  image: string;
  sortOrder: number;
  enabled: boolean;
};

/** 新建/编辑分类：只在打开时挂载，`key` 随目标变，initialValues 直接来自被编辑的分类。 */
function CategoryForm({
  target,
  saving,
  onSave,
  onCancel,
}: {
  target: EditTarget;
  saving: boolean;
  onSave: (values: CategoryFormValues) => void;
  onCancel: () => void;
}) {
  const [form] = Form.useForm<CategoryFormValues>();
  return (
    <Modal
      open
      destroyOnHidden
      title={
        target.node
          ? `编辑分类：${target.node.name}`
          : target.parentId
            ? "新建子分类"
            : "新建顶级分类"
      }
      okText="保存"
      onCancel={onCancel}
      onOk={async () => {
        onSave(await form.validateFields());
      }}
      confirmLoading={saving}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: target.node?.name ?? "",
          icon: target.node?.icon ?? "",
          image: target.node?.image ?? "",
          sortOrder: target.node?.sortOrder ?? 0,
          enabled: target.node?.enabled ?? true,
        }}
      >
        <Form.Item
          name="name"
          label="分类名称"
          rules={[{ required: true, message: "请填写分类名称" }]}
        >
          <Input maxLength={LIMITS.nameMax} placeholder="如：时令水果" />
        </Form.Item>
        <Form.Item
          name="icon"
          label="图标"
          extra="小程序分类页取图片；这里可以填一个 emoji 作兜底"
        >
          <Input maxLength={LIMITS.iconMax} placeholder="🍎 或图标地址" />
        </Form.Item>
        <Form.Item name="image" label="分类图片">
          <ImageUrlField />
        </Form.Item>
        <Form.Item
          name="sortOrder"
          label="排序值"
          extra="同级内数字越小越靠前；也可以直接在列表里上下移动"
        >
          <InputNumber min={0} max={LIMITS.sortOrderMax} precision={0} style={{ width: 160 }} />
        </Form.Item>
        <Form.Item
          name="enabled"
          label="启用"
          valuePropName="checked"
          extra="停用后小程序端不再显示该分类"
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
