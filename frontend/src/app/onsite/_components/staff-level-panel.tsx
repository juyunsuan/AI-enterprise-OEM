"use client";
// 技师等级页签：分档参数台账。等级名会出现在排期看板与技师卡片上，分成/加钟/门槛先按档位记全，结算口径接入后直接取值。
import {
  type OnsiteStaffLevelInput,
  type OnsiteStaffLevelRow,
} from "@enterprise/contracts";
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Switch, Tag } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import { useOnsiteStaffLevels, useOnsiteStaffActions } from "@/query/onsite";
import { Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import { cents } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const NAME_MAX = 40;

const emptyLevel: OnsiteStaffLevelInput = {
  name: "",
  rank: 1,
  commissionRate: 50,
  addonRate: 100,
  minPerformanceCents: 0,
  onlineHoursRequired: 0,
  points: 0,
  agreementArticleId: 0,
  sortOrder: 0,
  enabled: true,
};

function draftFromRow(row: OnsiteStaffLevelRow): OnsiteStaffLevelInput {
  return {
    id: row.id,
    name: row.name,
    rank: row.rank,
    commissionRate: row.commissionRate,
    addonRate: row.addonRate,
    minPerformanceCents: row.minPerformanceCents,
    onlineHoursRequired: row.onlineHoursRequired,
    points: row.points,
    agreementArticleId: row.agreementArticleId,
    sortOrder: row.sortOrder,
    enabled: row.enabled,
  };
}

export function StaffLevelPanel({ onOpenPanel }: { onOpenPanel: (key: string) => void }) {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteStaffActions();
  const levelsQuery = useOnsiteStaffLevels({ shopId });
  const [form] = Form.useForm<OnsiteStaffLevelInput>();
  const [editing, setEditing] = useState<OnsiteStaffLevelRow | null>(null);
  const [open, setOpen] = useState(false);
  const rows = levelsQuery.data?.list ?? [];
  const minPerformance = Form.useWatch("minPerformanceCents", form) ?? 0;
  const inUse = rows.filter((row) => row.staffCount > 0).length;

  const openForm = (row?: OnsiteStaffLevelRow) => {
    form.setFieldsValue(row ? draftFromRow(row) : { ...emptyLevel });
    setEditing(row ?? null);
    setOpen(true);
  };

  const save = async (values: OnsiteStaffLevelInput) => {
    await actions.saveStaffLevel.mutateAsync({
      params: { id: String(shopId) },
      body: { ...values, id: editing?.id },
    });
    setOpen(false);
  };

  const columns: TableProps<OnsiteStaffLevelRow>["columns"] = [
    {
      title: "等级",
      dataIndex: "name",
      render: (_, row) => (
        <div>
          <Space size={4} wrap>
            <strong>{row.name}</strong>
            {row.enabled ? null : <Tag>已停用</Tag>}
          </Space>
          <div className="muted text-12">
            档位 {row.rank} · 排序 {row.sortOrder} · 在册技师 {row.staffCount} 人
          </div>
        </div>
      ),
    },
    {
      title: "服务费分成（%）",
      dataIndex: "commissionRate",
      width: 150,
      render: (value: number) => (
        <span title="这一档服务费的分成比例（可带小数），给结算/提现口径留档">
          <strong>{value}%</strong>
          {value === 50 ? <span className="muted text-12"> 默认对半</span> : null}
        </span>
      ),
    },
    {
      title: "加钟费率（%）",
      dataIndex: "addonRate",
      width: 140,
      render: (value: number) => (
        <span title="档位台账值：100 = 加收一个单位时长的原价；真正算钱取的是服务档案上的加钟比例">
          {value}%{value === 100 ? <span className="muted text-12"> 按原价</span> : null}
        </span>
      ),
    },
    {
      title: "升级业绩门槛",
      dataIndex: "minPerformanceCents",
      width: 140,
      render: (value: number) => (value ? cents(value) : <span className="muted">无门槛</span>),
    },
    {
      title: "在岗时长要求（小时）",
      dataIndex: "onlineHoursRequired",
      width: 160,
      render: (value: number) => (value ? `${value} 小时` : <span className="muted">不要求</span>),
    },
    { title: "等级积分", dataIndex: "points", width: 100 },
    {
      title: "入驻协议文章",
      dataIndex: "agreementArticleId",
      width: 140,
      render: (value: number) =>
        value ? (
          <span title="技师端入驻/签约时展示的文章">文章 #{value}</span>
        ) : (
          <span className="muted">未挂协议</span>
        ),
    },
    {
      title: "操作",
      width: 140,
      render: (_, row) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => openForm(row)}>
            编辑
          </Button>
          <Popconfirm
            title={`删除等级「${row.name}」`}
            description={
              row.staffCount
                ? `还有 ${row.staffCount} 名技师挂在这个等级上，删除会被拒绝；请先给他们换等级。`
                : "删除后技师档案里的等级选项少一项，已完成的订单不受影响。"
            }
            okText="确认删除"
            cancelText="再想想"
            onConfirm={() =>
              void actions.removeStaffLevel.mutateAsync({
                params: { id: String(shopId) },
                body: { id: row.id },
              })
            }
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel
        title="技师等级"
        extra={
          <Button type="primary" onClick={() => openForm()}>
            新增等级
          </Button>
        }
      >
        <FilterBar>
          <span className="muted">
            等级是技师的分档台账：排期看板与技师卡片上的等级名取自这里；加钟真正加收的比例用的是
            「服务目录 › 服务」里的加钟比例，这里的分成与加钟费率、升级门槛先把每档口径记全，
            结算/提现接入后按档位取值。
          </span>
        </FilterBar>
        <DataTable
          rows={rows}
          page={1}
          loading={levelsQuery.isFetching}
          columns={columns}
          rowKey="id"
        />
        {!rows.length && !levelsQuery.isFetching ? (
          <Notice variant="warn">
            还没有等级：技师档案里的「等级」只能选「未定级」，分成比例与加钟费率也就没有取值来源。
            先按「初级 / 中级 / 高级」建三档，再回「技师」页签给人定级。
          </Notice>
        ) : null}
        {inUse ? (
          <Notice variant="info">
            有 {inUse} 个等级名下挂着技师，删除会先被拒绝。要收拢档位：
            <Button type="link" size="small" onClick={() => onOpenPanel("staff")}>
              去「技师」页签
            </Button>
            把这些人改到保留的等级，回到这一页再删旧档（同名校验会拦住新建，所以是「改档 → 删旧」而不是「同名替换」）。
          </Notice>
        ) : null}
      </Panel>

      <Modal
        open={open}
        title={editing ? `编辑等级：${editing.name}` : "新增等级"}
        destroyOnHidden
        width={640}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={actions.saveStaffLevel.isPending}
      >
        <Form form={form} layout="vertical" initialValues={{ ...emptyLevel }} onFinish={(values) => void save(values)}>
          <Space wrap size={12} align="start">
            <Form.Item
              name="name"
              label="等级名称"
              rules={[{ required: true, message: "请填写等级名称" }]}
              style={{ width: 200 }}
            >
              <Input maxLength={NAME_MAX} placeholder="例：高级技师" />
            </Form.Item>
            <Form.Item
              name="rank"
              label="档位序号"
              extra="数字越小越靠前，等级列表按档位升序展示"
              style={{ width: 130 }}
            >
              <InputNumber style={{ width: "100%" }} min={1} max={20} />
            </Form.Item>
            <Form.Item
              name="commissionRate"
              label="服务费分成（%）"
              extra="这一档服务费的分成比例，可带小数；先把口径记全，结算/提现接入后按档位取值"
              style={{ width: 160 }}
            >
              <InputNumber style={{ width: "100%" }} min={0} max={100} step={0.5} />
            </Form.Item>
            <Form.Item
              name="addonRate"
              label="加钟费率（%）"
              extra="100 = 加收一个单位时长的原价，200 = 双倍；订单实际算钱取「服务」档案上的加钟比例"
              style={{ width: 160 }}
            >
              <InputNumber style={{ width: "100%" }} min={0} max={300} step={5} />
            </Form.Item>
            <Form.Item
              name="minPerformanceCents"
              label="升级业绩门槛（分）"
              extra={`升级考核用的累计业绩，0 = 不设门槛；例 1 万元填 1000000，当前填写约 ${cents(minPerformance)}`}
              style={{ width: 200 }}
            >
              <InputNumber style={{ width: "100%" }} min={0} max={999999999} />
            </Form.Item>
            <Form.Item
              name="onlineHoursRequired"
              label="在岗时长要求（小时）"
              extra="升级需累计的在岗小时数，0 = 不考核；与业绩门槛一起构成这一档的晋级条件"
              style={{ width: 170 }}
            >
              <InputNumber style={{ width: "100%" }} min={0} max={20000} />
            </Form.Item>
            <Form.Item
              name="points"
              label="等级积分"
              extra="这一档对应的积分值，做激励或等级权益时按档位取值"
              style={{ width: 140 }}
            >
              <InputNumber style={{ width: "100%" }} min={0} max={999999} />
            </Form.Item>
            <Form.Item
              name="agreementArticleId"
              label="入驻协议文章编号"
              extra="到「内容运营 › 文章」复制协议文章的编号填这里，0 = 不挂协议；被引用的文章要先在这里换掉才能删除"
              style={{ width: 190 }}
            >
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序值" style={{ width: 120 }}>
              <InputNumber style={{ width: "100%" }} min={0} max={9999} />
            </Form.Item>
            <Form.Item
              name="enabled"
              label="启用"
              valuePropName="checked"
              extra="留档用的开关：技师档案的等级下拉目前不会过滤停用档位，要真正收档请先给技师换等级再删除"
              style={{ width: 150 }}
            >
              <Switch />
            </Form.Item>
          </Space>
          <div className="muted text-12" style={{ marginTop: 8 }}>
            等级名称在同一店铺内唯一，改名会同步影响排期看板与技师卡片上的展示；已挂在这个等级上的技师不用重新定级。
          </div>
        </Form>
      </Modal>
    </Space>
  );
}
