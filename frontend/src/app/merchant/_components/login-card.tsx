"use client";

import { Alert, Button, Card, Form, Input } from "antd";
import { useState } from "react";
import type { MpMerchantSession } from "@enterprise/contracts";
import { merchantLogin } from "@/api/marketplace";

type LoginForm = { username: string; password: string };

/** 商户登录：商户是独立账号体系，账号由入驻审核通过时创建（负责人）或由负责人添加（店员）。 */
export function MerchantLoginCard({
  onLoggedIn,
  notice,
}: {
  onLoggedIn: (session: MpMerchantSession) => void;
  notice?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (values: LoginForm) => {
    setBusy(true);
    setError("");
    try {
      const session = await merchantLogin(values);
      if (!session) throw new Error("登录响应异常，请重试");
      onLoggedIn(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ maxWidth: 420, margin: "48px auto" }}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>商户登录</h2>
      <p className="text-12 muted" style={{ marginTop: 0 }}>
        用入驻时申请的账号登录；审核通过后才能进入后台，审核结果由市场运营方决定。
      </p>
      {notice ? <Alert type="warning" showIcon title={notice} style={{ marginBottom: 12 }} /> : null}
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} /> : null}
      <Form layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="username" label="账号" rules={[{ required: true, message: "请输入账号" }]}>
          <Input autoComplete="username" maxLength={64} />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
          <Input.Password autoComplete="current-password" maxLength={64} />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={busy}>
          登录
        </Button>
      </Form>
      <div className="text-12 muted" style={{ marginTop: 12, textAlign: "center" }}>
        还没有账号？<a href="/merchant/apply">提交入驻申请</a>
      </div>
    </Card>
  );
}
