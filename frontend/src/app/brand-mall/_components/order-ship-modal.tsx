"use client";
import { Alert, App, Button, Form, Input, Modal, Select } from "antd";
import { useState } from "react";
import { useBrandExpress, useBrandOrderActions } from "@/query/brand-mall";
import { ActionLink, withShop } from "./brand-common";

/**
 * 发货：契约里只认「快递公司名称 + 单号」两个字符串（`brandOrderShipBodySchema`），
 * 公司下拉来自本店快递维护 + 平台预置，所以列表为空时必须给出「去维护快递」的入口。
 */
export function OrderShipModal({
  open,
  shopId,
  orderId,
  orderNo,
  onClose,
}: {
  open: boolean;
  shopId: number;
  orderId: number;
  orderNo: string;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    expressCompany: string;
    expressNo: string;
    remark: string;
  }>();
  const expressQuery = useBrandExpress({ shopId });
  const actions = useBrandOrderActions();
  const [submitting, setSubmitting] = useState(false);

  const options = (expressQuery.data ?? [])
    .filter((item) => item.enabled)
    .map((item) => ({
      value: item.name,
      label: item.shopId === 0 ? `${item.name}（平台预置）` : item.name,
    }));

  const submit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await actions.ship.mutateAsync({
        body: {
          shopId,
          id: orderId,
          expressCompany: values.expressCompany.trim(),
          expressNo: values.expressNo.trim(),
          remark: values.remark ?? "",
        },
      });
      message.success(`订单 ${orderNo} 已发货`);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`发货 · ${orderNo}`}
      okText="确认发货"
      okButtonProps={{ loading: submitting }}
      onCancel={onClose}
      onOk={() => void submit()}
      destroyOnHidden
    >
      {!options.length ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            <span>
              还没有可选的快递公司。
              <ActionLink path={withShop("/brand-mall/setting?tab=express", shopId)}>
                去「店铺设置 · 快递维护」添加
              </ActionLink>
              ，平台预置的公司会自动出现在这里。
            </span>
          }
        />
      ) : null}
      <Form form={form} layout="vertical" key={`${shopId}-${orderId}`}>
        <Form.Item
          name="expressCompany"
          label="快递公司"
          rules={[{ required: true, message: "请选择快递公司" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={options.length ? "选择快递公司" : "暂无可选公司，请先去维护"}
            options={options}
          />
        </Form.Item>
        <Form.Item
          name="expressNo"
          label="快递单号"
          rules={[{ required: true, message: "请填写快递单号" }]}
        >
          <Input maxLength={60} placeholder="顾客可在小程序订单里查看物流" />
        </Form.Item>
        <Form.Item name="remark" label="发货备注" extra="顾客可见的一句话，可留空">
          <Input.TextArea rows={2} maxLength={200} showCount />
        </Form.Item>
      </Form>
      <Button
        type="link"
        size="small"
        style={{ padding: 0 }}
        onClick={() =>
          window.open("https://www.bk.cn/", "_blank", "noopener")
        }
      >
        查单号归属（第三方）
      </Button>
      <div className="muted text-12">
        发货后订单转为「待收货」；单号写错可以先发货，再联系顾客改单（契约里没有改单接口）。
      </div>
    </Modal>
  );
}
