"use client";

import { Button, Form, Input, Select, Space } from "antd";
import {
  FDE_FIELD_GROUPS,
  FDE_PROFILE_FIELDS,
  type FdeFieldSpec,
  type FdeIndustry,
} from "@enterprise/contracts";
import { Notice, Panel } from "@/components/ui/panel";

export type FdeFormValues = {
  companyName: string;
  industry: FdeIndustry;
} & Record<string, unknown>;

/**
 * AI-FDE 提交清单：字段、必填与提示全部来自契约 `FDE_PROFILE_FIELDS`，
 * 前端只负责渲染，避免与后端校验、提示词口径漂移。
 */
export function FdeForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (values: FdeFormValues) => void;
}) {
  const [form] = Form.useForm();

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark
      onFinish={(values: FdeFormValues) => onSubmit(values)}
    >
      <Notice variant="info">
        分析调用「模型服务 → 模型设置」里配置的文本模型，未配置时会提示去配置。带
        * 为必填；不确定的内容可以留空，报告会把信息缺口单独列出来。
      </Notice>

      {FDE_FIELD_GROUPS.map((group) => (
        <Panel key={group.key} title={group.label} titleExtra={group.desc}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {FDE_PROFILE_FIELDS.filter((field) => field.group === group.key).map(
              (field) => (
                <FieldItem key={field.key} field={field} />
              ),
            )}
          </div>
        </Panel>
      ))}

      <Panel
        title="提交分析"
        titleExtra="分析通常需要 30-90 秒；生成期间请不要重复提交。"
      >
        <Space wrap>
          <Button type="primary" htmlType="submit" loading={submitting}>
            开始分析
          </Button>
          <Button
            onClick={() => form.resetFields()}
            disabled={submitting}
          >
            重置表单
          </Button>
        </Space>
      </Panel>
    </Form>
  );
}

function FieldItem({ field }: { field: FdeFieldSpec }) {
  const fullWidth = field.control === "textarea";
  return (
    <Form.Item
      name={field.key}
      label={field.label}
      extra={field.hint}
      style={fullWidth ? { gridColumn: "1 / -1", marginBottom: 0 } : { marginBottom: 0 }}
      rules={
        field.required
          ? [{ required: true, message: `请填写${field.label}` }]
          : undefined
      }
    >
      {field.control === "select" ? (
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="请选择"
          options={field.options}
        />
      ) : field.control === "textarea" ? (
        <Input.TextArea
          rows={field.rows ?? 3}
          maxLength={field.maxLength}
          showCount
          placeholder={field.placeholder}
        />
      ) : (
        <Input maxLength={field.maxLength} placeholder={field.placeholder} />
      )}
    </Form.Item>
  );
}
