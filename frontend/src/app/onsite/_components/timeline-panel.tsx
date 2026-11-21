"use client";
// 排期看板：按技师 × 日期把可服务时段切成时间片，与顾客端同源同算法（占用/休息/上限/提前量都在这里显形）。
import {
  type OnsiteSlot,
  type OnsiteTimelineRow,
} from "@enterprise/contracts";
import { Avatar, Button, DatePicker, Select, Space, Tag, Tooltip } from "antd";
import dayjs from "dayjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  useOnsiteScheduleDays,
  useOnsiteServices,
  useOnsiteStaff,
  useOnsiteTimeline,
} from "@/query/onsite";
import { EmptyState, Notice, Panel, PillTabs } from "@/components/ui/panel";
import { FilterBar } from "./list-kit";
import { StatusTag, statusText, withShop } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

/** 一次取满候选名单：看板的服务/技师筛选是本地选择，不分页。 */
const OPTION_PAGE_SIZE = 200;

const clockStart = (label: string) => label.split("-")[0] || label;
const clockEnd = (label: string) => label.split("-")[1] || label;

/** 连续同因时间片合并成一档展示，否则 5 分钟粒度下一屏全是重复标签。 */
type SlotRun = {
  key: string;
  reason: OnsiteSlot["reason"];
  available: boolean;
  orderId: number;
  from: string;
  to: string;
  count: number;
};

function runsOf(slots: OnsiteSlot[]): SlotRun[] {
  const runs: SlotRun[] = [];
  for (const slot of slots) {
    const last = runs[runs.length - 1];
    // 已占档按订单号拆开，便于跳到具体订单
    const merged =
      last &&
      last.reason === slot.reason &&
      last.available === slot.available &&
      (slot.reason !== "OCCUPIED" || last.orderId === slot.orderId);
    if (merged && last) {
      last.to = clockEnd(slot.label);
      last.count += 1;
      continue;
    }
    runs.push({
      key: `${slot.reason}-${slot.startAt}`,
      reason: slot.reason,
      available: slot.available,
      orderId: slot.orderId,
      from: clockStart(slot.label),
      to: clockEnd(slot.label),
      count: 1,
    });
  }
  return runs;
}

export function TimelinePanel({ onOpenPanel }: { onOpenPanel: (key: string) => void }) {
  const router = useRouter();
  const { shopId, shop } = useOnsiteScope();
  const params = useSearchParams();
  // 深链带进来的 day 先校形，避免非法串让 dayjs 把选择器打成 Invalid Date。
  const [day, setDay] = useState(() => {
    const wanted = params.get("day") ?? "";
    return /^\d{4}-\d{2}-\d{2}$/.test(wanted)
      ? wanted
      : dayjs().format("YYYY-MM-DD");
  });
  const [staffId, setStaffId] = useState(() => params.get("staffId") || "");
  const [serviceId, setServiceId] = useState("");
  const trade = shop?.trade;

  const staffQuery = useOnsiteStaff({ shopId }, {}, 1, OPTION_PAGE_SIZE);
  const servicesQuery = useOnsiteServices({ shopId }, {}, 1, OPTION_PAGE_SIZE);
  const timelineQuery = useOnsiteTimeline({ shopId }, { day, staffId, serviceId });
  const daysQuery = useOnsiteScheduleDays({ shopId }, { staffId, serviceId });

  const staffRows = staffQuery.data?.list ?? [];
  const serviceRows = servicesQuery.data?.list ?? [];
  const result = timelineQuery.data;
  const timelines = useMemo(() => result?.timelines ?? [], [result]);
  const dayOptions = daysQuery.data?.days ?? [];
  const selectedService = serviceRows.find((item) => String(item.id) === serviceId);
  const selectedStaff = staffRows.find((item) => String(item.id) === staffId);

  const goStaff = () => router.push(`${withShop("/onsite/staff", shopId)}&panel=staff`);

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel
        title="档期口径"
        titleBadge={result ? `${result.day}` : undefined}
        extra={
          <Button onClick={() => router.push(withShop("/onsite/setting", shopId))}>
            改时间片与可约天数
          </Button>
        }
      >
        <Space wrap size={8}>
          <Tag>时间片 {trade?.timeUnitMinutes ?? result?.timeUnitMinutes ?? "—"} 分钟一段</Tag>
          <Tag>可约到今天起 {trade?.maxDays ?? "—"} 天</Tag>
          <Tag>已订时段两侧各留 {trade?.bufferMinutes ?? result?.bufferMinutes ?? "—"} 分钟缓冲</Tag>
          <Tag>顾客最少提前 {trade?.bookingLeadMinutes ?? "—"} 分钟</Tag>
          <Tag>
            跨零点夜班 {trade?.allowCrossDay ? "店铺已允许" : "店铺未允许"}
          </Tag>
          {result?.durationMinutes ? (
            <Tag color="blue">
              已按「{selectedService?.title ?? "所选服务"}」的 {result.durationMinutes} 分钟连续占片
            </Tag>
          ) : null}
        </Space>
        <div className="muted text-12" style={{ marginTop: 8 }}>
          这几项就是这张网格看起来的样子：粒度决定一段多长，缓冲决定被订后左右各锁开多久，
          提前量决定今天还剩几段能选，可约天数决定日期条能点几天。改它们不影响已成交的订单。
        </div>
      </Panel>

      <Panel
        title="排期看板"
        extra={
          <Button onClick={() => onOpenPanel("rest")}>休息与工作量</Button>
        }
      >
        <FilterBar>
          <DatePicker
            allowClear={false}
            value={dayjs(day)}
            format="YYYY-MM-DD"
            disabledDate={(current) =>
              trade
                ? current.isAfter(dayjs().add(trade.maxDays - 1, "day").endOf("day"))
                : false
            }
            onChange={(_, formatted) => setDay(formatted || dayjs().format("YYYY-MM-DD"))}
          />
          <Select
            style={{ width: 200 }}
            value={staffId}
            onChange={(value: string) => setStaffId(value)}
            options={[
              { value: "", label: "全部在岗技师" },
              ...staffRows.map((row) => ({
                value: String(row.id),
                label: `${row.name}（${statusText("staff", row.status)}）`,
              })),
            ]}
          />
          <Select
            style={{ width: 240 }}
            value={serviceId}
            onChange={(value: string) => setServiceId(value)}
            options={[
              { value: "", label: "不限服务（只看单片空闲）" },
              ...serviceRows.map((row) => ({
                value: String(row.id),
                label: `${row.title}（${row.durationMinutes} 分钟）`,
              })),
            ]}
          />
          {dayOptions.length ? (
            <PillTabs
              size="small"
              variant="soft"
              value={day}
              onChange={setDay}
              items={dayOptions.map((item, index) => ({
                key: item.day,
                label: index === 0 ? "今天" : index === 1 ? "明天" : item.day.slice(5),
                count: item.availableCount,
              }))}
            />
          ) : null}
        </FilterBar>

        {selectedStaff && selectedStaff.status !== "ONLINE" && !timelines.length ? (
          <Notice variant="warn">
            「{selectedStaff.name}」当前是「{statusText("staff", selectedStaff.status)}」，
            排期引擎只算在岗技师的档，所以这里没有他。
            <Button type="link" size="small" onClick={goStaff}>
              去技师页签把他切为在岗
            </Button>
          </Notice>
        ) : null}
        {result?.note ? <Notice variant="warn">{result.note}</Notice> : null}

        {timelines.length ? (
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            {timelines.map((row) => (
              <TimelineCard key={row.staffId} row={row} shopId={shopId} />
            ))}
          </Space>
        ) : timelineQuery.isFetching || staffQuery.isFetching ? null : (
          <EmptyState
            text={
              staffRows.length
                ? "今天没有可展示档期：可能是全部技师都不在岗，或所选日期超出了店铺的可约天数。"
                : "还没有技师：排期与顾客端的可约时间片都来自技师的可服务时段。"
            }
            action={
              <Space wrap>
                <Button type="primary" onClick={goStaff}>
                  去「技师」页签新增/切在岗
                </Button>
                <Button onClick={() => onOpenPanel("rest")}>给技师排休息</Button>
              </Space>
            }
          />
        )}
      </Panel>
    </Space>
  );
}

function TimelineCard({ row, shopId }: { row: OnsiteTimelineRow; shopId: number }) {
  const router = useRouter();
  const runs = runsOf(row.slots);
  const occupied = row.slots.filter((slot) => slot.reason === "OCCUPIED").length;
  const rest = row.slots.filter((slot) => slot.reason === "REST").length;
  return (
    <div
      style={{
        border: "1px solid var(--line, #f0f0f0)",
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <Space wrap align="center" style={{ width: "100%", justifyContent: "space-between" }}>
        <Space align="center">
          <Avatar src={row.avatar || undefined} size={32}>
            {row.staffName.slice(0, 1) || "技"}
          </Avatar>
          <div>
            <div>
              <strong>{row.staffName}</strong>
              {row.levelName ? (
                <span className="muted text-12">
                  {" "}
                  · {row.levelName} · {row.rating.toFixed(1)} 分
                </span>
              ) : null}
            </div>
            <div className="muted text-12">
              可服务 {row.serviceStartAt}–{row.serviceEndAt} · 本日可约 {row.availableCount} 段 ·
              已占 {occupied} 段{rest ? ` · 休息 ${rest} 段` : ""}
            </div>
          </div>
        </Space>
        <Space wrap size={4}>
          <Button
            type="link"
            size="small"
            title="指定技师自接单模式下技师自己抢单；店铺统一派单模式在这里按空档改派"
            onClick={() => router.push(withShop("/onsite/order", shopId))}
          >
            去订单页派单
          </Button>
          <Button
            type="link"
            size="small"
            title="休息段会同时锁住顾客端的时间片"
            onClick={() => {
              const search = new URLSearchParams({
                shopId: String(shopId),
                panel: "rest",
                staffId: String(row.staffId),
              });
              router.push(`/onsite/schedule?${search.toString()}`);
            }}
          >
            排休息
          </Button>
        </Space>
      </Space>
      <div style={{ marginTop: 10 }}>
        {runs.length ? (
          <Space wrap size={6}>
            {runs.map((run) => (
              <Tooltip
                key={run.key}
                title={
                  run.reason === "OCCUPIED"
                    ? `这 ${run.count} 段被订单占用（含未付款，占档到超时取消或退款释放）`
                    : run.reason === "AVAILABLE" && !run.available
                      ? "单片空闲，但从这里起连续排不下所选服务的时长"
                      : undefined
                }
              >
                <span>
                  <StatusTag
                    kind="slotReason"
                    value={run.reason}
                    extra={
                      <span className="muted text-12">
                        {" "}
                        {run.from}–{run.to}
                        {run.count > 1 ? ` ×${run.count}` : ""}
                        {run.orderId ? `（订单 #${run.orderId}）` : ""}
                      </span>
                    }
                  />
                </span>
              </Tooltip>
            ))}
          </Space>
        ) : (
          <span className="muted">
            这一天的可服务时段切不出时间片：请核对技师的可服务时段与「跨零点夜班」开关。
          </span>
        )}
      </div>
    </div>
  );
}
