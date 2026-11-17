"use client";

import { Skeleton } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Notice } from "@/components/ui/panel";
import { AccountPanel } from "./ai-call/account-panel";
import { aiCallApi, type AiCallAccount } from "./ai-call/common";

/**
 * AI 调用账号：所有类型 Agent-Bot 共用的第三方平台凭据库（加密保存、界面不回显）。
 * 取用授权不在这里配——在各工具的「Agent 绑定账号」页签按设备/账号绑定。
 */
export function AiCallSection() {
  const [accounts, setAccounts] = useState<AiCallAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const result = await aiCallApi.accounts();
    setAccounts(result.data ?? []);
    setError(result.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return loading ? (
    <Skeleton active paragraph={{ rows: 6 }} />
  ) : (
    <>
      {error ? (
        <Notice variant="error">{`AI 调用账号加载失败：${error}`}</Notice>
      ) : null}
      <AccountPanel accounts={accounts} reload={reload} />
    </>
  );
}
