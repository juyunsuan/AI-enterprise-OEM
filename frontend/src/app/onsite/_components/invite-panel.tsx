"use client";
// 营销-邀请记录：每个邀请人的邀请码与累计邀请数，二维码在小程序端生成，这里只看账。
import type { OnsiteInviteRow } from "@enterprise/contracts";
import { useState } from "react";
import type { TableProps } from "antd";
import { useOnsiteInvites } from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable } from "./list-kit";
import { timeText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

export function InvitePanel() {
  const { shopId } = useOnsiteScope();
  const [page, setPage] = useState(1);
  const query = useOnsiteInvites({ shopId }, page);
  const rows = query.data?.list ?? [];

  const columns: TableProps<OnsiteInviteRow>["columns"] = [
    { title: "邀请人", dataIndex: "inviterName", width: 180 },
    { title: "邀请码", dataIndex: "code", width: 180 },
    {
      title: "活动",
      dataIndex: "activityId",
      width: 100,
      render: (value: number) => `#${value}`,
    },
    { title: "累计邀请", dataIndex: "inviteCount", width: 100 },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 180,
      render: (value: string) => timeText(value),
    },
  ];

  return (
    <Panel title="邀请记录">
      <Notice variant="info">
        顾客打开「邀请有礼」即生成专属邀请码与海报。奖励记录在「邀请有礼」页签里查看与核对；
        这里只统计谁邀请了多少人，便于挑出活跃的推广顾客。
      </Notice>
      {!rows.length && !query.isFetching ? (
        <EmptyState text="还没有顾客生成邀请码，先把小程序发出去或发一张券引流。" />
      ) : (
        <DataTable<OnsiteInviteRow>
          rows={rows}
          columns={columns}
          total={query.data?.total}
          page={page}
          loading={query.isFetching}
          onPage={setPage}
        />
      )}
    </Panel>
  );
}
