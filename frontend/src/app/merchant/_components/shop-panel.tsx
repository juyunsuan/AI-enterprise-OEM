"use client";

import { App, Alert, Button, Form, Input, Select, Space, Switch, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { MpMerchantOptions, MpMerchantProfile } from "@enterprise/contracts";
import { MP_SHOP_STATUS_LABELS } from "@enterprise/contracts";
import { mpMerchantApi } from "@/api/marketplace";
import { Panel } from "@/components/ui/panel";

type ShopForm = {
  name: string;
  logo: string;
  intro: string;
  categoryIds: number[];
  mchId: string;
  payEnabled: boolean;
};

/** 商户侧店铺设置：经营范围只能从平台类目里选；开店前必须至少一个类目。 */
export function ShopPanel({
  profile,
  categories,
  onRefresh,
}: {
  profile: MpMerchantProfile;
  categories: MpMerchantOptions["categories"];
  onRefresh: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const shop = profile.shop;
  const [form] = Form.useForm<ShopForm>();
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const mchId = Form.useWatch("mchId", form) ?? "";
  const canWrite = profile.marketStatus === "ONLINE" && profile.role === "OWNER";

  const options = useMemo(() => {
    const rootName = new Map(categories.filter((item) => !item.parentId).map((item) => [item.id, item.name]));
    return categories.map((item) => ({
      value: item.id,
      label: item.parentId ? `${rootName.get(item.parentId) ?? "其他"} / ${item.name}` : item.name,
    }));
  }, [categories]);

  useEffect(() => {
    form.setFieldsValue({
      name: shop?.name ?? "",
      logo: shop?.logo ?? "",
      intro: shop?.intro ?? "",
      categoryIds: shop?.categoryIds ?? [],
      mchId: shop?.mchId ?? "",
      payEnabled: shop?.payEnabled ?? false,
    });
  }, [form, shop]);

  const save = async (values: ShopForm) => {
    setBusy(true);
    try {
      await mpMerchantApi.shopSave(values);
      message.success("店铺设置已保存");
      await onRefresh();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (status: "DRAFT" | "ONLINE") => {
    setStatusBusy(true);
    try {
      await mpMerchantApi.shopStatus({ status });
      message.success(status === "ONLINE" ? "店铺已开业" : "店铺已暂停，买家端不再展示");
      await onRefresh();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setStatusBusy(false);
    }
  };

  if (!shop) {
    return (
      <Panel title="店铺">
        <Alert
          type="warning"
          showIcon
          title="店铺尚未创建"
          description="入驻审核通过后系统会自动建店；若长时间没有店铺，请把商户编号发给市场运营方核对。"
        />
      </Panel>
    );
  }

  return (
    <>
      <Panel
        title="店铺设置"
        titleExtra={
          <Tag color={shop.status === "ONLINE" ? "green" : shop.status === "SUSPENDED" ? "red" : "default"}>
            {MP_SHOP_STATUS_LABELS[shop.status] ?? shop.status}
          </Tag>
        }
      >
        {profile.marketStatus !== "ONLINE" ? (
          <Alert
            type="info"
            showIcon
            title="市场当前未营业"
            description="市场筹备中或已被平台停服：资料可查看，保存与开店操作暂不可用。"
            style={{ marginBottom: 16 }}
          />
        ) : null}
        {profile.role !== "OWNER" ? (
          <Alert
            type="info"
            showIcon
            title="店员账号只能查看"
            description="店铺资料、开店与店员管理由负责人操作。"
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <Form form={form} layout="vertical" onFinish={save} disabled={!canWrite} style={{ maxWidth: 720 }}>
          <Form.Item
            name="name"
            label="店铺名称"
            rules={[{ required: true, min: 2, max: 120, message: "请填写 2-120 字的店铺名" }]}
          >
            <Input maxLength={120} placeholder="买家在小程序里看到的店铺名" />
          </Form.Item>
          <Form.Item name="logo" label="店铺 Logo（图片地址）">
            <Input maxLength={500} placeholder="https://…（可留空）" />
          </Form.Item>
          <Form.Item name="intro" label="店铺简介">
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="一句话介绍你的店" />
          </Form.Item>
          <Form.Item
            name="categoryIds"
            label="经营类目"
            extra="只能选择平台统一类目；至少选择一个才能开店。"
            rules={[{ required: true, message: "请至少选择一个经营类目" }]}
          >
            <Select mode="multiple" allowClear maxTagCount="responsive" options={options} placeholder="选择经营范围" />
          </Form.Item>
          <Form.Item
            name="mchId"
            label="微信支付商户号"
            extra="买家货款直接进你自己的微信商户号，平台不经手资金；需先在微信支付后台开通 JSAPI 支付。"
          >
            <Input maxLength={64} placeholder="如：1900000000" />
          </Form.Item>
          <Form.Item
            name="payEnabled"
            label="开启微信支付"
            valuePropName="checked"
            extra={!mchId ? "填写商户号后才能开启。" : undefined}
          >
            <Switch disabled={!mchId} />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={busy}>
              保存设置
            </Button>
            {shop.status === "DRAFT" ? (
              <Button loading={statusBusy} disabled={!canWrite} onClick={() => void toggleStatus("ONLINE")}>
                开店营业
              </Button>
            ) : null}
            {shop.status === "ONLINE" ? (
              <Button loading={statusBusy} disabled={!canWrite} onClick={() => void toggleStatus("DRAFT")}>
                暂停营业
              </Button>
            ) : null}
          </Space>
        </Form>
      </Panel>
      {shop.status === "SUSPENDED" ? (
        <Panel title="店铺状态">
          <Alert type="error" showIcon title="店铺已被市场运营方停服" description="停服期间买家端不再展示与下单，可查看数据；恢复请联系市场运营方。" />
        </Panel>
      ) : null}
      {shop.status === "CLOSED" ? (
        <Panel title="店铺状态">
          <Alert type="warning" showIcon title="店铺已关闭" description="商户已退出市场，如需恢复经营请联系市场运营方。" />
        </Panel>
      ) : null}
    </>
  );
}
