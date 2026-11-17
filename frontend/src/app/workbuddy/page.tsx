import { redirect } from "next/navigation";

/**
 * 旧地址「Workbuddy 企业云」已并入 Agent-Bot：
 * 账号对话/定时任务/企业账号 → /agent-bot?tab=cloud&sub=…，AI 调用账号 → /agent-bot?tab=ai-call。
 */
export default async function WorkbuddyRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wanted = typeof params.tab === "string" ? params.tab : "";
  if (wanted === "ai-call") {
    redirect("/agent-bot?tab=ai-call");
  }
  const sub = ["schedules", "accounts", "bindings"].includes(wanted) ? wanted : "chat";
  redirect(`/agent-bot?tab=cloud&sub=${sub}`);
}
