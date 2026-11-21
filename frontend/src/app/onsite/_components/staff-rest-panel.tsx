"use client";
// 休息与工作量：给技师锁档期（店主设的休息段与顾客端置灰同源），并回看每人每天的服务与在路时长。
import {
  type OnsiteRestInput,
  type OnsiteRestRow,
  type OnsiteStaffRow,
  type OnsiteWorkLogRow,
} from "@enterprise/contracts";
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import type { TableProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  useOnsiteStaff,
  useOnsiteStaffActions,
  useOnsiteStaffRest,
  useOnsiteStaffWorkLogs,
} from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import { dayText, statusText, timeText, withShop } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const OPTION_PAGE_SIZE = 200;
const REASON_MAX = 200;
/** 契约的 startAt/endAt 是字符串、后端 new Date() 解析：带 T 的本地时刻不会被当成 UTC。 */
const SUBMIT_FORMAT = "YYYY-MM-DDTHH:mm:ss";
const PICKER_FORMAT = "YYYY-MM-DD HH:mm";

/** 休息段由谁设的：契约只有 OWNER/STAFF/SYSTEM 三个字面量、没有文案字典。 */
const CREATOR_LABELS: Record<string, string> = {
  OWNER: "店主设置",
  STAFF: "技师本人",
  SYSTEM: "规则生成",
};

const WORK_LOG_RANGES = [7, 14, 30];

type RestDraft = {
  range: [Dayjs, Dayjs] | null;
  allDay: boolean;
  reason: string;
};

const freshDraft = (): RestDraft => ({
  range: [dayjs().startOf("day"), dayjs().startOf("day")],
  allDay: true,
  reason: "",
});

function draftFromRow(row: OnsiteRestRow): RestDraft {
  return { range: [dayjs(row.startAt), dayjs(row.endAt)], allDay: row.allDay, reason: row.reason };
}

/** 是否已排完：过去的休息段不再锁档，列表要显式说清楚，免得店主以为还在挡单。 */
const isPastRest = (row: OnsiteRestRow) => dayjs(row.endAt).isBefore(dayjs());

const hoursText = (minutes: number) =>
  minutes >= 60 ? `${(minutes / 60).toFixed(1)} 小时` : `${minutes} 分钟`;

/** 休息段跨几天：整天模式按自然日给「N 天」，否则给小时数。 */
function spanText(row: OnsiteRestRow): string {
  const start = new Date(row.startAt).getTime();
  const end = new Date(row.endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "—";
  const days = Math.round((end - start) / 86_400_000);
  if (row.allDay && days >= 1) return `${days} 天`;
  return `${((end - start) / 3_600_000).toFixed(1)} 小时`;
}

export function StaffRestPanel({ onOpenPanel }: { onOpenPanel: (key: string) => void }) {
  const router = useRouter();
  const { message } = App.useApp();
  const { shopId } = useOnsiteScope();
  const params = useSearchParams();
  const actions = useOnsiteStaffActions();
  const [form] = Form.useForm<RestDraft>();
  const [picked, setPicked] = useState(() => Number(params.get("staffId") || 0));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OnsiteRestRow | null>(null);
  const [days, setDays] = useState(14);

  const staffQuery = useOnsiteStaff({ shopId }, {}, 1, OPTION_PAGE_SIZE);
  const staffRows = staffQuery.data?.list ?? [];
  // 没有深链时默认落到名单第一位，避免一进来是空板。
  const staffId = picked || (staffRows[0]?.id ?? 0);
  const staff: OnsiteStaffRow | undefined = staffRows.find((row) => row.id === staffId);

  const restQuery = useOnsiteStaffRest({ shopId }, staffId);
  const logsQuery = useOnsiteStaffWorkLogs({ shopId }, staffId, days);
  const restRows = restQuery.data?.list ?? [];
  const logRows = logsQuery.data?.list ?? [];
  const summary = logRows.reduce(
    (acc, row) => ({
      serviceMinutes: acc.serviceMinutes + row.serviceMinutes,
      travelMinutes: acc.travelMinutes + row.travelMinutes,
      orderCount: acc.orderCount + row.orderCount,
    }),
    { serviceMinutes: 0, travelMinutes: 0, orderCount: 0 },
  );

  const openForm = (row?: OnsiteRestRow) => {
    setEditing(row ?? null);
    form.setFieldsValue(row ? draftFromRow(row) : freshDraft());
    setOpen(true);
  };

  const closeForm = () => {
    setOpen(false);
    setEditing(null);
    form.resetFields();
  };

  // 快捷排休只改起止日期，具体时刻按整天口径由后端补齐。
  const fillPreset = (startOffset: number, endOffset: number) => {
    form.setFieldsValue({
      range: [
        dayjs().add(startOffset, "day").startOf("day"),
        dayjs().add(endOffset, "day").startOf("day"),
      ],
      allDay: true,
    });
  };

  const save = async (values: RestDraft) => {
    const first = values.range?.[0];
    const second = values.range?.[1];
    if (!first || !second) {
      message.warning("请先选择休息的起止日期");
      return;
    }
    const body: OnsiteRestInput = {
      id: editing?.id,
      startAt: (values.allDay ? first.startOf("day") : first).format(SUBMIT_FORMAT),
      endAt: (values.allDay ? second.endOf("day") : second).format(SUBMIT_FORMAT),
      allDay: values.allDay,
      reason: values.reason.trim(),
    };
    await actions.saveStaffRest.mutateAsync({
      params: { id: String(shopId), staffId: String(staffId) },
      body,
    });
    message.success(editing ? "休息段已更新" : "休息段已锁定，顾客端这段时间会置灰");
    closeForm();
  };

  const restColumns: TableProps<OnsiteRestRow>["columns"] = [
    {
      title: "休息起止",
      dataIndex: "startAt",
      render: (_, row) => (
        <div>
          <div>
            {row.allDay
              ? `${dayText(row.startAt)}${
                  dayText(row.endAt) !== dayText(row.startAt)
                    ? ` ~ ${dayText(row.endAt)}`
                    : ""
                }（整天）`
              : `${timeText(row.startAt)} ~ ${timeText(row.endAt)}`}
          </div>
          <div className="muted text-12">
            {spanText(row)}
            {isPastRest(row) ? " · 已结束，不再锁档" : " · 仍会锁档"}
          </div>
        </div>
      ),
    },
    {
      title: "事由",
      dataIndex: "reason",
      render: (value: string) => value || <span className="muted">未填</span>,
    },
    {
      title: "设置人",
      dataIndex: "createdByRole",
      width: 110,
      render: (value: string) => <Tag>{CREATOR_LABELS[value] ?? (value || "—")}</Tag>,
    },
    {
      title: "操作",
      width: 130,
      render: (_, row) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => openForm(row)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            title="解除后这段时间立刻放回可约池，顾客端马上能选"
            onClick={() =>
              void actions.removeStaffRest.mutateAsync({
                params: { id: String(shopId), staffId: String(staffId) },
                body: { id: row.id },
              })
            }
          >
            解除
          </Button>
        </Space>
      ),
    },
  ];

  const logColumns: TableProps<OnsiteWorkLogRow>["columns"] = [
    {
      title: "日期",
      dataIndex: "day",
      width: 120,
      render: (value: string) => dayText(value),
    },
    {
      title: "服务时长",
      dataIndex: "serviceMinutes",
      render: (value: number) => hoursText(value),
    },
    {
      title: "在路时长",
      dataIndex: "travelMinutes",
      render: (value: number) => hoursText(value),
    },
    { title: "完成单量", dataIndex: "orderCount", width: 100 },
    {
      title: "在外总时长",
      render: (_, row) => hoursText(row.serviceMinutes + row.travelMinutes),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel
        title="休息与请假（锁档）"
        titleBadge={staff ? staff.name : undefined}
        extra={
          <Button type="primary" disabled={!staffId} onClick={() => openForm()}>
            新增休息段
          </Button>
        }
      >
        <FilterBar>
          <Select
            style={{ width: 260 }}
            value={staffId || undefined}
            placeholder={staffRows.length ? "选择技师" : "还没有技师"}
            onChange={(value: number) => setPicked(value)}
            showSearch
            optionFilterProp="label"
            options={staffRows.map((row) => ({
              value: row.id,
              label: `${row.name}（${statusText("staff", row.status)}）`,
            }))}
          />
          <span className="muted">
            休息段与订单占用一样参与排期判定：落在段内的时间片在顾客端显示「休息中」，
            派单候选也会跳过；解除后立即放回可约池。
          </span>
        </FilterBar>

        {!staffRows.length && !staffQuery.isFetching ? (
          <EmptyState
            text="还没有技师：休息段与工时都要挂到具体技师身上。"
            action={
              <Button
                type="primary"
                onClick={() => router.push(`${withShop("/onsite/staff", shopId)}&panel=staff`)}
              >
                去「技师」页签新增
              </Button>
            }
          />
        ) : (
          <>
            {staff && staff.status !== "ONLINE" ? (
              <Notice variant="warn">
                「{staff.name}」当前是「{statusText("staff", staff.status)}」，排期看板本来就不算他的档；
                这里仍可提前排休息，等切回在岗时自动生效。
                <Button
                  type="link"
                  size="small"
                  onClick={() =>
                    router.push(`${withShop("/onsite/staff", shopId)}&panel=staff`)
                  }
                >
                  去改接单状态
                </Button>
              </Notice>
            ) : null}
            <DataTable
              rows={restRows}
              page={1}
              loading={restQuery.isFetching}
              columns={restColumns}
              rowKey="id"
            />
            {!restRows.length && !restQuery.isFetching ? (
              <Notice variant="info">
                该技师还没有休息段。要请假、培训或每周固定歇一天，点右上角「新增休息段」；
                想看这些段在时间片上的效果，回
                <Button type="link" size="small" onClick={() => onOpenPanel("timeline")}>
                  排期看板
                </Button>
                选这位技师即可。
              </Notice>
            ) : null}
          </>
        )}
      </Panel>

      <Panel title="工作量回看">
        <FilterBar>
          <Space wrap size={8}>
            {WORK_LOG_RANGES.map((item) => (
              <Button
                key={item}
                type={days === item ? "primary" : "default"}
                size="small"
                disabled={!staffId}
                onClick={() => setDays(item)}
              >
                近 {item} 天
              </Button>
            ))}
          </Space>
          <span className="muted">
            {staff ? `${staff.name} · 近 ${days} 天` : "先选技师"}
            {logRows.length
              ? `：合计服务 ${hoursText(summary.serviceMinutes)}、在路 ${hoursText(
                  summary.travelMinutes,
                )}、完成 ${summary.orderCount} 单。工时由完成的服务与路上时间累计，只读不回改。`
              : "：还没有工时记录，完成第一单后这里才会有数字。"}
          </span>
        </FilterBar>
        <DataTable
          rows={logRows}
          page={1}
          loading={logsQuery.isFetching}
          columns={logColumns}
          rowKey="day"
        />
        <div className="muted text-12" style={{ marginTop: 8 }}>
          在路时长普遍偏高的技师，适合调可服务时段或换归属城市；单日单量顶着「每日接单上限」的，
          要提上限请到「技师」页签改档案。
        </div>
      </Panel>

      <Modal
        open={open}
        destroyOnHidden
        width={620}
        title={editing ? "编辑休息段" : "新增休息段"}
        okText={editing ? "保存" : "锁定档期"}
        confirmLoading={actions.saveStaffRest.isPending}
        onOk={() => form.submit()}
        onCancel={closeForm}
      >
        <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
          <div className="muted text-12" style={{ marginBottom: 10 }}>
            {staff
              ? `给「${staff.name}」锁档：起止区间内的时间片在小程序里会变成「休息中」，派单候选也会跳过这段时间。`
              : "请先选择技师。"}
          </div>
          <Form.Item
            name="range"
            label="休息起止"
            rules={[{ required: true, message: "请选择休息的起止时间" }]}
          >
            <DatePicker.RangePicker
              showTime
              format={PICKER_FORMAT}
              style={{ width: "100%" }}
              needConfirm={false}
            />
          </Form.Item>
          <Form.Item name="allDay" label="整天休息" valuePropName="checked">
            <Switch />
          </Form.Item>
          <div className="muted text-12" style={{ marginTop: -8, marginBottom: 12 }}>
            开开关后按自然日锁：开始日取 00:00、结束日取 23:59，上面选到的具体时刻会忽略。
          </div>
          <Form.Item
            name="reason"
            label="事由"
            extra={`写在技师端的请假说明里，最长 ${REASON_MAX} 字；留空则只显示「店主排休」。`}
          >
            <Input maxLength={REASON_MAX} placeholder="如：回家过年、每周三培训" />
          </Form.Item>
          <Form.Item label="快捷排休">
            <Space wrap size={8}>
              <Button size="small" onClick={() => fillPreset(0, 0)}>
                今天
              </Button>
              <Button size="small" onClick={() => fillPreset(1, 1)}>
                明天
              </Button>
              <Button size="small" onClick={() => fillPreset(0, 2)}>
                今起 3 天
              </Button>
              <Button size="small" onClick={() => fillPreset(7, 7)}>
                一周后当天
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
