import { redirect } from "next/navigation";

/** 旧地址「Mobot 手机」已并入 Agent-Bot：/agent-bot?tab=mobot（老 tab=hosts 落成 sub=devices）。 */
export default async function MobotRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wanted = typeof params.tab === "string" ? params.tab : "";
  const sub = wanted === "hosts" || !wanted ? "devices" : wanted;
  const hostId = typeof params.hostId === "string" ? params.hostId : "";
  const query = new URLSearchParams({ tab: "mobot", sub });
  if (/^\d+$/.test(hostId)) query.set("hostId", hostId);
  redirect(`/agent-bot?${query.toString()}`);
}
