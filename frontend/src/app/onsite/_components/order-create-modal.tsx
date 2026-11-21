"use client";

// 代客下单：字段与契约 onsiteOrderCreateInputSchema 一一对应，金额与车费由后端按同一套算价口径算。
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
} from "antd";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useOnsiteOrderActions, useOnsiteServices, useOnsiteStaff } from "@/query/onsite";
import { Notice } from "@/components/ui/panel";
import { cents, statusText, withShop } from "./onsite-common";

/** 与契约一致的长度上限，先在前端卡住，省一次 400。 */
const REMARK_MAX = 300;
const PHONE_MAX = 32;
const ITEM_MAX = 20;

type CreateValues = {
  staffId?: number;
  customerId?: number;
  customerPhone?: string;
  addressId: number;
  startAt: string;
  customerRemark?: string;
  items: { serviceId: number; quantity?: number }[];
};

export function OrderCreateModal({
  open,
  shopId,
  onClose,
  onCreated,
}: {
  open: boolean;
  shopId: number;
  onClose: () => void;
  onCreated: (orderId: number) => void;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const actions = useOnsiteOrderActions();
  const serviceQuery = useOnsiteServices({ shopId }, { status: "ONLINE" }, 1, 100);
  const staffQuery = useOnsiteStaff({ shopId }, {}, 1, 100);
  const [form] = Form.useForm<CreateValues>();
  const services = useMemo(() => serviceQuery.data?.list ?? [], [serviceQuery.data]);
  const staffRows = useMemo(() => staffQuery.data?.list ?? [], [staffQuery.data]);
  const noService = !services.length;

  const submit = async (values: CreateValues) => {
    const created = await actions.createOrder.mutateAsync({
      params: { id: String(shopId) },
      body: {
        staffId: values.staffId ?? 0,
        customerId: values.customerId ?? 0,
        customerPhone: (values.customerPhone ?? "").trim(),
        addressId: Number(values.addressId),
        startAt: values.startAt,
        customerRemark: values.customerRemark ?? "",
        items: values.items.map((item) => ({
          serviceId: item.serviceId,
          quantity: item.quantity ?? 1,
        })),
      },
    });
    message.success(
      `订单 ${created?.orderNo || ""} 已创建，顾客端已生成待付款订单`,
    );
    onCreated(created?.id ?? 0);
  };

  return (
    <Modal
      open={open}
      key={`create-${shopId}`}
      title="新建订单（代客下单）"
      width={720}
      destroyOnHidden
      okText="创建订单"
      cancelText="先不建"
      confirmLoading={actions.createOrder.isPending}
      okButtonProps={{ disabled: noService }}
      onCancel={onClose}
      onOk={() => void form.submit()}
    >
      <Notice variant="info">
        代客下单是给熟客、电话预约补单用的：订单按店铺当前的算价口径计价（服务单价、物料费、车费），
        创建后是一笔「待付款」订单，顾客在小程序里付款，或你在订单详情里点「线下收款标记」。
      </Notice>
      {noService ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message="这个店铺还没有已上架的服务，下不了单。"
          description={
            <Button
              size="small"
              type="primary"
              onClick={() => router.push(withShop("/onsite/catalog", shopId))}
            >
              去服务目录上架服务
            </Button>
          }
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 12 }}
        initialValues={{ items: [{}], staffId: 0, customerId: 0 }}
        onFinish={(values) => void submit(values)}
      >
        <Form.Item
          name="customerPhone"
          label="顾客手机号"
          extra="按手机号找本店顾客档案。若提示「还没有在本店下过单」，请让对方先用小程序进一次店（自动建档）再回来下单。"
        >
          <Input maxLength={PHONE_MAX} placeholder="13900000000" />
        </Form.Item>
        <Space wrap size={12} align="start">
          <Form.Item
            name="customerId"
            label="顾客 ID（可选）"
            extra="已知档案编号时填这里，留 0 表示按上面的手机号找。"
            style={{ marginBottom: 12 }}
          >
            <InputNumber min={0} precision={0} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item
            name="addressId"
            label="服务地址 ID"
            rules={[{ required: true, message: "请填写服务地址 ID" }]}
            style={{ marginBottom: 12 }}
            extra="店主端没有地址列表接口：这个 ID 来自顾客在小程序里保存的收货地址（历史订单详情的地址快照就是它）。没有 ID 时请让顾客自己在小程序下单。"
          >
            <InputNumber min={1} precision={0} style={{ width: 140 }} />
          </Form.Item>
        </Space>
        <Form.Item
          name="startAt"
          label="预约上门时间"
          rules={[
            { required: true, message: "请选择预约上门时间" },
            {
              pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
              message: "时间格式需为 2026-11-20T14:00",
            },
          ]}
          extra="与后端约定的 `YYYY-MM-DDTHH:mm` 一致；档期冲突、超出可约天数会被后端拦下。"
        >
          <Input type="datetime-local" placeholder="2026-11-20T14:00" />
        </Form.Item>
        <Form.Item
          name="staffId"
          label="指定技师"
          extra="选「暂不指定」时按店铺派单模式处理，建完单在订单详情里派单。"
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={[
              { value: 0, label: "暂不指定（建完单再派单）" },
              ...staffRows.map((item) => ({
                value: item.id,
                label: `${item.name}（${statusText("staff", item.status)}）`,
              })),
            ]}
          />
        </Form.Item>

        <div className="muted text-12" style={{ marginBottom: 8 }}>
          服务项目（至少一项，最多 {ITEM_MAX} 项）
        </div>
        <Form.List
          name="items"
          rules={[
            {
              validator: (_, value) =>
                value?.length
                  ? Promise.resolve()
                  : Promise.reject(new Error("请至少选择一个服务")),
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              {fields.map((field) => (
                <Space key={field.key} align="baseline" wrap>
                  <Form.Item
                    name={[field.name, "serviceId"]}
                    rules={[{ required: true, message: "请选择服务" }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      style={{ width: 320 }}
                      placeholder="选择服务"
                      options={services.map((item) => ({
                        value: item.id,
                        label: `${item.title}（${cents(item.priceCents)} / ${
                          item.durationMinutes
                        } 分钟）`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, "quantity"]}
                    style={{ marginBottom: 0 }}
                    initialValue={1}
                  >
                    <InputNumber min={1} max={20} precision={0} style={{ width: 90 }} />
                  </Form.Item>
                  <span className="muted text-12">份</span>
                  {fields.length > 1 ? (
                    <Button
                      size="small"
                      type="text"
                      icon={<MinusCircleOutlined />}
                      onClick={() => remove(field.name)}
                    >
                      删除
                    </Button>
                  ) : null}
                </Space>
              ))}
              <Space>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  disabled={fields.length >= ITEM_MAX}
                  onClick={() => add({ quantity: 1 })}
                >
                  再加一项服务
                </Button>
                <Form.ErrorList errors={errors} />
              </Space>
            </Space>
          )}
        </Form.List>

        <Form.Item
          name="customerRemark"
          label="顾客留言"
          style={{ marginTop: 12 }}
          extra="会显示在顾客订单里，如「家里有狗请留意」「按门铃不要敲门」。"
        >
          <Input.TextArea rows={2} maxLength={REMARK_MAX} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
