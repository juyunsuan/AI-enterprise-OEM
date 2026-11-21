"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Descriptions,
  Image,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type {
  ErrandAiDispatchResult,
  ErrandCity,
  ErrandOrder,
  ErrandOrderDetail,
  ErrandRiderRoster,
} from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";
import { useErrandScope } from "./scope";
import { cny, labelOf, partyLine, StatusTag } from "./common";

/** 订单台账：筛选、详情、状态机动作与 AI 调度建议。 */
export function OrderTab() {
  const { meta } = useErrandScope();
  const { message } = App.useApp();
  const [rows, setRows] = useState<ErrandOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [cityId, setCityId] = useState(0);
  const [cities, setCities] = useState<ErrandCity[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ErrandOrderDetail | null>(null);
  const [roster, setRoster] = useState<ErrandRiderRoster[]>([]);
  const [assignRiderId, setAssignRiderId] = useState<number>(0);
  const [note, setNote] = useState("");
  const [ai, setAi] = useState<ErrandAiDispatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [settleAmount, setSettleAmount] = useState<number | null>(null);
  const [settleReceipt, setSettleReceipt] = useState("");
  const [settleNote, setSettleNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await errandApi.orders({
        query: { page, pageSize: 20, status, cityId, keyword },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "订单读取失败");
    } finally {
      setLoading(false);
    }
  }, [page, status, cityId, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    errandApi.riderRoster().then((list) => setRoster(list ?? [])).catch(() => setRoster([]));
    errandApi.cities().then((list) => setCities(list ?? [])).catch(() => setCities([]));
  }, []);

  const open = async (id: number) => {
    try {
      const row = await errandApi.orderDetail({ query: { id } });
      setDetail(row ?? null);
      setAi(null);
      setNote("");
      setAssignRiderId(row?.riderId || 0);
      setSettleAmount(row?.purchaseAmount || null);
      setSettleReceipt(row?.purchaseReceipt || "");
      setSettleNote(row?.purchaseNote || "");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "详情读取失败");
    }
  };

  const act = async (
    action: string,
    extra?: {
      riderId?: number;
      note?: string;
      purchaseAmount?: number;
      purchaseReceipt?: string;
      purchaseNote?: string;
    },
  ) => {
    if (!detail) return;
    setBusy(true);
    try {
      const next = await errandApi.orderAction({
        body: {
          id: detail.id,
          action: action as never,
          riderId: extra?.riderId ?? 0,
          note: extra?.note ?? "",
          purchaseAmount: extra?.purchaseAmount ?? 0,
          purchaseReceipt: extra?.purchaseReceipt ?? "",
          purchaseNote: extra?.purchaseNote ?? "",
        },
      });
      setDetail(next ?? null);
      message.success("订单已更新");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const askAi = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const result = await errandApi.aiDispatch({ body: { orderId: detail.id } });
      setAi(result ?? null);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "AI 调度失败");
    } finally {
      setBusy(false);
    }
  };

  const statusOptions = [
    { value: "", label: "全部状态" },
    ...Object.entries(meta?.orderStateLabels ?? {}).map(([value, label]) => ({ value, label })),
  ];

  return (
    <Panel
      title="跑腿订单"
      titleExtra={
        <Space>
          <Select
            size="small"
            style={{ width: 150 }}
            value={cityId}
            options={[
              { value: 0, label: "全部城市" },
              ...cities.map((city) => ({ value: city.id, label: city.name })),
            ]}
            onChange={(value) => {
              setPage(1);
              setCityId(value);
            }}
          />
          <Select
            size="small"
            style={{ width: 140 }}
            value={status}
            options={statusOptions}
            onChange={(value) => {
              setPage(1);
              setStatus(value);
            }}
          />
          <Input.Search
            size="small"
            allowClear
            placeholder="单号 / 联系人 / 手机号"
            onSearch={(value) => {
              setPage(1);
              setKeyword(value);
            }}
            style={{ width: 220 }}
          />
        </Space>
      }
    >
      {error ? <Notice variant="error">{error}</Notice> : null}
      <Table<ErrandOrder>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage }}
        columns={[
          { title: "单号", dataIndex: "orderNo", width: 170 },
          { title: "城市", width: 110, render: (_, row) => row.cityName || (row.cityId ? `#${row.cityId}` : "—") },
          {
            title: "类型",
            width: 90,
            render: (_, row) => labelOf(meta, "service", row.serviceType),
          },
          { title: "状态", width: 100, render: (_, row) => <StatusTag meta={meta} kind="order" value={row.status} /> },
          { title: "支付", width: 90, render: (_, row) => <StatusTag meta={meta} kind="pay" value={row.payState} /> },
          { title: "骑手", width: 120, render: (_, row) => row.riderName || "—" },
          { title: "金额", width: 100, render: (_, row) => cny(row.totalAmount) },
          { title: "联系人", width: 150, render: (_, row) => `${row.contactName} ${row.contactMobile}` },
          { title: "下单时间", width: 170, render: (_, row) => new Date(row.createdAt).toLocaleString() },
          {
            title: "操作",
            width: 90,
            render: (_, row) => (
              <Button size="small" onClick={() => void open(row.id)}>
                详情
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title={detail ? `订单 ${detail.orderNo}` : "订单详情"}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={860}
        destroyOnHidden
      >
        {detail ? (
          <div style={{ display: "grid", gap: 12 }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="类型">{labelOf(meta, "service", detail.serviceType)}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <StatusTag meta={meta} kind="order" value={detail.status} />
              </Descriptions.Item>
              <Descriptions.Item label="支付">
                <StatusTag meta={meta} kind="pay" value={detail.payState} /> ·{" "}
                {labelOf(meta, "payMode", detail.payMode)}
              </Descriptions.Item>
              <Descriptions.Item label="金额">{cny(detail.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="取货" span={2}>
                {detail.fromParty.name} {detail.fromParty.mobile} · {partyLine(detail.fromParty)}
              </Descriptions.Item>
              <Descriptions.Item label="送达" span={2}>
                {detail.toParty.name} {detail.toParty.mobile} · {partyLine(detail.toParty)}
              </Descriptions.Item>
              <Descriptions.Item label="物品">{detail.goodsDesc || "—"}</Descriptions.Item>
              <Descriptions.Item label="距离 / 重量">
                {detail.distanceKm} 公里 / {detail.weightKg} 公斤
              </Descriptions.Item>
              <Descriptions.Item label="费用拆项" span={2}>
                起步 {cny(detail.baseFee)} + 超距 {cny(detail.distanceFee)} + 超重 {cny(detail.weightFee)} + 夜间{" "}
                {cny(detail.timeFee)} + 帮买 {cny(detail.goodsFee)} + 小费 {cny(detail.tip)} - 券{" "}
                {cny(detail.couponDiscount)} - 积分 {cny(detail.pointsDiscount)}（{detail.pointsUsed} 分）
              </Descriptions.Item>
              <Descriptions.Item label="骑手">{detail.riderName || "—"}</Descriptions.Item>
              <Descriptions.Item label="骑手收入">{cny(detail.riderIncomeAmount)}</Descriptions.Item>
              <Descriptions.Item label="代理分佣">
                {detail.agentId ? `${cny(detail.agentIncomeAmount)}（代理 #${detail.agentId}）` : "—"}
              </Descriptions.Item>
              {detail.serviceType === "BUY" ? (
                <>
                  <Descriptions.Item label="实付 / 差额">
                    实付 {cny(detail.purchaseAmount)}
                    {detail.changeAmount > 0 ? ` · 应退 ${cny(detail.changeAmount)}` : ""}
                    {detail.extraAmount > 0
                      ? ` · 补收 ${cny(detail.extraAmount)}${detail.extraPaidAt ? "（已补）" : "（待补）"}`
                      : ""}
                  </Descriptions.Item>
                  <Descriptions.Item label="小票">
                    {detail.purchaseReceipt ? (
                      <Image src={detail.purchaseReceipt} width={72} alt="采购小票" />
                    ) : (
                      "—"
                    )}
                  </Descriptions.Item>
                </>
              ) : null}
              <Descriptions.Item label="评价">
                {detail.rating > 0 ? `${detail.rating} 星 ${detail.ratingComment || ""}` : "未评价"}
              </Descriptions.Item>
              <Descriptions.Item label="备注">{detail.remark || "—"}</Descriptions.Item>
            </Descriptions>

            <Space wrap>
              {detail.status === "PENDING_PAY" ? (
                <Button type="primary" loading={busy} onClick={() => void act("MARK_PAID")}>
                  登记已收款
                </Button>
              ) : null}
              {detail.status === "PENDING_ACCEPT" ? (
                <>
                  <Select
                    style={{ width: 220 }}
                    value={assignRiderId || undefined}
                    placeholder="选择骑手"
                    options={roster.map((row) => ({
                      value: row.id,
                      label: `${row.name}（${labelOf(meta, "vehicle", row.vehicleType)}${row.online ? "·接单中" : "·休息"}）`,
                    }))}
                    onChange={setAssignRiderId}
                  />
                  <Button
                    type="primary"
                    loading={busy}
                    disabled={!assignRiderId}
                    onClick={() => void act("ASSIGN", { riderId: assignRiderId })}
                  >
                    指派骑手
                  </Button>
                  <Button loading={busy} onClick={() => void askAi()}>
                    AI 调度建议
                  </Button>
                </>
              ) : null}
              {detail.status === "ACCEPTED" ? (
                <>
                  <Select
                    style={{ width: 220 }}
                    value={assignRiderId || undefined}
                    placeholder="转派给其他骑手"
                    options={roster
                      .filter((row) => row.id !== detail.riderId)
                      .map((row) => ({
                        value: row.id,
                        label: `${row.name}（${row.online ? "接单中" : "休息"}）`,
                      }))}
                    onChange={setAssignRiderId}
                  />
                  <Button
                    loading={busy}
                    disabled={!assignRiderId || assignRiderId === detail.riderId}
                    onClick={() => void act("ASSIGN", { riderId: assignRiderId, note: "转派骑手" })}
                  >
                    转派
                  </Button>
                </>
              ) : null}
              {detail.serviceType === "BUY" &&
              ["PICKED_UP", "DELIVERING", "ARRIVED"].includes(detail.status) ? (
                <>
                  <InputNumber
                    style={{ width: 150 }}
                    min={0}
                    placeholder="实际采购金额"
                    value={settleAmount ?? undefined}
                    onChange={(value) => setSettleAmount(Number(value) || 0)}
                  />
                  <Input
                    style={{ width: 220 }}
                    placeholder="小票图片地址（数字资产直链）"
                    value={settleReceipt}
                    onChange={(event) => setSettleReceipt(event.target.value)}
                  />
                  <Input
                    style={{ width: 200 }}
                    placeholder="采购备注"
                    value={settleNote}
                    onChange={(event) => setSettleNote(event.target.value)}
                  />
                  <Button
                    loading={busy}
                    disabled={!settleAmount}
                    onClick={() =>
                      void act("SETTLE_BUY", {
                        purchaseAmount: settleAmount ?? 0,
                        purchaseReceipt: settleReceipt,
                        purchaseNote: settleNote,
                      })
                    }
                  >
                    登记帮买实付
                  </Button>
                </>
              ) : null}
              {["PENDING_PAY", "PENDING_ACCEPT", "ACCEPTED"].includes(detail.status) ? (
                <Button
                  danger
                  loading={busy}
                  onClick={() => void act("CANCEL", { note: "店主取消" })}
                >
                  取消订单
                </Button>
              ) : null}
              {["PENDING_ACCEPT", "ACCEPTED", "PICKED_UP", "DELIVERING", "ARRIVED"].includes(detail.status) ? (
                <Button
                  danger
                  loading={busy}
                  onClick={() => {
                    const reason = note.trim() || "订单异常，等待店主处理";
                    void act("EXCEPTION", { note: reason });
                  }}
                >
                  标记异常
                </Button>
              ) : null}
              {detail.payState === "PAID" && detail.status !== "CANCELLED" ? (
                <Button loading={busy} onClick={() => void act("REFUND", { note: "线下退款登记" })}>
                  登记退款
                </Button>
              ) : null}
            </Space>
            <Input.TextArea
              rows={2}
              maxLength={300}
              placeholder="异常 / 退款 / 取消原因（会写进订单轨迹）"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />

            {ai ? (
              <Panel
                title="AI 调度建议"
                titleExtra={
                  <Tag color={ai.aiGenerated ? "blue" : "default"}>
                    {ai.aiGenerated ? `模型：${ai.model}` : "规则式兜底"}
                  </Tag>
                }
              >
                <Notice variant="info">{ai.advice}</Notice>
                <Table
                  rowKey="riderId"
                  size="small"
                  pagination={false}
                  dataSource={ai.candidates}
                  columns={[
                    { title: "骑手", render: (_, row) => `${row.name}（${row.riderNo}）` },
                    { title: "评分", dataIndex: "score", width: 80 },
                    { title: "理由", dataIndex: "reason" },
                    {
                      title: "操作",
                      width: 90,
                      render: (_, row) => (
                        <Button size="small" onClick={() => void act("ASSIGN", { riderId: row.riderId })}>
                          指派
                        </Button>
                      ),
                    },
                  ]}
                />
              </Panel>
            ) : null}

            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detail.events}
              columns={[
                { title: "时间", width: 170, render: (_, row) => new Date(row.createdAt).toLocaleString() },
                { title: "状态", width: 100, render: (_, row) => <StatusTag meta={meta} kind="order" value={row.status} /> },
                { title: "说明", dataIndex: "note" },
                { title: "操作人", dataIndex: "operator", width: 140 },
              ]}
            />
          </div>
        ) : null}
      </Modal>
    </Panel>
  );
}
