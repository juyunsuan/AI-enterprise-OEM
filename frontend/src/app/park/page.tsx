"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  ConfigProvider,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type {
  ParkAnnouncement,
  ParkBuilding,
  ParkCustomer,
  ParkOverview,
  ParkReservation,
  ParkSite,
  ParkStaff,
  ParkTenant,
  ParkUnit,
  ParkWorkOrder,
} from "@enterprise/contracts";
import {
  PARK_ANNOUNCEMENT_CATEGORIES,
  PARK_ANNOUNCEMENT_CATEGORY_LABELS,
  PARK_CUSTOMER_ROLE_LABELS,
  PARK_CUSTOMER_ROLES,
  PARK_STAFF_ROLES,
  PARK_TENANT_STATUSES,
  PARK_UNIT_STATUSES,
} from "@enterprise/contracts";
import { parkApi } from "@/api/park";
import { Notice, PageHero, Panel, StatCard } from "@/components/ui/panel";
import { ResourcesPanel } from "./_components/resources";
import { ActivitiesPanel } from "./_components/activities";
import { OrdersPanel } from "./_components/orders";
import { LeasesPanel } from "./_components/leases";
import { FlowsPanel } from "./_components/flows";
import { ParkOpsPanel } from "./_components/ops";
import { downloadCsv } from "./_components/export";

type SiteForm = {
  name: string;
  phone?: string;
  addressLine?: string;
  notice?: string;
  deskSiteKey?: string;
};
type BuildingForm = { name: string; floors: number; addressLine?: string };
type UnitForm = {
  buildingId: number;
  roomNo: string;
  floor: number;
  area: number;
  usage: string;
  status: "VACANT" | "OCCUPIED" | "DISABLED";
};
type TenantForm = {
  name: string;
  creditCode?: string;
  industry?: string;
  contactName?: string;
  contactPhone?: string;
  unitIds?: number[];
  status: "ACTIVE" | "LEFT" | "DISABLED";
  note?: string;
};
type StaffForm = {
  name: string;
  phone: string;
  staffCode: string;
  role: "OWNER" | "APPROVER" | "CLERK" | "INSPECTOR" | "GUARD";
  department?: string;
};
type AnnouncementForm = {
  category: "NOTICE" | "POLICY" | "PARTY" | "ACTIVITY";
  title: string;
  summary?: string;
  content?: string;
  pinned?: boolean;
  status: "DRAFT" | "PUBLISHED" | "OFFLINE";
};
type ReservationAction = "approve" | "reject" | "cancel" | "checkin" | "complete";
type WorkOrderAction = "accept" | "process" | "done" | "close" | "cancel";
type WechatForm = {
  appId: string;
  appSecret?: string;
  mchId?: string;
  payApiV3Key?: string;
  payCertSerial?: string;
  payPrivateKey?: string;
  payEnabled?: boolean;
};

const TABS = [
  { key: "overview", label: "概览" },
  { key: "space", label: "空间" },
  { key: "tenants", label: "租户" },
  { key: "leases", label: "租约/账单" },
  { key: "staff", label: "员工" },
  { key: "visitors", label: "访客/预约" },
  { key: "workorders", label: "工单" },
  { key: "announcements", label: "公告" },
  { key: "activities", label: "活动" },
  { key: "orders", label: "订单" },
  { key: "ops", label: "运营" },
  { key: "settings", label: "设置" },
];

const TAB_DESC: Record<string, string> = {
  overview: "园区运营概览：待审批预约、待处理工单、今日核验与最近动态。",
  space: "楼宇与房间：房间是报修定位、租户绑定与访客到访的最小空间单元。",
  tenants: "租户企业与房间绑定；企业加入码用于员工在小程序内自助归属企业。",
  leases: "园区租约与周期账单：按月/季/年出账，生成后可同步 ERP 应收；租户在小程序查看自己的账单。",
  staff: "园区员工：手机号 + 工号绑定员工端，角色决定审批、门岗核验与巡检权限。",
  visitors: "访客与场地预约：提交后进入园区审批，通过后生成一次性通行码，门岗核验后失效。",
  workorders: "报修/投诉/保洁工单：派单、处理、完成与评价；付费能力后续接入统一支付。",
  announcements: "园区公告、政策、党建与活动内容；发布后小程序首页和列表即时可见。",
  activities: "园区活动发布与报名名单：容量、报名截止、发布/结束；报名人始终是园区外部用户。",
  orders: "园区订单：场地预约费用与后续服务费统一台账；当前支持线下收款、取消与退款标记。",
  ops: "园区运营：发票台账、巡检计划与记录、停车许可、资产台账、能耗抄表。",
  settings: "园区资料、AI 客服站点 Key，以及园区小程序的 AppID/支付凭据。",
};

const tag = (label: string, color?: string) => <Tag color={color}>{label}</Tag>;

export default function ParkPage() {
  return (
    <Suspense fallback={<Panel title="园区管理">正在读取园区信息…</Panel>}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <ParkInner />
      </ConfigProvider>
    </Suspense>
  );
}

function ParkInner() {
  const { message } = App.useApp();
  const [sites, setSites] = useState<ParkSite[]>([]);
  const [siteId, setSiteId] = useState(0);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState<ParkOverview | null>(null);
  const [buildings, setBuildings] = useState<ParkBuilding[]>([]);
  const [units, setUnits] = useState<ParkUnit[]>([]);
  const [tenants, setTenants] = useState<ParkTenant[]>([]);
  const [staffs, setStaffs] = useState<ParkStaff[]>([]);
  const [customers, setCustomers] = useState<ParkCustomer[]>([]);
  const [announcements, setAnnouncements] = useState<ParkAnnouncement[]>([]);
  const [reservations, setReservations] = useState<ParkReservation[]>([]);
  const [workOrders, setWorkOrders] = useState<ParkWorkOrder[]>([]);
  const [wechat, setWechat] = useState<Awaited<ReturnType<typeof parkApi.wechat>> | null>(null);

  const [siteOpen, setSiteOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<ParkSite | null>(null);
  const [buildingOpen, setBuildingOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [doneOrder, setDoneOrder] = useState<ParkWorkOrder | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [siteForm] = Form.useForm<SiteForm>();
  const [buildingForm] = Form.useForm<BuildingForm>();
  const [unitForm] = Form.useForm<UnitForm>();
  const [tenantForm] = Form.useForm<TenantForm>();
  const [staffForm] = Form.useForm<StaffForm>();
  const [announcementForm] = Form.useForm<AnnouncementForm>();
  const [doneForm] = Form.useForm<{ result: string; feeAmount: number }>();
  const [wechatForm] = Form.useForm<WechatForm>();

  const site = useMemo(
    () => sites.find((row) => row.id === siteId) || null,
    [siteId, sites],
  );

  const loadSites = useCallback(async () => {
    try {
      const data = await parkApi.meta();
      if (!data) {
        message.error("园区信息为空");
        return;
      }
      setSites(data.sites);
      setSiteId((current) => {
        if (current === 0) return 0;
        return data.sites.some((row) => row.id === current)
          ? current
          : data.sites[0]?.id || 0;
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "园区读取失败");
    }
  }, [message]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const loadTab = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "overview") {
        setOverview(
          (await parkApi.overview({
            query: siteId ? { siteId } : {},
          })) ?? null,
        );
        return;
      }
      if (!siteId) return;
      if (tab === "space") {
        const [nextBuildings, nextUnits] = await Promise.all([
          parkApi.buildings({ query: { siteId } }),
          parkApi.units({ query: { siteId, buildingId: 0, status: "", keyword: "" } }),
        ]);
        setBuildings(nextBuildings ?? []);
        setUnits(nextUnits ?? []);
      } else if (tab === "tenants") {
        const [nextTenants, nextUnits] = await Promise.all([
          parkApi.tenants({ query: { siteId, status: "", keyword: "" } }),
          parkApi.units({ query: { siteId, buildingId: 0, status: "", keyword: "" } }),
        ]);
        setTenants(nextTenants ?? []);
        setUnits(nextUnits ?? []);
      } else if (tab === "staff") {
        setStaffs((await parkApi.staffs({ query: { siteId, status: "", role: "", keyword: "" } })) ?? []);
      } else if (tab === "visitors") {
        const [reservationPage, customerPage] = await Promise.all([
          parkApi.reservations({
            query: { siteId, kind: "", status: "", keyword: "", page: 1, pageSize: 100 },
          }),
          parkApi.customers({ query: { siteId, tenantId: 0, keyword: "", page: 1, pageSize: 100 } }),
        ]);
        setReservations(reservationPage?.list ?? []);
        setCustomers(customerPage?.list ?? []);
      } else if (tab === "workorders") {
        const page = await parkApi.workOrders({
          query: { siteId, category: "", status: "", keyword: "", page: 1, pageSize: 100 },
        });
        setWorkOrders(page?.list ?? []);
        setStaffs((await parkApi.staffs({ query: { siteId, status: "", role: "", keyword: "" } })) ?? []);
      } else if (tab === "announcements") {
        setAnnouncements(
          (await parkApi.announcements({ query: { siteId, category: "", status: "", keyword: "" } })) ?? [],
        );
      } else if (tab === "settings") {
        setWechat(await parkApi.wechat({ params: { id: String(siteId) } }));
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "数据读取失败");
    } finally {
      setLoading(false);
    }
  }, [message, siteId, tab]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  const openSite = (row?: ParkSite) => {
    setEditingSite(row || null);
    siteForm.setFieldsValue({
      name: row?.name || "",
      phone: row?.phone || "",
      addressLine: row?.addressLine || "",
      notice: row?.notice || "",
      deskSiteKey: row?.deskSiteKey || "",
    });
    setSiteOpen(true);
  };

  const saveSite = async () => {
    const values = await siteForm.validateFields();
    setBusy(true);
    try {
      await parkApi.siteSave({
        body: {
          id: editingSite?.id || 0,
          name: values.name,
          phone: values.phone || "",
          addressLine: values.addressLine || "",
          notice: values.notice || "",
          deskSiteKey: values.deskSiteKey || "",
        },
      });
      message.success(editingSite ? "园区已更新" : "园区已创建");
      setSiteOpen(false);
      await loadSites();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveBuilding = async () => {
    const values = await buildingForm.validateFields();
    setBusy(true);
    try {
      await parkApi.buildingSave({
        body: { siteId, id: 0, ...values },
      });
      message.success("楼宇已保存");
      setBuildingOpen(false);
      buildingForm.resetFields();
      await loadTab();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveUnit = async () => {
    const values = await unitForm.validateFields();
    setBusy(true);
    try {
      await parkApi.unitSave({
        body: { siteId, id: 0, ...values },
      });
      message.success("房间已保存");
      setUnitOpen(false);
      unitForm.resetFields();
      await loadTab();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveTenant = async () => {
    const values = await tenantForm.validateFields();
    setBusy(true);
    try {
      await parkApi.tenantSave({
        body: { siteId, id: 0, ...values },
      });
      message.success("租户已保存");
      setTenantOpen(false);
      tenantForm.resetFields();
      await loadTab();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveStaff = async () => {
    const values = await staffForm.validateFields();
    setBusy(true);
    try {
      await parkApi.staffSave({
        body: { siteId, id: 0, ...values },
      });
      message.success("员工已保存");
      setStaffOpen(false);
      staffForm.resetFields();
      await loadTab();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveAnnouncement = async () => {
    const values = await announcementForm.validateFields();
    setBusy(true);
    try {
      await parkApi.announcementSave({
        body: {
          siteId,
          id: 0,
          category: values.category,
          title: values.title,
          summary: values.summary || "",
          content: values.content || "",
          cover: "",
          pinned: Boolean(values.pinned),
          status: values.status,
        },
      });
      message.success("公告已保存");
      setAnnouncementOpen(false);
      announcementForm.resetFields();
      await loadTab();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveWechat = async () => {
    const values = await wechatForm.validateFields();
    setBusy(true);
    try {
      const result = await parkApi.saveWechat({
        params: { id: String(siteId) },
        body: {
          appId: values.appId,
          ...(values.appSecret ? { appSecret: values.appSecret } : {}),
          mchId: values.mchId || "",
          ...(values.payApiV3Key ? { payApiV3Key: values.payApiV3Key } : {}),
          payCertSerial: values.payCertSerial || "",
          ...(values.payPrivateKey ? { payPrivateKey: values.payPrivateKey } : {}),
          payEnabled: Boolean(values.payEnabled),
          templates: {},
        },
      });
      setWechat(result);
      message.success("小程序凭据已保存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const actReservation = async (id: number, action: ReservationAction) => {
    try {
      await parkApi.reservationAction({ body: { id, action, comment: "" } });
      message.success("已处理");
      await loadTab();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const openDone = (row: ParkWorkOrder) => {
    setDoneOrder(row);
    doneForm.setFieldsValue({ result: "", feeAmount: 0 });
    setDoneOpen(true);
  };

  const submitDone = async () => {
    if (!doneOrder) return;
    const values = await doneForm.validateFields();
    try {
      await parkApi.workOrderAction({
        body: {
          id: doneOrder.id,
          action: "done",
          note: "",
          result: values.result || "",
          images: [],
          feeAmount: values.feeAmount || 0,
        },
      });
      message.success(values.feeAmount > 0 ? "已完成，已生成工单费用订单" : "已完成");
      setDoneOpen(false);
      setDoneOrder(null);
      await loadTab();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const actWorkOrder = async (id: number, action: WorkOrderAction) => {
    try {
      await parkApi.workOrderAction({ body: { id, action, note: "", result: "", images: [] } });
      message.success("已处理");
      await loadTab();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const assignWorkOrder = async (id: number, staffId: number) => {
    try {
      await parkApi.workOrderAssign({ body: { id, staffId, note: "" } });
      message.success("已派单");
      await loadTab();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "派单失败");
    }
  };

  const remove = async (kind: string, id: number) => {
    try {
      if (kind === "building") await parkApi.buildingRemove({ body: { id } });
      if (kind === "unit") await parkApi.unitRemove({ body: { id } });
      if (kind === "tenant") await parkApi.tenantRemove({ body: { id } });
      if (kind === "announcement") await parkApi.announcementRemove({ body: { id } });
      message.success("已删除");
      await loadTab();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const siteOptions = [
    { value: 0, label: "全部园区" },
    ...sites.map((row) => ({
      value: row.id,
      label: `${row.name}（${row.parkCode}）`,
    })),
  ];

  const exportReservations = () =>
    downloadCsv(
      `park-reservations-${siteId || "all"}.csv`,
      reservations as unknown as Record<string, unknown>[],
      [
        { key: "kindLabel", label: "类型" },
        { key: "visitorName", label: "访客" },
        { key: "visitorPhone", label: "手机号" },
        { key: "purpose", label: "事由" },
        { key: "startAt", label: "开始" },
        { key: "endAt", label: "结束" },
        { key: "statusLabel", label: "状态" },
      ],
    );

  const exportWorkOrders = () =>
    downloadCsv(
      `park-workorders-${siteId || "all"}.csv`,
      workOrders as unknown as Record<string, unknown>[],
      [
        { key: "orderNo", label: "单号" },
        { key: "categoryLabel", label: "类型" },
        { key: "title", label: "标题" },
        { key: "reporterName", label: "上报人" },
        { key: "assigneeName", label: "处理人" },
        { key: "statusLabel", label: "状态" },
        { key: "createdAt", label: "创建时间" },
      ],
    );

  return (
    <>
      <PageHero
        title="园区管理"
        desc={TAB_DESC[tab]}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        extra={
          <Space>
            <Select
              value={siteId}
              options={siteOptions}
              placeholder="选择园区"
              style={{ minWidth: 200 }}
              onChange={setSiteId}
            />
            <Button onClick={() => openSite()}>新建园区</Button>
            {site ? <Button onClick={() => openSite(site)}>编辑园区</Button> : null}
          </Space>
        }
      />

      {!sites.length && !loading ? (
        <Notice>还没有园区。先新建一个园区，再配置楼宇、房间、租户与员工。</Notice>
      ) : null}
      {tab !== "overview" && !siteId ? (
        <Notice>请先在右上角选择一个具体园区，再查看该页签数据。</Notice>
      ) : null}

      {tab === "overview" && overview ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 12 }}>
            <StatCard label="园区数" value={overview.siteCount} hint={`运营中 ${overview.onlineSiteCount}`} />
            <StatCard label="租户" value={overview.tenantCount} />
            <StatCard label="小程序用户" value={overview.customerCount} />
            <StatCard label="待审批预约" value={overview.pendingReservations} />
            <StatCard label="待处理工单" value={overview.pendingWorkOrders} />
            <StatCard label="今日核验" value={overview.todayCheckins} />
          </div>
          <Panel title="最近预约">
            <Table
              size="small"
              rowKey="id"
              loading={loading}
              pagination={false}
              dataSource={overview.recentReservations}
              columns={[
                { title: "访客", dataIndex: "visitorName" },
                { title: "时间", render: (_, row) => `${row.startAt.slice(5, 16).replace("T", " ")} → ${row.endAt.slice(11, 16)}` },
                { title: "状态", render: (_, row) => tag(row.statusLabel) },
              ]}
            />
          </Panel>
          <Panel title="最近工单">
            <Table
              size="small"
              rowKey="id"
              loading={loading}
              pagination={false}
              dataSource={overview.recentWorkOrders}
              columns={[
                { title: "单号", dataIndex: "orderNo" },
                { title: "标题", dataIndex: "title" },
                { title: "状态", render: (_, row) => tag(row.statusLabel) },
              ]}
            />
          </Panel>
        </>
      ) : null}

      {tab === "space" ? (
        <>
          <Panel
            title="楼宇"
            extra={<Button onClick={() => setBuildingOpen(true)}>新增楼宇</Button>}
          >
            <Table
              size="small"
              rowKey="id"
              loading={loading}
              pagination={false}
              dataSource={buildings}
              columns={[
                { title: "楼宇", dataIndex: "name" },
                { title: "楼层", dataIndex: "floors" },
                { title: "房间数", dataIndex: "unitCount" },
                { title: "地址", dataIndex: "addressLine" },
                {
                  title: "操作",
                  render: (_, row) => (
                    <Button danger size="small" onClick={() => void remove("building", row.id)}>
                      删除
                    </Button>
                  ),
                },
              ]}
            />
          </Panel>
          <Panel
            title="房间"
            extra={<Button onClick={() => setUnitOpen(true)} disabled={!buildings.length}>新增房间</Button>}
          >
            <Table
              size="small"
              rowKey="id"
              loading={loading}
              pagination={false}
              dataSource={units}
              columns={[
                { title: "楼宇", dataIndex: "buildingName" },
                { title: "房号", dataIndex: "roomNo" },
                { title: "楼层", dataIndex: "floor" },
                { title: "面积", dataIndex: "area" },
                { title: "状态", render: (_, row) => tag(row.statusLabel) },
                { title: "租户", dataIndex: "tenantName" },
                {
                  title: "操作",
                  render: (_, row) => (
                    <Button danger size="small" onClick={() => void remove("unit", row.id)}>
                      删除
                    </Button>
                  ),
                },
              ]}
            />
          </Panel>
          <Panel title="场地 / 会议室">
            <ResourcesPanel siteId={siteId} buildings={buildings} />
          </Panel>
        </>
      ) : null}

      {tab === "tenants" ? (
        <Panel title="租户企业" extra={<Button onClick={() => setTenantOpen(true)}>新增租户</Button>}>
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            pagination={false}
            dataSource={tenants}
            columns={[
              { title: "企业", dataIndex: "name" },
              { title: "行业", dataIndex: "industry" },
              { title: "联系人", render: (_, row) => `${row.contactName} ${row.contactPhone}`.trim() },
              { title: "房间", render: (_, row) => row.unitNames.join("、") },
              { title: "加入码", dataIndex: "joinCode" },
              { title: "员工", dataIndex: "memberCount" },
              { title: "状态", render: (_, row) => tag(row.statusLabel) },
              {
                title: "操作",
                render: (_, row) => (
                  <Button danger size="small" onClick={() => void remove("tenant", row.id)}>
                    删除
                  </Button>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "leases" ? (
        <Panel title="租约与账单">
          <LeasesPanel siteId={siteId} />
        </Panel>
      ) : null}

      {tab === "staff" ? (
        <Panel title="园区员工" extra={<Button onClick={() => setStaffOpen(true)}>新增员工</Button>}>
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            pagination={false}
            dataSource={staffs}
            columns={[
              { title: "姓名", dataIndex: "name" },
              { title: "手机号", dataIndex: "phone" },
              { title: "工号", dataIndex: "staffCode" },
              { title: "角色", dataIndex: "roleLabel" },
              { title: "部门", dataIndex: "department" },
              { title: "状态", render: (_, row) => tag(row.statusLabel) },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "visitors" ? (
        <>
          <Panel
            title="访客/场地预约"
            extra={<Button onClick={exportReservations}>导出 CSV</Button>}
          >
            <Table
              size="small"
              rowKey="id"
              loading={loading}
              pagination={false}
              dataSource={reservations}
              columns={[
                { title: "类型", dataIndex: "kindLabel" },
                { title: "访客", render: (_, row) => `${row.visitorName} ${row.visitorPhone}`.trim() },
                { title: "事由", dataIndex: "purpose" },
                { title: "时间", render: (_, row) => `${row.startAt.slice(5, 16).replace("T", " ")} → ${row.endAt.slice(11, 16)}` },
                { title: "状态", render: (_, row) => tag(row.statusLabel) },
                {
                  title: "操作",
                  render: (_, row) => (
                    <Space>
                      {row.status === "PENDING" ? (
                        <>
                          <Button size="small" type="primary" onClick={() => void actReservation(row.id, "approve")}>通过</Button>
                          <Button size="small" danger onClick={() => void actReservation(row.id, "reject")}>驳回</Button>
                        </>
                      ) : null}
                      {row.status === "APPROVED" ? (
                        <Button size="small" onClick={() => void actReservation(row.id, "checkin")}>核验</Button>
                      ) : null}
                      {row.status === "CHECKED_IN" ? (
                        <Button size="small" onClick={() => void actReservation(row.id, "complete")}>完成</Button>
                      ) : null}
                    </Space>
                  ),
                },
              ]}
            />
          </Panel>
          <Panel title="小程序用户">
            <Table
              size="small"
              rowKey="id"
              loading={loading}
              pagination={false}
              dataSource={customers}
              columns={[
                { title: "昵称", dataIndex: "nickname" },
                { title: "手机号", dataIndex: "phone" },
                { title: "企业", dataIndex: "tenantName" },
                {
                  title: "身份",
                  render: (_, row) => (
                    <Select
                      size="small"
                      value={row.memberRole}
                      style={{ width: 120 }}
                      options={PARK_CUSTOMER_ROLES.map((value) => ({
                        value,
                        label: PARK_CUSTOMER_ROLE_LABELS[value],
                      }))}
                      onChange={(value) =>
                        void parkApi
                          .customerRole({
                            body: { id: row.id, memberRole: value },
                          })
                          .then(() => loadTab())
                          .catch((error) =>
                            message.error(
                              error instanceof Error ? error.message : "设置失败",
                            ),
                          )
                      }
                    />
                  ),
                },
                { title: "最近登录", dataIndex: "lastLoginAt" },
              ]}
            />
          </Panel>
        </>
      ) : null}

      {tab === "workorders" ? (
        <Panel
          title="园区工单"
          extra={<Button onClick={exportWorkOrders}>导出 CSV</Button>}
        >
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            pagination={false}
            dataSource={workOrders}
            columns={[
              { title: "单号", dataIndex: "orderNo" },
              { title: "类型", dataIndex: "categoryLabel" },
              { title: "标题", dataIndex: "title" },
              { title: "上报人", dataIndex: "reporterName" },
              { title: "处理人", dataIndex: "assigneeName" },
              { title: "状态", render: (_, row) => tag(row.statusLabel) },
              {
                title: "操作",
                render: (_, row) => (
                  <Space>
                    {row.status === "PENDING" || row.status === "ASSIGNED" ? (
                      <Select
                        size="small"
                        placeholder="派单"
                        style={{ width: 120 }}
                        options={staffs.map((item) => ({ value: item.id, label: item.name }))}
                        onChange={(value) => void assignWorkOrder(row.id, Number(value))}
                      />
                    ) : null}
                    {row.status === "ASSIGNED" ? (
                      <Button size="small" onClick={() => void actWorkOrder(row.id, "accept")}>接单</Button>
                    ) : null}
                    {row.status === "PROCESSING" ? (
                      <Button size="small" type="primary" onClick={() => openDone(row)}>完成</Button>
                    ) : null}
                    {row.status === "DONE" ? (
                      <Button size="small" onClick={() => void actWorkOrder(row.id, "close")}>关闭</Button>
                    ) : null}
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "announcements" ? (
        <Panel title="公告与内容" extra={<Button onClick={() => setAnnouncementOpen(true)}>新增公告</Button>}>
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            pagination={false}
            dataSource={announcements}
            columns={[
              { title: "分类", dataIndex: "categoryLabel" },
              { title: "标题", dataIndex: "title" },
              { title: "置顶", render: (_, row) => (row.pinned ? tag("置顶", "blue") : "") },
              { title: "状态", render: (_, row) => tag(row.statusLabel) },
              { title: "发布时间", dataIndex: "publishedAt" },
              {
                title: "操作",
                render: (_, row) => (
                  <Space>
                    <Button
                      size="small"
                      onClick={() => void parkApi.announcementStatus({ body: { id: row.id, status: row.status === "PUBLISHED" ? "OFFLINE" : "PUBLISHED" } }).then(loadTab)}
                    >
                      {row.status === "PUBLISHED" ? "下线" : "发布"}
                    </Button>
                    <Button danger size="small" onClick={() => void remove("announcement", row.id)}>删除</Button>
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "activities" ? (
        <Panel title="园区活动">
          <ActivitiesPanel siteId={siteId} />
        </Panel>
      ) : null}

      {tab === "orders" ? (
        <Panel title="园区订单">
          <OrdersPanel siteId={siteId} />
        </Panel>
      ) : null}

      {tab === "ops" ? (
        <Panel title="园区运营">
          <ParkOpsPanel siteId={siteId} />
        </Panel>
      ) : null}

      {tab === "settings" && site ? (
        <>
          <Panel title="园区资料">
            <Form layout="vertical" form={siteForm} initialValues={{ name: site.name, phone: site.phone, addressLine: site.addressLine, notice: site.notice, deskSiteKey: site.deskSiteKey }}>
              <Form.Item label="园区名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item label="电话" name="phone"><Input /></Form.Item>
              <Form.Item label="地址" name="addressLine"><Input /></Form.Item>
              <Form.Item label="首页通知" name="notice"><Input.TextArea rows={2} /></Form.Item>
              <Form.Item label="AI 客服站点 Key（service-desk siteKey）" name="deskSiteKey"><Input /></Form.Item>
              <Button type="primary" loading={busy} onClick={() => void (async () => {
                const values = await siteForm.validateFields();
                await parkApi.siteSave({ body: { id: site.id, name: values.name, phone: values.phone || "", addressLine: values.addressLine || "", notice: values.notice || "", deskSiteKey: values.deskSiteKey || "" } });
                message.success("园区资料已更新");
                await loadSites();
              })()}>
                保存园区资料
              </Button>
            </Form>
          </Panel>
          <Panel title="审批流">
            <FlowsPanel siteId={siteId} />
          </Panel>
          <Panel title="园区小程序">
            {wechat ? (
              <Notice>
                当前状态：{wechat.configured ? "已配置 AppID" : "未配置 AppID"}；支付：
                {wechat.payEnabled ? "已开启" : "未开启"}。园区小程序场景为 PARK，顾客与员工数据独立于其它小程序。
              </Notice>
            ) : null}
            <Notice>
              园区码 <b>{site.parkCode}</b>：下载源码包后在 <b>config.js</b> 填写
              apiBase 与该园区码（parkCode），并在 project.config.json 换成你自己的小程序 AppID。
              平台只输出统一模板源码，不代编译、不代传微信。
            </Notice>
            <Button href="/site-builder/mini-dev-guide" style={{ marginTop: 12 }}>
              小程序开发与发布说明
            </Button>
            <Form layout="vertical" form={wechatForm} style={{ marginTop: 12 }}>
              <Form.Item label="小程序 AppID" name="appId"><Input placeholder="wx..." /></Form.Item>
              <Form.Item label="AppSecret（留空保留原值）" name="appSecret"><Input.Password /></Form.Item>
              <Form.Item label="微信支付商户号" name="mchId"><Input /></Form.Item>
              <Form.Item label="支付 APIv3 Key（留空保留原值）" name="payApiV3Key"><Input.Password /></Form.Item>
              <Form.Item label="支付证书序列号" name="payCertSerial"><Input /></Form.Item>
              <Form.Item label="支付私钥（留空保留原值）" name="payPrivateKey"><Input.TextArea rows={3} /></Form.Item>
              <Space>
                <Button type="primary" loading={busy} onClick={() => void saveWechat()}>保存小程序凭据</Button>
                <Button onClick={() => void parkApi.testWechat({ params: { id: String(siteId) } }).then(() => message.success("凭据可用")).catch((error) => message.error(error.message || "自检失败"))}>
                  自检
                </Button>
              </Space>
            </Form>
          </Panel>
        </>
      ) : null}

      <Modal title={editingSite ? "编辑园区" : "新建园区"} open={siteOpen} onCancel={() => setSiteOpen(false)} onOk={() => void saveSite()} confirmLoading={busy} destroyOnHidden>
        <Form layout="vertical" form={siteForm}>
          <Form.Item label="园区名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="电话" name="phone"><Input /></Form.Item>
          <Form.Item label="地址" name="addressLine"><Input /></Form.Item>
          <Form.Item label="首页通知" name="notice"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item label="AI 客服站点 Key" name="deskSiteKey"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title="新增楼宇" open={buildingOpen} onCancel={() => setBuildingOpen(false)} onOk={() => void saveBuilding()} confirmLoading={busy} destroyOnHidden>
        <Form layout="vertical" form={buildingForm} initialValues={{ floors: 1 }}>
          <Form.Item label="楼宇名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="楼层数" name="floors"><InputNumber min={1} max={200} style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="地址" name="addressLine"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title="新增房间" open={unitOpen} onCancel={() => setUnitOpen(false)} onOk={() => void saveUnit()} confirmLoading={busy} destroyOnHidden>
        <Form layout="vertical" form={unitForm} initialValues={{ floor: 1, area: 0, usage: "OFFICE", status: "VACANT" }}>
          <Form.Item label="楼宇" name="buildingId" rules={[{ required: true }]}>
            <Select options={buildings.map((row) => ({ value: row.id, label: row.name }))} />
          </Form.Item>
          <Form.Item label="房间号" name="roomNo" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="楼层" name="floor"><InputNumber style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="面积（㎡）" name="area"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="状态" name="status">
            <Select options={PARK_UNIT_STATUSES.map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="新增租户" open={tenantOpen} onCancel={() => setTenantOpen(false)} onOk={() => void saveTenant()} confirmLoading={busy} destroyOnHidden>
        <Form layout="vertical" form={tenantForm} initialValues={{ status: "ACTIVE" }}>
          <Form.Item label="企业名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="统一社会信用代码" name="creditCode"><Input /></Form.Item>
          <Form.Item label="行业" name="industry"><Input /></Form.Item>
          <Form.Item label="联系人" name="contactName"><Input /></Form.Item>
          <Form.Item label="联系电话" name="contactPhone"><Input /></Form.Item>
          <Form.Item label="绑定房间" name="unitIds">
            <Select mode="multiple" options={units.map((row) => ({ value: row.id, label: `${row.buildingName} ${row.roomNo}` }))} />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select options={PARK_TENANT_STATUSES.map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="新增员工" open={staffOpen} onCancel={() => setStaffOpen(false)} onOk={() => void saveStaff()} confirmLoading={busy} destroyOnHidden>
        <Form layout="vertical" form={staffForm} initialValues={{ role: "CLERK" }}>
          <Form.Item label="姓名" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="手机号" name="phone" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="工号" name="staffCode" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="角色" name="role">
            <Select options={PARK_STAFF_ROLES.map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item label="部门" name="department"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title="完成工单"
        open={doneOpen}
        onCancel={() => setDoneOpen(false)}
        onOk={() => void submitDone()}
        confirmLoading={busy}
        destroyOnHidden
      >
        <Form layout="vertical" form={doneForm} initialValues={{ result: "", feeAmount: 0 }}>
          <Form.Item label="处理结果" name="result">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item label="工单费用（元，0=免费）" name="feeAmount">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="新增公告" open={announcementOpen} onCancel={() => setAnnouncementOpen(false)} onOk={() => void saveAnnouncement()} confirmLoading={busy} destroyOnHidden width={720}>
        <Form layout="vertical" form={announcementForm} initialValues={{ category: "NOTICE", status: "DRAFT", pinned: false }}>
          <Form.Item label="分类" name="category">
            <Select options={PARK_ANNOUNCEMENT_CATEGORIES.map((value) => ({ value, label: PARK_ANNOUNCEMENT_CATEGORY_LABELS[value] }))} />
          </Form.Item>
          <Form.Item label="标题" name="title" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="摘要" name="summary"><Input /></Form.Item>
          <Form.Item label="正文（支持 HTML）" name="content"><Input.TextArea rows={8} /></Form.Item>
          <Form.Item label="状态" name="status">
            <Select options={[{ value: "DRAFT", label: "草稿" }, { value: "PUBLISHED", label: "发布" }]} />
          </Form.Item>
          <Form.Item label="置顶" name="pinned"><Select options={[{ value: false, label: "否" }, { value: true, label: "是" }]} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
