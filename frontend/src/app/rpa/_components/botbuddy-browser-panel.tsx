"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { Badge, Button, Space, Table, Tag } from "antd";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { endpoints, type BotHostView } from "@enterprise/contracts";
import { endpoint } from "@/api/endpoint";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";

/**
 * RPA ·「本地RPA状态」页签里的第三类执行端：AWBotDSH 浏览器。
 *
 * 浏览器本体不在这台服务器上，而是跑在用户自己机器的 AWBotDSH 客户端里（内核级指纹窗口，
 * 随客户端内置 Automa 插件），所以这里只做状态登记：列出已配对的 AWBotDSH 主机与在线态，
 * 下载、配对与窗口操作都在「Agent-Bot → Bot 主机」页与客户端里完成。
 */

const POLL_MS = 30_000;

const listHosts = endpoint(endpoints.BotHost_list);

const PLATFORM_LABEL: Record<string, string> = {
  win: "Windows",
  mac: "macOS",
};

function badgeOf(host: BotHostView) {
  if (host.status === "DISABLED") return { status: "default" as const, text: "已停用" };
  if (host.online) return { status: "success" as const, text: "在线" };
  return {
    status: host.status === "NEVER" ? "default" as const : "error" as const,
    text: host.statusLabel || "离线",
  };
}

export function BotBuddyBrowserPanel() {
  const [hosts, setHosts] = useState<BotHostView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const data = await listHosts({ query: { kind: "DESKTOP" } });
      setHosts(data?.list ?? []);
      setError("");
    } catch (err) {
      setError((err as Error).message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const onlineCount = hosts.filter((host) => host.online).length;

  return (
    <Panel
      title="AWBotDSH 浏览器"
      titleBadge={`${hosts.length} 台主机 · ${onlineCount} 台在线`}
      extra={
        <Space>
          <span className="text-12 muted">
            客户端自带的内核级指纹窗口，内置 Automa 插件、开箱即用
          </span>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void reload()}>
            刷新
          </Button>
        </Space>
      }
    >
      {error ? <Notice variant="error">{`AWBotDSH 主机加载失败：${error}`}</Notice> : null}

      <Notice>
        AWBotDSH 浏览器跑在你自己机器的 AWBotDSH 客户端里：随客户端内置 Automa
        插件（每个窗口默认加载、不可删除），打开窗口点 Automa 图标即可编排 / 运行工作流；
        平台「RPA 脚本」里的 JSON（Automa 工作流）正文可以直接粘进 Automa 导入。
        下载、配对与新建窗口都在客户端完成，这里只登记主机在线状态。
      </Notice>

      {hosts.length ? (
        <Table<BotHostView>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={hosts}
          pagination={false}
          scroll={{ x: "max-content" }}
          columns={[
            {
              title: "主机",
              key: "name",
              render: (_: unknown, row: BotHostView) => (
                <div>
                  <div>{row.name}</div>
                  <div className="text-12 muted mono">
                    {PLATFORM_LABEL[row.platform] || row.platform || "—"}
                    {row.clientVersion ? ` · v${row.clientVersion}` : ""}
                  </div>
                </div>
              ),
            },
            {
              title: "在线",
              key: "online",
              width: 110,
              render: (_: unknown, row: BotHostView) => {
                const badge = badgeOf(row);
                return <Badge status={badge.status} text={badge.text} />;
              },
            },
            {
              title: "工作区",
              key: "workspace",
              width: 120,
              render: (_: unknown, row: BotHostView) =>
                row.workspace.count ? `${row.workspace.count} 个候选` : "—",
            },
            {
              title: "最近心跳",
              dataIndex: "lastSeenAt",
              key: "lastSeenAt",
              width: 160,
              render: (value: string | null) => fmtTime(value),
            },
            {
              title: "待执行",
              dataIndex: "pendingCount",
              key: "pendingCount",
              width: 90,
              render: (value: number) => (value ? <Tag>{value} 条</Tag> : "—"),
            },
            {
              title: "操作",
              key: "actions",
              width: 130,
              render: () => (
                <Link href="/agent-bot?tab=bots">
                  <Button size="small" type="link">
                    打开 Bot 主机
                  </Button>
                </Link>
              ),
            },
          ]}
        />
      ) : (
        <EmptyState
          text="还没有 AWBotDSH 主机：到「Agent-Bot → Bot 主机」页下载客户端，填本系统地址并配对后，客户端「浏览器」页签里就是自带 Automa 的指纹浏览器"
        />
      )}
    </Panel>
  );
}
