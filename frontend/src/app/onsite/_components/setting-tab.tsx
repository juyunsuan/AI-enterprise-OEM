"use client";

// 店铺与交易页签：开店 / 改资料 / 交易与运营参数 / 小程序外观。参数改动即时生效，不需要重新出包。
import { ONSITE_DISPATCH_MODE_LABELS, ONSITE_TIME_UNITS, type OnsiteShopInput, type OnsiteTrade, type OnsiteTheme } from "@enterprise/contracts";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
} from "antd";
import { useEffect, useState } from "react";
import { onsiteApi } from "@/api/onsite";
import { Notice, Panel } from "@/components/ui/panel";
import { useOnsiteShopActions } from "@/query/onsite";
import { useOnsiteScope } from "./onsite-shell";

/** 交易参数的界面语义（控件类型与解释文案），字段名与契约 onsiteTradeSchema 一一对应。 */
const TRADE_HINTS: Record<keyof OnsiteTrade, string> = {
  timeUnitMinutes: "可约时段怎么切：越细越灵活，但列表更长",
  bufferMinutes: "已订时段两侧各外扩的分钟数，给路上时间留余量",
  maxDays: "从今天起往后能约几天",
  bookingLeadMinutes: "防止顾客下单即要求开始服务",
  autoCancelMinutes: "下单后多久没付款就释放时段",
  allowCrossDay: "服务时段结束早于开始视为次日（夜班场景）",
  dispatchMode: "技师自接单，或店铺统一派单/改派",
  travelFeeEnabled: "关闭后订单不算距离、不产生车费",
  travelFeeFallbackCents: "地图距离算不出时的兜底金额（分），0 表示不兜底",
  canTxHours: "服务完成到允许提现的等待时长",
  reviewEnabled: "关闭后已完成订单不出现评价入口",
  reviewAuditFirst: "新评价先进待审，店主放行后才计分与对外展示",
  alertEnabled: "服务人员安全兜底，建议保持开启",
  alertHelpPhones: "求救时要外呼的号码，一期只留痕，短信/语音通道随 P4 虚拟号接入",
  alertNotifyOwner: "关闭后店主收不到站内求救提醒",
  alertDedupeMinutes: "同一技师在窗口内重复点击只算一次，防误触刷屏",
  deskSiteKey: "在线客服绑定项，改这行请到「客服与私域」页签（这里只保留字段完整性）",
  deskEnabled: "客服入口显隐，请到「客服与私域」页签调整",
  scrmCodeId: "私域 SCRM 活码绑定项，请到「客服与私域」页签调整",
  scrmEnabled: "加微入口显隐，请到「客服与私域」页签调整",
};

const DISPATCH_OPTIONS = Object.entries(ONSITE_DISPATCH_MODE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export function SettingTab() {
  const { message } = App.useApp();
  const { shop, reloadOverview } = useOnsiteScope();
  const [busy, setBusy] = useState(false);
  const [profileForm] = Form.useForm<OnsiteShopInput>();
  const [tradeForm] = Form.useForm<OnsiteTrade>();
  const [themeForm] = Form.useForm<OnsiteTheme>();
  const closeShop = useOnsiteShopActions().closeShop;

  // 店铺切换或重拉后重建表单值：用 key 重建避免残留脏字段（antd 6 口径）
  useEffect(() => {
    if (!shop) return;
    profileForm.setFieldsValue({
      name: shop.name,
      slogan: shop.slogan,
      logo: shop.logo,
      servicePhone: shop.servicePhone,
      shareImage: shop.shareImage,
    });
    tradeForm.setFieldsValue(shop.trade);
    themeForm.setFieldsValue(shop.theme);
  }, [shop, profileForm, tradeForm, themeForm]);

  const submit = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      message.success(success);
      await reloadOverview();
    } catch (cause) {
      // 后端错误文案都写成了「下一步做什么」，这里不额外加工
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  if (!shop) return null;

  /** 关闭店铺走变更钩子：失败提示由钩子统一给出，这里不重复弹一次。 */
  const closeCurrentShop = async () => {
    await closeShop.mutateAsync({
      params: { id: String(shop.id) },
      body: { reason: "店主自行关闭" },
    });
    message.success("店铺已关闭，配额已释放");
    await reloadOverview();
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel title="店铺资料">
        <Form
          form={profileForm}
          layout="vertical"
          onFinish={(values) =>
            void submit(
              () =>
                onsiteApi.updateShop({
                  params: { id: String(shop.id) },
                  body: values,
                }),
              "店铺资料已保存",
            )
          }
        >
          <Space wrap size={12} align="start">
            <Form.Item
              name="name"
              label="名称"
              rules={[{ required: true, message: "店铺名称不能为空" }]}
              style={{ marginBottom: 0 }}
            >
              <Input style={{ width: 220 }} maxLength={120} />
            </Form.Item>
            <Form.Item name="slogan" label="卖点" style={{ marginBottom: 0 }}>
              <Input style={{ width: 240 }} maxLength={120} />
            </Form.Item>
            <Form.Item name="servicePhone" label="客服电话" style={{ marginBottom: 0 }}>
              <Input style={{ width: 180 }} maxLength={32} />
            </Form.Item>
            <Form.Item
              name="logo"
              label="Logo 地址"
              style={{ marginBottom: 0 }}
              extra="走数字资产或对象存储外链"
            >
              <Input style={{ width: 260 }} maxLength={500} />
            </Form.Item>
            <Form.Item
              name="shareImage"
              label="分享封面"
              style={{ marginBottom: 0 }}
              extra="小程序转发卡片用的图，留空用 Logo"
            >
              <Input style={{ width: 260 }} maxLength={500} />
            </Form.Item>
          </Space>
          <Space style={{ marginTop: 16 }} wrap>
            <Button type="primary" htmlType="submit" loading={busy}>
              保存资料
            </Button>
            <Popconfirm
              title="关闭店铺"
              description="关闭后小程序端不可下单，凭据与台账保留，可重新开通。"
              okText="确认关闭"
              cancelText="再想想"
              onConfirm={() => void closeCurrentShop()}
            >
              <Button danger loading={closeShop.isPending}>
                关闭店铺
              </Button>
            </Popconfirm>
          </Space>
        </Form>
      </Panel>

      <Panel title="交易与运营参数">
        <Form
          form={tradeForm}
          layout="vertical"
          onFinish={(values) =>
            void submit(
              () =>
                onsiteApi.saveTrade({
                  params: { id: String(shop.id) },
                  body: values,
                }),
              "交易参数已保存，小程序端下次启动即生效",
            )
          }
        >
          <Space wrap size={16} align="start">
            <Form.Item
              name="timeUnitMinutes"
              label="时间片粒度"
              extra={TRADE_HINTS.timeUnitMinutes}
              style={{ marginBottom: 0 }}
            >
              <Select
                style={{ width: 120 }}
                options={ONSITE_TIME_UNITS.map((minutes) => ({
                  value: minutes,
                  label: `${minutes} 分钟`,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="bufferMinutes"
              label="前后缓冲（分钟）"
              extra={TRADE_HINTS.bufferMinutes}
              style={{ marginBottom: 0 }}
            >
              <InputNumber style={{ width: 120 }} min={0} max={120} />
            </Form.Item>
            <Form.Item
              name="maxDays"
              label="最多可约天数"
              extra={TRADE_HINTS.maxDays}
              style={{ marginBottom: 0 }}
            >
              <InputNumber style={{ width: 120 }} min={1} max={60} />
            </Form.Item>
            <Form.Item
              name="bookingLeadMinutes"
              label="最少提前（分钟）"
              extra={TRADE_HINTS.bookingLeadMinutes}
              style={{ marginBottom: 0 }}
            >
              <InputNumber style={{ width: 120 }} min={0} max={1440} />
            </Form.Item>
            <Form.Item
              name="autoCancelMinutes"
              label="未付款自动取消（分钟）"
              extra={TRADE_HINTS.autoCancelMinutes}
              style={{ marginBottom: 0 }}
            >
              <InputNumber style={{ width: 120 }} min={1} max={120} />
            </Form.Item>
            <Form.Item
              name="canTxHours"
              label="完成后可提现（小时）"
              extra={TRADE_HINTS.canTxHours}
              style={{ marginBottom: 0 }}
            >
              <InputNumber style={{ width: 120 }} min={0} max={168} />
            </Form.Item>
            <Form.Item
              name="travelFeeFallbackCents"
              label="车费兜底金额（分）"
              extra={TRADE_HINTS.travelFeeFallbackCents}
              style={{ marginBottom: 0 }}
            >
              <InputNumber style={{ width: 140 }} min={0} max={1000000} />
            </Form.Item>
            <Form.Item
              name="dispatchMode"
              label="派单模式"
              extra={TRADE_HINTS.dispatchMode}
              style={{ marginBottom: 0 }}
            >
              <Select style={{ width: 150 }} options={DISPATCH_OPTIONS} />
            </Form.Item>
            <Form.Item
              name="allowCrossDay"
              label="允许跨零点夜班"
              valuePropName="checked"
              extra={TRADE_HINTS.allowCrossDay}
              style={{ marginBottom: 0 }}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="travelFeeEnabled"
              label="收取车费"
              valuePropName="checked"
              extra={TRADE_HINTS.travelFeeEnabled}
              style={{ marginBottom: 0 }}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="reviewEnabled"
              label="允许顾客评价"
              valuePropName="checked"
              extra={TRADE_HINTS.reviewEnabled}
              style={{ marginBottom: 0 }}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="reviewAuditFirst"
              label="评价先审后展示"
              valuePropName="checked"
              extra={TRADE_HINTS.reviewAuditFirst}
              style={{ marginBottom: 0 }}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="alertEnabled"
              label="开启一键报警"
              valuePropName="checked"
              extra={TRADE_HINTS.alertEnabled}
              style={{ marginBottom: 0 }}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="alertNotifyOwner"
              label="求救通知店主"
              valuePropName="checked"
              extra={TRADE_HINTS.alertNotifyOwner}
              style={{ marginBottom: 0 }}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="alertDedupeMinutes"
              label="求救去重窗口（分钟）"
              extra={TRADE_HINTS.alertDedupeMinutes}
              style={{ marginBottom: 0 }}
            >
              <InputNumber style={{ width: 140 }} min={0} max={120} />
            </Form.Item>
          </Space>
          <div style={{ marginTop: 16 }}>
            <Button type="primary" htmlType="submit" loading={busy}>
              保存交易参数
            </Button>
          </div>
        </Form>
        <Notice variant="info">
          求救外呼号码与站点客服、私域活码在「店铺设置 → 客服与私域」和「售后与安全 → 一键报警」里维护；
          这里的开关只决定这条链路开不开，关掉任何一项都不影响另一项。
        </Notice>
      </Panel>

      <Panel title="小程序外观">
        <Form
          form={themeForm}
          layout="vertical"
          onFinish={(values) =>
            void submit(
              () =>
                onsiteApi.saveTheme({
                  params: { id: String(shop.id) },
                  body: values,
                }),
              "小程序外观已保存",
            )
          }
        >
          <Space wrap size={12} align="start">
            <Form.Item
              name="themeColor"
              label="主题色"
              rules={[{ pattern: /^#[0-9a-fA-F]{6}$/, message: "需为 #RRGGBB" }]}
              style={{ marginBottom: 0 }}
            >
              <Input style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="navigationTitle" label="导航标题" style={{ marginBottom: 0 }}>
              <Input style={{ width: 200 }} maxLength={30} />
            </Form.Item>
            {[0, 1, 2, 3].map((index) => (
              <Form.Item
                key={index}
                name={["tabBarLabels", index]}
                label={`页签 ${index + 1}`}
                rules={[{ required: true, message: "四个页签文案都要填" }]}
                style={{ marginBottom: 0 }}
              >
                <Input style={{ width: 120 }} maxLength={8} />
              </Form.Item>
            ))}
          </Space>
          <div style={{ marginTop: 16 }}>
            <Button htmlType="submit" loading={busy}>
              保存外观
            </Button>
          </div>
        </Form>
        <Notice variant="info">
          主题色、导航标题与页签文案在小程序启动时下发，改动即时生效不用重新出包；
          但 tabBar 图标若换设计稿，图片随包带出，需要重新下载源码包并上传。
        </Notice>
      </Panel>
    </Space>
  );
}
