"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
  MiniAppView,
  RentalCustomerRow,
  RentalShopRow,
  RentalStaffRow,
} from "@enterprise/contracts";
import { rentalApi } from "@/api/rental";
import { Notice, Panel } from "@/components/ui/panel";
import { exportCsv } from "./export";

const cny = (value: number) =>
  "¥" + Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CustomersPanel({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState<RentalCustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [form] = Form.useForm<{
    id?: number;
    nickname: string;
    phone: string;
    gender: number;
    city?: string;
    remark?: string;
    status: "ACTIVE" | "BLOCKED";
  }>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await rentalApi.customers({
        params: { id: String(shopId) },
        query: { page: 1, pageSize: 100, keyword, status },
      });
      setRows(result?.list ?? []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "顾客读取失败");
    } finally {
      setLoading(false);
    }
  }, [keyword, message, shopId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ gender: 0, status: "ACTIVE" });
    setOpen(true);
  };

  const openEdit = (row: RentalCustomerRow) => {
    form.setFieldsValue({
      id: row.id,
      nickname: row.nickname || row.phone || "顾客",
      phone: row.phone,
      gender: row.gender,
      city: row.city,
      remark: row.remark,
      status: row.status as "ACTIVE" | "BLOCKED",
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      await rentalApi.saveCustomer({
        params: { id: String(shopId) },
        body: {
          id: values.id ?? 0,
          nickname: values.nickname,
          phone: values.phone,
          gender: Number(values.gender ?? 0),
          city: values.city ?? "",
          remark: values.remark ?? "",
          status: values.status,
        },
      });
      message.success("顾客档案已保存");
      setOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = (row: RentalCustomerRow) => {
    modal.confirm({
      title: "删除顾客",
      content: `删除「${row.nickname || row.phone}」后不可恢复；有历史租单的顾客会改为限制下单。`,
      onOk: async () => {
        const result = await rentalApi.removeCustomer({
          params: { id: String(shopId) },
          body: { id: row.id },
        });
        if (result?.blocked) message.warning("该顾客有历史租单，已改为限制下单");
        else message.success("已删除");
        await load();
      },
    });
  };

  const toggle = async (row: RentalCustomerRow) => {
    const next = row.status === "ACTIVE" ? "BLOCKED" : "ACTIVE";
    try {
      await rentalApi.customerStatus({
        params: { id: String(shopId), customerId: String(row.id) },
        body: { status: next },
      });
      message.success(next === "BLOCKED" ? "已限制该顾客下单" : "已恢复该顾客下单");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const genderText = (value: number) => (value === 1 ? "男" : value === 2 ? "女" : "未填写");

  const columns: ColumnsType<RentalCustomerRow> = [
    { title: "顾客", dataIndex: "nickname", render: (value: string, row) => value || row.phone || "微信顾客" },
    { title: "手机号", dataIndex: "phone", render: (value: string) => value || "—" },
    { title: "来源", dataIndex: "source", width: 100, render: (value: string) => (value === "ADMIN" ? "后台建档" : "小程序") },
    { title: "性别", dataIndex: "gender", width: 80, render: (value: number) => genderText(value) },
    { title: "城市", dataIndex: "city", width: 100, render: (value: string) => value || "—" },
    { title: "订单数", dataIndex: "orderCount", align: "right", width: 80 },
    { title: "累计实付", dataIndex: "totalSpend", align: "right", render: (value: number) => cny(value) },
    { title: "最近下单", dataIndex: "lastOrderAt", width: 170, render: (value: string) => (value ? value.replace("T", " ").slice(0, 19) : "—") },
    { title: "状态", dataIndex: "status", width: 90, render: (value: string) => <Tag color={value === "ACTIVE" ? "green" : "red"}>{value === "ACTIVE" ? "正常" : "已限制"}</Tag> },
    {
      title: "操作",
      width: 210,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
          <Button size="small" danger={row.status === "ACTIVE"} onClick={() => void toggle(row)}>
            {row.status === "ACTIVE" ? "限制" : "恢复"}
          </Button>
          <Button size="small" danger onClick={() => remove(row)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Panel
        title="门店顾客"
        extra={
          <Space>
            <Input.Search placeholder="昵称 / 手机号" allowClear style={{ width: 220 }} onSearch={(value) => setKeyword(value.trim())} />
            <Select
              style={{ width: 120 }}
              value={status}
              onChange={setStatus}
              options={[{ value: "all", label: "全部" }, { value: "ACTIVE", label: "正常" }, { value: "BLOCKED", label: "已限制" }]}
            />
            <Button
              onClick={() =>
                exportCsv(
                  "rental-customers.csv",
                  ["顾客", "手机号", "来源", "性别", "城市", "订单数", "累计实付", "最近下单", "状态"],
                  rows.map((row) => [
                    row.nickname,
                    row.phone,
                    row.source,
                    genderText(row.gender),
                    row.city,
                    row.orderCount,
                    row.totalSpend,
                    row.lastOrderAt,
                    row.status,
                  ]),
                )
              }
            >
              导出 CSV
            </Button>
            <Button type="primary" onClick={openCreate}>新增顾客</Button>
          </Space>
        }
      >
        <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={{ pageSize: 10 }} />
      </Panel>

      <Modal
        title={form.getFieldValue("id") ? "编辑顾客" : "新增顾客"}
        open={open}
        confirmLoading={busy}
        onOk={() => void submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nickname" label="顾客姓名" rules={[{ required: true, message: "请填写姓名" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号" rules={[{ required: true, message: "请填写手机号" }]}>
            <Input />
          </Form.Item>
          <Space>
            <Form.Item name="gender" label="性别">
              <Select style={{ width: 120 }} options={[{ value: 0, label: "未填写" }, { value: 1, label: "男" }, { value: 2, label: "女" }]} />
            </Form.Item>
            <Form.Item name="city" label="城市">
              <Input placeholder="如：上海" />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select style={{ width: 120 }} options={[{ value: "ACTIVE", label: "正常" }, { value: "BLOCKED", label: "限制下单" }]} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

type StaffForm = {
  id?: number;
  name: string;
  phone: string;
  staffCode: string;
  role: "OWNER" | "CLERK" | "INSPECTOR";
  status: "ACTIVE" | "SUSPENDED";
};

export function StaffPanel({ shopId }: { shopId: number }) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<StaffForm>();
  const [rows, setRows] = useState<RentalStaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await rentalApi.staffs({
        params: { id: String(shopId) },
        query: { page: 1, pageSize: 100, status: "all" },
      });
      setRows(result?.list ?? []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "员工读取失败");
    } finally {
      setLoading(false);
    }
  }, [message, shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ role: "CLERK", status: "ACTIVE" });
    setOpen(true);
  };

  const openEdit = (row: RentalStaffRow) => {
    form.setFieldsValue({
      id: row.id,
      name: row.name,
      phone: row.phone,
      staffCode: row.staffCode,
      role: row.role as StaffForm["role"],
      status: row.status as StaffForm["status"],
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      await rentalApi.saveStaff({
        params: { id: String(shopId) },
        body: {
          id: values.id ?? 0,
          name: values.name,
          phone: values.phone,
          staffCode: values.staffCode,
          role: values.role,
          status: values.status,
        },
      });
      message.success("员工档案已保存");
      setOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = (row: RentalStaffRow) => {
    modal.confirm({
      title: "停用员工",
      content: `停用后「${row.name}」无法再绑定员工端，历史验车记录保留。确定继续吗？`,
      onOk: async () => {
        await rentalApi.removeStaff({ params: { id: String(shopId) }, body: { id: row.id } });
        message.success("已停用");
        await load();
      },
    });
  };

  return (
    <Panel
      title="员工与工号"
      extra={<Button type="primary" onClick={openCreate}>新增员工</Button>}
    >
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={[
          { title: "姓名", dataIndex: "name" },
          { title: "手机号", dataIndex: "phone" },
          { title: "工号", dataIndex: "staffCode" },
          { title: "角色", dataIndex: "roleLabel", width: 90 },
          { title: "状态", dataIndex: "status", width: 90, render: (value: string, row) => <Tag color={value === "ACTIVE" ? "green" : "default"}>{row.statusLabel}</Tag> },
          {
            title: "操作",
            width: 150,
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
                <Button size="small" danger onClick={() => remove(row)}>停用</Button>
              </Space>
            ),
          },
        ]}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={form.getFieldValue("id") ? "编辑员工" : "新增员工"}
        open={open}
        confirmLoading={busy}
        onOk={() => void submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请填写姓名" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号" rules={[{ required: true, message: "请填写手机号" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="staffCode" label="工号" rules={[{ required: true, message: "请填写工号" }]}>
            <Input placeholder="员工在小程序绑定身份时使用" />
          </Form.Item>
          <Space>
            <Form.Item name="role" label="角色">
              <Select
                style={{ width: 140 }}
                options={[{ value: "OWNER", label: "店长" }, { value: "CLERK", label: "店员" }, { value: "INSPECTOR", label: "验车员" }]}
              />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select style={{ width: 140 }} options={[{ value: "ACTIVE", label: "在岗" }, { value: "SUSPENDED", label: "停用" }]} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Panel>
  );
}

export function SettingsPanel({
  shop,
  onRefresh,
}: {
  shop: RentalShopRow;
  onRefresh: () => Promise<void> | void;
}) {
  const { message } = App.useApp();
  const [shopForm] = Form.useForm<{
    name: string;
    logo?: string;
    servicePhone?: string;
    address?: string;
    themeColor?: string;
    navigationTitle?: string;
  }>();
  const [tradeForm] = Form.useForm<{
    autoCancelMinutes?: number;
    maxRentDays?: number;
    depositRefundHours?: number;
    depositRefundAuto?: boolean;
    deskSiteKey?: string;
    scrmCodeId?: number;
    notice?: string;
  }>();
  const [wechatForm] = Form.useForm<{
    appId?: string;
    appSecret?: string;
    mchId?: string;
    payApiV3Key?: string;
    payCertSerial?: string;
    payPrivateKey?: string;
    payEnabled?: boolean;
  }>();
  const [wechat, setWechat] = useState<MiniAppView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    shopForm.setFieldsValue({
      name: shop.name,
      logo: shop.logo,
      servicePhone: shop.servicePhone,
      address: shop.address,
      themeColor: shop.themeColor,
      navigationTitle: shop.navigationTitle,
    });
    tradeForm.setFieldsValue({
      autoCancelMinutes: shop.trade.autoCancelMinutes,
      maxRentDays: shop.trade.maxRentDays,
      depositRefundHours: shop.trade.depositRefundHours,
      depositRefundAuto: shop.trade.depositRefundAuto,
      deskSiteKey: shop.trade.deskSiteKey,
      scrmCodeId: shop.trade.scrmCodeId,
      notice: shop.trade.notice,
    });
    rentalApi
      .wechat({ params: { id: String(shop.id) } })
      .then((view) => {
        setWechat(view);
        wechatForm.setFieldsValue({
          appId: view?.appId || "",
          mchId: view?.mchId || "",
          payCertSerial: view?.payCertSerial || "",
          payEnabled: view?.payEnabled || false,
        });
      })
      .catch(() => setWechat(null));
  }, [shop, shopForm, tradeForm, wechatForm]);

  const saveShop = async () => {
    const values = await shopForm.validateFields();
    setBusy(true);
    try {
      await rentalApi.updateShop({
        params: { id: String(shop.id) },
        body: {
          id: shop.id,
          name: values.name,
          logo: values.logo ?? "",
          servicePhone: values.servicePhone ?? "",
          address: values.address ?? "",
          themeColor: values.themeColor ?? "#3370ff",
          navigationTitle: values.navigationTitle ?? "租赁管理",
        },
      });
      message.success("门店资料已保存");
      await onRefresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveTrade = async () => {
    const values = await tradeForm.validateFields();
    setBusy(true);
    try {
      await rentalApi.saveTrade({
        params: { id: String(shop.id) },
        body: {
          autoCancelMinutes: Number(values.autoCancelMinutes ?? 30),
          maxRentDays: Number(values.maxRentDays ?? 30),
          depositRefundHours: Number(values.depositRefundHours ?? 24),
          depositRefundAuto: Boolean(values.depositRefundAuto),
          deskSiteKey: values.deskSiteKey ?? "",
          scrmCodeId: Number(values.scrmCodeId ?? 0),
          notice: values.notice ?? "",
        },
      });
      message.success("交易与客服设置已保存");
      await onRefresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveWechat = async () => {
    const values = await wechatForm.validateFields();
    setBusy(true);
    try {
      const view = await rentalApi.saveWechat({
        params: { id: String(shop.id) },
        body: {
          appId: values.appId ?? "",
          ...(values.appSecret ? { appSecret: values.appSecret } : {}),
          mchId: values.mchId ?? "",
          ...(values.payApiV3Key ? { payApiV3Key: values.payApiV3Key } : {}),
          payCertSerial: values.payCertSerial ?? "",
          ...(values.payPrivateKey ? { payPrivateKey: values.payPrivateKey } : {}),
          payEnabled: Boolean(values.payEnabled),
          templates: {},
        },
      });
      setWechat(view);
      wechatForm.setFieldsValue({ appSecret: "", payApiV3Key: "", payPrivateKey: "" });
      message.success("小程序与支付凭据已保存");
      await onRefresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const testWechat = async () => {
    setBusy(true);
    try {
      const result = await rentalApi.testWechat({ params: { id: String(shop.id) }, body: {} });
      message[result?.ok ? "success" : "error"](result?.message || "自检完成");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "自检失败");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const result = await rentalApi.package({ params: { id: String(shop.id) } });
      if (result?.url) window.open(result.url, "_blank");
      message.success("已生成小程序源码包");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async () => {
    const next = shop.status === "ONLINE" ? "CLOSED" : "ONLINE";
    setBusy(true);
    try {
      await rentalApi.setStatus({ params: { id: String(shop.id) }, body: { status: next } });
      message.success(next === "ONLINE" ? "门店已上线" : "门店已下线");
      await onRefresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Panel
        title="门店资料"
        extra={<Space><Button onClick={toggleStatus} loading={busy}>{shop.status === "ONLINE" ? "下线门店" : "上线门店"}</Button><Button type="primary" loading={busy} onClick={() => void saveShop()}>保存资料</Button></Space>}
      >
        <Form form={shopForm} layout="vertical">
          <Space wrap>
            <Form.Item name="name" label="门店名称" rules={[{ required: true }]} style={{ width: 260 }}>
              <Input />
            </Form.Item>
            <Form.Item name="logo" label="Logo 地址" style={{ width: 300 }}>
              <Input />
            </Form.Item>
            <Form.Item name="servicePhone" label="联系电话" style={{ width: 200 }}>
              <Input />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="address" label="门店地址" style={{ width: 380 }}>
              <Input />
            </Form.Item>
            <Form.Item name="themeColor" label="主题色" style={{ width: 160 }}>
              <Input placeholder="#3370ff" />
            </Form.Item>
            <Form.Item name="navigationTitle" label="小程序标题" style={{ width: 220 }}>
              <Input />
            </Form.Item>
          </Space>
        </Form>
        <Notice>
          门店码 <b>{shop.shopCode}</b>：小程序 config.js 的 shopCode 填这个值；员工绑定身份也用它定位本店。
        </Notice>
      </Panel>

      <Panel title="交易与客服" extra={<Button type="primary" loading={busy} onClick={() => void saveTrade()}>保存设置</Button>}>
        <Form form={tradeForm} layout="vertical">
          <Space wrap>
            <Form.Item name="autoCancelMinutes" label="未付款自动关单（分钟）" style={{ width: 220 }}>
              <InputNumber min={1} max={240} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="maxRentDays" label="单次最长租期（天）" style={{ width: 200 }}>
              <InputNumber min={1} max={365} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="depositRefundHours" label="押金退还时效（小时）" style={{ width: 200 }}>
              <InputNumber min={0} max={720} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="depositRefundAuto" label="结算后自动退押金（关闭则手动退）" valuePropName="checked" style={{ width: 260 }}>
              <Switch />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="deskSiteKey" label="AI 客服站点 siteKey" style={{ width: 320 }}>
              <Input placeholder="在「AI客服 › 站点管理」复制" />
            </Form.Item>
            <Form.Item name="scrmCodeId" label="企业微信活码 ID" style={{ width: 220 }}>
              <InputNumber min={0} style={{ width: "100%" }} placeholder="在「营销工具 › 企微 SCRM」查看" />
            </Form.Item>
          </Space>
          <Form.Item name="notice" label="门店公告（小程序首页展示）">
            <Input.TextArea rows={2} maxLength={500} placeholder="如：春节取还车时间调整，请提前联系门店" />
          </Form.Item>
        </Form>
        <Notice>
          在线客服复用站内 AI 客服（service-desk），这里只存 siteKey；私域只存企微活码引用，租单事件通过 SCRM 外发箱投递，不直写 scrm_*。
        </Notice>
      </Panel>

      <Panel
        title="小程序与微信支付"
        extra={
          <Space>
            <Button loading={busy} onClick={() => void testWechat()}>凭据自检</Button>
            <Button type="primary" loading={busy} onClick={() => void saveWechat()}>保存凭据</Button>
            <Button loading={busy} onClick={() => void download()}>下载源码包</Button>
            <Button href="/site-builder/mini-dev-guide">发布说明</Button>
          </Space>
        }
      >
        {wechat ? (
          <Notice variant={wechat.configured ? "success" : "warn"}>
            {wechat.configured ? "已登记小程序主体。" : "尚未登记小程序 AppID。"}
            {wechat.payEnabled ? " 微信支付已开启。" : " 微信支付未开启，租客端会提示线下支付。"}
          </Notice>
        ) : null}
        <Form form={wechatForm} layout="vertical" style={{ marginTop: 12 }}>
          <Space wrap>
            <Form.Item name="appId" label="小程序 AppID" style={{ width: 260 }}>
              <Input placeholder="wx…" />
            </Form.Item>
            <Form.Item name="appSecret" label="AppSecret（留空保留）" style={{ width: 300 }}>
              <Input.Password />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="mchId" label="微信商户号" style={{ width: 220 }}>
              <Input />
            </Form.Item>
            <Form.Item name="payApiV3Key" label="APIv3 密钥（留空保留）" style={{ width: 300 }}>
              <Input.Password />
            </Form.Item>
            <Form.Item name="payCertSerial" label="商户证书序列号" style={{ width: 260 }}>
              <Input />
            </Form.Item>
            <Form.Item name="payEnabled" label="开启在线收款" valuePropName="checked" style={{ width: 160 }}>
              <Switch />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="payPrivateKey" label="商户私钥（留空保留）" style={{ width: 360 }}>
              <Input.TextArea rows={2} placeholder="apiclient_key.pem 内容" />
            </Form.Item>
          </Space>
        </Form>
        <Notice>
          下载的是平台统一源码包，不含账号参数；在微信开发者工具里填写 config.js 的 apiBase 与 shopCode，再上传提审。
        </Notice>
      </Panel>
    </Space>
  );
}