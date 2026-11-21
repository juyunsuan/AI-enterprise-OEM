"use client";

import { App, Button, Form, Input, InputNumber, Space, Tag } from "antd";
import type { FormInstance } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { MpMarket } from "@enterprise/contracts";
import { MP_MARKET_STATUS_LABELS } from "@enterprise/contracts";
import { marketplaceApi } from "@/api/marketplace";
import { Panel } from "@/components/ui/panel";
import { MarketStatusTag, ShopCodeBadge } from "./common";

type MarketForm = {
  name: string;
  logo: string;
  description: string;
  themeColor: string;
  closeMinutes: number;
  settleCycleDays: number;
};

/**
 * 市场设置：名称/门面/主题色与两个交易参数。
 * 市场编号（shopCode）创建后不可改——已发布的小程序 config.js 用的是它。
 */
export function MarketTab({ onChanged }: { onChanged?: () => void }) {
  const { message } = App.useApp();
  const [market, setMarket] = useState<MpMarket | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [form] = Form.useForm<MarketForm>();

  const load = useCallback(async () => {
    try {
      const detail = await marketplaceApi.detail();
      setMarket(detail);
      if (detail) {
        form.setFieldsValue({
          name: detail.name,
          logo: detail.logo,
          description: detail.description,
          themeColor: detail.themeColor,
          closeMinutes: detail.closeMinutes,
          settleCycleDays: detail.settleCycleDays,
        });
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "市场信息读取失败");
    } finally {
      setLoaded(true);
    }
  }, [message, form]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (values: MarketForm) => {
    setBusy(true);
    try {
      const saved = market
        ? await marketplaceApi.save({ body: values })
        : await marketplaceApi.create({
            body: {
              name: values.name,
              logo: values.logo,
              description: values.description,
              themeColor: values.themeColor,
            },
          });
      setMarket(saved);
      onChanged?.();
      message.success(market ? "市场设置已保存" : "市场已创建，接下来可以维护类目并招商户入驻");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: "DRAFT" | "ONLINE" | "CLOSED") => {
    setStatusBusy(true);
    try {
      const updated = await marketplaceApi.status({ body: { status } });
      setMarket(updated);
      message.success("市场状态已更新");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "状态更新失败");
    } finally {
      setStatusBusy(false);
    }
  };

  if (loaded && !market) {
    return (
      <Panel title="创建市场">
        <MarketFormView form={form} onCreate={submit} busy={busy} />
      </Panel>
    );
  }

  return (
    <>
      <Panel
        title="市场设置"
        titleExtra={
          market ? (
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <MarketStatusTag status={market.status} labels={MP_MARKET_STATUS_LABELS} />
              <ShopCodeBadge code={market.shopCode} />
            </span>
          ) : null
        }
      >
        <MarketFormView
          form={form}
          editing={!!market}
          onCreate={submit}
          busy={busy}
        />
        {market ? (
          <div className="text-12 muted" style={{ marginTop: 8 }}>
            市场编号 {market.shopCode} 是小程序的公开寻址码，创建后不可修改；商户入驻页需要填它。
          </div>
        ) : null}
      </Panel>

      {market ? (
        <Panel title="营业状态">
          <Space wrap>
            {market.status !== "ONLINE" ? (
              <Button
                type="primary"
                loading={statusBusy}
                disabled={market.status === "SUSPENDED"}
                onClick={() => changeStatus("ONLINE")}
              >
                开始营业
              </Button>
            ) : (
              <Button loading={statusBusy} onClick={() => changeStatus("DRAFT")}>
                转为筹备中
              </Button>
            )}
            <Button
              danger
              loading={statusBusy}
              disabled={market.status === "CLOSED" || market.status === "SUSPENDED"}
              onClick={() => changeStatus("CLOSED")}
            >
              关闭市场
            </Button>
            {market.status === "SUSPENDED" ? (
              <Tag color="red">平台已停服：{market.offReason || "请联系平台管理员"}</Tag>
            ) : null}
            {market.status === "CLOSED" ? (
              <span className="text-12 muted">关闭后商户与买家都不能再访问，重启需重新点「开始营业」。</span>
            ) : null}
          </Space>
          <div className="text-12 muted" style={{ marginTop: 8 }}>
            只有「营业中」的市场接受新商户入驻与商户后台写操作；筹备中可先配置类目与审核存量申请。
          </div>
        </Panel>
      ) : null}
    </>
  );
}

function MarketFormView({
  form,
  editing,
  onCreate,
  busy,
}: {
  form: FormInstance<MarketForm>;
  editing?: boolean;
  onCreate: (values: MarketForm) => void;
  busy: boolean;
}) {
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onCreate}
      initialValues={{
        name: "",
        logo: "",
        description: "",
        themeColor: "#E93323",
        closeMinutes: 30,
        settleCycleDays: 7,
      }}
      style={{ maxWidth: 640 }}
    >
      <Form.Item
        name="name"
        label="市场名称"
        rules={[{ required: true, min: 2, max: 120, message: "请填写 2-120 字的名称" }]}
      >
        <Input placeholder="如：城市好物集" maxLength={120} />
      </Form.Item>
      <Form.Item name="logo" label="市场 Logo（图片地址）">
        <Input placeholder="https://…（可留空）" maxLength={500} />
      </Form.Item>
      <Form.Item name="description" label="市场简介">
        <Input.TextArea rows={3} maxLength={500} showCount placeholder="一句话介绍这个市场招什么商户、卖给谁" />
      </Form.Item>
      <Form.Item
        name="themeColor"
        label="主题色（#RRGGBB）"
        rules={[
          { required: true, pattern: /^#[0-9a-fA-F]{6}$/, message: "请填写 #RRGGBB 格式的颜色" },
        ]}
      >
        <Input placeholder="#E93323" maxLength={7} style={{ width: 200 }} />
      </Form.Item>
      {editing ? (
        <>
          <Form.Item name="closeMinutes" label="未支付订单自动关闭（分钟）">
            <InputNumber min={5} max={1440} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="settleCycleDays" label="结算周期（天）">
            <InputNumber min={1} max={90} style={{ width: 200 }} />
          </Form.Item>
        </>
      ) : null}
      <Button type="primary" htmlType="submit" loading={busy}>
        {editing ? "保存设置" : "创建市场"}
      </Button>
    </Form>
  );
}
