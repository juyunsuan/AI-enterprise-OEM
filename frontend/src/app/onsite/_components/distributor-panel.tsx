"use client";
// 代理-分销商：顾客申请成为分销员，店主审核定级定比例；通过后其分享带来的订单按比例进佣金台账。
import type { OnsiteDistributorRow } from "@enterprise/contracts";
import { Button, Form, Input, InputNumber, Modal, Select, Space } from "antd";
import type { TableProps } from "antd";
import { useMemo, useState } from "react";
import { useOnsiteAgentActions, useOnsiteDistributors } from "@/query/onsite";
import type { OnsiteDistributorFilter } from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import { StatusTag, cents, statusOptions, timeText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const PAGE_SIZE = 20;
const REASON_MAX = 200;

export function DistributorPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteAgentActions();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState<OnsiteDistributorRow | null>(null);
  const [form] = Form.useForm<{
    approve: boolean;
    levelName: string;
    rate: number;
    rejectReason: string;
  }>();
  const filter = useMemo(
    () => ({
      status:
        status === "all" ? undefined : (status as OnsiteDistributorFilter["status"]),
    }),
    [status],
  );
  const query = useOnsiteDistributors({ shopId }, filter, page, PAGE_SIZE);

  const openReview = (row: OnsiteDistributorRow) => {
    form.setFieldsValue({
      approve: true,
      levelName: row.levelName,
      rate: row.rate,
      rejectReason: "",
    });
    setReviewing(row);
  };

  const submit = async () => {
    if (!reviewing) return;
    const values = await form.validateFields();
    await actions.reviewDistributor.mutateAsync({
      params: { id: String(shopId) },
      body: {
        profileId: reviewing.id,
        approve: values.approve,
        levelName: values.levelName || "",
        rate: values.rate || 0,
        rejectReason: values.rejectReason || "",
      },
    });
    setReviewing(null);
  };

  const columns: TableProps<OnsiteDistributorRow>["columns"] = [
    {
      title: "申请人",
      dataIndex: "customerName",
      render: (_, row) => (
        <div>
          <strong>{row.realName || row.customerName || `顾客 #${row.customerId}`}</strong>
          <div className="muted text-12">
            {row.customerName ? `顾客：${row.customerName}` : ""}
            {row.phone ? ` · ${row.phone}` : ""}
          </div>
        </div>
      ),
    },
    {
      title: "等级 / 比例",
      dataIndex: "levelName",
      width: 150,
      render: (_, row) => (
        <div>
          <div>{row.levelName || "未定级"}</div>
          <div className="muted text-12">{row.rate}%</div>
        </div>
      ),
    },
    {
      title: "上级分销商",
      dataIndex: "pid",
      width: 120,
      render: (value: number) => (value ? `#${value}` : "—"),
    },
    {
      title: "成单 / 佣金",
      dataIndex: "orderCount",
      width: 140,
      render: (_, row) => (
        <div>
          <div>{row.orderCount} 单</div>
          <div className="muted text-12">{cents(row.commissionCents)}</div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string, row) => (
        <StatusTag
          kind="distributor"
          value={value}
          extra={
            row.rejectReason ? (
              <div className="muted text-12">{row.rejectReason}</div>
            ) : null
          }
        />
      ),
    },
    {
      title: "申请时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => timeText(value),
    },
    {
      title: "操作",
      width: 110,
      render: (_, row) =>
        row.status === "PENDING" ? (
          <Button size="small" type="link" onClick={() => openReview(row)}>
            审核
          </Button>
        ) : (
          <span className="muted text-12">{row.reviewedAt ? "已处理" : "—"}</span>
        ),
    },
  ];

  return (
    <Panel title="分销商">
      <Notice variant="info">
        顾客在小程序里申请成为分销员，审核通过后按「等级 + 比例」计佣；驳回必须写原因，申请人可见。
        分销关系一单绑定、永久有效，上级分销商由申请来源自动带上。
      </Notice>
      <FilterBar>
        <Select
          style={{ width: 160 }}
          value={status}
          options={statusOptions("distributor", ["PENDING", "APPROVED", "REJECTED", "DISABLED"])}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </FilterBar>
      {!query.data?.list.length && !query.isFetching ? (
        <EmptyState text="还没有分销申请。顾客在小程序「我的 → 推广中心」提交后会出现在这里。" />
      ) : (
        <DataTable<OnsiteDistributorRow>
          rows={query.data?.list ?? []}
          columns={columns}
          total={query.data?.total}
          page={page}
          loading={query.isFetching}
          onPage={setPage}
        />
      )}

      <Modal
        open={reviewing !== null}
        destroyOnHidden
        title={reviewing ? `审核分销申请：${reviewing.realName || reviewing.customerName}` : ""}
        confirmLoading={actions.reviewDistributor.isPending}
        onCancel={() => setReviewing(null)}
        onOk={() => void submit()}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="approve" label="审核结果">
            <Select
              options={[
                { value: true, label: "通过" },
                { value: false, label: "驳回" },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.approve !== next.approve}>
            {({ getFieldValue }) =>
              getFieldValue("approve") ? (
                <Space size={12} wrap>
                  <Form.Item name="levelName" label="分销等级" style={{ width: 180 }}>
                    <Input maxLength={40} placeholder="如：银牌分销" />
                  </Form.Item>
                  <Form.Item name="rate" label="分佣比例（%）" style={{ width: 150 }}>
                    <InputNumber style={{ width: "100%" }} min={0} max={100} step={0.5} />
                  </Form.Item>
                </Space>
              ) : (
                <Form.Item
                  name="rejectReason"
                  label="驳回原因"
                  rules={[{ required: true, message: "驳回必须写明原因" }]}
                >
                  <Input maxLength={REASON_MAX} placeholder="申请人可见" />
                </Form.Item>
              )
            }
          </Form.Item>
        </Form>
      </Modal>
    </Panel>
  );
}
