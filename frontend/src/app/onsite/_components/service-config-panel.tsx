"use client";
// 客服与私域页签：AI 客服站点与企微 SCRM 活码各自独立绑定、各自判定可用性（松耦合，互不牵连）。
import {
  type OnsiteServiceConfigInput,
} from "@enterprise/contracts";
import { App, Button, Form, Select, Space, Switch, Tag } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useOnsiteServiceConfig,
  useOnsiteServiceConfigActions,
  useOnsiteServiceOptions,
} from "@/query/onsite";
import { Notice, Panel } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";
import { useOnsiteScope } from "./onsite-shell";

/**
 * 两条链路都在本域只存「引用」：客服存站点 siteKey，私域存活码 id。
 * 平台关掉 service-desk 不影响 SCRM 的绑定与展示，反之亦然；
 * 候选项由 onsite 后端直读两张表下发（`service-options`），避免跨板块调用被开关拦成 403。
 */
export function ServiceConfigPanel() {
  const { shopId } = useOnsiteScope();
  const { message } = App.useApp();
  const router = useRouter();
  const [form] = Form.useForm<OnsiteServiceConfigInput>();
  const configQuery = useOnsiteServiceConfig({ shopId });
  const optionsQuery = useOnsiteServiceOptions({ shopId });
  const save = useOnsiteServiceConfigActions().saveServiceConfig;
  const [deskOn, setDeskOn] = useState(false);
  const [scrmOn, setScrmOn] = useState(false);

  const config = configQuery.data ?? null;
  const options = optionsQuery.data ?? null;

  useEffect(() => {
    if (!config) return;
    form.setFieldsValue({
      deskEnabled: config.deskEnabled,
      deskSiteKey: config.deskSiteKey,
      scrmEnabled: config.scrmEnabled,
      scrmCodeId: config.scrmCodeId,
    });
    setDeskOn(config.deskEnabled);
    setScrmOn(config.scrmEnabled);
  }, [config, form]);

  const submit = async (values: OnsiteServiceConfigInput) => {
    const next = await save.mutateAsync({
      params: { id: String(shopId) },
      body: values,
    });
    message.success("客服与私域设置已保存，小程序端下次启动即生效");
    if (!next) return;
    setDeskOn(next.deskEnabled);
    setScrmOn(next.scrmEnabled);
  };

  if (configQuery.isPending && !configQuery.data) {
    return <Panel title="客服与私域">正在读取绑定状态…</Panel>;
  }

  return (
    <Form form={form} layout="vertical" onFinish={(values) => void submit(values)}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Panel title="在线客服（AI 客服）">
          <Form.Item
            name="deskEnabled"
            label="小程序显示客服入口"
            valuePropName="checked"
            extra="关闭后小程序端不再出现「在线客服」按钮，绑定关系保留"
          >
            <Switch onChange={(checked) => setDeskOn(checked)} />
          </Form.Item>
          <Form.Item
            name="deskSiteKey"
            label="绑定本站 AI 客服站点"
            extra="会话、知识库与机器人都在「AI 客服」板块维护，这里只选一个站点"
          >
            <Select
              allowClear
              placeholder={
                options?.deskSites.length
                  ? "选择客服站点"
                  : "还没有客服站点，请先到「AI 客服」新建"
              }
              options={(options?.deskSites ?? []).map((site) => ({
                value: site.siteKey,
                label: site.enabled
                  ? site.name
                  : `${site.name}（已停用，选了也不会生效）`,
              }))}
            />
          </Form.Item>
          {config && deskOn ? (
            config.deskAvailable ? (
              <Notice variant="success">
                已就绪：顾客在小程序点「在线客服」即进入站点「{config.deskSiteName}」的会话窗。
              </Notice>
            ) : (
              <Notice variant="warn">
                {config.deskHint || "在线客服当前不可用"}
                {options?.deskHref ? (
                  <>
                    {" "}
                    <Button type="link" size="small" onClick={() => router.push(options.deskHref)}>
                      前往处理
                    </Button>
                  </>
                ) : null}
              </Notice>
            )
          ) : null}
        </Panel>

        <Panel title="私域顾问（企业微信 SCRM）">
          <Form.Item
            name="scrmEnabled"
            label="小程序显示加微入口"
            valuePropName="checked"
            extra="关闭后小程序端不再出现「添加顾问微信」，绑定关系保留"
          >
            <Switch onChange={(checked) => setScrmOn(checked)} />
          </Form.Item>
          <Form.Item
            name="scrmCodeId"
            label="绑定营销工具·企微 SCRM 活码"
            extra="顾客扫码加微后的客户池、打标与 SOP 都在 SCRM 侧进行，本域不落会话数据"
          >
            <Select
              allowClear
              placeholder={
                options?.scrmCodes.length
                  ? "选择活码"
                  : "还没有活码，请先到「营销工具 → 企业微信 SCRM」创建"
              }
              options={(options?.scrmCodes ?? []).map((code) => ({
                value: code.id,
                label:
                  code.status === "ACTIVE" && code.qrUrl
                    ? code.name
                    : `${code.name}（${code.status === "ACTIVE" ? "缺二维码" : "已暂停"}，选了也不会生效）`,
              }))}
            />
          </Form.Item>
          {config && scrmOn ? (
            config.scrmAvailable ? (
              <Space align="start">
                <RawImg
                  src={config.scrmQrUrl}
                  alt={`活码 ${config.scrmCodeName} 二维码`}
                  style={{ width: 120, height: 120, objectFit: "contain", border: "1px solid rgba(31,35,41,0.08)" }}
                />
                <div className="muted">
                  当前展示给顾客的活码：{config.scrmCodeName}
                  <div>
                    <Tag color="green">就绪</Tag>
                  </div>
                </div>
              </Space>
            ) : (
              <Notice variant="warn">
                {config.scrmHint || "私域加微入口当前不可用"}
                {options?.scrmHref ? (
                  <>
                    {" "}
                    <Button type="link" size="small" onClick={() => router.push(options.scrmHref)}>
                      前往处理
                    </Button>
                  </>
                ) : null}
              </Notice>
            )
          ) : null}
        </Panel>
      </div>

      <Notice variant="info">
        两条链路互不依赖：平台管理员关闭「AI 客服」或「企业微信 SCRM」任意一个，另一个照常工作，
        保存也不会因为另一侧不可用而被拒绝。
      </Notice>
      <div style={{ marginTop: 12 }}>
        <Button type="primary" htmlType="submit" loading={save.isPending}>
          保存客服与私域设置
        </Button>
      </div>
    </Form>
  );
}
