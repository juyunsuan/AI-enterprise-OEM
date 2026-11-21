"use client";

import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { HealthMeta, HealthTeamJoinRow, HealthTeamRow } from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useHealthMeta, useHealthShopId } from "./health-scope";
import {
  DataTable,
  Descriptions,
  FilterBar,
  OnOffTag,
  StatusTag,
  labelOf,
  useHealthResource,
} from "./health-common";

/**
 * 团队：以机构为单位组建的医护小组（含组长、成员、公告），
 * 顾客扫码进组后由组内医护共同服务；加入申请在审核通过后才进组。
 */

const PAGE_SIZE = 20;
const OPTION_PAGE_SIZE = 100;
/** 加入申请没有独立的列表接口，只能按团队详情汇总：团队多时只扫前 50 个。 */
const JOIN_SCAN_LIMIT = 50;

type TeamDetailData = NonNullable<Awaited<ReturnType<typeof healthApi.teamDetail>>>;

export function TeamsTab() {
  const shopId = useHealthShopId();
  const meta = useHealthMeta();
  const [panel, setPanel] = useState("teams");
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "teams", label: "团队", children: <TeamList shopId={shopId} meta={meta} /> },
        { key: "joins", label: "加入申请", children: <JoinLedger shopId={shopId} meta={meta} /> },
      ]}
    />
  );
}

function TeamList({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<HealthTeamRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [organId, setOrganId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HealthTeamRow | "new" | null>(null);
  const [detailId, setDetailId] = useState(0);

  const organs = useHealthResource(
    () => healthApi.organs({ query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE, kind: "all" } }),
    [shopId],
    shopId > 0,
  );
  const practitioners = useHealthResource(
    () =>
      healthApi.practitioners({
        query: {
          shopId,
          page: 1,
          pageSize: OPTION_PAGE_SIZE,
          role: "all",
          organId: 0,
          hospitalId: 0,
          departmentId: 0,
        },
      }),
    [shopId],
    shopId > 0,
  );

  const organOptions = (organs.data?.list ?? []).map((row) => ({ value: row.id, label: row.name }));
  const practitionerOptions = (practitioners.data?.list ?? []).map((row) => ({
    value: row.id,
    label: row.organName ? `${row.name}（${row.organName}）` : row.name,
  }));

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const result = await healthApi.teams({
        query: { shopId, page, pageSize: PAGE_SIZE, organId },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, [shopId, page, organId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (row: HealthTeamRow) => {
    setBusy(true);
    try {
      await healthApi.teamRemove({ body: { shopId, id: row.id } });
      message.success("团队已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<HealthTeamRow> = [
    { title: "团队名称", dataIndex: "name", render: (value: string) => <strong>{value}</strong> },
    { title: "所属机构", dataIndex: "organName", width: 160, render: (value: string) => value || "—" },
    { title: "组长", dataIndex: "leaderName", width: 110, render: (value: string) => value || "未设置" },
    { title: "成员数", dataIndex: "memberCount", width: 90 },
    { title: "服务人数", dataIndex: "patientCount", width: 100 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => <OnOffTag value={value} />,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 170,
      fixed: "right",
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button size="small" type="text" onClick={() => setDetailId(row.id)}>
            详情
          </Button>
          <Button size="small" type="text" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除团队后组内成员与公告一并失效，已服务顾客不受影响，确认继续？"
            onConfirm={() => void remove(row)}
          >
            <Button size="small" type="text" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="团队"
      titleExtra={<span className="muted text-12">团队归属机构，组长与成员从本店已通过审核的医护里选</span>}
      extra={
        <Button type="primary" size="small" onClick={() => setEditing("new")}>
          新建团队
        </Button>
      }
    >
      <FilterBar>
        <div style={{ display: "grid", gap: 4 }}>
          <span className="muted text-12">所属机构</span>
          <Select
            value={organId}
            style={{ width: 200 }}
            onChange={(value) => {
              setOrganId(value);
              setPage(1);
            }}
            options={[{ value: 0, label: "全部机构" }, ...organOptions]}
          />
        </div>
      </FilterBar>

      {rows.length || loading ? (
        <DataTable
          rows={rows}
          columns={columns}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={loading || busy}
          onPage={(next) => setPage(next)}
          scroll={{ x: 1060 }}
        />
      ) : (
        <EmptyState text="还没有团队：新建团队后把机构里的医护编进组，顾客扫码即可进组。" />
      )}

      {/* 详情只认 teamId：关抽屉时传 0，配合 key 重新挂载避免看到上一个团队的数据。 */}
      <TeamDrawer
        key={detailId || "none"}
        shopId={shopId}
        meta={meta}
        teamId={detailId}
        practitionerOptions={practitionerOptions}
        onClose={() => setDetailId(0)}
        onChanged={() => void load()}
      />

      <TeamModal
        shopId={shopId}
        editing={editing}
        organOptions={organOptions}
        practitionerOptions={practitionerOptions}
        onClose={() => setEditing(null)}
        onDone={() => void load()}
      />
    </Panel>
  );
}

function TeamModal({
  shopId,
  editing,
  organOptions,
  practitionerOptions,
  onClose,
  onDone,
}: {
  shopId: number;
  editing: HealthTeamRow | "new" | null;
  organOptions: { value: number; label: string }[];
  practitionerOptions: { value: number; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    name: string;
    organId: number;
    leaderPractitionerId: number;
    intro: string;
    status: string;
  }>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    if (!row) {
      form.setFieldsValue({
        name: "",
        organId: 0,
        leaderPractitionerId: 0,
        intro: "",
        status: "ON",
      });
      return;
    }
    form.setFieldsValue({
      name: row.name,
      organId: row.organId,
      leaderPractitionerId: row.leaderPractitionerId,
      intro: row.intro,
      status: row.status,
    });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.teamSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          name: values.name,
          organId: Number(values.organId ?? 0),
          leaderPractitionerId: Number(values.leaderPractitionerId ?? 0),
          intro: values.intro ?? "",
          status: values.status === "OFF" ? "OFF" : "ON",
        },
      });
      message.success("团队已保存");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={row ? `编辑 ${row.name}` : "新建团队"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="团队名称" rules={[{ required: true, message: "请填写团队名称" }]}>
          <Input maxLength={80} placeholder="如 高血压慢病管理一组" />
        </Form.Item>
        <Form.Item name="organId" label="所属机构">
          <Select options={[{ value: 0, label: "暂不归属机构" }, ...organOptions]} />
        </Form.Item>
        <Form.Item name="leaderPractitionerId" label="组长">
          <Select
            showSearch
            optionFilterProp="label"
            options={[{ value: 0, label: "暂不设置" }, ...practitionerOptions]}
          />
        </Form.Item>
        <Form.Item name="intro" label="团队介绍" extra="小程序端团队页展示">
          <Input.TextArea rows={3} maxLength={2000} showCount />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select
            options={[
              { value: "ON", label: "启用" },
              { value: "OFF", label: "停用" },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function TeamDrawer({
  shopId,
  meta,
  teamId,
  practitionerOptions,
  onClose,
  onChanged,
}: {
  shopId: number;
  meta: HealthMeta | null;
  teamId: number;
  practitionerOptions: { value: number; label: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [memberForm] = Form.useForm<{ practitionerId: number; isLeader: boolean }>();
  const [noticeEditing, setNoticeEditing] = useState<
    TeamDetailData["notices"][number] | "new" | null
  >(null);
  const [joining, setJoining] = useState<HealthTeamJoinRow | null>(null);

  const detail = useHealthResource(
    () => healthApi.teamDetail({ query: { shopId, id: teamId } }),
    [shopId, teamId],
    shopId > 0 && teamId > 0,
  );
  const data = detail.data;

  const refresh = async () => {
    await detail.reload();
    onChanged();
  };

  const addMember = async () => {
    const values = await memberForm.validateFields();
    setAddingMember(true);
    try {
      await healthApi.teamMemberAdd({
        body: {
          shopId,
          teamId,
          practitionerId: Number(values.practitionerId),
          isLeader: Boolean(values.isLeader),
        },
      });
      message.success("成员已加入团队");
      memberForm.resetFields();
      await refresh();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setAddingMember(false);
    }
  };

  const removeMember = async (id: number) => {
    setBusy(true);
    try {
      await healthApi.teamMemberRemove({ body: { shopId, id } });
      message.success("成员已移出团队");
      await refresh();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const removeNotice = async (id: number) => {
    setBusy(true);
    try {
      await healthApi.teamNoticeRemove({ body: { shopId, id } });
      message.success("公告已删除");
      await refresh();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const memberColumns: ColumnsType<TeamDetailData["members"][number]> = [
    { title: "姓名", dataIndex: "name", render: (value: string) => <strong>{value}</strong> },
    {
      title: "身份",
      dataIndex: "role",
      width: 100,
      render: (value: string) => labelOf(meta, "practitionerRoles", value),
    },
    { title: "职称", dataIndex: "title", width: 110, render: (value: string) => value || "—" },
    {
      title: "组长",
      dataIndex: "isLeader",
      width: 80,
      render: (value: boolean) => (value ? <Tag color="blue">组长</Tag> : "—"),
    },
    {
      title: "加入时间",
      dataIndex: "joinedAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 80,
      render: (_: unknown, row) => (
        <Popconfirm title="移出后该医护不再服务本组顾客。" onConfirm={() => void removeMember(row.id)}>
          <Button size="small" type="text" danger loading={busy}>
            移出
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const joinColumns: ColumnsType<HealthTeamJoinRow> = [
    { title: "申请人", dataIndex: "name" },
    { title: "留言", dataIndex: "message", render: (value: string) => value || "—" },
    {
      title: "审核状态",
      dataIndex: "auditStatus",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    { title: "审核意见", dataIndex: "auditReason", render: (value: string) => value || "—" },
    {
      title: "提交时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 90,
      render: (_: unknown, row) => (
        <Button size="small" type="text" onClick={() => setJoining(row)}>
          审核
        </Button>
      ),
    },
  ];

  return (
    <Drawer
      open={teamId > 0}
      size="large"
      title={data ? `团队详情 · ${data.team.name}` : "团队详情"}
      onClose={onClose}
      destroyOnHidden
    >
      {data ? (
        <div style={{ display: "grid", gap: 18 }}>
          <Descriptions
            items={[
              { label: "所属机构", value: data.team.organName || "—" },
              { label: "组长", value: data.team.leaderName || "未设置" },
              { label: "成员数", value: data.team.memberCount },
              { label: "服务人数", value: data.team.patientCount },
              { label: "状态", value: <OnOffTag value={data.team.status} /> },
              { label: "创建时间", value: data.team.createdAt ? fmtTime(data.team.createdAt) : "—" },
            ]}
          />
          <div>
            <div className="muted text-12">团队介绍</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{data.team.intro || "—"}</div>
          </div>

          <div>
            <div className="muted text-12" style={{ marginBottom: 6 }}>
              成员
            </div>
            <Form form={memberForm} layout="inline" style={{ marginBottom: 8, rowGap: 8 }}>
              <Form.Item
                name="practitionerId"
                rules={[{ required: true, message: "请选择医护" }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="选择医护"
                  style={{ width: 220 }}
                  options={practitionerOptions}
                />
              </Form.Item>
              <Form.Item name="isLeader" label="设为组长" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item>
                <Button type="primary" size="small" loading={addingMember} onClick={() => void addMember()}>
                  添加成员
                </Button>
              </Form.Item>
            </Form>
            {data.members.length ? (
              <DataTable rows={data.members} columns={memberColumns} page={1} scroll={{ x: 640 }} />
            ) : (
              <EmptyState text="还没有成员：从上方选一位医护加入团队。" />
            )}
          </div>

          <div>
            <div
              className="muted text-12"
              style={{ marginBottom: 6, display: "flex", justifyContent: "space-between" }}
            >
              <span>公告</span>
              <Button size="small" onClick={() => setNoticeEditing("new")}>
                发布公告
              </Button>
            </div>
            {data.notices.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {data.notices.map((notice) => (
                  <div
                    key={notice.id}
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{notice.title || "未命名公告"}</strong>
                      <Space size={4}>
                        <Button size="small" type="text" onClick={() => setNoticeEditing(notice)}>
                          编辑
                        </Button>
                        <Popconfirm
                          title="删除后组内成员与顾客都看不到这条公告。"
                          onConfirm={() => void removeNotice(notice.id)}
                        >
                          <Button size="small" type="text" danger loading={busy}>
                            删除
                          </Button>
                        </Popconfirm>
                      </Space>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{notice.content || "—"}</div>
                    <div className="muted text-12" style={{ marginTop: 4 }}>
                      {notice.authorName || "店主"} · {notice.createdAt ? fmtTime(notice.createdAt) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="还没有公告：发布一条告知组内成员排班与服务安排。" />
            )}
          </div>

          <div>
            <div className="muted text-12" style={{ marginBottom: 6 }}>
              本组加入申请
            </div>
            {data.joins.length ? (
              <DataTable rows={data.joins} columns={joinColumns} page={1} scroll={{ x: 720 }} />
            ) : (
              <EmptyState text="还没有医护申请加入本团队。" />
            )}
          </div>
        </div>
      ) : null}

      <NoticeModal
        shopId={shopId}
        teamId={teamId}
        editing={noticeEditing}
        onClose={() => setNoticeEditing(null)}
        onDone={() => void refresh()}
      />

      <JoinAuditModal
        shopId={shopId}
        join={joining}
        onClose={() => setJoining(null)}
        onDone={() => void refresh()}
      />
    </Drawer>
  );
}

function NoticeModal({
  shopId,
  teamId,
  editing,
  onClose,
  onDone,
}: {
  shopId: number;
  teamId: number;
  editing: TeamDetailData["notices"][number] | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ title: string; content: string }>();
  const [saving, setSaving] = useState(false);
  const open = editing !== null;
  const row = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ title: row?.title ?? "", content: row?.content ?? "" });
  }, [open, row, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.teamNoticeSave({
        body: {
          shopId,
          id: row?.id ?? 0,
          teamId,
          title: String(values.title || "").trim(),
          content: String(values.content || "").trim(),
        },
      });
      message.success(row ? "公告已更新" : "公告已发布");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={row ? "编辑公告" : "发布公告"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="标题" rules={[{ required: true, message: "请填写公告标题" }]}>
          <Input maxLength={80} />
        </Form.Item>
        <Form.Item
          name="content"
          label="内容"
          rules={[{ required: true, message: "请填写公告内容" }]}
        >
          <Input.TextArea rows={4} maxLength={4000} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function JoinAuditModal({
  shopId,
  join,
  onClose,
  onDone,
}: {
  shopId: number;
  join: HealthTeamJoinRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ approved: boolean; reason: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!join) return;
    form.setFieldsValue({ approved: true, reason: "" });
  }, [join, form]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!join) return;
    setSaving(true);
    try {
      await healthApi.teamJoinAudit({
        body: {
          shopId,
          id: join.id,
          approved: Boolean(values.approved),
          reason: values.approved ? "" : String(values.reason || ""),
        },
      });
      message.success(values.approved ? "已同意加入团队" : "已驳回加入申请");
      onClose();
      onDone();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(join)}
      title={join ? `审核加入申请 · ${join.name}` : "审核加入申请"}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="提交审核"
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form form={form} layout="vertical">
        <div className="muted text-12" style={{ marginBottom: 12 }}>
          申请团队：{join?.teamName || "—"}；留言：{join?.message || "无"}
        </div>
        <Form.Item name="approved" label="审核结果" initialValue={true}>
          <Select
            options={[
              { value: true, label: "同意加入" },
              { value: false, label: "驳回（需写明原因）" },
            ]}
          />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(prev, next) => prev.approved !== next.approved}>
          {({ getFieldValue }) => (
            <Form.Item
              name="reason"
              label="驳回原因"
              rules={
                getFieldValue("approved") === false
                  ? [{ required: true, message: "驳回必须写明原因" }]
                  : []
              }
            >
              <Input.TextArea rows={3} maxLength={200} showCount />
            </Form.Item>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
}

function JoinLedger({ shopId, meta }: { shopId: number; meta: HealthMeta | null }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<HealthTeamJoinRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [auditing, setAuditing] = useState<HealthTeamJoinRow | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const teamPage = await healthApi.teams({
        query: { shopId, page: 1, pageSize: OPTION_PAGE_SIZE, organId: 0 },
      });
      const teams = (teamPage?.list ?? []).slice(0, JOIN_SCAN_LIMIT);
      const details = await Promise.all(
        teams.map((team) => healthApi.teamDetail({ query: { shopId, id: team.id } })),
      );
      const joins = details
        .flatMap((item) => item?.joins ?? [])
        .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
      setRows(joins);
      setTruncated((teamPage?.total ?? 0) > teams.length);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, [shopId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<HealthTeamJoinRow> = [
    { title: "团队", dataIndex: "teamName", width: 180, render: (value: string) => <strong>{value}</strong> },
    { title: "申请人", dataIndex: "name", width: 110 },
    { title: "留言", dataIndex: "message", render: (value: string) => value || "—" },
    {
      title: "审核状态",
      dataIndex: "auditStatus",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    { title: "审核意见", dataIndex: "auditReason", width: 180, render: (value: string) => value || "—" },
    {
      title: "提交时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => (value ? fmtTime(value) : "—"),
    },
    {
      title: "操作",
      width: 90,
      render: (_: unknown, row) => (
        <Button size="small" type="text" onClick={() => setAuditing(row)}>
          审核
        </Button>
      ),
    },
  ];

  const view = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Panel
      title="加入申请"
      titleExtra={<span className="muted text-12">医护在小程序端申请加入团队的台账，审核通过后自动入组</span>}
      extra={
        <Button size="small" loading={loading} onClick={() => void load()}>
          刷新
        </Button>
      }
    >
      {truncated ? (
        <Notice variant="info">
          团队较多，这里只汇总了前 {JOIN_SCAN_LIMIT} 个团队的加入申请；其余请到对应团队详情里处理。
        </Notice>
      ) : null}
      {rows.length || loading ? (
        <DataTable
          rows={view}
          columns={columns}
          total={rows.length}
          page={page}
          pageSize={PAGE_SIZE}
          loading={loading}
          onPage={(next) => setPage(next)}
          scroll={{ x: 1000 }}
        />
      ) : (
        <EmptyState text="还没有加入申请：医护在小程序端申请加入团队后会出现在这里。" />
      )}

      <JoinAuditModal
        shopId={shopId}
        join={auditing}
        onClose={() => setAuditing(null)}
        onDone={() => void load()}
      />
    </Panel>
  );
}
