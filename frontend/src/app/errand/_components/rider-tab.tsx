"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Image, Input, Modal, Select, Space, Table } from "antd";
import type { ErrandCity, ErrandRider, ErrandRiderStatus } from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";
import { useErrandScope } from "./scope";
import { cny, labelOf, StatusTag } from "./common";

/** 骑手报名审核：通过 / 拒绝 / 停用，拒绝必须写原因。 */
export function RiderTab() {
  const { meta } = useErrandScope();
  const { message } = App.useApp();
  const [rows, setRows] = useState<ErrandRider[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [cityId, setCityId] = useState(0);
  const [cities, setCities] = useState<ErrandCity[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<{ rider: ErrandRider; status: ErrandRiderStatus } | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await errandApi.riders({
        query: { page, pageSize: 20, status, cityId, keyword },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "骑手读取失败");
    } finally {
      setLoading(false);
    }
  }, [page, status, cityId, keyword]);

  useEffect(() => {
    void load();
    errandApi.cities().then((list) => setCities(list ?? [])).catch(() => setCities([]));
  }, [load]);

  const submit = async () => {
    if (!target) return;
    try {
      await errandApi.riderStatus({
        body: { id: target.rider.id, status: target.status, reason },
      });
      message.success("骑手状态已更新");
      setTarget(null);
      setReason("");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  return (
    <Panel
      title="骑手与审核"
      titleExtra={
        <Space>
          <Select
            size="small"
            style={{ width: 150 }}
            value={cityId}
            options={[
              { value: 0, label: "全部城市" },
              ...cities.map((city) => ({ value: city.id, label: city.name })),
            ]}
            onChange={(value) => {
              setPage(1);
              setCityId(value);
            }}
          />
          <Select
            size="small"
            style={{ width: 130 }}
            value={status}
            onChange={(value) => {
              setPage(1);
              setStatus(value);
            }}
            options={[
              { value: "", label: "全部状态" },
              ...Object.entries(meta?.riderStatusLabels ?? {}).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Input.Search
            size="small"
            allowClear
            placeholder="姓名 / 手机号 / 骑手编号"
            onSearch={(value) => {
              setPage(1);
              setKeyword(value);
            }}
            style={{ width: 220 }}
          />
        </Space>
      }
    >
      {error ? <Notice variant="error">{error}</Notice> : null}
      <Table<ErrandRider>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage }}
        columns={[
          { title: "编号", dataIndex: "riderNo", width: 150 },
          { title: "城市", width: 110, render: (_, row) => row.cityName || "—" },
          { title: "姓名", dataIndex: "name", width: 110 },
          { title: "手机号", dataIndex: "mobile", width: 130 },
          { title: "车辆", width: 90, render: (_, row) => labelOf(meta, "vehicle", row.vehicleType) },
          { title: "状态", width: 100, render: (_, row) => <StatusTag meta={meta} kind="rider" value={row.status} /> },
          { title: "接单中", width: 80, render: (_, row) => (row.online ? "是" : "否") },
          { title: "累计单", width: 80, render: (_, row) => row.orderCount },
          { title: "评分", width: 70, render: (_, row) => row.rating.toFixed(1) },
          { title: "余额", width: 90, render: (_, row) => cny(row.balance) },
          { title: "证件照", width: 90, render: (_, row) => (row.idCardFront ? <Image src={row.idCardFront} alt="证件照" width={40} /> : "—") },
          {
            title: "操作",
            width: 240,
            render: (_, row) => (
              <Space wrap>
                {row.status !== "APPROVED" ? (
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      setTarget({ rider: row, status: "APPROVED" });
                      setReason("");
                    }}
                  >
                    通过
                  </Button>
                ) : null}
                {row.status !== "SUSPENDED" ? (
                  <Button
                    size="small"
                    danger
                    onClick={() => {
                      setTarget({ rider: row, status: "SUSPENDED" });
                      setReason("");
                    }}
                  >
                    停用
                  </Button>
                ) : null}
                {row.status !== "REJECTED" ? (
                  <Button
                    size="small"
                    onClick={() => {
                      setTarget({ rider: row, status: "REJECTED" });
                      setReason("");
                    }}
                  >
                    拒绝
                  </Button>
                ) : null}
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={target ? `${target.rider.name} · ${labelOf(meta, "rider", target.status)}` : "骑手状态"}
        open={!!target}
        onCancel={() => setTarget(null)}
        onOk={() => void submit()}
        okText="确认"
        destroyOnHidden
      >
        {target?.status === "APPROVED" ? (
          <Notice variant="info">通过后骑手即可在小程序里切换「接单中」并接单。</Notice>
        ) : (
          <Input.TextArea
            rows={3}
            maxLength={300}
            placeholder="原因会展示给骑手，请写清楚（例如证件照不清晰，请重新上传）"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        )}
      </Modal>
    </Panel>
  );
}
