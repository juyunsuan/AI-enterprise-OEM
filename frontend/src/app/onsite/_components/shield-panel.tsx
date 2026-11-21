"use client";
// 号码保护页签：这是「谁对谁开过屏蔽/留痕」的审计台账，不是通讯录；中间号通话能力属后续批次。
import { type OnsiteShieldRow } from "@enterprise/contracts";
import { Button, Popconfirm, Select, Tag } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import {
  useOnsiteContentActions,
  useOnsiteShields,
  useOnsiteStaff,
} from "@/query/onsite";
import { Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import { timeText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

/** 契约里 type 是内联注释枚举（BLOCK_STAFF 顾客屏蔽技师 / BLOCK_CUSTOMER 技师拉黑顾客），端上补文案。 */
const SHIELD_TYPE_LABELS: Record<string, string> = {
  BLOCK_STAFF: "顾客屏蔽技师",
  BLOCK_CUSTOMER: "技师拉黑顾客",
};

export function ShieldPanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteContentActions();
  const [staffId, setStaffId] = useState("");

  const query = useOnsiteShields({ shopId }, staffId);
  const rows = query.data?.list ?? [];
  const staffRows = useOnsiteStaff({ shopId }, {}, 1, 200).data?.list ?? [];

  const columns: TableProps<OnsiteShieldRow>["columns"] = [
    {
      title: "顾客",
      dataIndex: "customerNickname",
      width: 200,
      render: (value: string, row) => value || `顾客 #${row.customerId}`,
    },
    {
      title: "技师",
      dataIndex: "staffName",
      width: 160,
      render: (value: string, row) => value || `#${row.staffId}`,
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 160,
      render: (value: string) => (
        <Tag color={value === "BLOCK_CUSTOMER" ? "red" : "orange"}>
          {SHIELD_TYPE_LABELS[value] ?? value}
        </Tag>
      ),
    },
    {
      title: "建立时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => timeText(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      fixed: "right",
      render: (_, row) => (
        <Popconfirm
          title="解除这条屏蔽关系？"
          description="解除后双方恢复可见可下单；本条留痕会从列表移除。"
          okText="解除"
          cancelText="再想想"
          onConfirm={() =>
            void actions.removeShield.mutateAsync({
              params: { id: String(shopId) },
              body: { id: row.id },
            })
          }
        >
          <Button size="small" type="link" danger loading={actions.removeShield.isPending}>
            解除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Panel title="号码保护 / 屏蔽留痕">
      <Notice variant="warn">
        这张列表是审计台账、不是通讯录：它记录顾客与技师之间「谁对谁开启了号码保护 /
        互相屏蔽」以及建立时间，用于事后追溯真实手机号在什么关系下被隐藏或打开。
        虚拟中间号（通话录音、号码置换）属后续批次能力，本页不提供拨号或查看完整号码的入口——
        需要联系顾客本人请走「顾客私域 → 顾客名单」与「意见反馈」。
      </Notice>
      <FilterBar>
        <Select
          allowClear
          style={{ width: 180 }}
          placeholder="按技师筛选"
          value={staffId || undefined}
          onChange={(value) => setStaffId(value ?? "")}
          options={staffRows.map((row) => ({ value: String(row.id), label: row.name }))}
        />
      </FilterBar>
      <DataTable<OnsiteShieldRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={query.isFetching}
        scroll={{ x: 860 }}
      />
    </Panel>
  );
}
