"use client";
// 营销-邀请有礼：一个活动 = 一种奖励；被邀请人首单支付成功后自动给邀请人发奖，一条绑定只发一次。
import {
  type OnsiteActivityRecordRow,
  type OnsiteActivityRow,
  type OnsiteCouponRow,
} from "@enterprise/contracts";
import { Button, Form, Input, InputNumber, Modal, Select, Space } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import {
  useOnsiteActivities,
  useOnsiteActivityActions,
  useOnsiteActivityRecords,
  useOnsiteCoupons,
} from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable } from "./list-kit";
import { StatusTag, cents, timeText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const REWARD_TEXT: Record<string, string> = {
  BALANCE: "余额",
  POINTS: "积分",
  COUPON: "券",
};

type ActivityForm = {
  name: string;
  rewardType: string;
  rewardYuan: number;
  rewardPoints: number;
  couponId: number;
  startAt: string;
  endAt: string;
};

export function ActivityPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteActivityActions();
  const [page, setPage] = useState(1);
  const query = useOnsiteActivities({ shopId }, {}, page);
  const coupons = useOnsiteCoupons({ shopId }, {}, 1, 100);
  const rows = query.data?.list ?? [];
  const [editing, setEditing] = useState<OnsiteActivityRow | null>(null);
  const [form] = Form.useForm<ActivityForm>();
  const [recordsOf, setRecordsOf] = useState<OnsiteActivityRow | null>(null);

  const openEditor = (row?: OnsiteActivityRow) => {
    setEditing(row ?? ({} as OnsiteActivityRow));
    form.setFieldsValue(
      row
        ? {
            name: row.name,
            rewardType: row.rewardType,
            rewardYuan: row.rewardType === "BALANCE" ? row.rewardCents / 100 : 0,
            rewardPoints: row.rewardType === "POINTS" ? row.rewardCents : 0,
            couponId: row.couponId,
            startAt: row.startAt ? row.startAt.slice(0, 10) : "",
            endAt: row.endAt ? row.endAt.slice(0, 10) : "",
          }
        : {
            name: "邀请有礼",
            rewardType: "BALANCE",
            rewardYuan: 0,
            rewardPoints: 0,
            couponId: 0,
            startAt: "",
            endAt: "",
          },
    );
  };

  const save = async () => {
    const values = await form.validateFields();
    await actions.saveActivity.mutateAsync({
      params: { id: String(shopId) },
      body: {
        ...(editing?.id ? { id: editing.id } : {}),
        name: values.name.trim(),
        rewardType: values.rewardType as "BALANCE" | "POINTS" | "COUPON",
        rewardCents:
          values.rewardType === "BALANCE"
            ? Math.round((values.rewardYuan || 0) * 100)
            : values.rewardType === "POINTS"
              ? Math.round(values.rewardPoints || 0)
              : 0,
        couponId: values.rewardType === "COUPON" ? values.couponId || 0 : 0,
        startAt: values.startAt ? `${values.startAt}T00:00:00` : "",
        endAt: values.endAt ? `${values.endAt}T23:59:59` : "",
      },
    });
    setEditing(null);
  };

  const toggle = async (row: OnsiteActivityRow) => {
    await actions.setActivityStatus.mutateAsync({
      params: { id: String(shopId), activityId: String(row.id) },
      body: { status: row.status === "ON" ? "OFF" : "ON" },
    });
  };

  const rewardLabel = (row: OnsiteActivityRow) =>
    row.rewardType === "COUPON"
      ? "券"
      : `${cents(row.rewardCents)}${row.rewardType === "POINTS" ? " 积分" : ""}`;

  const columns: TableProps<OnsiteActivityRow>["columns"] = [
    { title: "活动", dataIndex: "name", width: 180 },
    {
      title: "奖励",
      key: "reward",
      width: 140,
      render: (_, row) => `${REWARD_TEXT[row.rewardType] ?? row.rewardType} · ${rewardLabel(row)}`,
    },
    { title: "已邀请", dataIndex: "inviteCount", width: 90 },
    { title: "已发奖", dataIndex: "rewardCount", width: 90 },
    {
      title: "时间",
      key: "period",
      width: 220,
      render: (_, row) => (
        <span className="muted text-12">
          {row.startAt ? timeText(row.startAt) : "立即"} ~ {row.endAt ? timeText(row.endAt) : "长期"}
        </span>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <StatusTag kind="activity" value={value} />,
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      fixed: "right",
      render: (_, row) => (
        <Space size={0}>
          <Button size="small" type="link" onClick={() => openEditor(row)}>
            编辑
          </Button>
          <Button size="small" type="link" onClick={() => setRecordsOf(row)}>
            记录
          </Button>
          <Button size="small" type="link" onClick={() => void toggle(row)}>
            {row.status === "ON" ? "停用" : "启用"}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="邀请有礼"
      extra={
        <Button type="primary" onClick={() => openEditor()}>
          新建活动
        </Button>
      }
    >
      <Notice variant="info">
        顾客在小程序「邀请有礼」里拿到专属邀请码，被邀请人首单支付成功后给邀请人发奖。
        同一条邀请关系只发一次；奖励走店内余额 / 积分 / 券，与站内 AWcoin 互不相通。
      </Notice>
      {!rows.length && !query.isFetching ? (
        <EmptyState
          text="还没有邀请活动。建一个活动后，小程序端会自动出现「邀请有礼」入口。"
          action={
            <Button type="primary" onClick={() => openEditor()}>
              新建活动
            </Button>
          }
        />
      ) : (
        <DataTable<OnsiteActivityRow>
          rows={rows}
          columns={columns}
          total={query.data?.total}
          page={page}
          loading={query.isFetching}
          scroll={{ x: 1000 }}
          onPage={setPage}
        />
      )}

      {editing ? (
        <Modal
          open
          destroyOnHidden
          title={editing.id ? "编辑活动" : "新建活动"}
          confirmLoading={actions.saveActivity.isPending}
          onCancel={() => setEditing(null)}
          onOk={() => void save()}
        >
          <Form form={form} layout="vertical" key={editing.id ?? "new"}>
            <Form.Item name="name" label="活动名称" rules={[{ required: true, whitespace: true, message: "请填写活动名称" }]}>
              <Input maxLength={60} />
            </Form.Item>
            <Space size={12} wrap>
              <Form.Item name="rewardType" label="奖励类型">
                <Select
                  style={{ width: 130 }}
                  options={Object.entries(REWARD_TEXT).map(([value, label]) => ({ value, label }))}
                />
              </Form.Item>
              <Form.Item noStyle shouldUpdate>
                {({ getFieldValue }) =>
                  getFieldValue("rewardType") === "BALANCE" ? (
                    <Form.Item name="rewardYuan" label="奖励金额（元）">
                      <InputNumber min={0} step={1} style={{ width: 140 }} />
                    </Form.Item>
                  ) : getFieldValue("rewardType") === "POINTS" ? (
                    <Form.Item name="rewardPoints" label="奖励积分">
                      <InputNumber min={1} style={{ width: 140 }} />
                    </Form.Item>
                  ) : (
                    <Form.Item name="couponId" label="奖励券">
                      <Select
                        style={{ width: 200 }}
                        options={(coupons.data?.list ?? []).map((coupon: OnsiteCouponRow) => ({
                          value: coupon.id,
                          label: coupon.name,
                        }))}
                      />
                    </Form.Item>
                  )
                }
              </Form.Item>
            </Space>
            <Space size={12} wrap>
              <Form.Item name="startAt" label="开始（空 = 立即）">
                <Input placeholder="2026-11-20" style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="endAt" label="结束（空 = 长期）">
                <Input placeholder="2026-12-31" style={{ width: 160 }} />
              </Form.Item>
            </Space>
          </Form>
        </Modal>
      ) : null}

      {recordsOf ? <RecordModal activity={recordsOf} onClose={() => setRecordsOf(null)} /> : null}
    </Panel>
  );
}

function RecordModal({
  activity,
  onClose,
}: {
  activity: OnsiteActivityRow;
  onClose: () => void;
}) {
  const { shopId } = useOnsiteScope();
  const [page, setPage] = useState(1);
  const query = useOnsiteActivityRecords({ shopId }, activity.id, page);
  const rows = query.data?.list ?? [];
  const columns: TableProps<OnsiteActivityRecordRow>["columns"] = [
    { title: "邀请人", dataIndex: "inviterName", width: 140 },
    { title: "被邀请人", dataIndex: "inviteeName", width: 140 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) =>
        value === "REWARDED" ? "已发奖" : value === "PENDING" ? "待首单" : value,
    },
    { title: "奖励", dataIndex: "rewardCents", width: 110, render: (v: number) => cents(v) },
    { title: "绑定时间", dataIndex: "createdAt", width: 160, render: (v: string) => timeText(v) },
    { title: "发奖时间", dataIndex: "rewardedAt", width: 160, render: (v: string) => (v ? timeText(v) : "—") },
  ];
  return (
    <Modal open destroyOnHidden width={820} title={`「${activity.name}」邀请记录`} footer={null} onCancel={onClose}>
      {!rows.length && !query.isFetching ? (
        <EmptyState text="还没有人参与这个活动。" />
      ) : (
        <DataTable<OnsiteActivityRecordRow>
          rows={rows}
          columns={columns}
          total={query.data?.total}
          page={page}
          loading={query.isFetching}
          onPage={setPage}
        />
      )}
    </Modal>
  );
}
