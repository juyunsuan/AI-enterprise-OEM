"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import {
  PARK_APPROVAL_BIZ_TYPES,
  PARK_APPROVAL_BIZ_LABELS,
  PARK_STAFF_ROLES,
  PARK_STAFF_ROLE_LABELS,
  type ParkApprovalFlow,
} from "@enterprise/contracts";
import { parkApi } from "@/api/park";

type FlowNode = {
  name: string;
  approverType: "STAFF" | "TENANT_ADMIN";
  role: "OWNER" | "APPROVER" | "CLERK" | "INSPECTOR" | "GUARD";
  mode: "ANY" | "ALL" | "SEQUENTIAL";
};
type FlowForm = {
  name: string;
  enabled: boolean;
  nodes: FlowNode[];
};

const DEFAULT_NODES: FlowNode[] = [
  {
    name: "园区审批",
    approverType: "STAFF",
    role: "OWNER",
    mode: "ANY",
  },
];

export function FlowsPanel({ siteId }: { siteId: number }) {
  const { message } = App.useApp();
  const [bizType, setBizType] = useState<(typeof PARK_APPROVAL_BIZ_TYPES)[number]>(
    "VISITOR",
  );
  const [flow, setFlow] = useState<ParkApprovalFlow | null>(null);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<FlowForm>();

  const load = useCallback(async () => {
    if (!siteId) return;
    try {
      const row = await parkApi.flow({ query: { siteId, bizType } });
      setFlow(row);
      form.setFieldsValue(
        row
          ? {
              name: row.name,
              enabled: row.enabled,
              nodes: row.nodes as FlowNode[],
            }
          : {
              name: `${PARK_APPROVAL_BIZ_LABELS[bizType]}审批`,
              enabled: true,
              nodes: DEFAULT_NODES,
            },
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "审批流读取失败");
    }
  }, [bizType, form, message, siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const row = await parkApi.flowSave({
        body: {
          siteId,
          bizType,
          name: values.name,
          nodes: values.nodes,
          enabled: Boolean(values.enabled),
        },
      });
      setFlow(row);
      message.success("审批流已保存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form layout="vertical" form={form} onFinish={() => void save()}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          value={bizType}
          style={{ width: 200 }}
          onChange={(value) => setBizType(value)}
          options={PARK_APPROVAL_BIZ_TYPES.map((value) => ({
            value,
            label: PARK_APPROVAL_BIZ_LABELS[value],
          }))}
        />
        <Tag color={flow ? "green" : "default"}>
          {flow ? `已配置 v${flow.version}` : "未配置，使用默认园区管理员审批"}
        </Tag>
      </Space>
      <Form.Item label="流程名称" name="name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item label="启用" name="enabled" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.List name="nodes">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field, index) => (
              <Space key={field.key} align="start" wrap>
                <Form.Item
                  label={`节点 ${index + 1}`}
                  name={[field.name, "name"]}
                  rules={[{ required: true }]}
                >
                  <Input style={{ width: 160 }} />
                </Form.Item>
                <Form.Item
                  label="审批人类型"
                  name={[field.name, "approverType"]}
                >
                  <Select
                    style={{ width: 140 }}
                    options={[
                      { value: "STAFF", label: "园区员工" },
                      { value: "TENANT_ADMIN", label: "租户管理员" },
                    ]}
                  />
                </Form.Item>
                <Form.Item label="员工角色" name={[field.name, "role"]}>
                  <Select
                    style={{ width: 140 }}
                    options={PARK_STAFF_ROLES.map((value) => ({
                      value,
                      label: PARK_STAFF_ROLE_LABELS[value],
                    }))}
                  />
                </Form.Item>
                <Form.Item label="会签方式" name={[field.name, "mode"]}>
                  <Select
                    style={{ width: 120 }}
                    options={[
                      { value: "ANY", label: "或签" },
                      { value: "ALL", label: "会签" },
                      { value: "SEQUENTIAL", label: "顺序" },
                    ]}
                  />
                </Form.Item>
                {fields.length > 1 ? (
                  <Button danger size="small" onClick={() => remove(field.name)}>
                    删除
                  </Button>
                ) : null}
              </Space>
            ))}
            <Button
              type="dashed"
              onClick={() => add({ ...DEFAULT_NODES[0], name: `节点 ${fields.length + 1}` })}
              style={{ marginBottom: 12 }}
            >
              添加节点
            </Button>
          </>
        )}
      </Form.List>
      <Button type="primary" loading={busy} onClick={() => void save()}>
        保存审批流
      </Button>
    </Form>
  );
}
