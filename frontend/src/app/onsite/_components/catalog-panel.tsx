"use client";
// 分类与标签：服务目录的两个辅助维度，字段少、改动频繁，共用一套「表格 + 弹窗表单」写法。
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
import { useState } from "react";
import {
  ONSITE_LABEL_TYPE_LABELS,
  ONSITE_LABEL_TYPES,
  type OnsiteCategoryInput,
  type OnsiteCategoryRow,
  type OnsiteLabelInput,
  type OnsiteLabelRow,
} from "@enterprise/contracts";
import { EmptyState, Panel } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";
import {
  useOnsiteCatalogActions,
  useOnsiteCategories,
  useOnsiteLabels,
} from "@/query/onsite";
import { DataTable, FilterBar } from "./list-kit";
import { statusText } from "./onsite-common";

const THUMB = {
  width: 40,
  height: 40,
  borderRadius: 6,
  objectFit: "cover" as const,
  background: "#fafafa",
};

/** 分类表单值：契约的 id 单独在提交时补，弹窗里只管业务字段。 */
type CategoryForm = Omit<OnsiteCategoryInput, "id">;
type LabelForm = Omit<OnsiteLabelInput, "id">;

const NEW_CATEGORY: CategoryForm = {
  parentId: 0,
  name: "",
  image: "",
  sortOrder: 0,
  enabled: true,
};

const NEW_LABEL: LabelForm = {
  name: "",
  type: "FEATURE",
  sortOrder: 0,
  enabled: true,
};

const labelTypeOf = (type: string): LabelForm["type"] =>
  type === "REVIEW" ? "REVIEW" : "FEATURE";

export function CatalogPanel({
  shopId,
  onOpenServices,
}: {
  shopId: number;
  onOpenServices: () => void;
}) {
  const { modal } = App.useApp();
  const actions = useOnsiteCatalogActions();
  const query = useOnsiteCategories({ shopId });
  const rows = query.data?.list ?? [];
  const [editing, setEditing] = useState<{ open: boolean; row: OnsiteCategoryRow | null }>({
    open: false,
    row: null,
  });
  const nameOf = (id: number) => rows.find((item) => item.id === id)?.name ?? "";

  const removeRow = (row: OnsiteCategoryRow) => {
    modal.confirm({
      title: `删除分类「${row.name}」`,
      content: "删除后小程序分类页少一个入口；分类本身不带服务时才可删除，历史服务不受影响。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.removeCategory.mutateAsync({
          params: { id: String(shopId) },
          body: { id: row.id },
        });
      },
    });
  };

  const columns: TableProps<OnsiteCategoryRow>["columns"] = [
    {
      title: "分类名称",
      dataIndex: "name",
      width: 220,
      render: (_, row) => (
        <div>
          <div>{row.name}</div>
          {row.parentId ? (
            <div className="muted text-12">上级：{nameOf(row.parentId)}</div>
          ) : (
            <div className="muted text-12">一级分类</div>
          )}
        </div>
      ),
    },
    {
      title: "图标",
      dataIndex: "image",
      width: 80,
      render: (value: string) =>
        value ? <RawImg src={value} alt="" style={THUMB} /> : <span className="muted">—</span>,
    },
    { title: "排序", dataIndex: "sortOrder", width: 80 },
    {
      title: "已挂服务",
      dataIndex: "serviceCount",
      width: 140,
      render: (value: number) =>
        value ? (
          // 分类下有服务时后端会拦删除，这里直接把下一步入口给出来
          <Button size="small" type="link" onClick={onOpenServices}>
            {value} 个 · 去改分类
          </Button>
        ) : (
          <span className="muted">0 个</span>
        ),
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? "green" : "default"}>{value ? "显示中" : "已停用"}</Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button
            size="small"
            type="link"
            icon={<EditOutlined aria-hidden />}
            onClick={() => setEditing({ open: true, row })}
          >
            编辑
          </Button>
          {row.serviceCount ? null : (
            <Button size="small" type="link" danger onClick={() => removeRow(row)}>
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="服务分类"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ open: true, row: null })}
        >
          新建分类
        </Button>
      }
    >
      {rows.length || query.isFetching ? (
        <DataTable<OnsiteCategoryRow>
          rows={rows}
          columns={columns}
          page={1}
          loading={query.isFetching}
        />
      ) : (
        <EmptyState
          text="还没有分类。分类决定小程序首页与分类页的分组，建议先按服务大类建 2-4 个。"
          action={
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden />}
              onClick={() => setEditing({ open: true, row: null })}
            >
              新建分类
            </Button>
          }
        />
      )}
      <div className="muted text-12" style={{ marginTop: 8 }}>
        分类最多两级；停用的分类在小程序里不出现，但已挂在其中的服务仍照常可售。
      </div>
      <CategoryModal
        shopId={shopId}
        editing={editing}
        categories={rows}
        onClose={() => setEditing({ open: false, row: null })}
      />
    </Panel>
  );
}

function CategoryModal({
  shopId,
  editing,
  categories,
  onClose,
}: {
  shopId: number;
  editing: { open: boolean; row: OnsiteCategoryRow | null };
  categories: OnsiteCategoryRow[];
  onClose: () => void;
}) {
  const row = editing.row;
  const initial: CategoryForm = row
    ? {
        parentId: row.parentId,
        name: row.name,
        image: row.image,
        sortOrder: row.sortOrder,
        enabled: row.enabled,
      }
    : NEW_CATEGORY;
  // 只有没有下级的分类能当上级，否则就成了三级
  const parentOptions = [
    { value: 0, label: "作为一级分类" },
    ...categories
      .filter((item) => item.parentId === 0 && item.id !== row?.id)
      .map((item) => ({ value: item.id, label: `挂在「${item.name}」下（二级）` })),
  ];

  return (
    <Modal
      open={editing.open}
      title={row ? `编辑分类「${row.name}」` : "新建分类"}
      width={520}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      {editing.open ? (
        <CategoryFormBlock
          key={row?.id ?? "new"}
          shopId={shopId}
          rowId={row?.id}
          initial={initial}
          parentOptions={parentOptions}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function CategoryFormBlock({
  shopId,
  rowId,
  initial,
  parentOptions,
  onClose,
}: {
  shopId: number;
  rowId?: number;
  initial: CategoryForm;
  parentOptions: { value: number; label: string }[];
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const save = useOnsiteCatalogActions().saveCategory;
  const [form] = Form.useForm<CategoryForm>();

  const submit = async () => {
    const values = await form.validateFields();
    await save.mutateAsync({
      params: { id: String(shopId) },
      body: rowId ? { ...values, id: rowId } : values,
    });
    message.success(rowId ? "分类已保存" : "分类已创建，挂上服务并上架后才会在小程序显示");
    onClose();
  };

  return (
    <Form form={form} layout="vertical" initialValues={initial}>
      <Form.Item
        name="name"
        label="分类名称"
        rules={[{ required: true, message: "请填写分类名称" }]}
        extra="小程序分类页与首页金刚区显示的名字"
      >
        <Input maxLength={60} placeholder="如：中式推拿" />
      </Form.Item>
      <Form.Item name="parentId" label="上级分类" extra="不选即一级分类；分类只支持两级">
        <Select options={parentOptions} />
      </Form.Item>
      <Form.Item name="image" label="分类图标" extra="对象存储或数字资产直链，留空用默认占位">
        <Input maxLength={500} placeholder="https://…" />
      </Form.Item>
      <Space wrap align="start">
        <Form.Item
          name="sortOrder"
          label="排序值"
          extra="越小越靠前"
          style={{ width: 160 }}
        >
          <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="enabled"
          label="是否在小程序显示"
          valuePropName="checked"
          style={{ width: 180 }}
        >
          <Switch />
        </Form.Item>
      </Space>
      <Space>
        <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
          保存分类
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}

export function LabelPanel({
  shopId,
  onOpenServices,
}: {
  shopId: number;
  onOpenServices: () => void;
}) {
  const { modal } = App.useApp();
  const actions = useOnsiteCatalogActions();
  const [type, setType] = useState("all");
  const query = useOnsiteLabels({ shopId }, type);
  const rows = query.data?.list ?? [];
  const [editing, setEditing] = useState<{ open: boolean; row: OnsiteLabelRow | null }>({
    open: false,
    row: null,
  });

  const removeRow = (row: OnsiteLabelRow) => {
    modal.confirm({
      title: `删除标签「${row.name}」`,
      content: row.usageCount
        ? `该标签已挂在 ${row.usageCount} 个服务上，删除会同时解除这些引用，服务详情页与评价页会少这一项。`
        : "该标签还没被引用，删除不影响任何服务。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.removeLabel.mutateAsync({
          params: { id: String(shopId) },
          body: { id: row.id },
        });
      },
    });
  };

  const columns: TableProps<OnsiteLabelRow>["columns"] = [
    { title: "标签名称", dataIndex: "name", width: 200 },
    {
      title: "类型",
      dataIndex: "type",
      width: 140,
      render: (value: string) => (
        <Tag color={value === "FEATURE" ? "blue" : "purple"}>
          {statusText("labelType", value)}
        </Tag>
      ),
    },
    { title: "排序", dataIndex: "sortOrder", width: 80 },
    {
      title: "被引用",
      dataIndex: "usageCount",
      width: 140,
      render: (value: number) =>
        value ? (
          <Button size="small" type="link" onClick={onOpenServices}>
            {value} 个服务 · 去勾选
          </Button>
        ) : (
          <span className="muted">未使用</span>
        ),
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? "green" : "default"}>{value ? "可用" : "已停用"}</Tag>
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
            onClick={() => setEditing({ open: true, row })}
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
      title="标签"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ open: true, row: null })}
        >
          新建标签
        </Button>
      }
    >
      <FilterBar>
        <Select
          style={{ width: 180 }}
          value={type}
          onChange={(value: string) => setType(value)}
          options={[
            { value: "all", label: "全部类型" },
            ...ONSITE_LABEL_TYPES.map((value) => ({
              value,
              label: ONSITE_LABEL_TYPE_LABELS[value],
            })),
          ]}
        />
        <span className="muted text-12">
          服务卖点在「服务」页签的服务编辑里勾选；评价词给顾客在评价页勾选，两者互不影响。
        </span>
      </FilterBar>
      {rows.length || query.isFetching ? (
        <DataTable<OnsiteLabelRow>
          rows={rows}
          columns={columns}
          page={1}
          loading={query.isFetching}
        />
      ) : (
        <EmptyState
          text={
            type === "all"
              ? "还没有标签。卖点标签让服务详情页更有说服力，评价词让顾客评价时一键勾选。"
              : `「${ONSITE_LABEL_TYPE_LABELS[type] ?? type}」还没有标签，新建一个再勾到服务上。`
          }
          action={
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden />}
              onClick={() => setEditing({ open: true, row: null })}
            >
              新建标签
            </Button>
          }
        />
      )}
      <LabelModal
        shopId={shopId}
        editing={editing}
        defaultType={type}
        onClose={() => setEditing({ open: false, row: null })}
      />
    </Panel>
  );
}

function LabelModal({
  shopId,
  editing,
  defaultType,
  onClose,
}: {
  shopId: number;
  editing: { open: boolean; row: OnsiteLabelRow | null };
  defaultType: string;
  onClose: () => void;
}) {
  const row = editing.row;
  // 新建时默认落在当前筛选的类型上，契约只认 FEATURE / REVIEW 两个值
  const initial: LabelForm = row
    ? { name: row.name, type: row.type, sortOrder: row.sortOrder, enabled: row.enabled }
    : { ...NEW_LABEL, type: labelTypeOf(defaultType) };
  return (
    <Modal
      open={editing.open}
      title={row ? `编辑标签「${row.name}」` : "新建标签"}
      width={520}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      {editing.open ? (
        <LabelFormBlock
          key={row?.id ?? "new"}
          shopId={shopId}
          rowId={row?.id}
          initial={initial}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function LabelFormBlock({
  shopId,
  rowId,
  initial,
  onClose,
}: {
  shopId: number;
  rowId?: number;
  initial: LabelForm;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const save = useOnsiteCatalogActions().saveLabel;
  const [form] = Form.useForm<LabelForm>();

  const submit = async () => {
    const values = await form.validateFields();
    await save.mutateAsync({
      params: { id: String(shopId) },
      body: rowId ? { ...values, id: rowId } : values,
    });
    message.success(rowId ? "标签已保存" : "标签已创建，勾到服务上才会对外展示");
    onClose();
  };

  return (
    <Form form={form} layout="vertical" initialValues={initial}>
      <Form.Item
        name="name"
        label="标签名称"
        rules={[{ required: true, message: "请填写标签名称" }]}
        extra="短词最好，如「手法专业」「准时到达」"
      >
        <Input maxLength={40} />
      </Form.Item>
      <Form.Item name="type" label="类型" rules={[{ required: true }]}>
        <Select
          options={ONSITE_LABEL_TYPES.map((value) => ({
            value,
            label: ONSITE_LABEL_TYPE_LABELS[value],
          }))}
        />
      </Form.Item>
      <Space wrap align="start">
        <Form.Item name="sortOrder" label="排序值" extra="越小越靠前" style={{ width: 160 }}>
          <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="enabled"
          label="可用"
          valuePropName="checked"
          extra="停用后不能在服务编辑里勾选"
          style={{ width: 200 }}
        >
          <Switch />
        </Form.Item>
      </Space>
      <Space>
        <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
          保存标签
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}
