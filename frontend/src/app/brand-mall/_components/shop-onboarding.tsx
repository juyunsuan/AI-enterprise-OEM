"use client";
import { App, Button, ColorPicker, Form, Input, Space } from "antd";
import type { BrandMeta, BrandShopCreateBody } from "@enterprise/contracts";
import { Notice, Panel } from "@/components/ui/panel";
import { useBrandShopActions } from "@/query/brand-mall";
import { ImageUrlField } from "@/components/ui/image-field";

/** 与契约 `brandShopCreateBodySchema` 同口径的长度限制，写进 extra 而不是让用户猜。 */
const LIMITS = { nameMin: 2, nameMax: 30, sloganMax: 60, phoneMax: 30 };

/**
 * 「开通商城」引导：账号下没有店铺时，全站所有页面都只渲染这一块。
 *
 * 配额用满不给死路的报错：说明上限从哪来、下一步做什么（关掉一家或找平台调整）。
 */
export function ShopOnboarding({ meta }: { meta: BrandMeta | null }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<BrandShopCreateBody>();
  const actions = useBrandShopActions();
  const quotaReached = meta ? meta.shopCount >= meta.shopQuota : false;
  const themeColor = Form.useWatch("themeColor", form) ?? "#FA3534";

  const submit = async () => {
    const values = await form.validateFields();
    const created = await actions.create.mutateAsync({
      body: {
        name: values.name.trim(),
        shopCode: values.shopCode?.trim() || undefined,
        logo: values.logo ?? "",
        slogan: values.slogan ?? "",
        servicePhone: values.servicePhone ?? "",
        themeColor: values.themeColor ?? "#FA3534",
      },
    });
    if (created) {
      message.success(`商城「${created.name}」已开通，接着绑定你自己的小程序 AppID`);
      form.resetFields();
    }
  };

  return (
    <Panel title="开通商城">
      <Notice variant="info">
        每个账号都可以开自己的微信小程序商城：商品、订单、顾客、优惠券与页面装修都归你这个店铺，
        顾客付款直接进你自己的微信商户号，平台不经手资金。
        开通后按「绑定小程序凭据 → 传商品 → 装修首页 → 下载源码包并上传微信」四步走，
        哪一步没做完，总览页的上线自检就会把那一项变成可点的跳转按钮。
      </Notice>
      {quotaReached ? (
        <Notice variant="warn">
          平台每个账号最多 {meta?.shopQuota ?? 0} 个商城，你已经开了 {meta?.shopCount ?? 0} 个。
          要继续新增，请先在「店铺设置 → 危险操作」关闭不再经营的一家，或联系平台调整配额。
        </Notice>
      ) : null}
      <Form
        form={form}
        layout="vertical"
        disabled={quotaReached}
        style={{ marginTop: 12, maxWidth: 620 }}
        initialValues={{ themeColor: "#FA3534" }}
      >
        <Form.Item
          name="name"
          label="商城名称"
          extra={`会显示在小程序顶部与分享卡片，${LIMITS.nameMin}-${LIMITS.nameMax} 个字`}
          rules={[
            {
              required: true,
              min: LIMITS.nameMin,
              max: LIMITS.nameMax,
              message: `请填写 ${LIMITS.nameMin}-${LIMITS.nameMax} 个字的商城名称`,
            },
          ]}
        >
          <Input placeholder="如：小王家鲜果铺" maxLength={LIMITS.nameMax} />
        </Form.Item>
        <Form.Item
          name="shopCode"
          label="店铺标识（可选）"
          extra="公开寻址码，用于小程序码与分享链接，创建后不再改动；留空由本站生成，只可用 4-16 位字母数字"
          rules={[{ pattern: /^[A-Za-z0-9]{4,16}$/, message: "店铺标识为 4-16 位字母或数字" }]}
        >
          <Input placeholder="留空自动生成" maxLength={16} />
        </Form.Item>
        <Form.Item name="logo" label="商城 Logo" extra="建议 200×200 方图，填本站图片地址">
          <ImageUrlField />
        </Form.Item>
        <Form.Item name="slogan" label="一句话简介">
          <Input
            placeholder="如：产地直发，当天采摘当天寄"
            maxLength={LIMITS.sloganMax}
          />
        </Form.Item>
        <Form.Item
          name="servicePhone"
          label="客服电话"
          extra="顾客在「我的」页能看到，用于售后咨询"
        >
          <Input placeholder="如：400-000-0000" maxLength={LIMITS.phoneMax} />
        </Form.Item>
        <Form.Item
          name="themeColor"
          label="主题色"
          extra="小程序按钮、价格与导航高亮都用这一支色"
          rules={[
            { required: true, pattern: /^#[0-9A-Fa-f]{6}$/, message: "主题色要写成 #RRGGBB" },
          ]}
        >
          <Space>
            <ColorPicker
              format="hex"
              value={themeColor}
              onChangeComplete={(color) =>
                form.setFieldValue("themeColor", color.toHexString())
              }
            />
            <Input
              style={{ width: 140 }}
              value={themeColor}
              maxLength={7}
              onChange={(event) =>
                form.setFieldValue("themeColor", event.target.value.trim())
              }
            />
          </Space>
        </Form.Item>
        <Space>
          <Button
            type="primary"
            loading={actions.create.isPending}
            disabled={quotaReached}
            onClick={() => void submit()}
          >
            开通商城
          </Button>
          <span className="muted text-12">
            开通后该账号即店铺归属人，商品与订单不与其他账号互看
          </span>
        </Space>
      </Form>
    </Panel>
  );
}
