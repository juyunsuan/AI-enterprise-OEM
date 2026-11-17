import { redirect } from "next/navigation";

/**
 * 旧地址「Bot 主机」已并入 Agent-Bot：/agent-bot?tab=bots。
 * 页签与主机深链按老参数名平移（tab=hosts → sub=devices，任务中心带的 hostId 原样保留）。
 */
export default async function BotHostsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wanted = typeof params.tab === "string" ? params.tab : "";
  const sub = wanted === "hosts" || !wanted ? "devices" : wanted;
  const hostId = typeof params.hostId === "string" ? params.hostId : "";
  const query = new URLSearchParams({ tab: "bots", sub });
  if (/^\d+$/.test(hostId)) query.set("hostId", hostId);
  redirect(`/agent-bot?${query.toString()}`);
}
