"use client";

import { App, Button, Col, Form, Input, InputNumber, Popconfirm, Row, Select, Space, Switch, Tag } from "antd";
import { useEffect, useState } from "react";
import type { CardShopSite, CardShopSiteSaveBody } from "@enterprise/contracts";
import { cardShopApi } from "@/api/card-shop";
import { Panel } from "@/components/ui/panel";
import { labelOf, StatusTag } from "./common";
import { useCardShopScope } from "./scope";

/**
 * 站点设置：外观、交易参数、模块开关、购卡协议与上下线。
 * 保存后重拉站点列表（名称/开关变化会反映到页头切换器与总览）。
 */
export function SiteTab() {
  const { site, meta, reload } = useCardShopScope();
  const { message } = App.useApp();
  const [form] = Form.useForm<CardShopSiteSaveBody>();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!site) return;
    form.setFieldsValue({
      id: site.id,
      name: site.name,
      logo: site.logo,
      slogan: site.slogan,
      themeColor: site.themeColor,
      notice: site.notice,
      serviceContact: site.serviceContact,
      deskSiteKey: site.deskSiteKey,
      toggles: site.toggles,
      stockDisplayMode: site.stockDisplayMode,
      cardOrderMode: site.cardOrderMode,
      lockMinutes: site.lockMinutes,
      protocolText: site.protocolText,
    });
  }, [site, form]);

  if (!site) return null;

  const save = async (values: CardShopSiteSaveBody) => {
    setSaving(true);
    try {
      await cardShopApi.siteSave({ body: { ...values, id: site.id } });
      message.success("站点设置已保存");
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: CardShopSite["status"]) => {
    setBusy(true);
    try {
      await cardShopApi.siteStatus({ body: { id: site.id, status } });
      message.success(`站点已切换为「${labelOf(meta, "site", status)}」`);
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await cardShopApi.siteRemove({ body: { siteId: site.id } });
      message.success("商店已删除");
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="商店状态"
        titleExtra={<StatusTag meta={meta} kind="site" value={site.status} />}
        extra={
          <Space size={6}>
            {site.status !== "ONLINE" ? (
              <Button type="primary" size="small" loading={busy} onClick={() => void changeStatus("ONLINE")}>
                上线营业
              </Button>
            ) : (
              <Button size="small" loading={busy} onClick={() => void changeStatus("DRAFT")}>
                暂停营业
              </Button>
            )}
            {site.status !== "CLOSED" ? (
              <Popconfirm
                title="关店后买家端立即不可用，商品、卡密与订单台账保留；需要时再点「上线营业」即可恢复。"
                onConfirm={() => void changeStatus("CLOSED")}
              >
                <Button size="small" danger loading={busy}>
                  关店
                </Button>
              </Popconfirm>
            ) : null}
            <Button size="small" danger type="text" loading={busy} onClick={() => void remove()} style={{ marginLeft: 8 }}>
              彻底删除
            </Button>
          </Space>
        }
      >
        <Space size={24} wrap>
          <span className="text-12 muted">
            站点码 <Tag>{site.siteCode}</Tag>（写进小程序包 config.js）
          </span>
          <span className="text-12 muted">商品 {site.goodsTotal}</span>
          <span className="text-12 muted">可售卡密 {site.cardAvailableTotal}</span>
          {site.siteUrl ? (
            <span className="text-12 muted">站点地址 {site.siteUrl}</span>
          ) : null}
        </Space>
      </Panel>

      <Panel title="外观与基础信息">
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="商店名称" rules={[{ required: true, message: "请填写商店名称" }]}>
                <Input maxLength={120} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="slogan" label="标语">
                <Input maxLength={200} placeholder="一句话说明这里卖什么" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="logo"
                label="Logo 地址"
                extra="填可公网访问的图片直链；留空则小程序显示名称文字"
              >
                <Input maxLength={500} placeholder="https://..." />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="themeColor" label="主题色">
                <Input maxLength={16} placeholder="#3370FF" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="lockMinutes" label="锁单时长（分钟）" extra="超时未付款自动关单并释放卡密">
                <InputNumber min={1} max={1440} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="stockDisplayMode" label="库存展示口径">
                <Select
                  options={[
                    { value: "RANGE", label: "显示区间（充足/紧张/售罄）" },
                    { value: "ACTUAL", label: "显示实际数量" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="cardOrderMode" label="默认出卡顺序（商品可单独覆盖）">
                <Select
                  options={[
                    { value: "OLDEST", label: "先卖老卡" },
                    { value: "NEWEST", label: "先卖新卡" },
                    { value: "RANDOM", label: "随机出卡" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notice" label="首页公告栏文案" extra="模块开关关闭时小程序端不渲染公告栏">
                <Input.TextArea rows={2} maxLength={500} showCount />
              </Form.Item>
            </Col>
          </Row>

          <Panel title="联系方式名片" titleExtra={<span className="muted text-12">客服未绑定 AI 客服时展示这张名片</span>}>
            <Row gutter={16}>
              <Col xs={12} md={6}>
                <Form.Item name={["serviceContact", "phone"]} label="电话">
                  <Input maxLength={32} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name={["serviceContact", "qq"]} label="QQ">
                  <Input maxLength={32} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name={["serviceContact", "wechat"]} label="微信号">
                  <Input maxLength={64} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name={["serviceContact", "email"]} label="邮箱">
                  <Input maxLength={120} />
                </Form.Item>
              </Col>
            </Row>
          </Panel>

          <div style={{ height: 16 }} />
          <Panel
            title="模块开关"
            titleExtra={<span className="muted text-12">关掉的模块在小程序端整块不渲染</span>}
          >
            <Row gutter={[16, 4]}>
              {(meta?.toggleKeys ?? Object.keys(site.toggles)).map((key) => (
                <Col xs={12} md={8} key={key}>
                  <Form.Item
                    name={["toggles", key]}
                    label={meta?.toggleLabels?.[key] || key}
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </Panel>

          <div style={{ height: 16 }} />
          <Panel
            title="在线客服绑定"
            titleExtra={<span className="muted text-12">填 AI 客服站点的 siteKey，小程序客服页用 web-view 打开</span>}
          >
            <Form.Item name="deskSiteKey" label="AI 客服 siteKey" extra="留空表示不绑定，客服入口降级为联系方式名片">
              <Input maxLength={64} placeholder={site.deskSiteName ? `当前绑定：${site.deskSiteName}` : "未绑定"} />
            </Form.Item>
          </Panel>

          <div style={{ height: 16 }} />
          <Panel
            title="购卡协议"
            titleExtra={<span className="muted text-12">开关开启且正文非空时，买家下单必须先勾选同意</span>}
          >
            <Form.Item name="protocolText" label="协议正文（支持 HTML，落库前走净化）">
              <Input.TextArea rows={6} maxLength={200000} />
            </Form.Item>
          </Panel>

          <div style={{ marginTop: 16 }}>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存设置
            </Button>
          </div>
        </Form>
      </Panel>
    </div>
  );
}
