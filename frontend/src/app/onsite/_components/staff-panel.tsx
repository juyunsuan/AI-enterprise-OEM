"use client";
// 技师页签：接单台账（在岗与否直接决定小程序端可见性）+ 资料变更待审 + 离场与排期入口。
import {
  ONSITE_STAFF_STATUSES,
  type OnsiteStaffRow,
  type OnsiteStaffStatus,
} from "@enterprise/contracts";
import { App, Avatar, Button, Input, Modal, Select, Space, Tag } from "antd";
import type { TableProps } from "antd";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  useOnsiteCities,
  useOnsiteStaff,
  useOnsiteStaffActions,
  useOnsiteStaffLevels,
} from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable, Descriptions, FilterBar } from "./list-kit";
import { StatusTag, statusOptions, statusText, timeText, withShop } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";
import { StaffDrawer } from "./staff-drawer";

const PAGE_SIZE = 20;

/** 状态切换的按钮文案与落地效果说明：让店主一眼知道点完顾客端会怎样。 */
const STATUS_ACTION_LABELS: Record<OnsiteStaffStatus, string> = {
  ONLINE: "设为在岗",
  OFF_DUTY: "转为休息",
  SUSPENDED: "停用",
  PENDING: "退回待审核",
  LEFT: "标记已离场",
};

export function StaffPanel({ onOpenPanel }: { onOpenPanel: (key: string) => void }) {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteStaffActions();
  const [status, setStatus] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [levelId, setLevelId] = useState("");
  const [cityId, setCityId] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState<OnsiteStaffRow | null>(null);
  const [rejectRemark, setRejectRemark] = useState("");

  const filter = useMemo(
    () => ({ status, keyword: keyword.trim(), levelId, cityId }),
    [status, keyword, levelId, cityId],
  );
  const listQuery = useOnsiteStaff({ shopId }, filter, page, PAGE_SIZE);
  const levelsQuery = useOnsiteStaffLevels({ shopId });
  const citiesQuery = useOnsiteCities({ shopId });
  const rows = listQuery.data?.list ?? [];
  const levels = levelsQuery.data?.list ?? [];
  const cities = citiesQuery.data?.list ?? [];
  const filtered =
    status !== "all" ||
    Boolean(keyword.trim()) ||
    Boolean(levelId) ||
    Boolean(cityId);
  const pendingCount = rows.filter((row) => row.hasPendingProfile).length;

  const resetFilters = () => {
    setStatus("all");
    setKeyword("");
    setLevelId("");
    setCityId("");
    setPage(1);
  };

  const changeStatus = async (row: OnsiteStaffRow, next: OnsiteStaffStatus) => {
    await actions.setStaffStatus.mutateAsync({
      params: { id: String(shopId) },
      body: { id: row.id, status: next, remark: "" },
    });
    message.success(
      next === "ONLINE"
        ? `${row.name} 已在岗：小程序技师列表、排期看板与派单候选都会带上他`
        : `${row.name} 已改为「${statusText("staff", next)}」，顾客端不再能选到他`,
    );
  };

  const reviewProfile = async (approved: boolean) => {
    if (!reviewing) return;
    await actions.reviewStaffProfile.mutateAsync({
      params: { id: String(shopId) },
      body: {
        id: reviewing.id,
        approved,
        remark: approved ? "" : rejectRemark.trim(),
      },
    });
    message.success(
      approved
        ? "资料变更已通过，小程序端改用新内容展示"
        : "资料变更已驳回，小程序端仍展示原档案内容",
    );
    setReviewing(null);
    setRejectRemark("");
  };

  const goSchedule = (row: OnsiteStaffRow, panel: string) => {
    const search = new URLSearchParams({
      shopId: String(shopId),
      panel,
      staffId: String(row.id),
    });
    router.push(`/onsite/schedule?${search.toString()}`);
  };

  const columns: TableProps<OnsiteStaffRow>["columns"] = [
    {
      title: "头像",
      dataIndex: "avatar",
      width: 68,
      render: (_, row) => (
        <Avatar src={row.avatar || undefined} size={40}>
          {row.name.slice(0, 1) || "技"}
        </Avatar>
      ),
    },
    {
      title: "姓名",
      dataIndex: "name",
      render: (_, row) => (
        <div>
          <Space size={4} wrap>
            <strong>{row.name}</strong>
            {row.authStatus === "VERIFIED" ? <Tag color="green">已实名</Tag> : null}
            {row.source === "APPLY" ? <Tag>自助报名</Tag> : null}
            {row.recommendTop ? <Tag color="blue">推荐位</Tag> : null}
          </Space>
          <div className="muted text-12">
            工号 {row.staffNo || "—"} · 从业 {row.workYears} 年
          </div>
        </div>
      ),
    },
    {
      title: "手机",
      dataIndex: "phone",
      width: 130,
      render: (value: string) => value || "—",
    },
    {
      title: "等级",
      dataIndex: "levelName",
      width: 110,
      render: (value: string) => value || <span className="muted">未定级</span>,
    },
    {
      title: "城市",
      dataIndex: "cityName",
      width: 140,
      render: (_, row) => row.cityName || row.serviceCity || "—",
    },
    {
      title: "接单状态",
      dataIndex: "status",
      width: 150,
      render: (_, row) => (
        <>
          <StatusTag kind="staff" value={row.status} />
          <div className="muted text-12">
            {row.serviceStartAt}–{row.serviceEndAt}
            {row.crossDay ? "（跨零点）" : ""}
            {row.dailyOrderLimit ? ` · 日限 ${row.dailyOrderLimit} 单` : " · 日限不限"}
          </div>
        </>
      ),
    },
    {
      title: "评分与单量",
      dataIndex: "rating",
      width: 170,
      render: (_, row) => (
        <div>
          <div>
            {row.rating.toFixed(1)} 分
            <span className="muted text-12">（{row.reviewCount} 条评价）</span>
          </div>
          <div className="muted text-12">
            真实 {row.orderCountTrue} 单 · 对外展示 {row.orderCountTrue + row.orderCountVirtual} 单
          </div>
        </div>
      ),
    },
    {
      title: "最近定位上报",
      dataIndex: "lastLocationAt",
      width: 160,
      render: (_, row) =>
        row.locationEnabled ? (
          timeText(row.lastLocationAt)
        ) : (
          <span className="muted">未开启定位采集</span>
        ),
    },
    {
      title: "操作",
      width: 300,
      render: (_, row) => (
        <Space size={2} wrap>
          <Button type="link" size="small" onClick={() => setEditing(row.id)}>
            编辑
          </Button>
          {row.status === "ONLINE" ? (
            <Button
              type="link"
              size="small"
              loading={actions.setStaffStatus.isPending}
              title="置为休息后顾客端与派单候选都会排除他，已下的单不受影响"
              onClick={() => void changeStatus(row, "OFF_DUTY")}
            >
              {STATUS_ACTION_LABELS.OFF_DUTY}
            </Button>
          ) : (
            <Button
              type="link"
              size="small"
              loading={actions.setStaffStatus.isPending}
              title="在岗才会出现在小程序技师列表与排期看板"
              onClick={() => void changeStatus(row, "ONLINE")}
            >
              {STATUS_ACTION_LABELS.ONLINE}
            </Button>
          )}
          {row.status !== "SUSPENDED" ? (
            <Button
              type="link"
              size="small"
              danger
              title="停用：保留档案与历史订单，但不派单、不可约"
              onClick={() => void changeStatus(row, "SUSPENDED")}
            >
              {STATUS_ACTION_LABELS.SUSPENDED}
            </Button>
          ) : null}
          {row.hasPendingProfile ? (
            <Button
              type="link"
              size="small"
              title="审核通过后才对外展示新资料；驳回则小程序端继续显示原档案"
              onClick={() => {
                setRejectRemark("");
                setReviewing(row);
              }}
            >
              资料审核（{row.pendingDiff.length}）
            </Button>
          ) : null}
          <Button type="link" size="small" onClick={() => goSchedule(row, "timeline")}>
            排期
          </Button>
          <Button type="link" size="small" onClick={() => goSchedule(row, "rest")}>
            休息/工时
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() =>
              modal.confirm({
                title: `${STATUS_ACTION_LABELS.LEFT} · ${row.name}`,
                content:
                  "离场只停止之后的接单，历史订单仍保留他的姓名与档案；" +
                  "若还有进行中的订单会被拒绝，请先在「订单履约」改派给其它技师或完成退款，再回来操作。",
                okText: "确认离场",
                onOk: async () => {
                  await actions.removeStaff.mutateAsync({
                    params: { id: String(shopId) },
                    body: { id: row.id },
                  });
                  message.success(`${row.name} 已离场，小程序端不再展示`);
                },
              })
            }
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel
        title="技师名单"
        titleBadge={pendingCount ? `${pendingCount} 人待审资料` : undefined}
        extra={
          <Button type="primary" onClick={() => setEditing(0)}>
            新增技师
          </Button>
        }
      >
        <FilterBar>
          <Select
            style={{ width: 140 }}
            value={status}
            options={statusOptions("staff", ONSITE_STAFF_STATUSES)}
            onChange={(value: string) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <Input
            allowClear
            placeholder="姓名 / 手机号 / 工号"
            style={{ width: 200 }}
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
          <Select
            style={{ width: 150 }}
            value={levelId}
            onChange={(value: string) => {
              setLevelId(value);
              setPage(1);
            }}
            options={[
              { value: "", label: "全部等级" },
              ...levels.map((level) => ({ value: String(level.id), label: level.name })),
            ]}
          />
          <Select
            style={{ width: 150 }}
            value={cityId}
            onChange={(value: string) => {
              setCityId(value);
              setPage(1);
            }}
            options={[
              { value: "", label: "全部城市" },
              ...cities.map((city) => ({ value: String(city.id), label: city.name })),
            ]}
          />
          {filtered ? (
            <Button type="text" onClick={resetFilters}>
              清空筛选
            </Button>
          ) : null}
        </FilterBar>
        <DataTable
          rows={rows}
          total={listQuery.data?.total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={listQuery.isFetching}
          onPage={setPage}
          columns={columns}
          rowKey="id"
        />
        {rows.length === 0 && !listQuery.isFetching ? (
          filtered ? (
            <Notice variant="info">
              当前筛选条件下没有技师。
              <Button type="link" size="small" onClick={resetFilters}>
                清空筛选
              </Button>
              或换一个状态/等级/城市再看。
            </Notice>
          ) : (
            <EmptyState
              text="还没有技师：小程序里的技师列表、排期看板与派单候选现在都是空的，顾客只能按服务下单。"
              action={
                <Button type="primary" onClick={() => setEditing(0)}>
                  新增第一位技师
                </Button>
              }
            />
          )
        ) : null}
        {!levels.length && rows.length ? (
          <Notice variant="warn">
            本店还没有技师等级：分成比例、加钟费率与入驻协议都取自等级，
            <Button type="link" size="small" onClick={() => onOpenPanel("level")}>
              去「等级」页签新建
            </Button>
            后再回这里给技师定级。
          </Notice>
        ) : null}
        <div className="muted text-12" style={{ marginTop: 8 }}>
          状态含义：在岗=顾客可挑可约；休息/停用/已离场=两端都排除，但历史订单档案保留。
          自助报名进来的技师初始为「待审核」，点「{STATUS_ACTION_LABELS.ONLINE}」即通过入驻。
          要查某人这一段时间的服务与在路时长，点行末「休息/工时」。
        </div>
      </Panel>

      <Modal
        open={Boolean(reviewing)}
        title={reviewing ? `资料变更审核 · ${reviewing.name}` : ""}
        destroyOnHidden
        onCancel={() => setReviewing(null)}
        width={620}
        footer={[
          <Button key="later" onClick={() => setReviewing(null)}>
            稍后处理
          </Button>,
          <Button
            key="reject"
            danger
            loading={actions.reviewStaffProfile.isPending}
            onClick={() => void reviewProfile(false)}
          >
            驳回变更
          </Button>,
          <Button
            key="pass"
            type="primary"
            loading={actions.reviewStaffProfile.isPending}
            onClick={() => void reviewProfile(true)}
          >
            通过并对外展示
          </Button>,
        ]}
      >
        {reviewing ? (
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <Notice variant="info">
              下面是技师本人提交、等待你放行的变更项。审核通过前小程序端仍展示原档案；
              通过后新内容立即对外生效（姓名/手机号/头像/简介/相册/服务时段/城市与常驻地址）。
            </Notice>
            <Descriptions
              items={reviewing.pendingDiff.map((item) => ({
                label: item.label,
                value: item.value || "—",
              }))}
            />
            <Input
              placeholder="驳回理由（只驳回时使用，技师端可见）"
              maxLength={200}
              value={rejectRemark}
              onChange={(event) => setRejectRemark(event.target.value)}
            />
          </Space>
        ) : null}
      </Modal>

      <StaffDrawer
        open={editing !== null}
        shopId={shopId}
        staffId={editing ?? 0}
        levels={levels}
        cities={cities}
        onClose={() => setEditing(null)}
      />

      <Panel title="和技师相关的其它入口">
        <Space wrap>
          <Button onClick={() => router.push(withShop("/onsite/schedule", shopId))}>
            排期看板
          </Button>
          <Button onClick={() => router.push(withShop("/onsite/order", shopId))}>
            订单履约（改派/代客下单）
          </Button>
          <Button onClick={() => onOpenPanel("level")}>等级与分成</Button>
        </Space>
        <div className="muted text-12" style={{ marginTop: 8 }}>
          给某个服务配「谁能做、各自多少钱」在「服务目录」里做：那里按服务列出技师差异价，
          排期看板选服务时也只看这份名单收敛候选。
        </div>
      </Panel>
    </Space>
  );
}
