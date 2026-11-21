"use client";

import { useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import type { ErrandAsset, ErrandRule, ErrandSite } from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { serviceDeskApi } from "@/api/collab";
import { Notice, Panel } from "@/components/ui/panel";
import { useErrandScope } from "./scope";
import { StatusTag } from "./common";

type ToggleKey = keyof ErrandSite["toggles"];

const TOGGLE_KEYS: ToggleKey[] = [
  "indexNotice",
  "deskChat",
  "contact",
  "addressBook",
  "myOrders",
  "protocol",
  "coupon",
  "tip",
  "buyService",
  "riderApply",
];

/**
 * 站点设置：门面、联系方式、栏目开关与 AI 客服绑定；计价按城市在「服务城市」维护。
 * 图片素材走平台数字资产（选一条资产把公网地址填进来），不在本站另建素材库。
 */
export function SiteTab() {
  const { site, meta, reload } = useErrandScope();
  const { message } = App.useApp();
  const [form] = Form.useForm<ErrandSite & ErrandRule>();
  const [deskOptions, setDeskOptions] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<"logo" | "banner" | null>(null);
  const [assets, setAssets] = useState<ErrandAsset[]>([]);
  const [assetKeyword, setAssetKeyword] = useState("");

  useEffect(() => {
    if (!site) return;
    form.setFieldsValue({
      ...site,
      ...site.rule,
    });
  }, [site, form]);

  useEffect(() => {
    serviceDeskApi
      .sites()
      .then((rows) =>
        setDeskOptions(
          (rows ?? []).map((row) => ({
            value: row.siteKey,
            label: `${row.name}${row.enabled ? "" : "（已停用）"}`,
          })),
        ),
      )
      .catch(() => setDeskOptions([]));
  }, []);

  useEffect(() => {
    if (!picker) return;
    errandApi
      .assets({ query: { keyword: assetKeyword, take: 40 } })
      .then((rows) => setAssets(rows ?? []))
      .catch(() => setAssets([]));
  }, [picker, assetKeyword]);

  if (!site) return null;

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await errandApi.siteSave({
        body: {
          name: values.name,
          logo: values.logo || "",
          banner: values.banner || "",
          slogan: values.slogan || "",
          themeColor: values.themeColor || "#3370FF",
          notice: values.notice || "",
          province: values.province || "",
          city: values.city || "",
          district: values.district || "",
          addressLine: values.addressLine || "",
          lng: Number(values.lng) || 0,
          lat: Number(values.lat) || 0,
          businessHours: values.businessHours || "",
          phone: values.phone || "",
          contact: values.contact,
          deskSiteKey: values.deskSiteKey || "",
          toggles: values.toggles || {},
          protocolText: values.protocolText || "",
        },
      });
      message.success("站点设置已保存；计价请到「服务城市」按城市维护");
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const pickAsset = (asset: ErrandAsset) => {
    if (picker === "logo") form.setFieldValue("logo", asset.url);
    if (picker === "banner") form.setFieldValue("banner", asset.url);
    setPicker(null);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="站点门面"
        titleExtra={
          <Space>
            <StatusTag meta={meta} kind="site" value={site.status} />
            <Tag>{site.siteCode}</Tag>
          </Space>
        }
        extra={
          <Button
            onClick={async () => {
              try {
                await errandApi.siteStatus({
                  body: { status: site.status === "ONLINE" ? "DRAFT" : "ONLINE" },
                });
                message.success(site.status === "ONLINE" ? "已下线站点" : "站点已上线");
                await reload();
              } catch (cause) {
                message.error(cause instanceof Error ? cause.message : "操作失败");
              }
            }}
          >
            {site.status === "ONLINE" ? "下线站点" : "上线站点"}
          </Button>
        }
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="站点名称" rules={[{ required: true, message: "请填写名称" }]}>
                <Input maxLength={120} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="themeColor" label="主题色">
                <Input maxLength={16} placeholder="#3370FF" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="phone" label="联系电话">
                <Input maxLength={32} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="logo" label="Logo 地址（数字资产直链）">
                <Input maxLength={500} placeholder="点右侧「从数字资产选择」" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="banner" label="首页横幅地址">
                <Input maxLength={500} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="素材">
                <Space>
                  <Button onClick={() => setPicker("logo")}>从数字资产选 Logo</Button>
                  <Button onClick={() => setPicker("banner")}>选横幅</Button>
                </Space>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="slogan" label="一句话介绍">
                <Input maxLength={200} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="notice" label="首页公告">
                <Input maxLength={500} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="province" label="省">
                <Input maxLength={40} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="city" label="市">
                <Input maxLength={40} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="district" label="区">
                <Input maxLength={40} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="businessHours" label="营业时间">
                <Input maxLength={80} placeholder="09:00-22:00" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="addressLine" label="站点地址">
                <Input maxLength={200} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="lng" label="经度">
                <InputNumber style={{ width: "100%" }} min={-180} max={180} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="lat" label="纬度">
                <InputNumber style={{ width: "100%" }} min={-90} max={90} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="deskSiteKey"
                label="AI 客服服务站"
                extra="只绑定平台 AI 客服（service-desk）已有站点；小程序用 web-view 打开现成会话页"
              >
                <Select
                  allowClear
                  showSearch
                  options={deskOptions}
                  placeholder="未绑定（展示联系电话）"
                />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="protocolText" label="下单协议（顾客须勾选）">
                <Input.TextArea rows={2} maxLength={4000} />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="left">小程序栏目</Divider>
          <Row gutter={16}>
            {TOGGLE_KEYS.map((key) => (
              <Col span={6} key={key}>
                <Form.Item
                  name={["toggles", key]}
                  label={meta?.toggleLabels?.[key] || key}
                  valuePropName="checked"
                  initialValue={true}
                >
                  <Switch />
                </Form.Item>
              </Col>
            ))}
          </Row>

          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存站点设置
            </Button>
            <span className="muted text-12">
              保存后小程序端以实时配置为准，不需要重新出包
            </span>
          </Space>
        </Form>
      </Panel>

      <Card size="small" title="AI 客服与数字资产">
        <Notice variant="info">
          在线客服只存绑定的 AI 客服站点 Key，会话与消息全部留在 service-desk；
          图片素材从「数字资产管理」选一条资产填入地址即可，本站不另建素材库。
          {deskOptions.length === 0 ? " 还没有 AI 客服站点：先到「AI 客服」新建一个站点。" : ""}
        </Notice>
      </Card>

      <Modal
        title="从数字资产选择图片"
        open={!!picker}
        onCancel={() => setPicker(null)}
        footer={null}
        width={760}
        destroyOnHidden
      >
        <Space style={{ marginBottom: 12 }}>
          <Input.Search
            allowClear
            placeholder="按名称搜索"
            onSearch={(value) => setAssetKeyword(value)}
            style={{ width: 260 }}
          />
          <Button onClick={() => setAssetKeyword("")}>刷新</Button>
        </Space>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => pickAsset(asset)}
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, cursor: "pointer" }}
            >
              <Image src={asset.url} alt={asset.name} height={88} style={{ objectFit: "cover" }} />
              <div className="text-12" style={{ marginTop: 6, wordBreak: "break-all" }}>
                {asset.name || asset.url.slice(-24)}
              </div>
            </button>
          ))}
        </div>
        {assets.length === 0 ? <Notice variant="info">没有图片资产：先到「数字资产管理」上传。</Notice> : null}
      </Modal>
    </div>
  );
}
