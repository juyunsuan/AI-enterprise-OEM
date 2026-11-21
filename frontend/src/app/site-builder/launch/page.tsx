"use client";

import { ArrowLeftOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  ConfigProvider,
  Descriptions,
  Select,
  Space,
  Table,
  Tooltip,
  Tag,
  Typography,
} from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type {
  ToolLaunchCode,
  ToolLaunchDetail,
  ToolLaunchStateView,
} from "@enterprise/contracts";
import {
  TOOL_BILL_STATUS_LABELS,
  TOOL_LAUNCH_CODES,
} from "@enterprise/contracts";
import { toolLaunchApi } from "@/api/tool-launch";
import { Panel, PageHero } from "@/components/ui/panel";
import {
  cycleLabel,
  formatBytes,
  formatDateTime,
  launchStatusTag,
  launchTerms,
  useToolLaunchStates,
} from "@/lib/tool-launch";

/**
 * 建站工具「启动设置」页（`/site-builder/launch?tool=<code>`）。
 *
 * 这一页只回答两个问题，而且答案必须与平台管理员的配置一模一样：
 * 1. 现在这个工具对我是开还是关、关掉的后果是什么；
 * 2. 开起来要扣多少积分、按什么口径扣、什么时候扣、欠费会怎样。
 *
 * 所有口径文字都来自后端 `plan`（与日批出账同一函数生成），前端不另写一套算法；
 * 启动 / 停止之后一律重新拉取，页面不留「手动刷新才知道变了」的状态。
 */


function LaunchPanel({
  tool,
  onChanged,
}: {
  tool: ToolLaunchCode;
  /** 启停之后重拉卡片页那份共享状态，否则返回建站管理还要等 30 秒才改标签。 */
  onChanged: () => void;
}) {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const [detail, setDetail] = useState<ToolLaunchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await toolLaunchApi.detail({ query: { tool } }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "启动状态读取失败");
    } finally {
      setLoading(false);
    }
  }, [tool, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async () => {
    setBusy(true);
    try {
      await toolLaunchApi.start({ body: { tool } });
      message.success("已启动，顾客端与出包入口同时放开");
      await load();
      onChanged();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "启动失败");
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    modal.confirm({
      title: "停止这个工具？",
      content:
        "停止后顾客端立即不可访问、站内配置转为只读；数据一律保留，之后不再产生新账单。随时可以重新启动。",
      okText: "确认停止",
      okButtonProps: { danger: true },
      cancelText: "先不停",
      onOk: async () => {
        try {
          await toolLaunchApi.stop({ body: { tool } });
          message.success("已停止，后续不再扣积分");
          await load();
          onChanged();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "停止失败");
        }
      },
    });
  };

  if (loading && !detail) {
    return <Panel title="启动设置">正在读取启动状态…</Panel>;
  }
  if (!detail) {
    return (
      <Panel
        title="启动设置"
        extra={<Button icon={<ReloadOutlined />} onClick={() => void load()}>重试</Button>}
      >
        <Alert type="warning" showIcon title="没有取到启动状态，请重试" />
      </Panel>
    );
  }

  const state = detail.state as ToolLaunchStateView;
  const { plan } = state;
  const tag = launchStatusTag(state);
  const insufficient = detail.balanceAmount < state.nextChargeAmount;

  const confirmStart = () => {
    modal.confirm({
      title: `启动「${state.name}」`,
      width: 560,
      okText: plan.billingEnabled
        ? `确认启动并扣 ${plan.unitPrice} 积分`
        : "确认启动",
      cancelText: "再看看",
      content: (
        <Space orientation="vertical" size={6} style={{ width: "100%" }}>
          {launchTerms(state).map((term) => (
            <Typography.Text key={term}>· {term}</Typography.Text>
          ))}
          <Typography.Text type={insufficient ? "danger" : "secondary"}>
            当前积分余额 {detail.balanceAmount}，
            {insufficient ? (
              <>
                不足以支付首期。
                <Button type="link" size="small" onClick={() => router.push("/points")}>
                  去积分中心充值
                </Button>
                后再回来启动。
              </>
            ) : (
              "足够支付首期。"
            )}
          </Typography.Text>
        </Space>
      ),
      onOk: start,
    });
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel
        title={
          <Space size={8}>
            {state.name}
            <Tag color={tag.color}>{tag.label}</Tag>
            {state.ownBilling ? <Tag>独立站按站点月账</Tag> : null}
          </Space>
        }
        titleExtra={<span className="text-12 muted">{state.summary}</span>}
        extra={
          <Space>
            <Button onClick={() => router.push(state.path)}>进入工具</Button>
            {state.open ? (
              <Button danger onClick={stop}>
                停止
              </Button>
            ) : state.stopReason === "PLATFORM" || !plan.launchAllowed ? (
              <Tooltip title="这一项由平台控制：请联系平台客服开通后再启动">
                <Button type="primary" disabled>
                  启动
                </Button>
              </Tooltip>
            ) : (
              <Button type="primary" loading={busy} onClick={confirmStart}>
                {plan.billingEnabled ? `启动并扣 ${plan.unitPrice} 积分` : "启动"}
              </Button>
            )}
          </Space>
        }
      >
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 2, md: 3 }}
          items={[
            { key: "balance", label: "积分余额", children: `${detail.balanceAmount}` },
            {
              key: "period",
              label: state.status === "TRIAL" ? "过渡期截止" : "本期起止",
              children:
                state.status === "TRIAL"
                  ? formatDateTime(state.trialEndsAt)
                  : state.periodStart
                    ? `${formatDateTime(state.periodStart)} ~ ${formatDateTime(state.periodEnd)}`
                    : "—",
            },
            {
              key: "next",
              label: "下次扣费",
              children: state.nextChargeAt
                ? `${formatDateTime(state.nextChargeAt)} · ${state.nextChargeAmount} 积分`
                : "不会自动扣费",
            },
            {
              key: "started",
              label: "启动时间",
              children: formatDateTime(state.startedAt),
            },
            {
              key: "periods",
              label: "已出账期数",
              children: `${state.billedPeriods} 期`,
            },
            {
              key: "arrears",
              label: "欠费起算",
              children: formatDateTime(state.arrearsSince),
            },
          ]}
        />
        {!state.open ? (
          <Alert
            style={{ marginTop: 12 }}
            type="error"
            showIcon
            title="未启动期间的限制"
            description={
              state.stopReason === "PLATFORM"
                ? state.offReason || "平台已暂停该工具，请联系平台客服。"
                : "顾客端小程序不可访问、站内配置只读；数据一律保留，未启动期间不扣积分。"
            }
          />
        ) : null}
        {state.status === "ARREARS" ? (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            showIcon
            title={`欠费宽限中：${plan.graceHours} 小时内补齐积分会自动恢复，超期自动停服`}
            description={
              <>
                {`欠费起算 ${formatDateTime(state.arrearsSince)}。`}
                <Button type="link" size="small" onClick={() => router.push("/points")}>
                  去积分中心充值
                </Button>
                补齐后系统自动补扣并恢复，不需要再付一期。
              </>
            }
          />
        ) : null}
      </Panel>

      <Panel
        title="计费规则"
        titleExtra={
          <span className="text-12 muted">
            以下口径由平台管理员在「平台管理后台 → 积分与计费 → 价目与用量」配置，与自动出账完全一致
          </span>
        }
      >
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 2, md: 3 }}
          items={[
            { key: "cycle", label: "计费口径", children: cycleLabel(plan.cycle) },
            {
              key: "price",
              label: "单价",
              children: plan.unitPrice
                ? `${plan.unitPrice} 积分/${
                    plan.cycleDays
                      ? plan.unitLabel || `${plan.cycleDays} 天`
                      : plan.cycle === "USAGE_PV"
                        ? `${plan.usageUnitSize} 次访问`
                        : plan.cycle === "USAGE_BYTES"
                          ? formatBytes(plan.usageUnitSize)
                          : plan.unitLabel || "期"
                  }`
                : "不扣积分",
            },
            {
              key: "cycleDays",
              label: "账期长度",
              children: plan.cycleDays
                ? `${plan.cycleDays} 天 / 期`
                : plan.cycle === "USAGE_PV" || plan.cycle === "USAGE_BYTES"
                  ? "按量（本期只计量）"
                  : "不适用（免费口径）",
            },
            {
              key: "free",
              label: plan.cycleDays
                ? "免费期数"
                : plan.cycle === "FREE"
                  ? "免费额度"
                  : "每期免费量",
              children: plan.cycleDays
                ? plan.freePeriods
                  ? `前 ${plan.freePeriods} 期免费`
                  : "无"
                : plan.freeQuantity
                  ? `${plan.freeQuantity} ${plan.unitLabel}`
                  : "无",
            },
            {
              key: "min",
              label: "起扣额",
              children: plan.minCharge ? `${plan.minCharge} 积分` : "无",
            },
            { key: "grace", label: "欠费宽限", children: `${plan.graceHours} 小时` },
            {
              key: "transition",
              label: "存量免费过渡",
              children: `${plan.transitionDays} 天`,
            },
            {
              key: "enabled",
              label: "平台是否启用扣费",
              children: plan.billingEnabled ? "已启用" : "未启用（启动不扣积分）",
            },
            {
              key: "allowed",
              label: "允许自助启动",
              children: plan.launchAllowed ? "允许" : "已由平台关闭",
            },
          ]}
        />
        <Alert
          style={{ marginTop: 12 }}
          type={plan.billingEnabled ? "info" : "success"}
          showIcon
          title={plan.note}
          description={
            plan.cycle === "USAGE_PV" || plan.cycle === "USAGE_BYTES"
              ? "按访问 / 按流量计费的正式出账尚未开启：现在只累计下面的计量数据，出账前会在本页公示。"
              : "停止或欠费停服后立即止扣；重新启动会按当期口径重新出首期。"
          }
        />
      </Panel>

      <Panel
        title="本账期计量"
        titleExtra={
          <span className="text-12 muted">
            访问与流量按天累计，用于按访问 / 按流量口径的出账依据；当前口径为
            {cycleLabel(plan.cycle)}
          </span>
        }
      >
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 3 }}
          items={[
            { key: "pv", label: "访问量", children: `${detail.usage.pv} 次` },
            { key: "bytes", label: "响应流量", children: formatBytes(detail.usage.bytes) },
            {
              key: "orders",
              label: "形成订单数",
              children: `${detail.usage.orders} 单（只计额度，不扣积分）`,
            },
            { key: "days", label: "有数据天数", children: `${detail.usage.days} 天` },
          ]}
        />
      </Panel>

      <Panel title="扣费账单" titleExtra={<span className="text-12 muted">最近 12 期</span>}>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={detail.bills}
          locale={{ emptyText: "还没有账单：未启动不出账，扣费从启动的那一刻开始" }}
          columns={[
            {
              title: "账期",
              dataIndex: "periodKey",
              render: (_, row) =>
                `${formatDateTime(row.periodStart)} ~ ${formatDateTime(row.periodEnd)}`,
            },
            { title: "天数", dataIndex: "days", width: 72 },
            {
              title: "积分",
              dataIndex: "pointsAmount",
              width: 96,
              render: (value: number) => `${value}`,
            },
            {
              title: "状态",
              dataIndex: "status",
              width: 108,
              render: (value: string) => (
                <Tag color={value === "CHARGED" ? "green" : value === "ARREARS" ? "red" : "blue"}>
                  {TOOL_BILL_STATUS_LABELS[value] || value}
                </Tag>
              ),
            },
            { title: "备注", dataIndex: "remark" },
          ]}
        />
      </Panel>
    </Space>
  );
}

function LaunchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { states, reload } = useToolLaunchStates();
  const raw = params.get("tool") || "";
  const known = (TOOL_LAUNCH_CODES as readonly string[]).includes(raw);
  const tool = (known ? raw : "brand-mall") as ToolLaunchCode;

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <div style={{ display: "grid", gap: 16 }}>
        <PageHero
          title="启动设置"
          desc="建站管理的每个工具都要先启动才对外营业：未启动期间顾客端不可访问，同时也不扣积分。这里同时给出该工具的完整计费口径——单价、账期、免费期、欠费宽限全部来自平台配置，与自动扣费一分不差。"
          extra={
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/site-builder")}>
              返回建站管理
            </Button>
          }
        />
        <Panel title="选择工具">
          <Select
            style={{ minWidth: 280 }}
            value={tool}
            onChange={(value: ToolLaunchCode) =>
              router.push(`/site-builder/launch?tool=${value}`)
            }
            options={
              states.length
                ? states.map((item) => ({
                    value: item.toolCode,
                    label: `${item.name} · ${launchStatusTag(item).label}`,
                  }))
                : TOOL_LAUNCH_CODES.map((code) => ({ value: code, label: code }))
            }
          />
        </Panel>
        {raw && !known ? (
          <Alert
            type="warning"
            showIcon
            title={`地址里的工具码「${raw}」不是本系统的建站工具，已按「品牌商城」展示；要从别的工具进来，请用该工具页的「启动设置」入口或在上方选择工具。`}
          />
        ) : null}
        <LaunchPanel key={tool} tool={tool} onChanged={() => void reload()} />
      </div>
    </ConfigProvider>
  );
}

export default function ToolLaunchRoute() {
  return (
    <Suspense fallback={null}>
      <LaunchPage />
    </Suspense>
  );
}
