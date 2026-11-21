"use client";
// 没有店铺时的开通引导：一个账号只有一家上门服务店铺，没有「再开一家」。
import { App, Button, Form, Input } from "antd";
import type { OnsiteShopInput } from "@enterprise/contracts";
import { useOnsiteShopActions } from "@/query/onsite";
import { Notice, Panel } from "@/components/ui/panel";

function ShopCreateForm({ onDone }: { onDone: (shopId: number) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<OnsiteShopInput>();
  const createShop = useOnsiteShopActions().createShop;

  const submit = async (values: OnsiteShopInput) => {
    const created = await createShop.mutateAsync({ body: values });
    if (!created) {
      message.success("店铺已开通，接下来绑定你自己的小程序 AppID");
      return;
    }
    message.success(`「${created.name}」已开通，接下来绑定你自己的小程序 AppID`);
    form.resetFields();
    onDone(created.id);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      style={{ maxWidth: 420 }}
      onFinish={(values) => void submit(values)}
    >
      <Form.Item
        name="name"
        label="店铺名称"
        rules={[{ required: true, min: 2, message: "请填写至少 2 个字的店铺名称" }]}
      >
        <Input placeholder="如「城本上门理疗」" maxLength={120} />
      </Form.Item>
      <Form.Item name="slogan" label="一句话卖点">
        <Input placeholder="显示在小程序首页" maxLength={120} />
      </Form.Item>
      <Form.Item name="servicePhone" label="客服电话">
        <Input placeholder="顾客下单有疑问时联系" maxLength={32} />
      </Form.Item>
      <Form.Item
        name="logo"
        label="Logo 地址"
        extra="走数字资产或对象存储外链，留空则小程序首页用店铺名文字"
      >
        <Input maxLength={500} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={createShop.isPending}>
        开通店铺
      </Button>
    </Form>
  );
}

export function ShopOnboarding({ onCreated }: { onCreated: () => void }) {
  return (
    <Panel title="开通上门服务店铺">
      <Notice variant="info">
        一个账号只能开通一家上门服务店铺：开通即创建一部独立小程序的业务底座，店铺码是它在你自己小程序包里的身份标识，
        创建后不变。服务目录、服务人员与排期都在这家店铺下展开，顾客的钱直接进你自己的微信支付商户号。
      </Notice>
      <div style={{ marginTop: 16 }}>
        <ShopCreateForm onDone={() => onCreated()} />
      </div>
    </Panel>
  );
}
