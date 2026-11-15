"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { Button, Select, Space, Tooltip } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BotWorkspaceDetail } from "@enterprise/contracts";
import { useI18n } from "@/lib/i18n/i18n";
import { botHostApi } from "./common";

export type WorkspaceTarget = {
  /** 空串＝用客户端默认工作区（平台不替用户猜路径）。 */
  workspace: string;
};

export const EMPTY_TARGET: WorkspaceTarget = { workspace: "" };

/**
 * 主机的可选工作区：客户端上报的候选表，对话框与定时表单共用一份。
 * 主机切换时重取，避免拿旧白名单去派活。
 */
export function useWorkspaces(hostId: number) {
  const [detail, setDetail] = useState<BotWorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!hostId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    const result = await botHostApi.workspaces(hostId);
    setDetail(result.data);
    setLoading(false);
  }, [hostId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { detail, loading, reload };
}

/** 工作区下拉：吃客户端上报的候选表，过滤掉已不存在的目录。 */
export function WorkspaceSelect({
  detail,
  value,
  onChange,
  style,
}: {
  detail: BotWorkspaceDetail | null;
  value: string;
  onChange: (workspace: string) => void;
  style?: React.CSSProperties;
}) {
  const { t } = useI18n();
  const workspaces = useMemo(
    () => (detail ? detail.list.filter((ws) => ws.exists) : []),
    [detail],
  );

  if (!workspaces.length) {
    return (
      <Tooltip
        title={t("客户端还没上报这台机器上的工作区，指令会落在它的默认工作区")}
      >
        <span className="text-12 muted">{t("默认工作区")}</span>
      </Tooltip>
    );
  }

  return (
    <Select<string>
      value={value}
      style={{ minWidth: 260, ...style }}
      popupMatchSelectWidth={false}
      onChange={onChange}
      options={[
        {
          value: "",
          label: detail?.defaultPath
            ? `${t("默认工作区")} · ${detail.defaultPath}`
            : t("默认工作区"),
        },
        ...workspaces.map((ws) => ({
          value: ws.path,
          label: `${ws.label || ws.path}${ws.isGit ? " · git" : ""}${
            ws.trust === "trusted" ? ` · ${t("已信任")}` : ""
          }`,
        })),
      ]}
    />
  );
}

/**
 * 表单里的派活目标（定时任务用）：只选工作区。
 * 客户端本地怎么配模型、装了什么技能都是它自己的事，平台这里不展示、不干预。
 */
export function WorkspacePicker({
  detail,
  value,
  onChange,
  onReload,
}: {
  detail: BotWorkspaceDetail | null;
  value: WorkspaceTarget;
  onChange: (next: WorkspaceTarget) => void;
  onReload: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  return (
    <Space wrap size={8}>
      <WorkspaceSelect
        detail={detail}
        value={value.workspace}
        onChange={(workspace) => onChange({ workspace })}
      />
      <Tooltip title={t("重新读取客户端上报的工作区")}>
        <Button
          size="small"
          icon={<ReloadOutlined aria-hidden />}
          onClick={() => void onReload()}
        />
      </Tooltip>
    </Space>
  );
}
