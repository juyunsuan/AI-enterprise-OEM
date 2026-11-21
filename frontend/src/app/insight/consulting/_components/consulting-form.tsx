"use client";

import { Button, Checkbox, Form, Input, Select, Space, Tag } from "antd";
import {
  CONSULTING_FIELD_GROUPS,
  CONSULTING_FRAMEWORKS,
  CONSULTING_FRAMEWORK_GROUPS,
  CONSULTING_PROFILE_FIELDS,
  type ConsultingFieldSpec,
  type ConsultingFrameworkKey,
  type FdeIndustry,
} from "@enterprise/contracts";
import { Notice, Panel } from "@/components/ui/panel";

export type ConsultingFormValues = {
  companyName: string;
  industry: FdeIndustry;
  companySize: string;
  businessModel: string;
  goals: string;
  frameworks: ConsultingFrameworkKey[];
} & Record<string, unknown>;

/**
 * 企业咨询提交清单：企业数据字段来自契约 `CONSULTING_PROFILE_FIELDS`，
 * 模型清单来自 `CONSULTING_FRAMEWORKS`；前端只渲染，口径与后端校验、提示词同源。
 */
export function ConsultingForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (values: ConsultingFormValues) => void;
}) {
  const [form] = Form.useForm();
  const selectedFrameworks = Form.useWatch("frameworks", form) as
    | string[]
    | undefined;

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark
      initialValues={{ frameworks: ["swot", "pest", "fiveForces"] }}
      onFinish={(values: ConsultingFormValues) => onSubmit(values)}
    >
      <Notice variant="info">
        分析调用「模型服务 → 模型设置」里配置的文本模型，未配置时会提示去配置。带
        * 为必填；不确定的内容可以留空，报告会把信息缺口单独列出来。所选模型越多，生成时间越长。
      </Notice>

      {CONSULTING_FIELD_GROUPS.map((group) => (
        <Panel key={group.key} title={group.label} titleExtra={group.desc}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {CONSULTING_PROFILE_FIELDS.filter(
              (field) => field.group === group.key,
            ).map((field) => (
              <FieldItem key={field.key} field={field} />
            ))}
          </div>
        </Panel>
      ))}

      <Panel
        title="分析模型"
        titleExtra="按本次要回答的问题勾选；经典模型之间可以互相印证，也会暴露分歧。"
      >
        <Form.Item
          name="frameworks"
          rules={[
            {
              required: true,
              type: "array",
              min: 1,
              message: "请至少选择一个分析模型",
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Checkbox.Group style={{ width: "100%" }}>
            <div style={{ display: "grid", gap: 20 }}>
              {CONSULTING_FRAMEWORK_GROUPS.map((group) => (
                <div key={group.key}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {group.label}
                  </div>
                  <div className="muted text-12" style={{ marginBottom: 10 }}>
                    {group.desc}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {CONSULTING_FRAMEWORKS.filter(
                      (item) => item.group === group.key,
                    ).map((item) => (
                      <Checkbox
                        key={item.key}
                        value={item.key}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          padding: "10px 12px",
                          border: "1px solid var(--border-color, #e5e7eb)",
                          borderRadius: 8,
                          width: "100%",
                        }}
                      >
                        <span>
                          <span style={{ fontWeight: 600 }}>{item.label}</span>
                          <span
                            className="muted text-12"
                            style={{ display: "block", marginTop: 2 }}
                          >
                            {item.desc}
                          </span>
                        </span>
                      </Checkbox>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Checkbox.Group>
        </Form.Item>
      </Panel>

      <Panel
        title="提交分析"
        titleExtra="多个模型通常需要 1-3 分钟；生成期间请不要重复提交。"
      >
        <Space wrap>
          <Button type="primary" htmlType="submit" loading={submitting}>
            开始分析
          </Button>
          <Button onClick={() => form.resetFields()} disabled={submitting}>
            重置表单
          </Button>
          <Tag color="default">已选 {selectedFrameworks?.length ?? 0} 个模型</Tag>
        </Space>
      </Panel>
    </Form>
  );
}

function FieldItem({ field }: { field: ConsultingFieldSpec }) {
  const fullWidth = field.control === "textarea";
  return (
    <Form.Item
      name={field.key}
      label={field.label}
      extra={field.hint}
      style={
        fullWidth
          ? { gridColumn: "1 / -1", marginBottom: 0 }
          : { marginBottom: 0 }
      }
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
