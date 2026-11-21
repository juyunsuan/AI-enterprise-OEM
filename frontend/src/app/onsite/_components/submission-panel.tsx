"use client";
// 留资线索页签：顾客在内容文章页「留资表单」提交，通过后即转成可跟进、可代客下单的线索。
import {
  type OnsiteSubmissionDetail,
  type OnsiteSubmissionRow,
} from "@enterprise/contracts";
import { Button, Drawer, Form, Input, Modal, Select, Space, Spin, Switch } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useOnsiteContentActions,
  useOnsiteSubmission,
  useOnsiteSubmissions,
} from "@/query/onsite";
import { Notice, Panel } from "@/components/ui/panel";
import { DataTable, Descriptions, FilterBar } from "./list-kit";
import { StatusTag, timeText, withShop } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

export function SubmissionPanel() {
  const { shopId } = useOnsiteScope();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(0);

  const query = useOnsiteSubmissions({ shopId }, { status }, page);
  const rows = query.data?.list ?? [];

  return (
    <Panel title="留资线索">
      <Notice variant="info">
        留资是顾客在内容文章页底部「留资表单」里主动留下的联系方式。
        「通过」＝线索生效：按手机号去「订单履约」代客下单即转成正式订单；「关闭」＝不再跟进，记录仍保留可查。
      </Notice>
      <FilterBar>
        <Select
          style={{ width: 150 }}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部状态" },
            { value: "PENDING", label: "待跟进" },
            { value: "APPROVED", label: "已通过" },
            { value: "REJECTED", label: "已关闭" },
          ]}
        />
      </FilterBar>
      <DataTable<OnsiteSubmissionRow>
        rows={rows}
        columns={buildColumns(setDetailId)}
        total={query.data?.total}
        page={page}
        loading={query.isFetching}
        scroll={{ x: 1100 }}
        onPage={setPage}
      />
      <SubmissionDrawer shopId={shopId} id={detailId} onClose={() => setDetailId(0)} />
    </Panel>
  );
}

function buildColumns(openDetail: (id: number) => void): TableProps<OnsiteSubmissionRow>["columns"] {
  return [
    { title: "姓名", dataIndex: "name", width: 120, render: (value: string) => value || "未填写" },
    { title: "手机号", dataIndex: "phone", width: 140, render: (value: string) => value || "未填写" },
    { title: "来源文章", dataIndex: "articleTitle", width: 240 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag kind="submission" value={value} />,
    },
    {
      title: "跟进备注",
      dataIndex: "auditRemark",
      width: 220,
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <span>{value || <span className="muted text-12">—</span>}</span>
          {row.auditedAt ? <span className="muted text-12">{timeText(row.auditedAt)}</span> : null}
        </Space>
      ),
    },
    {
      title: "提交时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => timeText(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 100,
      fixed: "right",
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => openDetail(row.id)}>
          详情
        </Button>
      ),
    },
  ];
}

function SubmissionDrawer({
  shopId,
  id,
  onClose,
}: {
  shopId: number;
  id: number;
  onClose: () => void;
}) {
  const detail = useOnsiteSubmission({ shopId }, id);
  return (
    <Drawer open={id > 0} size={620} destroyOnHidden title="留资详情" onClose={onClose}>
      {!id ? null : detail.data ? (
        <SubmissionBody detail={detail.data} shopId={shopId} />
      ) : detail.isError ? (
        <Notice variant="error">留资详情读取失败：{detail.error.message || "请稍后重试"}</Notice>
      ) : (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin />
        </div>
      )}
    </Drawer>
  );
}

function SubmissionBody({
  detail,
  shopId,
}: {
  detail: OnsiteSubmissionDetail;
  shopId: number;
}) {
  const router = useRouter();
  const actions = useOnsiteContentActions();
  const [auditing, setAuditing] = useState<"approve" | "reject" | null>(null);
  const [form] = Form.useForm<{ remark: string; createStaff: boolean }>();

  const audit = async (approved: boolean) => {
    const values = await form.validateFields();
    await actions.auditSubmission.mutateAsync({
      params: { id: String(shopId) },
      body: {
        id: detail.id,
        approved,
        remark: (values.remark ?? "").trim(),
        createStaff: approved && Boolean(values.createStaff),
      },
    });
    setAuditing(null);
  };

  return (
    <Space orientation="vertical" size={14} style={{ width: "100%" }}>
      <Descriptions
        items={[
          { label: "姓名", value: detail.name || "未填写" },
          { label: "手机号", value: detail.phone || "未填写" },
          { label: "来源文章", value: detail.articleTitle || "—" },
          { label: "状态", value: <StatusTag kind="submission" value={detail.status} /> },
          { label: "提交时间", value: timeText(detail.createdAt) },
          {
            label: "跟进技师",
            value: detail.staffId ? `#${detail.staffId}` : "未指派",
          },
          { label: "处理备注", value: detail.auditRemark || "—" },
          { label: "处理时间", value: detail.auditedAt ? timeText(detail.auditedAt) : "—" },
        ]}
      />
      <div>
        <div className="muted text-12" style={{ marginBottom: 6 }}>
          表单提交内容
        </div>
        {detail.answers.length ? (
          <Descriptions
            items={detail.answers.map((answer) => ({
              label: `${answer.label}（${answer.fieldType}）`,
              value: answer.value || "—",
            }))}
          />
        ) : (
          <span className="muted text-12">这条留资只留了姓名与手机号，没有附加问题。</span>
        )}
      </div>
      {detail.status === "PENDING" ? (
        <Space wrap>
          <Button type="primary" onClick={() => setAuditing("approve")}>
            通过（转跟进 / 转订单）
          </Button>
          <Button danger onClick={() => setAuditing("reject")}>
            关闭
          </Button>
          <Button onClick={() => router.push(withShop("/onsite/order", shopId))}>
            去订单履约为 TA 下单
          </Button>
        </Space>
      ) : (
        <Notice variant="success">
          这条留资已处理完毕；如需代客下单，去「订单履约」新建订单并核对手机号。
        </Notice>
      )}

      {auditing ? (
        <Modal
          open
          destroyOnHidden
          title={auditing === "approve" ? "通过这条留资" : "关闭这条留资"}
          okText="提交"
          confirmLoading={actions.auditSubmission.isPending}
          onCancel={() => setAuditing(null)}
          onOk={() => void audit(auditing === "approve")}
        >
          <div className="muted text-12" style={{ marginBottom: 8 }}>
            {auditing === "approve"
              ? "通过后线索进入已跟进台账：按手机号在「订单履约」代客下单即转成正式订单。审核不可重复提交。"
              : "关闭表示不再跟进（如留错电话、同行试探），记录保留可查。"}
          </div>
          <Form
            form={form}
            layout="vertical"
            key={`${detail.id}-${auditing}`}
            initialValues={{ remark: "", createStaff: false }}
          >
            <Form.Item
              name="remark"
              label="处理备注"
              rules={
                auditing === "reject"
                  ? [{ required: true, whitespace: true, message: "关闭请写明原因" }]
                  : []
              }
            >
              <Input.TextArea rows={3} maxLength={200} showCount placeholder="客户意向、报价沟通结论等" />
            </Form.Item>
            {auditing === "approve" ? (
              <Form.Item
                name="createStaff"
                label="同时建档为服务人员"
                valuePropName="checked"
                extra="仅报名类留资使用：要求留资里有手机号，否则会提交失败"
              >
                <Switch />
              </Form.Item>
            ) : null}
          </Form>
        </Modal>
      ) : null}
    </Space>
  );
}
