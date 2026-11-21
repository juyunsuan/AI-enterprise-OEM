"use client";
import { Form, Input, Modal } from "antd";
import { useState } from "react";

/**
 * 需要输入一段文字才能继续的确认弹窗：关闭订单的理由、卖家备注、
 * 驳回售后的理由、停服原因都走这一份，避免每个页面各写一套校验。
 */
export function PromptModal({
  open,
  title,
  label,
  extra,
  initialValue = "",
  placeholder,
  maxLength = 500,
  required = false,
  okText = "保存",
  danger = false,
  confirmLoading = false,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  label: string;
  extra?: string;
  initialValue?: string;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  okText?: string;
  danger?: boolean;
  confirmLoading?: boolean;
  onSubmit: (value: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [form] = Form.useForm<{ value: string }>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const { value } = await form.validateFields();
    setSubmitting(true);
    try {
      await onSubmit(value.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      okButtonProps={{ danger, loading: submitting || confirmLoading }}
      onCancel={onCancel}
      onOk={() => void submit()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ value: initialValue }}
      >
        <Form.Item
          name="value"
          label={label}
          extra={extra}
          rules={
            required
              ? [{ required: true, message: `请填写${label}` }]
              : [{ max: maxLength, message: `最多 ${maxLength} 个字` }]
          }
        >
          <Input.TextArea rows={3} maxLength={maxLength} showCount placeholder={placeholder} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
