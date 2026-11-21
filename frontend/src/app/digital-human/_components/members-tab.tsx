"use client";

// 会员与流水页签：终端会员台账（人工补偿）与三账户流水。
import { SearchOutlined } from "@ant-design/icons";
import {
  App,
  Button,
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
import { useCallback, useState } from "react";
import {
  DH_ACCOUNTS,
  DH_ACCOUNT_LABELS,
  DH_BIZ_TYPE_LABELS,
  DH_MEMBER_STATUS,
  DH_MEMBER_STATUS_LABELS,
  type DhBalanceLogRow,
  type DhMemberRow,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { EmptyState, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtDate, fmtTime } from "@/lib/datetime";
import { PAGE_SIZE, usePagedList } from "./shared";

export function MembersTab() {
  const [tab, setTab] = useState("members");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "members", label: "会员", children: <MemberSection key="members" /> },
        { key: "logs", label: "资产流水", children: <LogSection key="logs" /> },
      ]}
    />
  );
}

type MemberStatus = (typeof DH_MEMBER_STATUS)[number];
type Account = (typeof DH_ACCOUNTS)[number];

// ---------------------------------------------------------------------------
// 会员
// ---------------------------------------------------------------------------

type AdjustDraft = {
  member: DhMemberRow;
  pointDelta: number;
  bodyDelta: number;
  voiceDelta: number;
  vipDays: number;
  status: "ACTIVE" | "FROZEN";
  remark: string;
};

function MemberSection() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [promoterOnly, setPromoterOnly] = useState(false);
  const [status, setStatus] = useState<"" | MemberStatus>("");
  const [adjust, setAdjust] = useState<AdjustDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.members({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(appliedKeyword ? { keyword: appliedKeyword } : {}),
          ...(vipOnly ? { vipOnly } : {}),
          ...(promoterOnly ? { promoterOnly } : {}),
          ...(status ? { status } : {}),
        },
      }),
    [appliedKeyword, vipOnly, promoterOnly, status],
  );
  const list = usePagedList<DhMemberRow>(fetcher);

  const submit = async () => {
    if (!adjust) return;
    setSaving(true);
    try {
      await digitalHumanApi.updateMember({
        body: {
          id: adjust.member.id,
          ...(adjust.pointDelta ? { pointDelta: adjust.pointDelta } : {}),
          ...(adjust.bodyDelta ? { bodyDelta: adjust.bodyDelta } : {}),
          ...(adjust.voiceDelta ? { voiceDelta: adjust.voiceDelta } : {}),
          ...(adjust.vipDays ? { vipDays: adjust.vipDays } : {}),
          status: adjust.status,
          remark: adjust.remark.trim() || "站点方调整",
        },
      });
      message.success(`已调整会员「${adjust.member.nickname || "微信用户"}」`);
      setAdjust(null);
      list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "调整失败");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<DhMemberRow> = [
    {
      title: "会员",
      dataIndex: "nickname",
      width: 200,
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <span>{value || "微信用户"}</span>
          <span className="muted text-12">
            ID {row.id}
            {row.referrerId ? ` · 推荐人 ${row.referrerId}` : ""}
          </span>
        </Space>
      ),
    },
    {
      title: "三账户",
      width: 200,
      render: (_, row) => (
        <span className="text-12">
          算力 {row.point} · 形象点 {row.bodyQuota} · 声音点 {row.voiceQuota}
        </span>
      ),
    },
    {
      title: "会员",
      width: 150,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Tag color={row.isVip ? "gold" : "default"}>{row.isVip ? "会员" : "非会员"}</Tag>
          <span className="muted text-12">
            {row.vipExpireAt ? `至 ${fmtDate(row.vipExpireAt)}` : "—"}
          </span>
        </Space>
      ),
    },
    {
      title: "推广",
      width: 140,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <span>等级 {row.promoterLevel}</span>
          <span className="muted text-12">佣金余额 {row.commissionBalance}</span>
        </Space>
      ),
    },
    {
      title: "状态",
      width: 110,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Tag color={row.status === "ACTIVE" ? "green" : "red"}>
            {DH_MEMBER_STATUS_LABELS[row.status] || row.status}
          </Tag>
          <span className="muted text-12">作品 {row.workCount}</span>
        </Space>
      ),
    },
    {
      title: "最近登录",
      width: 150,
      render: (_, row) => (
        <span className="text-12 muted">
          {row.lastLoginAt ? fmtTime(row.lastLoginAt) : "—"}
        </span>
      ),
    },
    {
      title: "操作",
      width: 90,
      render: (_, row) => (
        <Button
          size="small"
          onClick={() =>
            setAdjust({
              member: row,
              pointDelta: 0,
              bodyDelta: 0,
              voiceDelta: 0,
              vipDays: 0,
              status: row.status === "FROZEN" ? "ACTIVE" : "FROZEN",
              remark: "",
            })
          }
        >
          调整
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="会员台账"
      extra={
        <Space wrap>
          <Input
            allowClear
            placeholder="昵称/手机号"
            prefix={<SearchOutlined />}
            value={keyword}
            style={{ width: 180 }}
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={() => {
              setAppliedKeyword(keyword.trim());
              list.setPage(1);
            }}
          />
          <Select
            value={status}
            style={{ width: 120 }}
            options={[
              { value: "", label: "全部状态" },
              ...DH_MEMBER_STATUS.map((value) => ({
                value,
                label: DH_MEMBER_STATUS_LABELS[value],
              })),
            ]}
            onChange={(value: "" | MemberStatus) => {
              setStatus(value);
              list.setPage(1);
            }}
          />
          <Space size={4}>
            <Switch
              size="small"
              checked={vipOnly}
              onChange={(value) => {
                setVipOnly(value);
                list.setPage(1);
              }}
            />
            仅会员
          </Space>
          <Space size={4}>
            <Switch
              size="small"
              checked={promoterOnly}
              onChange={(value) => {
                setPromoterOnly(value);
                list.setPage(1);
              }}
            />
            仅推广员
          </Space>
        </Space>
      }
    >
      {list.rows.length === 0 && !list.loading ? (
        <EmptyState text="还没有会员：小程序端首次打开并 wx.login 后自动建档。" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={list.loading}
          columns={columns}
          dataSource={list.rows}
          pagination={{
            current: list.page,
            pageSize: PAGE_SIZE,
            total: list.total,
            showSizeChanger: false,
            onChange: list.setPage,
          }}
        />
      )}

      <Modal
        open={Boolean(adjust)}
        title={adjust ? `调整会员「${adjust.member.nickname || "微信用户"}」` : ""}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void submit()}
        onCancel={() => setAdjust(null)}
      >
        {adjust ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <span className="muted text-12">
              当前：算力 {adjust.member.point} · 形象点 {adjust.member.bodyQuota} · 声音点{" "}
              {adjust.member.voiceQuota}
            </span>
            <label>
              算力增减
              <InputNumber
                style={{ width: "100%" }}
                value={adjust.pointDelta}
                min={-99999}
                max={99999}
                onChange={(value) =>
                  setAdjust({ ...adjust, pointDelta: Number(value ?? 0) })
                }
              />
            </label>
            <label>
              形象点增减
              <InputNumber
                style={{ width: "100%" }}
                value={adjust.bodyDelta}
                min={-9999}
                max={9999}
                onChange={(value) =>
                  setAdjust({ ...adjust, bodyDelta: Number(value ?? 0) })
                }
              />
            </label>
            <label>
              声音点增减
              <InputNumber
                style={{ width: "100%" }}
                value={adjust.voiceDelta}
                min={-9999}
                max={9999}
                onChange={(value) =>
                  setAdjust({ ...adjust, voiceDelta: Number(value ?? 0) })
                }
              />
            </label>
            <label>
              会员天数增减（正数续期，负数收回）
              <InputNumber
                style={{ width: "100%" }}
                value={adjust.vipDays}
                min={-3650}
                max={3650}
                onChange={(value) =>
                  setAdjust({ ...adjust, vipDays: Number(value ?? 0) })
                }
              />
            </label>
            <Space size={6}>
              <Switch
                checked={adjust.status === "ACTIVE"}
                onChange={(active) =>
                  setAdjust({ ...adjust, status: active ? "ACTIVE" : "FROZEN" })
                }
              />
              账号正常（关闭即冻结）
            </Space>
            <label>
              备注
              <Input
                value={adjust.remark}
                maxLength={200}
                placeholder="会写进资产流水"
                onChange={(event) =>
                  setAdjust({ ...adjust, remark: event.target.value })
                }
              />
            </label>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 流水
// ---------------------------------------------------------------------------

function LogSection() {
  const [account, setAccount] = useState<"" | Account>("");
  const [memberId, setMemberId] = useState("");

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.balanceLogs({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(account ? { account } : {}),
          ...(Number(memberId) > 0 ? { memberId: Number(memberId) } : {}),
        },
      }),
    [account, memberId],
  );
  const list = usePagedList<DhBalanceLogRow>(fetcher);

  const columns: ColumnsType<DhBalanceLogRow> = [
    { title: "会员", dataIndex: "nickname", width: 160, render: (value: string, row) => `${value || "微信用户"}（${row.memberId}）` },
    {
      title: "账户",
      dataIndex: "account",
      width: 90,
      render: (value: string) => <Tag>{DH_ACCOUNT_LABELS[value] || value}</Tag>,
    },
    {
      title: "变动",
      dataIndex: "delta",
      width: 100,
      render: (value: number, row) => (
        <span style={{ color: value < 0 ? "var(--error, #ff4d4f)" : "var(--success, #52c41a)" }}>
          {value > 0 ? `+${value}` : value}
          {row.isRefund ? "（退）" : ""}
        </span>
      ),
    },
    { title: "余额", dataIndex: "balanceAfter", width: 90 },
    {
      title: "来源",
      dataIndex: "bizType",
      width: 110,
      render: (value: string) => DH_BIZ_TYPE_LABELS[value] || value,
    },
    { title: "备注", dataIndex: "remark", ellipsis: true },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
  ];

  return (
    <Panel
      title="资产流水"
      extra={
        <Space>
          <Input
            placeholder="会员 ID"
            value={memberId}
            style={{ width: 120 }}
            onChange={(event) => setMemberId(event.target.value)}
            onPressEnter={() => list.setPage(1)}
          />
          <Select
            value={account}
            style={{ width: 130 }}
            options={[
              { value: "", label: "全部账户" },
              ...DH_ACCOUNTS.map((value) => ({
                value,
                label: DH_ACCOUNT_LABELS[value],
              })),
            ]}
            onChange={(value: "" | Account) => {
              setAccount(value);
              list.setPage(1);
            }}
          />
        </Space>
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={list.loading}
        columns={columns}
        dataSource={list.rows}
        pagination={{
          current: list.page,
          pageSize: PAGE_SIZE,
          total: list.total,
          showSizeChanger: false,
          onChange: list.setPage,
        }}
      />
    </Panel>
  );
}
