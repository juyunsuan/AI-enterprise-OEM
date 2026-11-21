"use client";

import { App, Alert, Button, Descriptions, Form, Input, Tag } from "antd";
import { useState } from "react";
import type { MpMerchantProfile } from "@enterprise/contracts";
import {
  MP_MARKET_STATUS_LABELS,
  MP_MERCHANT_AUDIT_STATUS_LABELS,
  MP_MERCHANT_ROLE_LABELS,
} from "@enterprise/contracts";
import { mpMerchantApi } from "@/api/marketplace";
import { Panel } from "@/components/ui/panel";

type PasswordForm = { oldPassword: string; newPassword: string; confirm: string };

export function AccountPanel({ profile }: { profile: MpMerchantProfile }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<PasswordForm>();

  const submit = async (values: PasswordForm) => {
    setBusy(true);
    try {
      await mpMerchantApi.changePassword({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      form.resetFields();
      message.success("密码已修改，下次登录用新密码");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "修改失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel title="商户信息">
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="商户">{profile.merchantName}</Descriptions.Item>
          <Descriptions.Item label="所属市场">
            {profile.marketName}（{profile.marketShopCode}）
          </Descriptions.Item>
          <Descriptions.Item label="市场状态">
            {MP_MARKET_STATUS_LABELS[profile.marketStatus] ?? profile.marketStatus}
          </Descriptions.Item>
          <Descriptions.Item label="入驻审核">
            <Tag color={profile.auditStatus === "APPROVED" ? "green" : "gold"}>
              {MP_MERCHANT_AUDIT_STATUS_LABELS[profile.auditStatus] ?? profile.auditStatus}
            </Tag>
            {profile.auditNote ? <span className="muted text-12"> {profile.auditNote}</span> : null}
          </Descriptions.Item>
          <Descriptions.Item label="当前账号">
            {profile.username}（{MP_MERCHANT_ROLE_LABELS[profile.role] ?? profile.role}）
          </Descriptions.Item>
          <Descriptions.Item label="最近登录">
            {profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : "—"}
          </Descriptions.Item>
        </Descriptions>
      </Panel>
      <Panel title="修改密码">
        {profile.marketStatus !== "ONLINE" ? (
          <Alert
            type="info"
            showIcon
            title="市场当前未营业"
            description="筹备中或平台停服期间不能修改密码，市场恢复营业后再试。"
            style={{ marginBottom: 12 }}
          />
        ) : null}
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          disabled={profile.marketStatus !== "ONLINE"}
          style={{ maxWidth: 420 }}
        >
          <Form.Item name="oldPassword" label="原密码" rules={[{ required: true, message: "请输入原密码" }]}>
            <Input.Password maxLength={64} autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true, min: 8, max: 64, message: "新密码至少 8 位" }]}
          >
            <Input.Password maxLength={64} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "请再次输入新密码" },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue("newPassword") === value
                    ? Promise.resolve()
                    : Promise.reject(new Error("两次输入的密码不一致")),
              }),
            ]}
          >
            <Input.Password maxLength={64} autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            修改密码
          </Button>
        </Form>
      </Panel>
    </>
  );
}
