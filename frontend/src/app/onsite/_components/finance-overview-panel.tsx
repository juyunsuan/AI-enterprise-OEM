"use client";
// 财务-收入概览与分账：规则矩阵决定「谁承担佣金」，台账逐单可核对；平台不垫佣金。
import type {
  OnsiteCommissionRuleRow,
  OnsiteOrderCommissionRow,
} from "@enterprise/contracts";
import { Button, Form, InputNumber, Modal, Space, Switch } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import {
  useOnsiteCommissionActions,
  useOnsiteCommissionRules,
  useOnsiteIncomeOverview,
  useOnsiteOrderCommissions,
} from "@/query/onsite";
import { EmptyState, Notice, Panel, StatCard, StatGrid } from "@/components/ui/panel";
import { DataTable } from "./list-kit";
import { cents, timeText } from "./onsite-common";
import { useOnsiteShopId } from "./onsite-shell";

type RuleForm = {
  totalRate: number;
  staffBorneRate: number;
  ownerBorneRate: number;
  platformBorneRate: number;
  enabled: boolean;
};

export function FinanceOverviewPanel() {
  const shopId = useOnsiteShopId();
  const overview = useOnsiteIncomeOverview({ shopId });
  const rules = useOnsiteCommissionRules({ shopId });
  const actions = useOnsiteCommissionActions();
  const [page, setPage] = useState(1);
  const ledger = useOnsiteOrderCommissions({ shopId }, {}, page);
  const [editing, setEditing] = useState<OnsiteCommissionRuleRow | null>(null);
  const [form] = Form.useForm<RuleForm>();
  const data = overview.data;

  const openRule = (row: OnsiteCommissionRuleRow) => {
    setEditing(row);
    form.setFieldsValue({
      totalRate: row.totalRate,
      staffBorneRate: row.staffBorneRate,
      ownerBorneRate: row.ownerBorneRate,
      platformBorneRate: row.platformBorneRate,
      enabled: row.enabled,
    });
  };

  const saveRule = async () => {
    if (!editing) return;
    const values = await form.validateFields();
    await actions.saveRule.mutateAsync({
      params: { id: String(shopId) },
      body: { role: editing.role, ...values },
    });
    setEditing(null);
  };

  const ruleColumns: TableProps<OnsiteCommissionRuleRow>["columns"] = [
    { title: "层级", dataIndex: "roleName", width: 130 },
    { title: "佣金比例", dataIndex: "totalRate", width: 110, render: (v: number) => `${v}%` },
    { title: "技师承担", dataIndex: "staffBorneRate", width: 110, render: (v: number) => `${v}%` },
    { title: "代理承担", dataIndex: "ownerBorneRate", width: 110, render: (v: number) => `${v}%` },
    { title: "平台承担", dataIndex: "platformBorneRate", width: 110, render: (v: number) => `${v}%` },
    {
      title: "启用",
      dataIndex: "enabled",
      width: 80,
      render: (value: boolean) => (value ? "是" : "否"),
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => openRule(row)}>
          调整
        </Button>
      ),
    },
  ];

  const ledgerColumns: TableProps<OnsiteOrderCommissionRow>["columns"] = [
    { title: "订单号", dataIndex: "orderNo", width: 180 },
    { title: "顾客", dataIndex: "customerName", width: 130 },
    { title: "状态", dataIndex: "status", width: 100 },
    { title: "计佣基数", dataIndex: "baseCents", width: 120, render: (v: number) => cents(v) },
    { title: "佣金合计", dataIndex: "totalCents", width: 120, render: (v: number) => cents(v) },
    { title: "分账条目", dataIndex: "itemCount", width: 100 },
    { title: "支付时间", dataIndex: "paidAt", width: 160, render: (v: string) => (v ? timeText(v) : "—") },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <StatGrid>
        <StatCard label="成交单量" value={String(data?.orderCount ?? 0)} hint="仅统计已支付订单" />
        <StatCard label="成交金额" value={cents(data?.orderAmountCents)} hint="顾客实付（含余额抵扣）" />
        <StatCard label="佣金合计" value={cents(data?.commissionCents)} hint="按规则矩阵从成交额中拆出" />
        <StatCard label="技师承担" value={cents(data?.staffBorneCents)} hint="从技师收入里扣" />
        <StatCard label="代理承担" value={cents(data?.ownerBorneCents)} hint="从代理/渠道收入里扣" />
        <StatCard label="平台承担" value={cents(data?.platformBorneCents)} hint="平台默认不掏钱，仅在规则里配置" />
        <StatCard label="待结算" value={cents(data?.pendingSettleCents)} hint="已完成未结算的技师收入" />
        <StatCard label="待提现" value={cents(data?.pendingWithdrawCents)} hint="待处理的提现申请" />
        <StatCard label="余额负债" value={cents(data?.balanceLiabilityCents)} hint="顾客店内余额合计，需留存足够现金" />
        <StatCard label="充值收入" value={cents(data?.rechargeCents)} hint="已确认到账的充值" />
      </StatGrid>

      <Panel title="各层级佣金">
        {!data?.byRole.length ? (
          <EmptyState text="还没有产生佣金分账。订单支付后按角色汇总到这里。" />
        ) : (
          <DataTable
            rows={data.byRole}
            page={1}
            rowKey="role"
            columns={[
              { title: "层级", dataIndex: "roleName", width: 140 },
              { title: "成交单量", dataIndex: "orderCount", width: 120 },
              {
                title: "佣金合计",
                dataIndex: "totalCents",
                width: 140,
                render: (value: number) => cents(value),
              },
            ]}
          />
        )}
      </Panel>

      <Panel title="分账规则（层级 × 承担方）">
        <Notice variant="info">
          一笔佣金由技师与代理的收入按比例分担，平台默认不垫钱。
          修改规则只影响之后的新订单，历史单按成交时快照结算，不会回算。
        </Notice>
        {!rules.data?.list.length && !rules.isFetching ? (
          <EmptyState text="规则矩阵还没初始化，稍后重试或检查权限。" />
        ) : (
          <DataTable<OnsiteCommissionRuleRow>
            rows={rules.data?.list ?? []}
            columns={ruleColumns}
            page={1}
            loading={rules.isFetching}
          />
        )}
      </Panel>

      <Panel title="佣金台账">
        {!ledger.data?.list.length && !ledger.isFetching ? (
          <EmptyState text="还没有产生佣金。订单支付后这里会逐单列出计佣基数与佣金合计。" />
        ) : (
          <DataTable<OnsiteOrderCommissionRow>
            rows={ledger.data?.list ?? []}
            columns={ledgerColumns}
            total={ledger.data?.total}
            page={page}
            loading={ledger.isFetching}
            onPage={setPage}
          />
        )}
      </Panel>

      {editing ? (
        <Modal
          open
          destroyOnHidden
          title={`调整「${editing.roleName}」分账规则`}
          confirmLoading={actions.saveRule.isPending}
          onCancel={() => setEditing(null)}
          onOk={() => void saveRule()}
        >
          <Form form={form} layout="vertical" key={editing.role}>
            <Space size={12} wrap>
              <Form.Item name="totalRate" label="佣金比例 %">
                <InputNumber min={0} max={100} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="enabled" label="启用" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Space>
            <Space size={12} wrap>
              <Form.Item name="staffBorneRate" label="技师承担 %">
                <InputNumber min={0} max={100} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="ownerBorneRate" label="代理承担 %">
                <InputNumber min={0} max={100} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="platformBorneRate" label="平台承担 %">
                <InputNumber min={0} max={100} style={{ width: 120 }} />
              </Form.Item>
            </Space>
            <div className="muted text-12">
              三个承担比例合计应等于 100%，否则佣金账会对不平。
            </div>
          </Form>
        </Modal>
      ) : null}
    </Space>
  );
}
