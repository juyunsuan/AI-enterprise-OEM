"use client";

// 一键报警：安全事项按「未处理永远在最前」呈现，处置要写清联系了谁、结果如何。
import {
  ONSITE_ALERT_STATUSES,
  type OnsiteAlertConfigInput,
  type OnsiteAlertRow,
} from "@enterprise/contracts";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
} from "antd";
import type { TableProps } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  useOnsiteAlertActions,
  useOnsiteAlertConfig,
  useOnsiteAlerts,
} from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable, Descriptions, FilterBar } from "./list-kit";
import { StatusTag, statusOptions, statusText, timeText, withShop } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const PAGE_SIZE = 20;
const REMARK_MAX = 300;
const HELP_PHONE_MAX = 32;

const ALERT_STATUS_OPTIONS = ONSITE_ALERT_STATUSES.map((value) => ({
  value,
  label: statusText("alert", value),
}));

export function AlertPanel() {
  const { shopId } = useOnsiteScope();
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [handling, setHandling] = useState<OnsiteAlertRow | null>(null);
  const alertId = Number(params.get("alertId") || 0);
  const [openedAlertId, setOpenedAlertId] = useState(0);

  const filter = useMemo(
    () => ({ status: status === "all" ? undefined : status }),
    [status],
  );
  const query = useOnsiteAlerts({ shopId }, filter, page, PAGE_SIZE);
  const rows = useMemo(() => query.data?.list ?? [], [query.data]);
  const foundInList = alertId > 0 && rows.some((item) => item.id === alertId);
  // 通知深链 /onsite/aftersale?panel=alert&alertId=7：列表到位后自动展开这条报警的处置框。
  useEffect(() => {
    if (!foundInList || openedAlertId === alertId) return;
    const row = rows.find((item) => item.id === alertId);
    if (!row) return;
    setOpenedAlertId(alertId);
    setHandling(row);
  }, [alertId, foundInList, openedAlertId, rows]);
  const missingFromList = alertId > 0 && !foundInList && rows.length > 0;

  const columns: TableProps<OnsiteAlertRow>["columns"] = [
    {
      title: "报警时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => timeText(value),
    },
    {
      title: "服务人员",
      dataIndex: "staffName",
      width: 180,
      render: (_, row) => (
        <div>
          <div>{row.staffName || `#${row.staffId}`}</div>
          {row.staffPhone ? (
            <a className="text-12" href={`tel:${row.staffPhone}`}>
              {row.staffPhone}
            </a>
          ) : (
            <div className="muted text-12">没有留电话</div>
          )}
        </div>
      ),
    },
    {
      title: "关联订单",
      dataIndex: "orderNo",
      width: 170,
      render: (_, row) =>
        row.orderId ? (
          <Button
            size="small"
            type="link"
            onClick={() =>
              router.push(withShop(`/onsite/order?orderId=${row.orderId}`, shopId))
            }
          >
            {row.orderNo || `#${row.orderId}`}
          </Button>
        ) : (
          <span className="muted text-12">非订单场景</span>
        ),
    },
    {
      // 定位与链接一律按契约原值展示：一期没有地图服务，不伪造地图组件。
      title: "位置快照",
      dataIndex: "address",
      width: 260,
      render: (_, row) => (
        <div>
          <div>{row.address || "未取到地址"}</div>
          <div className="muted text-12">
            坐标 {row.lng}, {row.lat}
          </div>
          <div className="muted text-12">顾客 #{row.customerId}</div>
        </div>
      ),
    },
    {
      title: "现场说明 / 录音",
      dataIndex: "content",
      width: 240,
      render: (_, row) => (
        <div>
          <div>{row.content || "—"}</div>
          {row.audioUrl ? (
            <a className="text-12" href={row.audioUrl} target="_blank" rel="noreferrer">
              听取录音
            </a>
          ) : (
            <div className="muted text-12">无录音</div>
          )}
        </div>
      ),
    },
    {
      title: "当时通知了谁",
      dataIndex: "notifyResult",
      width: 240,
      render: (value: string) => value || <span className="muted text-12">—</span>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <StatusTag kind="alert" value={value} />,
    },
    {
      title: "处置记录",
      dataIndex: "handleRemark",
      width: 240,
      render: (_, row) => (
        <div>
          <div>{row.handleRemark || "—"}</div>
          {row.handledAt ? (
            <div className="muted text-12">
              {timeText(row.handledAt)} · 处理人 {row.handledBy || "—"}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      fixed: "right",
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => setHandling(row)}>
          处理
        </Button>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <AlertConfigPanel shopId={shopId} />
      <Panel
        title="报警记录"
        titleExtra={
          <span className="muted text-12">
            未处理的报警永远排在最前；处置必须留说明，安全记录不能只改状态
          </span>
        }
      >
        <FilterBar>
          <Select
            style={{ width: 150 }}
            value={status}
            onChange={(value: string) => {
              setStatus(value);
              setPage(1);
            }}
            options={statusOptions("alert", ONSITE_ALERT_STATUSES)}
          />
        </FilterBar>
        {query.isError ? (
          <Notice variant="error">
            报警记录读取失败：{query.error.message || "请稍后重试"}
          </Notice>
        ) : null}
        {missingFromList ? (
          <Notice variant="warn">
            通知里的报警 {alertId} 不在当前列表里，多半是被状态筛选挡住了。
            <Button size="small" type="link" onClick={() => setStatus("all")}>
              切回全部状态
            </Button>
          </Notice>
        ) : null}
        <DataTable<OnsiteAlertRow>
          rows={rows}
          columns={columns}
          total={query.data?.total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={query.isFetching}
          onPage={setPage}
          scroll={{ x: 1500 }}
        />
        {!rows.length && !query.isFetching && !query.isError ? (
          <EmptyState
            text={
              status === "all"
                ? "还没有报警记录。技师在小程序端点「一键报警」后会生成一条待处理记录，并给你发站内提醒。"
                : "当前状态下没有报警，切回「全部状态」看看历史记录。"
            }
          />
        ) : null}

        {handling ? (
          <HandleAlertModal
            shopId={shopId}
            row={handling}
            onClose={() => setHandling(null)}
          />
        ) : null}
      </Panel>
    </Space>
  );
}

function HandleAlertModal({
  shopId,
  row,
  onClose,
}: {
  shopId: number;
  row: OnsiteAlertRow;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const actions = useOnsiteAlertActions();
  const [form] = Form.useForm<{
    status: OnsiteAlertRow["status"];
    remark: string;
  }>();

  const submit = async (values: {
    status: OnsiteAlertRow["status"];
    remark: string;
  }) => {
    await actions.handleAlert.mutateAsync({
      params: { id: String(shopId) },
      body: { id: row.id, status: values.status, remark: values.remark.trim() },
    });
    message.success("处置结果已记录，这条报警的处理人会写进安全台账");
    onClose();
  };

  return (
    <Modal
      open
      key={`alert-${row.id}`}
      title={`处置报警 · ${row.staffName || `#${row.staffId}`}`}
      okText="保存处置结果"
      cancelText="先不处理"
      destroyOnHidden
      confirmLoading={actions.handleAlert.isPending}
      onCancel={onClose}
      onOk={() => void form.submit()}
    >
      <Descriptions
        items={[
          { label: "报警时间", value: timeText(row.createdAt) },
          { label: "联系电话", value: row.staffPhone || "—" },
          { label: "关联订单", value: row.orderNo || `#${row.orderId || "无"}` },
          { label: "位置", value: row.address || "—" },
          { label: "坐标", value: `${row.lng}, ${row.lat}` },
          { label: "现场说明", value: row.content || "—" },
          { label: "当时通知了谁", value: row.notifyResult || "—" },
        ]}
      />
      <Notice variant="warn">
        先打电话确认人身安全（电话上方技师号码），再回来记录结果。
        若确认为误报也请填写说明，安全台账不能只改状态。
      </Notice>
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 12 }}
        initialValues={{ status: row.status === "PENDING" ? "PROCESSING" : row.status }}
        onFinish={(values) => void submit(values)}
      >
        <Form.Item name="status" label="处置状态" extra="联系中 = 已在核实但还没结论；已处置 = 事情处理完毕；误报 = 误触或虚惊。">
          <Select options={ALERT_STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="remark"
          label="处置说明"
          rules={[{ required: true, message: "请填写处置说明" }]}
          extra="写清联系了谁、到场情况、是否需要进一步报警。"
        >
          <Input.TextArea rows={3} maxLength={REMARK_MAX} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function AlertConfigPanel({ shopId }: { shopId: number }) {
  const { message } = App.useApp();
  const actions = useOnsiteAlertActions();
  const config = useOnsiteAlertConfig({ shopId });
  const data = config.data;

  return (
    <Panel
      title="求救配置"
      titleExtra={
        <span className="muted text-12">
          配置存在店铺交易参数里，只影响这条求救链路，不改动收款与排期参数
        </span>
      }
    >
      {config.isError ? (
        <Notice variant="error">
          求救配置读取失败：{config.error.message || "请稍后重试"}
        </Notice>
      ) : null}
      {!data && !config.isError ? (
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      ) : null}
      {data ? (
        <Form
          key={`alert-config-${shopId}`}
          layout="vertical"
          initialValues={{
            enabled: data.enabled,
            helpPhones: data.helpPhones,
            notifyOwner: data.notifyOwner,
            dedupeMinutes: data.dedupeMinutes,
          }}
          onFinish={(values: OnsiteAlertConfigInput) =>
            void actions.saveAlertConfig
              .mutateAsync({
                params: { id: String(shopId) },
                body: values,
              })
              .then(() => {
                message.success("求救配置已保存，技师端下次启动即生效");
              })
          }
        >
          <Space wrap size={16} align="start">
            <Form.Item
              name="enabled"
              label="开启一键报警"
              valuePropName="checked"
              extra="服务人员安全兜底，关掉后技师端不再有这个按钮，建议保持开启。"
              style={{ marginBottom: 0 }}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="notifyOwner"
              label="求救站内提醒店主"
              valuePropName="checked"
              extra="关掉后你不会收到站内信，只能靠下方外呼号码；关掉不等于报警不生效，只是通知不到你。"
              style={{ marginBottom: 0 }}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="dedupeMinutes"
              label="去重窗口（分钟）"
              extra="同一技师在这个窗口内重复点击只算一次，防误触刷屏；窗口内的重复点击仍会留痕提醒。"
              style={{ marginBottom: 0 }}
            >
              <InputNumber min={1} max={120} precision={0} style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Form.Item
            name="helpPhones"
            label="求救外呼号码"
            style={{ marginTop: 16 }}
            extra="一期只留痕：号码会随报警记录写清「待外呼」，短信与语音外呼通道随 P4 虚拟号接入后自动生效。最多 10 个，回车或逗号分隔录入。"
            rules={[
              {
                validator: (_, value: string[]) => {
                  const list = value ?? [];
                  if (list.length > 10) {
                    return Promise.reject(new Error("最多 10 个号码"));
                  }
                  if (list.some((item) => item.trim().length > HELP_PHONE_MAX)) {
                    return Promise.reject(
                      new Error(`单个号码不能超过 ${HELP_PHONE_MAX} 位`),
                    );
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Select
              mode="tags"
              style={{ minWidth: 320 }}
              placeholder="13900000000, 13800000000"
              tokenSeparators={[",", " "]}
              maxTagCount={10}
            />
          </Form.Item>
          <div style={{ marginTop: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={actions.saveAlertConfig.isPending}
            >
              保存求救配置
            </Button>
          </div>
        </Form>
      ) : null}
    </Panel>
  );
}
