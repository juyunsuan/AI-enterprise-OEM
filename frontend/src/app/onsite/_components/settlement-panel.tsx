"use client";
// 财务-技师结算：按周期汇总已完成订单的毛收入、技师承担的佣金与净额，生成后打款留痕。
import type { OnsiteSettlementRow } from "@enterprise/contracts";
import { Button, DatePicker, Form, Input, Modal, Select, Space } from "antd";
import type { TableProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import {
  useOnsiteSettlements,
  useOnsiteStaff,
  useOnsiteWalletActions,
} from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import { StatusTag, cents, statusOptions, timeText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const PAGE_SIZE = 20;
const REMARK_MAX = 200;

type CreateForm = {
  staffId: number;
  range: [Dayjs, Dayjs];
};

export function SettlementPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteWalletActions();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const filter = useMemo(
    () => ({ status: status === "all" ? undefined : status }),
    [status],
  );
  const query = useOnsiteSettlements({ shopId }, filter, page, PAGE_SIZE);
  const staffQuery = useOnsiteStaff({ shopId }, {}, 1, 100);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<OnsiteSettlementRow | null>(null);
  const [form] = Form.useForm<CreateForm>();
  const [payForm] = Form.useForm<{ remark: string }>();

  const openCreate = () => {
    form.setFieldsValue({
      staffId: undefined as unknown as number,
      range: [dayjs().startOf("month"), dayjs().endOf("day")],
    });
    setCreating(true);
  };

  const create = async () => {
    const values = await form.validateFields();
    await actions.createSettlement.mutateAsync({
      params: { id: String(shopId) },
      body: {
        staffId: values.staffId,
        periodStart: values.range[0].startOf("day").format(),
        periodEnd: values.range[1].endOf("day").format(),
      },
    });
    setCreating(false);
  };

  const pay = async () => {
    if (!paying) return;
    const values = await payForm.validateFields();
    await actions.paySettlement.mutateAsync({
      params: { id: String(shopId), settlementId: String(paying.id) },
      body: { remark: values.remark || "" },
    });
    setPaying(null);
  };

  const columns: TableProps<OnsiteSettlementRow>["columns"] = [
    {
      title: "技师",
      dataIndex: "staffName",
      width: 160,
      render: (_, row) => (
        <div>
          <div>{row.staffName || `#${row.staffId}`}</div>
          <div className="muted text-12">结算单 #{row.id}</div>
        </div>
      ),
    },
    {
      title: "结算周期",
      dataIndex: "periodStart",
      width: 220,
      render: (_, row) => (
        <span className="muted text-12">
          {timeText(row.periodStart)} ~ {timeText(row.periodEnd)}
        </span>
      ),
    },
    { title: "单量", dataIndex: "orderCount", width: 80 },
    { title: "毛收入", dataIndex: "grossCents", width: 120, render: (v: number) => cents(v) },
    {
      title: "技师承担佣金",
      dataIndex: "commissionCents",
      width: 130,
      render: (v: number) => <span style={{ color: "var(--color-warning, #d97706)" }}>-{cents(v)}</span>,
    },
    {
      title: "应发净额",
      dataIndex: "netCents",
      width: 120,
      render: (v: number) => <strong>{cents(v)}</strong>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <StatusTag kind="settlement" value={value} />,
    },
    {
      title: "发放时间",
      dataIndex: "paidAt",
      width: 160,
      render: (value: string) => (value ? timeText(value) : "—"),
    },
    {
      title: "操作",
      key: "actions",
      width: 100,
      render: (_, row) =>
        row.status === "PAID" ? (
          <span className="muted text-12">已发放</span>
        ) : (
          <Button
            size="small"
            type="link"
            onClick={() => {
              payForm.setFieldsValue({ remark: "" });
              setPaying(row);
            }}
          >
            登记打款
          </Button>
        ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel
        title="技师结算单"
        extra={
          <Button type="primary" onClick={openCreate}>
            生成结算单
          </Button>
        }
      >
        <Notice variant="info">
          结算口径：周期内已完成订单的服务费 + 车费为毛收入，减去技师承担的佣金后为应发净额。
          同一技师同一周期不能重复生成；这里是线下打款的登记台账，打款动作本身走你自己的账户。
        </Notice>
        <FilterBar>
          <Select
            style={{ width: 160 }}
            value={status}
            options={statusOptions("settlement", ["PENDING", "PAID"])}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
        </FilterBar>
        {!query.data?.list.length && !query.isFetching ? (
          <EmptyState text="还没有结算单。技师有已完成订单后，按周期生成结算单再登记打款。" />
        ) : (
          <DataTable<OnsiteSettlementRow>
            rows={query.data?.list ?? []}
            columns={columns}
            total={query.data?.total}
            page={page}
            loading={query.isFetching}
            onPage={setPage}
          />
        )}
      </Panel>

      <Modal
        open={creating}
        destroyOnHidden
        title="生成结算单"
        confirmLoading={actions.createSettlement.isPending}
        onCancel={() => setCreating(false)}
        onOk={() => void create()}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="staffId"
            label="技师"
            rules={[{ required: true, message: "请选择技师" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择要结算的技师"
              options={(staffQuery.data?.list ?? []).map((row) => ({
                value: row.id,
                label: `${row.name}${row.staffNo ? `（${row.staffNo}）` : ""}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="range"
            label="结算周期"
            rules={[{ required: true, message: "请选择结算周期" }]}
            extra="开始日 00:00 到结束日 23:59；按订单完成时间归集"
          >
            <DatePicker.RangePicker style={{ width: "100%" }} needConfirm={false} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={paying !== null}
        destroyOnHidden
        title={paying ? `登记打款：${paying.staffName || `技师 #${paying.staffId}`}` : ""}
        confirmLoading={actions.paySettlement.isPending}
        onCancel={() => setPaying(null)}
        onOk={() => void pay()}
      >
        <div className="muted text-12" style={{ marginBottom: 12 }}>
          应发净额 {cents(paying?.netCents)}。登记后结算单标记为「已打款」，不会重复发放。
        </div>
        <Form form={payForm} layout="vertical" initialValues={{ remark: "" }}>
          <Form.Item name="remark" label="打款备注">
            <Input maxLength={REMARK_MAX} placeholder="如：微信转账尾号 1234，11-18 已打" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
