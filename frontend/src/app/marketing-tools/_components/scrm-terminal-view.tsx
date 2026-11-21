"use client";

import { App, Switch, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { fmtTime } from "@/lib/datetime";
import { scrmApi, type ScrmTerminalSetting } from "./scrm-common";

const SCENE_LABELS: Record<string, string> = {
  ONSITE: "上门服务",
  CARD_SHOP: "卡密商城",
  EXPRESS: "快递寄件",
  ERRAND: "跑腿",
  CIRCLE: "圈子社区",
  DIGITAL_HUMAN: "数字人",
  KNOWLEDGE_PAY: "知识付费",
};

const EVENT_LABELS: Record<string, string> = {
  CUSTOMER_REGISTER: "顾客注册",
  ORDER_PAID: "订单付款",
  ORDER_COMPLETED: "订单完成",
};

/**
 * 终端接入：给没有独立 SCRM outbox 的小程序按实例开关来源打标。
 * 一个企微客户可以在多个终端各打一个来源标签；终端顾客记录仍各自独立。
 */
export function ScrmTerminalView() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<ScrmTerminalSetting[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await scrmApi.terminalSettings()) || []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "终端列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (row: ScrmTerminalSetting, enabled: boolean) => {
    setRows((list) =>
      list.map((item) =>
        item.scene === row.scene && item.sourceId === row.sourceId
          ? { ...item, enabled }
          : item,
      ),
    );
    try {
      await scrmApi.terminalToggle({
        body: { scene: row.scene, sourceId: row.sourceId, enabled },
      });
      message.success(enabled ? "已开启来源打标" : "已关闭来源打标");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
      await load();
    }
  };

  const columns: ColumnsType<ScrmTerminalSetting> = [
    {
      title: "终端",
      dataIndex: "scene",
      width: 130,
      render: (value: string) => (
        <Tag>{SCENE_LABELS[value] || value}</Tag>
      ),
    },
    { title: "实例", dataIndex: "sourceName", render: (value: string) => value || "—" },
    {
      title: "来源打标",
      dataIndex: "enabled",
      width: 110,
      render: (value: boolean, row) => (
        <Switch checked={value} onChange={(next) => void toggle(row, next)} />
      ),
    },
    {
      title: "最近事件",
      dataIndex: "lastEventKind",
      width: 120,
      render: (value: string) => EVENT_LABELS[value] || value || "—",
    },
    {
      title: "最近打标",
      dataIndex: "lastTaggedAt",
      width: 170,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "最近错误",
      dataIndex: "lastError",
      render: (value: string) => (value ? <span className="text-12 muted">{value}</span> : "—"),
    },
  ];

  return (
    <div>
      <div className="muted text-12" style={{ marginBottom: 12 }}>
        开启后，该终端顾客登录/付款时会按 unionId 或手机号匹配企微联系人，
        并追加“来源渠道”标签。同一企微客户可同时拥有多个终端标签。
      </div>
      <Table
        rowKey={(row) => `${row.scene}:${row.sourceId}`}
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
      />
    </div>
  );
}