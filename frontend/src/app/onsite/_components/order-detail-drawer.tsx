"use client";

// 订单详情抽屉：读 useOnsiteOrder，动作按钮按后端同一套订单状态机在前端推导可点范围。
import {
  ONSITE_ORDER_ACTIONS,
  type OnsiteOrderAction,
  type OnsiteOrderDetail,
  type OnsiteOrderItemRow,
} from "@enterprise/contracts";
import {
  Alert,
  App,
  Button,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Timeline,
} from "antd";
import type { TableProps } from "antd";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  useOnsiteOrder,
  useOnsiteOrderActions,
  useOnsiteStaff,
} from "@/query/onsite";
import { Notice } from "@/components/ui/panel";
import { DataTable, Descriptions } from "./list-kit";
import {
  StatusTag,
  cents,
  statusText,
  timeText,
  withShop,
} from "./onsite-common";

type ActionKind =
  | "dispatch"
  | "advance"
  | "payOffline"
  | "sign"
  | "addon"
  | "cancel"
  | "remark";

/** 弹窗里所有动作共用一个表单值集合，未用到的字段留空。 */
type ActionValues = {
  staffId?: number;
  action?: OnsiteOrderAction;
  content?: string;
  image?: string;
  address?: string;
  remark?: string;
  orderItemId?: number;
  quantity?: number;
  reason?: string;
  note?: string;
  offline?: boolean;
};

/** 每个动作对顾客端的影响说明：一句话讲清「点了之后顾客看到什么」。 */
const ACTION_HELP: Record<ActionKind, string> = {
  dispatch:
    "顾客端仍显示当前状态，只是将上门的技师换成新人；改派会按新人位置重算车费，差额记在订单流转里。",
  advance: "顾客端状态与时间轴同步更新，并收到对应节点的提醒。",
  payOffline:
    "把这笔单登记为「已线下收款」，顾客端从待付款变为待接单、不再出现付款入口；钱是你线下收的，平台不经手。",
  sign: "替顾客完成签收：订单转为「已签收」，顾客端出现评价入口，这一单的收入也进入可结算口径。",
  addon: "在原定时段后面加时长，生成一笔待付的加钟单；顾客端服务结束时间顺延，加钟金额需另行支付。",
  cancel:
    "订单转为「已取消」并释放该时段，顾客端看到取消结果与原因；只有未付款的单可以取消。",
  remark: "只写进店铺后台的店主备注，顾客端看不到；要给顾客看的文字请用顾客留言里的口径。",
};

/** 推进状态的每个动作在顾客端分别意味着什么。 */
const ADVANCE_HELP: Record<string, string> = {
  accept: "顾客端从「待接单」变成「已接单」，表示这单已确认安排。",
  reject: "顾客端变为「技师拒单」，需要填写拒单理由；已付款的单请走退款而不是拒单。",
  depart: "顾客端显示「服务出发」，并留下出发地址作为到场时间举证。",
  arrive: "顾客端显示「已到达」；后端要求带到场照片，没有照片这一步会被拒。",
  start: "顾客端显示「服务中」，开始服务的时间会用于实际时长统计。",
  complete: "顾客端变为「已完成」，出现签收与评价入口；时长按实际打卡时间结算。",
};

const ROLE_LABELS: Record<string, string> = {
  SYSTEM: "系统",
  CUSTOMER: "顾客",
  OWNER: "店主",
  STAFF: "技师",
  PLATFORM_ADMIN: "平台",
};

/**
 * 契约的店主侧订单详情没有「可用动作」字段（只有 C 端视图带 actions），
 * 这里按后端 onsite.order.rules 的迁移表推导：非法动作点了也会被后端拒，
 * 但提前收起按钮能让店主少看一次报错。
 */
function orderAvailability(detail: OnsiteOrderDetail) {
  const status = detail.status;
  const advances: OnsiteOrderAction[] = [];
  for (const action of ONSITE_ORDER_ACTIONS) {
    const from: Record<OnsiteOrderAction, string[]> = {
      accept: ["PAID"],
      reject: ["PAID", "ACCEPTED"],
      depart: ["ACCEPTED"],
      arrive: ["EN_ROUTE"],
      start: ["ON_SITE"],
      complete: ["ACCEPTED", "EN_ROUTE", "ON_SITE", "SERVING"],
    };
    if (from[action].includes(status)) advances.push(action);
  }
  return {
    advances,
    dispatch: status === "PENDING_PAYMENT" || status === "PAID",
    payOffline: status === "PENDING_PAYMENT" && detail.payStatus !== "PAID",
    sign: status === "COMPLETED",
    addon: ["ACCEPTED", "EN_ROUTE", "ON_SITE", "SERVING"].includes(status),
    cancel: status === "PENDING_PAYMENT",
  };
}

export function OrderDetailDrawer({
  open,
  shopId,
  orderId,
  onClose,
}: {
  open: boolean;
  shopId: number;
  orderId: number;
  onClose: () => void;
}) {
  const detail = useOnsiteOrder({ shopId }, orderId);
  return (
    <Drawer
      title="订单详情与履约操作"
      open={open}
      size={900}
      destroyOnHidden
      onClose={onClose}
    >
      {!open ? null : detail.data ? (
        <OrderDetailBody
          key={`${shopId}-${orderId}`}
          shopId={shopId}
          detail={detail.data}
        />
      ) : detail.isError ? (
        <Notice variant="error">
          订单详情读取失败：{detail.error.message || "请稍后重试"}。
          若提示「订单不存在」，通常是站内通知带着别家店铺的订单号，右上角切回原店铺即可。
        </Notice>
      ) : (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin />
        </div>
      )}
    </Drawer>
  );
}

function OrderDetailBody({
  shopId,
  detail,
}: {
  shopId: number;
  detail: OnsiteOrderDetail;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<{
    kind: ActionKind;
    action?: OnsiteOrderAction;
  } | null>(null);
  const available = orderAvailability(detail);

  const itemColumns: TableProps<OnsiteOrderItemRow>["columns"] = [
    { title: "服务项目", dataIndex: "title" },
    {
      title: "单价",
      dataIndex: "unitPriceCents",
      width: 110,
      render: (value: number) => cents(value),
    },
    { title: "数量", dataIndex: "quantity", width: 70 },
    {
      title: "时长",
      dataIndex: "durationMinutes",
      width: 90,
      render: (value: number, row) => `${value * row.quantity} 分钟`,
    },
    {
      title: "物料费",
      dataIndex: "materialFeeCents",
      width: 110,
      render: (value: number, row) => cents(value * row.quantity),
    },
    {
      title: "小计",
      dataIndex: "payAmountCents",
      width: 110,
      render: (value: number) => cents(value),
    },
    {
      title: "可退",
      dataIndex: "refundableQuantity",
      width: 110,
      render: (value: number, row) =>
        `剩 ${value} 份 / 已退 ${row.refundedQuantity} 份`,
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <div className="muted text-12">可执行的履约操作</div>
        <Space wrap size={8} style={{ marginTop: 8 }}>
          {available.dispatch ? (
            <Button size="small" type="primary" onClick={() => setActing({ kind: "dispatch" })}>
              {detail.staffId ? "改派技师" : "派单"}
            </Button>
          ) : null}
          {available.advances.map((action) => (
            <Button
              key={action}
              size="small"
              danger={action === "reject"}
              onClick={() => setActing({ kind: "advance", action })}
            >
              {statusText("orderAction", action)}
            </Button>
          ))}
          {available.payOffline ? (
            <Button size="small" onClick={() => setActing({ kind: "payOffline" })}>
              线下收款标记
            </Button>
          ) : null}
          {available.sign ? (
            <Button size="small" onClick={() => setActing({ kind: "sign" })}>
              代客签收
            </Button>
          ) : null}
          {available.addon ? (
            <Button size="small" onClick={() => setActing({ kind: "addon" })}>
              加钟
            </Button>
          ) : null}
          {available.cancel ? (
            <Button size="small" danger onClick={() => setActing({ kind: "cancel" })}>
              取消订单
            </Button>
          ) : null}
          <Button size="small" onClick={() => setActing({ kind: "remark" })}>
            店主备注
          </Button>
        </Space>
        <div className="muted text-12" style={{ marginTop: 8 }}>
          当前状态「{statusText("order", detail.status)}」可做的操作以这排按钮为准；
          后端只放行状态机允许的迁移，退款处理中的单要先处理退款。
        </div>
        {detail.status === "REFUND_PENDING" ? (
          <Notice variant="warn">
            这单有退款正在处理，履约动作会被后端拒绝。
            <Button
              size="small"
              type="link"
              onClick={() =>
                router.push(withShop("/onsite/aftersale?panel=refund", shopId))
              }
            >
              去售后与安全处理退款
            </Button>
          </Notice>
        ) : null}
      </div>

      <Descriptions
        items={[
          { label: "订单号", value: detail.orderNo },
          { label: "状态", value: <StatusTag kind="order" value={detail.status} /> },
          {
            label: "支付",
            value: (
              <Space size={4}>
                <StatusTag kind="pay" value={detail.payStatus} />
                <span className="muted text-12">{detail.payType || "—"}</span>
              </Space>
            ),
          },
          {
            label: "售后",
            value: detail.refundStatus ? (
              <StatusTag kind="refund" value={detail.refundStatus} />
            ) : (
              "无"
            ),
          },
          {
            label: "顾客",
            value: `${detail.customerName || "—"}（${detail.customerPhone || "—"}）`,
          },
          {
            label: "技师",
            value: detail.staffId
              ? `${detail.staffName || detail.staffId} ${detail.staffPhone || ""}`
              : "未派单",
          },
          {
            label: "服务时间",
            value: `${timeText(detail.startAt)} ~ ${timeText(detail.endAt)}`,
          },
          {
            label: "时长",
            value: `约定 ${detail.durationMinutes} 分钟 / 实际 ${detail.trueDurationMinutes} 分钟`,
          },
          { label: "下单时间", value: timeText(detail.createdAt) },
          { label: "付款时间", value: timeText(detail.paidAt) },
          {
            label: "待付截止",
            value: detail.expireAt ? timeText(detail.expireAt) : "—",
          },
          {
            label: "结算",
            value: `${detail.settlementStatus || "—"}${
              detail.settleableAt ? ` · ${timeText(detail.settleableAt)}` : ""
            }`,
          },
          {
            label: "服务方式",
            value: detail.serviceMode || "—",
          },
          {
            label: "加钟",
            value: detail.isAddon ? `已加 ${detail.addonCount} 个单位时长` : "无",
          },
          { label: "顾客留言", value: detail.customerRemark || "—" },
          { label: "店主备注", value: detail.ownerRemark || "—" },
        ]}
      />

      <div>
        <Divider orientation="horizontal" titlePlacement="left" plain>
          服务地址与车费
        </Divider>
        {detail.address ? (
          <Descriptions
            items={[
              {
                label: "联系人",
                value: `${detail.address.contactName || "—"} ${
                  detail.address.phone || ""
                }`,
              },
              {
                label: "地址",
                value:
                  [
                    detail.address.province,
                    detail.address.city,
                    detail.address.district,
                    detail.address.detail,
                  ]
                    .filter(Boolean)
                    .join(" ") || "—",
              },
              {
                // 定位只按契约原值展示，不在店主端伪造地图。
                label: "定位坐标",
                value: `${detail.address.lng}, ${detail.address.lat}`,
              },
              { label: "车费", value: cents(detail.travelFeeCents) },
              {
                label: "车费口径",
                value: (
                  <Space size={4}>
                    <StatusTag kind="feeSource" value={detail.travelFeeSource} />
                    <span className="muted text-12">
                      距离 {Math.round(detail.distanceMeters / 10) / 100} 公里
                    </span>
                  </Space>
                ),
              },
            ]}
          />
        ) : (
          <Alert
            type="warning"
            showIcon
            message="这单没有取到服务地址快照，通常是代客下单时没带地址 ID。请让顾客在小程序里保存地址后重新下单，或在本单重新派单前先与顾客电话确认上门地点。"
          />
        )}
        <Descriptions
          items={[
            { label: "服务费", value: cents(detail.serviceFeeCents) },
            { label: "物料费", value: cents(detail.materialFeeCents) },
            { label: "车费", value: cents(detail.travelFeeCents) },
            { label: "优惠", value: `-${cents(detail.discountCents)}` },
            {
              label: "实付",
              value: <strong>{cents(detail.payAmountCents)}</strong>,
            },
          ]}
        />
      </div>

      <div>
        <Divider orientation="horizontal" titlePlacement="left" plain>
          服务明细
        </Divider>
        <DataTable<OnsiteOrderItemRow>
          rows={detail.items}
          columns={itemColumns}
          page={1}
        />
      </div>

      {detail.signature ? (
        <div>
          <Divider orientation="horizontal" titlePlacement="left" plain>
            签收凭证
          </Divider>
          <Descriptions
            items={[
              { label: "签收时间", value: timeText(detail.signature.signedAt) },
              {
                label: "签署人",
                value:
                  detail.signature.confirmedBy === "CUSTOMER"
                    ? "顾客本人"
                    : `代签（${detail.signature.confirmedBy || "—"}）`,
              },
              {
                label: "签名图片",
                value: detail.signature.image ? (
                  <a href={detail.signature.image} target="_blank" rel="noreferrer">
                    查看图片
                  </a>
                ) : (
                  "—"
                ),
              },
            ]}
          />
        </div>
      ) : null}

      {detail.staffChanges.length ? (
        <div>
          <Divider orientation="horizontal" titlePlacement="left" plain>
            改派记录
          </Divider>
          <Space orientation="vertical" size={4} style={{ width: "100%" }}>
            {detail.staffChanges.map((item) => (
              <div key={item.id} className="muted text-12">
                {timeText(item.at)}：{item.fromStaffName || "未派单"} →{" "}
                {item.toStaffName}，车费差额 {cents(item.travelFeeDeltaCents)}
                {item.remark ? ` · ${item.remark}` : ""}
              </div>
            ))}
          </Space>
        </div>
      ) : null}

      <div>
        <Divider orientation="horizontal" titlePlacement="left" plain>
          订单流转
        </Divider>
        {detail.timeline.length ? (
          <Timeline
            items={detail.timeline.map((log, index) => ({
              key: `${log.at}-${index}`,
              color: log.operatorRole === "OWNER" ? "blue" : "gray",
              title: log.toStatus
                ? statusText("order", log.toStatus)
                : log.action || "操作",
              content: (
                <span className="muted text-12">
                  {ROLE_LABELS[log.operatorRole] ?? log.operatorRole ?? "系统"}
                  {log.content ? ` · ${log.content}` : ""} · {timeText(log.at)}
                </span>
              ),
            }))}
          />
        ) : (
          <span className="muted text-12">这单还没有流转记录。</span>
        )}
      </div>

      {detail.tracks.length ? (
        <div>
          <Divider orientation="horizontal" titlePlacement="left" plain>
            打卡轨迹（原值）
          </Divider>
          <Space orientation="vertical" size={4} style={{ width: "100%" }}>
            {detail.tracks.map((track, index) => (
              <div key={`${track.at}-${index}`} className="text-12">
                <div>
                  {timeText(track.at)} · {track.stage || "—"} ·{" "}
                  {track.address || "无地址"} · 坐标 {track.lng}, {track.lat}
                </div>
                {track.image ? (
                  <a
                    className="text-12"
                    href={track.image}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看现场照片
                  </a>
                ) : null}
              </div>
            ))}
          </Space>
        </div>
      ) : null}

      {acting ? (
        <OrderActionModal
          shopId={shopId}
          detail={detail}
          acting={acting}
          onClose={() => setActing(null)}
        />
      ) : null}
    </Space>
  );
}

function OrderActionModal({
  shopId,
  detail,
  acting,
  onClose,
}: {
  shopId: number;
  detail: OnsiteOrderDetail;
  acting: { kind: ActionKind; action?: OnsiteOrderAction };
  onClose: () => void;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const actions = useOnsiteOrderActions();
  const staffQuery = useOnsiteStaff({ shopId }, {}, 1, 100);
  const staffRows = useMemo(() => staffQuery.data?.list ?? [], [staffQuery.data]);
  const [form] = Form.useForm<ActionValues>();
  const busy =
    actions.dispatchOrder.isPending ||
    actions.advanceOrder.isPending ||
    actions.orderPayOffline.isPending ||
    actions.orderSign.isPending ||
    actions.orderAddon.isPending ||
    actions.cancelOrder.isPending ||
    actions.orderRemark.isPending;

  const advanceLabel = acting.action
    ? statusText("orderAction", acting.action)
    : "";
  const title =
    acting.kind === "advance"
      ? `推进状态 · ${advanceLabel}`
      : MODAL_TITLES[acting.kind];
  const help =
    acting.kind === "advance" && acting.action
      ? ADVANCE_HELP[acting.action] ?? ACTION_HELP.advance
      : ACTION_HELP[acting.kind];
  // 后端对「到达打卡」强制要照片，缺图直接提示下一步而不是让请求先失败。
  const needArrivalImage = acting.action === "arrive";
  const noStaff = acting.kind === "dispatch" && !staffRows.length;

  const run = async (values: ActionValues) => {
    const body = { orderId: detail.id };
    if (acting.kind === "dispatch" && values.staffId) {
      await actions.dispatchOrder.mutateAsync({
        params: { id: String(shopId) },
        body: { ...body, staffId: values.staffId },
      });
      message.success("已派单/改派，技师端会收到这单，顾客端稍后同步");
    } else if (acting.kind === "advance" && acting.action) {
      await actions.advanceOrder.mutateAsync({
        params: { id: String(shopId) },
        body: {
          ...body,
          action: acting.action,
          content: values.content ?? "",
          image: values.image ?? "",
          address: values.address ?? "",
        },
      });
      message.success(`已执行「${advanceLabel}」，顾客端状态同步更新`);
    } else if (acting.kind === "payOffline") {
      await actions.orderPayOffline.mutateAsync({
        params: { id: String(shopId) },
        body: { ...body, remark: values.remark ?? "" },
      });
      message.success("已登记线下收款，这单不再出现线上付款入口");
    } else if (acting.kind === "sign") {
      await actions.orderSign.mutateAsync({
        params: { id: String(shopId) },
        body: { ...body, image: (values.image ?? "").trim() },
      });
      message.success("已代客签收，顾客端可以评价了");
    } else if (acting.kind === "addon" && values.orderItemId) {
      const result = await actions.orderAddon.mutateAsync({
        params: { id: String(shopId) },
        body: { ...body, orderItemId: values.orderItemId, quantity: values.quantity ?? 1 },
      });
      message.success(
        `已加钟，服务结束时间顺延到 ${timeText(result?.endAt ?? "")}（加钟单待顾客支付）`,
      );
    } else if (acting.kind === "cancel") {
      await actions.cancelOrder.mutateAsync({
        params: { id: String(shopId) },
        body: { ...body, reason: (values.reason ?? "").trim() },
      });
      message.success("订单已取消，占用的档期已释放");
    } else if (acting.kind === "remark") {
      await actions.orderRemark.mutateAsync({
        params: { id: String(shopId) },
        body: { ...body, note: values.note ?? "" },
      });
      message.success("店主备注已保存，顾客端看不到这条");
    }
    onClose();
  };

  return (
    <Modal
      open
      key={`${acting.kind}-${acting.action ?? ""}`}
      title={title}
      okText="确认执行"
      cancelText="先不做"
      destroyOnHidden
      confirmLoading={busy}
      onCancel={onClose}
      onOk={() => void form.submit()}
      okButtonProps={{ disabled: noStaff }}
    >
      <Notice variant="info">{help}</Notice>
      {noStaff ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message="这个店铺还没有技师，派不了单。"
          description={
            <Button
              size="small"
              type="primary"
              onClick={() => router.push(withShop("/onsite/staff", shopId))}
            >
              去技师排期新增技师
            </Button>
          }
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 12 }}
        onFinish={(values) => void run(values)}
      >
        {acting.kind === "dispatch" ? (
          <Form.Item
            name="staffId"
            label="指派给"
            rules={[{ required: true, message: "请选择技师" }]}
            extra="档期冲突或技师已停服会被后端拦下，按提示改期或换人即可。"
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择要上门的技师"
              options={staffRows.map((item) => ({
                value: item.id,
                label: `${item.name}（${statusText("staff", item.status)}）${
                  item.cityName ? ` · ${item.cityName}` : ""
                }`,
              }))}
            />
          </Form.Item>
        ) : null}

        {acting.kind === "advance" ? (
          <>
            <Form.Item
              name="content"
              label={acting.action === "reject" ? "拒单理由" : "备注"}
              rules={
                acting.action === "reject"
                  ? [{ required: true, message: "拒单必须写理由" }]
                  : []
              }
              extra="会写进订单流转，顾客在订单详情里能看到。"
            >
              <Input.TextArea rows={2} maxLength={200} showCount />
            </Form.Item>
            {needArrivalImage || acting.action === "complete" ? (
              <Form.Item
                name="image"
                label="现场照片地址"
                rules={
                  needArrivalImage ? [{ required: true, message: "请填写到场照片地址" }] : []
                }
                extra={
                  needArrivalImage
                    ? "后端要求「到达打卡」必须带照片作为到场举证；技师端是拍照上传，这里填已上传的图片地址。"
                    : "可选：完工现场照片地址，纠纷时作为举证。"
                }
              >
                <Input maxLength={500} placeholder="https://…" />
              </Form.Item>
            ) : null}
            {acting.action === "depart" ||
            acting.action === "arrive" ||
            acting.action === "complete" ? (
              <Form.Item name="address" label="当时所在位置">
                <Input maxLength={200} placeholder="例如：xx 路 xx 大厦" />
              </Form.Item>
            ) : null}
          </>
        ) : null}

        {acting.kind === "payOffline" ? (
          <Form.Item
            name="remark"
            label="收款说明"
            extra="例如：现金 / 顾客转账到店主账户，写清楚便于对账；这单金额按实付登记为已收款。"
          >
            <Input maxLength={200} />
          </Form.Item>
        ) : null}

        {acting.kind === "sign" ? (
          <Form.Item
            name="image"
            label="顾客签名图片地址"
            rules={[{ required: true, message: "签名图片地址不能为空" }]}
            extra="后端拒空签名：请先让顾客在小程序上手写签名，或把纸质签名拍照后取图片地址再填这里。"
          >
            <Input maxLength={500} placeholder="https://…" />
          </Form.Item>
        ) : null}

        {acting.kind === "addon" ? (
          <>
            <Form.Item
              name="orderItemId"
              label="给哪一项服务加钟"
              rules={[{ required: true, message: "请选择服务明细" }]}
              extra="加钟金额按该明细的服务单价与单位时长折算；若提示「不支持加钟」，请到服务目录打开该服务的加钟开关。"
            >
              <Select
                placeholder="选择订单里的服务项目"
                options={detail.items.map((item) => ({
                  value: item.id,
                  label: `${item.title}（${item.durationMinutes} 分钟 / 份）`,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="quantity"
              label="加几个单位时长"
              initialValue={1}
              extra="1 个单位 = 服务设置的加钟单位时长，最多 10。"
            >
              <InputNumber min={1} max={10} precision={0} />
            </Form.Item>
          </>
        ) : null}

        {acting.kind === "cancel" ? (
          <Form.Item
            name="reason"
            label="取消原因"
            rules={[{ required: true, message: "请填写取消原因" }]}
            extra="原因会进订单流转并对顾客展示；只有未付款的订单可以取消，已付款请走售后退款。"
          >
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>
        ) : null}

        {acting.kind === "remark" ? (
          <Form.Item
            name="note"
            label="店主备注"
            initialValue={detail.ownerRemark}
            extra="仅本站可见，最多 300 字。"
          >
            <Input.TextArea rows={3} maxLength={300} showCount />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}

const MODAL_TITLES: Record<ActionKind, string> = {
  dispatch: "派单 / 改派技师",
  advance: "推进状态",
  payOffline: "标记为线下收款",
  sign: "代顾客签收",
  addon: "加钟",
  cancel: "取消订单",
  remark: "店主备注",
};
