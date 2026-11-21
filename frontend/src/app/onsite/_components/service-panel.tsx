"use client";
// 服务列表：目录的主实体。筛选 + 上/下架 + 复制 + 删除 + 技师价差，字段编辑走右侧抽屉。
import {
  CopyOutlined,
  EditOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
} from "antd";
import type { TableProps } from "antd";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ONSITE_SERVICE_STATUSES,
  type OnsiteServiceRow,
  type OnsiteStaffPriceRow,
} from "@enterprise/contracts";
import { EmptyState, Panel } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";
import {
  useOnsiteCatalogActions,
  useOnsiteCategories,
  useOnsiteLabels,
  useOnsiteServices,
  useOnsiteStaffPrices,
} from "@/query/onsite";
import { DataTable, FilterBar } from "./list-kit";
import { cents, statusOptions, StatusTag, timeText, withShop } from "./onsite-common";
import { ServiceDrawer } from "./service-drawer";

const PAGE_SIZE = 20;
const COVER = {
  width: 44,
  height: 44,
  borderRadius: 6,
  objectFit: "cover" as const,
  background: "#fafafa",
};

export function ServicePanel({
  shopId,
  onOpenCategory,
}: {
  shopId: number;
  onOpenCategory: () => void;
}) {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const actions = useOnsiteCatalogActions();
  const [status, setStatus] = useState("all");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ open: boolean; id: number }>({
    open: false,
    id: 0,
  });
  const [pricing, setPricing] = useState<{ open: boolean; row: OnsiteServiceRow | null }>({
    open: false,
    row: null,
  });

  const categoriesQuery = useOnsiteCategories({ shopId });
  const categories = useMemo(
    () => categoriesQuery.data?.list ?? [],
    [categoriesQuery.data],
  );
  const labelsQuery = useOnsiteLabels({ shopId }, "FEATURE");
  const featureLabels = useMemo(
    () => labelsQuery.data?.list ?? [],
    [labelsQuery.data],
  );

  const filter = useMemo(
    () => ({ status, keyword: keyword.trim(), categoryId }),
    [status, keyword, categoryId],
  );
  const query = useOnsiteServices({ shopId }, filter, page, PAGE_SIZE);
  const rows = query.data?.list ?? [];
  const categoryName = (ids: number[]) =>
    ids.length
      ? ids.map((id) => categories.find((item) => item.id === id)?.name ?? `#${id}`).join(" / ")
      : "未分类";

  const toggleStatus = async (row: OnsiteServiceRow) => {
    const next = row.status === "ONLINE" ? "OFFLINE" : "ONLINE";
    await actions.setServiceStatus.mutateAsync({
      params: { id: String(shopId) },
      body: { ids: [row.id], status: next },
    });
    message.success(
      next === "ONLINE"
        ? `「${row.title}」已上架，顾客端可以下单了`
        : `「${row.title}」已下架，顾客端不再展示，历史订单不受影响`,
    );
  };

  const copyRow = async (row: OnsiteServiceRow) => {
    await actions.copyService.mutateAsync({
      params: { id: String(shopId) },
      body: { id: row.id },
    });
    message.success("已复制为草稿副本，改完标题再上架，避免同名服务");
  };

  const removeRow = (row: OnsiteServiceRow) => {
    if (row.status === "ONLINE") {
      // 架上服务后端会拦删除，这里把「先下架」这一步直接做成按钮
      modal.confirm({
        title: `「${row.title}」还在架上`,
        content: "删除前必须先下架（历史订单要能回看服务名称与价格）。要现在下架吗？",
        okText: "下架",
        cancelText: "先不删",
        onOk: async () => {
          await actions.setServiceStatus.mutateAsync({
            params: { id: String(shopId) },
            body: { ids: [row.id], status: "OFFLINE" },
          });
          message.success("已下架，再点一次删除即可移除");
        },
      });
      return;
    }
    modal.confirm({
      title: `删除服务「${row.title}」`,
      content: "删除后顾客端彻底看不到该服务，已配置的技师价差与分类引用一并解除，不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.removeService.mutateAsync({
          params: { id: String(shopId) },
          body: { id: row.id },
        });
        message.success("服务已删除");
      },
    });
  };

  const columns: TableProps<OnsiteServiceRow>["columns"] = [
    {
      title: "封面",
      dataIndex: "coverImage",
      width: 72,
      render: (value: string) =>
        value ? (
          <RawImg src={value} alt="" style={COVER} />
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      title: "服务名称",
      dataIndex: "title",
      width: 300,
      render: (_, row) => (
        <div style={{ minWidth: 0 }}>
          <div>{row.title}</div>
          <div className="muted text-12">{row.subtitle || "没有副标题"}</div>
          <Space size={2} wrap>
            {row.highlights.slice(0, 3).map((item) => (
              <Tag key={item}>{item}</Tag>
            ))}
            {row.doorEnabled ? <Tag color="blue">上门</Tag> : null}
            {row.storeEnabled ? <Tag color="cyan">到店</Tag> : null}
          </Space>
        </div>
      ),
    },
    {
      title: "分类",
      dataIndex: "categoryIds",
      width: 160,
      render: (ids: number[]) => categoryName(ids),
    },
    {
      title: "时长",
      dataIndex: "durationMinutes",
      width: 120,
      render: (_, row) => (
        <div>
          <div>{row.durationMinutes} 分钟</div>
          {row.addonEnabled ? (
            <div className="muted text-12">可加钟 {row.addonUnitMinutes} 分钟/次</div>
          ) : (
            <div className="muted text-12">不可加钟</div>
          )}
        </div>
      ),
    },
    {
      title: "起价",
      dataIndex: "priceCents",
      width: 130,
      render: (value: number, row) => (
        <div>
          <div>{cents(value)}</div>
          {row.marketPriceCents > value ? (
            <span className="muted text-12" style={{ textDecoration: "line-through" }}>
              {cents(row.marketPriceCents)}
            </span>
          ) : null}
          {row.staffCount ? (
            <div className="muted text-12">{row.staffCount} 人有差异价</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "销量 / 评分",
      dataIndex: "salesTrue",
      width: 130,
      render: (_, row) => (
        <div>
          <div>{row.salesVirtual + row.salesTrue} 单</div>
          <div className="muted text-12">
            {row.rating.toFixed(1)} 分 · {row.reviewCount} 条
          </div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag kind="service" value={value} />,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 150,
      render: (value: string) => timeText(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 300,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button
            size="small"
            type="link"
            icon={<EditOutlined aria-hidden />}
            onClick={() => setEditing({ open: true, id: row.id })}
          >
            编辑
          </Button>
          <Button
            size="small"
            type="link"
            loading={actions.setServiceStatus.isPending}
            onClick={() => void toggleStatus(row)}
          >
            {row.status === "ONLINE" ? "下架" : "上架"}
          </Button>
          <Button
            size="small"
            type="link"
            onClick={() => setPricing({ open: true, row })}
          >
            技师价差
          </Button>
          <Button
            size="small"
            type="link"
            icon={<CopyOutlined aria-hidden />}
            onClick={() => void copyRow(row)}
          >
            复制
          </Button>
          <Button size="small" type="link" danger onClick={() => removeRow(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const filtered = Boolean(status !== "all" || keyword || categoryId);

  return (
    <Panel
      title="服务"
      titleBadge={query.data ? `${query.data.total}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ open: true, id: 0 })}
        >
          新建服务
        </Button>
      }
    >
      <FilterBar
        action={
          filtered ? (
            <Button
              size="small"
              type="link"
              onClick={() => {
                setStatus("all");
                setKeywordInput("");
                setKeyword("");
                setCategoryId("");
                setPage(1);
              }}
            >
              清除筛选
            </Button>
          ) : null
        }
      >
        <Select
          style={{ width: 130 }}
          value={status}
          onChange={(value: string) => {
            setStatus(value);
            setPage(1);
          }}
          options={statusOptions("service", ONSITE_SERVICE_STATUSES)}
        />
        <Input.Search
          allowClear
          style={{ width: 220 }}
          placeholder="名称或副标题关键字"
          value={keywordInput}
          onChange={(event) => {
            setKeywordInput(event.target.value);
            // 点清除图标时不回车也要立刻回到未筛选态
            if (!event.target.value) setKeyword("");
          }}
          onSearch={(value) => {
            setKeyword(value.trim());
            setPage(1);
          }}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 200 }}
          placeholder="按分类筛选"
          value={categoryId || undefined}
          onChange={(value?: string) => {
            setCategoryId(value ?? "");
            setPage(1);
          }}
          options={categories.map((item) => ({
            value: String(item.id),
            label: `${item.parentId ? "　" : ""}${item.name}（${item.serviceCount}）`,
          }))}
        />
      </FilterBar>
      {!categories.length && !categoriesQuery.isFetching ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            <span>
              还没有分类，新建服务时只能留「未分类」，顾客端分类页会是空的。
              <Button size="small" type="link" onClick={onOpenCategory}>
                去新建分类
              </Button>
            </span>
          }
        />
      ) : null}
      {rows.length || query.isFetching ? (
        <DataTable<OnsiteServiceRow>
          rows={rows}
          columns={columns}
          total={query.data?.total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={query.isFetching}
          onPage={setPage}
          scroll={{ x: 1500 }}
        />
      ) : (
        <EmptyState
          text={
            filtered
              ? "没有符合当前条件的服务，换个关键字或清除筛选试试。"
              : "还没有服务。服务是顾客唯一能下单的东西，先建一个（填名称、时长、起价）再上架。"
          }
          action={
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden />}
              onClick={() => setEditing({ open: true, id: 0 })}
            >
              新建服务
            </Button>
          }
        />
      )}
      <ServiceDrawer
        open={editing.open}
        shopId={shopId}
        serviceId={editing.id}
        categories={categories}
        featureLabels={featureLabels}
        onOpenCategory={onOpenCategory}
        onClose={() => setEditing({ open: false, id: 0 })}
      />
      <StaffPriceModal
        shopId={shopId}
        open={pricing.open}
        row={pricing.row}
        onClose={() => setPricing({ open: false, row: null })}
        onOpenStaff={() => router.push(withShop("/onsite/staff", shopId))}
      />
    </Panel>
  );
}

function StaffPriceModal({
  shopId,
  open,
  row,
  onClose,
  onOpenStaff,
}: {
  shopId: number;
  open: boolean;
  row: OnsiteServiceRow | null;
  onClose: () => void;
  onOpenStaff: () => void;
}) {
  const serviceId = open && row ? row.id : 0;
  const query = useOnsiteStaffPrices({ shopId }, serviceId);
  const rows = query.data?.list ?? [];

  return (
    <Modal
      open={open}
      title={row ? `技师价差 · ${row.title}` : "技师价差"}
      width={760}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      {serviceId && row ? (
        query.isError ? (
          <Alert
            type="error"
            showIcon
            message={`价差读取失败：${query.error.message || "请稍后重试"}`}
          />
        ) : query.isPending ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Spin />
          </div>
        ) : rows.length ? (
          <StaffPriceForm
            key={serviceId}
            shopId={shopId}
            serviceId={serviceId}
            fallbackCents={row.priceCents}
            rows={rows}
            onClose={onClose}
          />
        ) : (
          <EmptyState
            text="本店还没有在岗或休息中的技师，价差无从配置。"
            action={
              <Button type="primary" onClick={onOpenStaff}>
                去技师排期添加技师
              </Button>
            }
          />
        )
      ) : null}
    </Modal>
  );
}

function StaffPriceForm({
  shopId,
  serviceId,
  fallbackCents,
  rows,
  onClose,
}: {
  shopId: number;
  serviceId: number;
  fallbackCents: number;
  rows: OnsiteStaffPriceRow[];
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const save = useOnsiteCatalogActions().saveStaffPrices;
  const [draft, setDraft] = useState(
    () =>
      rows.map((row) => ({
        staffId: row.staffId,
        name: row.name,
        phone: row.phone,
        priced: row.priced,
        priceCents: row.priceCents,
        durationMinutes: row.durationMinutes,
      })),
  );

  const patch = (staffId: number, next: Partial<(typeof draft)[number]>) => {
    setDraft((prev) => prev.map((row) => (row.staffId === staffId ? { ...row, ...next } : row)));
  };

  const submit = async () => {
    // 只提交单独定价的行：整组覆盖，没出现的行等于回落服务价
    const pricedRows = draft
      .filter((row) => row.priced)
      .map((row) => ({
        staffId: row.staffId,
        priceCents: Math.round(row.priceCents),
        durationMinutes: Math.round(row.durationMinutes),
      }));
    await save.mutateAsync({
      params: { id: String(shopId), serviceId: String(serviceId) },
      body: { rows: pricedRows },
    });
    message.success(`已保存 ${pricedRows.length} 位技师的单独价格`);
    onClose();
  };

  const columns: TableProps<(typeof draft)[number]>["columns"] = [
    {
      title: "技师",
      dataIndex: "name",
      width: 180,
      render: (_, row) => (
        <div>
          <div>{row.name}</div>
          <div className="muted text-12">{row.phone}</div>
        </div>
      ),
    },
    {
      title: "单独定价",
      dataIndex: "priced",
      width: 100,
      render: (_, row) => (
        <Switch
          checked={row.priced}
          onChange={(checked) => patch(row.staffId, { priced: checked })}
        />
      ),
    },
    {
      title: "价格（分）",
      dataIndex: "priceCents",
      width: 160,
      render: (_, row) =>
        row.priced ? (
          <InputNumber
            min={0}
            max={99999999}
            precision={0}
            style={{ width: 130 }}
            value={row.priceCents}
            onChange={(value) => patch(row.staffId, { priceCents: Number(value ?? 0) })}
          />
        ) : (
          <span className="muted">按服务价 {cents(fallbackCents)}</span>
        ),
    },
    {
      title: "时长（分钟）",
      dataIndex: "durationMinutes",
      width: 150,
      render: (_, row) =>
        row.priced ? (
          <InputNumber
            min={0}
            max={1440}
            precision={0}
            style={{ width: 120 }}
            value={row.durationMinutes}
            onChange={(value) => patch(row.staffId, { durationMinutes: Number(value ?? 0) })}
          />
        ) : (
          <span className="muted">按服务时长</span>
        ),
    },
  ];

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="没打开「单独定价」的技师，一律按服务价格与标准时长计费；打开后这里的价格优先。金额填整数分（1 元 = 100 分）。"
      />
      <Table<(typeof draft)[number]>
        rowKey="staffId"
        size="small"
        columns={columns}
        dataSource={draft}
        pagination={false}
        scroll={{ x: "max-content" }}
      />
      <Space style={{ marginTop: 16 }} wrap>
        <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
          保存价差
        </Button>
        <Button onClick={onClose}>取消</Button>
        <span className="muted text-12">
          当前 {draft.filter((row) => row.priced).length} 位单独定价，服务原价 {cents(fallbackCents)}
        </span>
      </Space>
    </>
  );
}
