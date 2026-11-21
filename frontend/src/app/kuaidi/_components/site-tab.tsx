"use client";

import {
  App,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import { useEffect, useState } from "react";
import type {
  KuaidiPayAccount,
  KuaidiSite,
  KuaidiSiteSaveBody,
} from "@enterprise/contracts";
import { kuaidiApi } from "@/api/kuaidi";
import { Panel } from "@/components/ui/panel";
import { labelOf, StatusTag } from "./common";
import { useKuaidiScope } from "./scope";

/**
 * 站点设置：外观、保价与交易参数、模块开关、寄件协议与上下线。
 * 保存后重拉站点列表（名称/开关变化会反映到页头切换器与总览）。
 */
export function SiteTab() {
  const { site, meta, reload } = useKuaidiScope();
  const { message } = App.useApp();
  const [form] = Form.useForm<KuaidiSiteSaveBody>();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payAccounts, setPayAccounts] = useState<KuaidiPayAccount[]>([]);

  useEffect(() => {
    kuaidiApi
      .payAccounts()
      .then((rows) => setPayAccounts(rows ?? []))
      .catch(() => setPayAccounts([]));
  }, []);

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
      province: site.province,
      city: site.city,
      district: site.district,
      addressLine: site.addressLine,
      lng: site.lng,
      lat: site.lat,
      businessHours: site.businessHours,
      phone: site.phone,
      pickupNote: site.pickupNote,
      payAccountId: site.payAccountId,
      toggles: site.toggles,
      insuranceEnabled: site.insuranceEnabled,
      insuranceRate: site.insuranceRate,
      insuranceMax: site.insuranceMax,
      maxWeightKg: site.maxWeightKg,
      payMinutes: site.payMinutes,
      pickupSlots: site.pickupSlots,
      protocolText: site.protocolText,
    });
  }, [site, form]);

  if (!site) return null;

  const save = async (values: KuaidiSiteSaveBody) => {
    setSaving(true);
    try {
      await kuaidiApi.siteSave({ body: { ...values, id: site.id } });
      message.success("站点设置已保存");
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: KuaidiSite["status"], reason = "") => {
    setBusy(true);
    try {
      await kuaidiApi.siteStatus({ body: { id: site.id, status, reason } });
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
      await kuaidiApi.siteRemove({ body: { siteId: site.id } });
      message.success("站点已删除");
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
        title="站点状态"
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
                title="关闭后买家端立即不可用，数据保留；重新上线需再次切回营业中。"
                onConfirm={() => void changeStatus("CLOSED", "店主主动关站")}
              >
                <Button size="small" danger loading={busy}>
                  关站
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
            寄件点码 <Tag>{site.siteCode}</Tag>（小程序选点与扫码定位用）
          </span>
          <span className="text-12 muted">快递公司 {site.companyTotal}</span>
          <span className="text-12 muted">寄件单 {site.orderTotal}</span>
          <span className="text-12 muted">顾客 {site.customerTotal}</span>
          <span className="text-12 muted">
            收款账户 {site.payAccountName || "默认（第一个启用账户）"}
          </span>
        </Space>
      </Panel>

      <Panel title="外观与基础信息">
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="站点名称" rules={[{ required: true, message: "请填写站点名称" }]}>
                <Input maxLength={120} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="slogan" label="标语">
                <Input maxLength={200} placeholder="一句话说明寄件服务范围" />
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
              <Form.Item name="payMinutes" label="支付保留（分钟）" extra="超时未付款自动关单">
                <InputNumber min={5} max={1440} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notice" label="首页公告栏文案" extra="模块开关关闭时小程序端不渲染公告栏">
                <Input.TextArea rows={2} maxLength={500} showCount />
              </Form.Item>
            </Col>
          </Row>

          <Panel
            title="寄件点位置与取件信息"
            titleExtra={
              <span className="muted text-12">
                顾客在小程序里按这里的地址选点；同一个账号可以有多个寄件点
              </span>
            }
          >
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="province" label="省">
                  <Input maxLength={40} placeholder="如 广东省" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="city" label="市">
                  <Input maxLength={40} placeholder="如 深圳市" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="district" label="区/县">
                  <Input maxLength={40} placeholder="如 南山区" />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item name="addressLine" label="详细地址" extra="门牌号与楼层等，顾客导航与上门取件都用它">
                  <Input maxLength={200} placeholder="如 科技园 8 栋 101" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="businessHours" label="营业时间">
                  <Input maxLength={80} placeholder="如 09:00-18:00" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="phone" label="寄件点电话">
                  <Input maxLength={32} placeholder="顾客可一键拨打" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  name="payAccountId"
                  label="收款账户"
                  extra="不选时用账号下第一个启用的收款账户"
                >
                  <Select
                    options={[
                      { value: 0, label: "默认（第一个启用账户）" },
                      ...payAccounts
                        .filter((item) => item.enabled)
                        .map((item) => ({
                          value: item.id,
                          label: `${item.name}（${item.mchId}）${item.complete ? "" : " · 未配齐"}`,
                        })),
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item
                  name="pickupNote"
                  label="取件提示"
                  extra="展示在首页与下单页，如「大件请提前电话联系」"
                >
                  <Input.TextArea rows={2} maxLength={300} showCount />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="lng" label="经度（可选）" extra="地图选点回填；0 表示未设置">
                  <InputNumber min={-180} max={180} step={0.000001} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="lat" label="纬度（可选）" extra="与经度成对填写">
                  <InputNumber min={-90} max={90} step={0.000001} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          </Panel>

          <div style={{ height: 16 }} />
          <Panel
            title="报价与保价"
            titleExtra={<span className="muted text-12">运费由后端报价引擎按快递公司规则计算</span>}
          >
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="maxWeightKg" label="单件最大计费重量（kg）" extra="超过时小程序直接拒单">
                  <InputNumber min={0.1} max={1000} step={1} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="insuranceEnabled" label="开通保价" valuePropName="checked">
                  <Switch checkedChildren="可保价" unCheckedChildren="不保价" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="insuranceMax" label="单件最高保价金额（元）" extra="0 表示不限">
                  <InputNumber min={0} max={9999999} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="insuranceRate" label="保价费率" extra="如 0.005 = 千分之五，按声明价值计费">
                  <InputNumber min={0} max={0.2} step={0.001} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item
                  name="pickupSlots"
                  label="可取件时段"
                  extra="买家下单时从这里选一个时段；留空表示不限定"
                >
                  <Select
                    mode="tags"
                    maxTagCount={10}
                    placeholder="如 09:00-12:00，输入后回车添加"
                    options={site.pickupSlots.map((value) => ({ value, label: value }))}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Panel>

          <div style={{ height: 16 }} />
          <Panel title="联系方式名片" titleExtra={<span className="muted text-12">客服未绑定 AI 客服时展示这张名片</span>}>
            <Row gutter={16}>
              <Col xs={12} md={8}>
                <Form.Item name={["serviceContact", "phone"]} label="电话">
                  <Input maxLength={32} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name={["serviceContact", "wechat"]} label="微信号">
                  <Input maxLength={64} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name={["serviceContact", "email"]} label="邮箱">
                  <Input maxLength={120} />
                </Form.Item>
              </Col>
            </Row>
          </Panel>

          <div style={{ height: 16 }} />
          <Panel title="模块开关" titleExtra={<span className="muted text-12">关掉的模块在小程序端整块不渲染</span>}>
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
            <Form.Item
              name="deskSiteKey"
              label="AI 客服 siteKey"
              extra="留空表示不绑定，客服入口降级为联系方式名片"
            >
              <Input
                maxLength={64}
                placeholder={site.deskSiteName ? `当前绑定：${site.deskSiteName}` : "未绑定"}
              />
            </Form.Item>
          </Panel>

          <div style={{ height: 16 }} />
          <Panel title="寄件协议" titleExtra={<span className="muted text-12">开关开启且正文非空时，买家下单必须先勾选同意</span>}>
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
