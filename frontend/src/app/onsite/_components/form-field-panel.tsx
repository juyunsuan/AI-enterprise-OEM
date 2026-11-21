"use client";
// 留资表单字段库：字段在这里定义，文章页勾选后才出现在顾客端，字段类型决定端上渲染哪种控件。
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Tag } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import {
  ONSITE_FORM_FIELD_TYPES,
  ONSITE_FORM_FIELD_TYPE_LABELS,
  type OnsiteFormFieldInput,
  type OnsiteFormFieldRow,
} from "@enterprise/contracts";
import { EmptyState, Panel } from "@/components/ui/panel";
import { useOnsiteContentActions, useOnsiteFormFields } from "@/query/onsite";
import { DataTable } from "./list-kit";
import { statusText } from "./onsite-common";

const OPTIONS_MAX = 30;

type FieldForm = Omit<OnsiteFormFieldInput, "id">;

const NEW_FIELD: FieldForm = {
  name: "",
  fieldType: "text",
  options: [],
  placeholder: "",
  required: true,
  sortOrder: 0,
  enabled: true,
};

export function FormFieldPanel({
  shopId,
  onOpenArticles,
}: {
  shopId: number;
  onOpenArticles: () => void;
}) {
  const { modal } = App.useApp();
  const actions = useOnsiteContentActions();
  const query = useOnsiteFormFields({ shopId });
  const rows = query.data?.list ?? [];
  const [editing, setEditing] = useState<{ open: boolean; row: OnsiteFormFieldRow | null }>({
    open: false,
    row: null,
  });

  const removeRow = (row: OnsiteFormFieldRow) => {
    modal.confirm({
      title: `删除字段「${row.name}」`,
      content: row.articleCount
        ? `有 ${row.articleCount} 篇文章挂了这个字段，删除会同时从这些文章的表单里移除；已提交的留资记录仍保留当时的答案文本。`
        : "该字段还没被任何文章引用，删除没有副作用。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.removeFormField.mutateAsync({
          params: { id: String(shopId) },
          body: { id: row.id },
        });
      },
    });
  };

  const columns: TableProps<OnsiteFormFieldRow>["columns"] = [
    { title: "字段名称", dataIndex: "name", width: 200 },
    {
      title: "类型",
      dataIndex: "fieldType",
      width: 120,
      render: (value: string) => <Tag>{statusText("fieldType", value)}</Tag>,
    },
    {
      title: "选项 / 占位提示",
      dataIndex: "options",
      width: 260,
      render: (_, row) => (
        <div>
          <div>{row.options.length ? row.options.join("、") : <span className="muted">无选项</span>}</div>
          <div className="muted text-12">{row.placeholder || "没有占位提示"}</div>
        </div>
      ),
    },
    {
      title: "必填",
      dataIndex: "required",
      width: 90,
      render: (value: boolean) => (value ? <Tag color="red">必填</Tag> : <span className="muted">可空</span>),
    },
    { title: "排序", dataIndex: "sortOrder", width: 80 },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? "green" : "default"}>{value ? "可用" : "已停用"}</Tag>
      ),
    },
    {
      title: "被引用",
      dataIndex: "articleCount",
      width: 150,
      render: (value: number) =>
        value ? (
          <Button size="small" type="link" onClick={onOpenArticles}>
            {value} 篇文章 · 去勾选
          </Button>
        ) : (
          <span className="muted">未使用</span>
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
      title="留资表单字段"
      titleBadge={rows.length ? `${rows.length}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ open: true, row: null })}
        >
          新建字段
        </Button>
      }
    >
      <div className="muted text-12" style={{ marginBottom: 12 }}>
        字段是全站共用的：在这里建好「姓名 / 手机号 / 期望城市」，到「图文资讯」的文章里勾选即可。
        类型决定顾客端渲染的控件，「单选」需要至少两个选项。
      </div>
      {rows.length || query.isFetching ? (
        <DataTable<OnsiteFormFieldRow>
          rows={rows}
          columns={columns}
          page={1}
          loading={query.isFetching}
        />
      ) : (
        <EmptyState
          text="还没有留资字段。挂表单的文章问不出东西，先建两三个最常用的（姓名、手机号、意向城市）。"
          action={
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden />}
              onClick={() => setEditing({ open: true, row: null })}
            >
              新建字段
            </Button>
          }
        />
      )}
      <FieldModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing({ open: false, row: null })}
      />
    </Panel>
  );
}

function FieldModal({
  shopId,
  editing,
  onClose,
}: {
  shopId: number;
  editing: { open: boolean; row: OnsiteFormFieldRow | null };
  onClose: () => void;
}) {
  const row = editing.row;
  const initial: FieldForm = row
    ? {
        name: row.name,
        fieldType: row.fieldType,
        options: row.options,
        placeholder: row.placeholder,
        required: row.required,
        sortOrder: row.sortOrder,
        enabled: row.enabled,
      }
    : NEW_FIELD;

  return (
    <Modal
      open={editing.open}
      title={row ? `编辑字段「${row.name}」` : "新建字段"}
      width={560}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      {editing.open ? (
        <FieldFormBlock
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

function FieldFormBlock({
  shopId,
  rowId,
  initial,
  onClose,
}: {
  shopId: number;
  rowId?: number;
  initial: FieldForm;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const save = useOnsiteContentActions().saveFormField;
  const [form] = Form.useForm<FieldForm>();
  const fieldType = Form.useWatch("fieldType", form) ?? initial.fieldType;

  const submit = async () => {
    const values = await form.validateFields();
    const options = values.options.map((item) => item.trim()).filter(Boolean);
    if (values.fieldType === "select" && options.length < 2) {
      message.warning("单选题至少给两个选项，否则顾客端点了没反应");
      return;
    }
    await save.mutateAsync({
      params: { id: String(shopId) },
      body: rowId
        ? { ...values, options, id: rowId }
        : { ...values, options },
    });
    message.success(rowId ? "字段已保存" : "字段已创建，去文章里勾选后顾客才填得到");
    onClose();
  };

  return (
    <Form form={form} layout="vertical" initialValues={initial}>
      <Form.Item
        name="name"
        label="字段名称"
        rules={[{ required: true, message: "请填写字段名称" }]}
        extra="顾客端表单的标签文字"
      >
        <Input maxLength={60} placeholder="如：期望上门时间" />
      </Form.Item>
      <Space wrap align="start">
        <Form.Item name="fieldType" label="字段类型" style={{ width: 200 }}>
          <Select
            options={ONSITE_FORM_FIELD_TYPES.map((value) => ({
              value,
              label: ONSITE_FORM_FIELD_TYPE_LABELS[value],
            }))}
          />
        </Form.Item>
        <Form.Item
          name="required"
          label="必填"
          valuePropName="checked"
          extra="必填项空着提交不了"
          style={{ width: 140 }}
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name="enabled"
          label="可用"
          valuePropName="checked"
          extra="停用后文章里勾不到"
          style={{ width: 140 }}
        >
          <Switch />
        </Form.Item>
      </Space>
      <Form.Item name="placeholder" label="占位提示" extra="输入框里的灰色示例文字，可留空">
        <Input maxLength={80} />
      </Form.Item>
      {fieldType === "select" ? (
        <Form.Item
          label="单选项"
          extra={`顾客只能选一个，至少 2 项，最多 ${OPTIONS_MAX} 项`}
        >
          <Form.List name="options">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                {fields.map((field, index) => (
                  <Space key={field.key} align="start">
                    <Form.Item name={field.name} noStyle>
                      <Input maxLength={40} placeholder={`第 ${index + 1} 个选项`} style={{ width: 320 }} />
                    </Form.Item>
                    <Button size="small" onClick={() => remove(field.name)}>
                      移除
                    </Button>
                  </Space>
                ))}
                <div>
                  <Button size="small" disabled={fields.length >= OPTIONS_MAX} onClick={() => add("")}>
                    添加选项
                  </Button>
                  <span className="muted text-12" style={{ marginLeft: 8 }}>
                    已加 {fields.length} / {OPTIONS_MAX} 项
                  </span>
                </div>
              </Space>
            )}
          </Form.List>
        </Form.Item>
      ) : (
        <div className="muted text-12" style={{ marginBottom: 16 }}>
          非单选类型不需要选项；「省市区的」由端上自带的地区选择器承接。
        </div>
      )}
      <Form.Item name="sortOrder" label="排序值" extra="文章内多字段按它从上到下排" style={{ width: 200 }}>
        <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
      </Form.Item>
      <Space>
        <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
          保存字段
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}
