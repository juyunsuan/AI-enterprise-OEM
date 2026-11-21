"use client";

import { App, Alert, Button, Form, Input, Result, Select, Space, Spin } from "antd";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { MpMerchantOptions } from "@enterprise/contracts";
import { fetchMerchantOptions, submitMerchantApply } from "@/api/marketplace";
import { MerchantFrame } from "../_components/frame";

type ApplyForm = {
  name: string;
  licenseNo: string;
  licenseImage: string;
  contactName: string;
  contactPhone: string;
  categoryIds: number[];
  username: string;
  password: string;
  phone: string;
};

/**
 * 商户入驻申请（免登录）：先把市场编号换成市场与类目，再提交主体与账号。
 * 提交后账号即创建，但审核通过前登录会被拒绝并提示当前进度。
 */
export default function MerchantApplyPage() {
  return (
    <Suspense
      fallback={
        <MerchantFrame title="入驻申请">
          <div style={{ padding: 48, textAlign: "center" }}>
            <Spin description="正在读取入驻信息…" />
          </div>
        </MerchantFrame>
      }
    >
      <ApplyInner />
    </Suspense>
  );
}

function ApplyInner() {
  const params = useSearchParams();
  const { message } = App.useApp();
  const [form] = Form.useForm<ApplyForm>();
  const [code, setCode] = useState(params.get("market") ?? params.get("marketCode") ?? "");
  const [market, setMarket] = useState<MpMerchantOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const lookup = useCallback(
    async (value: string) => {
      const next = value.trim();
      if (!next) {
        message.warning("请先填写市场编号");
        return;
      }
      setLoading(true);
      setMarket(null);
      try {
        setMarket(await fetchMerchantOptions(next));
      } catch (cause) {
        message.error(cause instanceof Error ? cause.message : "市场编号查询失败");
      } finally {
        setLoading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    const initial = (params.get("market") ?? params.get("marketCode") ?? "").trim();
    if (initial) void lookup(initial);
    // 只在带编号进入时自动查询一次；后续输入由「查询市场」按钮触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryOptions = useMemo(() => {
    if (!market) return [];
    const rootName = new Map(
      market.categories.filter((item) => !item.parentId).map((item) => [item.id, item.name]),
    );
    return market.categories.map((item) => ({
      value: item.id,
      label: item.parentId ? `${rootName.get(item.parentId) ?? "其他"} / ${item.name}` : item.name,
    }));
  }, [market]);

  const submit = async (values: ApplyForm) => {
    if (!market) {
      message.warning("请先查询市场编号");
      return;
    }
    setBusy(true);
    try {
      await submitMerchantApply({ ...values, marketCode: market.marketCode });
      setDone(true);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "提交失败");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <MerchantFrame title="入驻申请">
        <Result
          status="success"
          title="入驻申请已提交"
          subTitle="市场运营方审核后会按你填写的联系电话通知结果；通过后即可用刚申请的账号登录商户后台。"
          extra={
            <Space>
              <Button type="primary" href="/merchant">
                去登录商户后台
              </Button>
              <Button onClick={() => setDone(false)}>再提交一个商户</Button>
            </Space>
          }
        />
      </MerchantFrame>
    );
  }

  return (
    <MerchantFrame
      title="入驻申请"
      subtitle={
        <>
          需要市场运营方提供的市场编号。提交后账号即创建，审核通过才能登录；
          已有账号请直接<a href="/merchant">登录商户后台</a>。
        </>
      }
    >
      <div className="panel" style={{ padding: 20 }}>
        <Space.Compact style={{ width: "100%", maxWidth: 480, marginBottom: 16 }}>
          <Input
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setMarket(null);
            }}
            placeholder="市场编号（如 M123456）"
            maxLength={16}
            onPressEnter={() => void lookup(code)}
          />
          <Button loading={loading} onClick={() => void lookup(code)}>
            查询市场
          </Button>
        </Space.Compact>
        {market ? (
          <Alert
            type="success"
            showIcon
            title={`入驻市场：${market.marketName}`}
            description="请如实填写主体信息与经营类目；类目只能从市场统一类目里选。"
            style={{ marginBottom: 16 }}
          />
        ) : (
          <Alert
            type="info"
            showIcon
            title="先查询市场编号"
            description="查询成功后会显示市场名称并可选择经营类目。"
            style={{ marginBottom: 16 }}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          disabled={!market}
          style={{ maxWidth: 720 }}
        >
          <Form.Item
            name="name"
            label="商户名称"
            rules={[{ required: true, min: 2, max: 120, message: "请填写 2-120 字的商户名称" }]}
          >
            <Input maxLength={120} placeholder="营业执照上的主体名称或门店品牌名" />
          </Form.Item>
          <Form.Item name="licenseNo" label="营业执照号">
            <Input maxLength={64} placeholder="可留空，审核时由运营方核对" />
          </Form.Item>
          <Form.Item name="licenseImage" label="营业执照图片地址">
            <Input maxLength={500} placeholder="https://…（可留空）" />
          </Form.Item>
          <Form.Item
            name="contactName"
            label="联系人"
            rules={[{ required: true, message: "请填写联系人" }]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item
            name="contactPhone"
            label="联系电话"
            rules={[
              { required: true, message: "请填写联系电话" },
              { pattern: /^[0-9+\-\s]{5,32}$/, message: "联系电话格式不正确" },
            ]}
          >
            <Input maxLength={32} placeholder="审核结果会通过这个电话通知" />
          </Form.Item>
          <Form.Item
            name="categoryIds"
            label="意向经营类目"
            rules={[{ required: true, message: "请至少选择一个经营类目" }]}
          >
            <Select mode="multiple" allowClear maxTagCount="responsive" options={categoryOptions} placeholder="选择经营范围" />
          </Form.Item>

          <div className="text-12 muted" style={{ margin: "4px 0 12px" }}>
            以下为商户后台登录账号，审核通过后即可使用；请妥善保管密码。
          </div>
          <Form.Item
            name="username"
            label="登录账号"
            rules={[
              { required: true, message: "请填写登录账号" },
              {
                pattern: /^[A-Za-z][A-Za-z0-9_]{3,31}$/,
                message: "以字母开头，4-32 位字母、数字或下划线",
              },
            ]}
          >
            <Input maxLength={32} autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label="登录密码"
            rules={[{ required: true, min: 8, max: 64, message: "密码至少 8 位" }]}
          >
            <Input.Password maxLength={64} autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="phone" label="账号手机号">
            <Input maxLength={32} placeholder="可留空" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            提交入驻申请
          </Button>
        </Form>
      </div>
    </MerchantFrame>
  );
}
