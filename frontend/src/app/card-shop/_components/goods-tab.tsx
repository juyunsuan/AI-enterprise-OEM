"use client";

import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Col,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CardShopCategory,
  CardShopGoods,
  CardShopGoodsSaveBody,
  CardShopGoodsStatus,
} from "@enterprise/contracts";
import { cardShopApi } from "@/api/card-shop";
import { EmptyState, Panel, TabStrip } from "@/components/ui/panel";
import { moneyCny } from "@/lib/money";
import { StatusTag } from "./common";
import { useCardShopScope } from "./scope";

type GoodsFilter = {
  keyword: string;
  categoryId?: number;
  status?: CardShopGoodsStatus;
  warnOnly?: boolean;
};

const STATUS_OPTIONS = [
  { value: "ONLINE", label: "销售中" },
  { value: "DRAFT", label: "草稿" },
  { value: "OFFLINE", label: "已下架" },
  { value: "FROZEN", label: "平台冻结" },
];

/** 商品：分类骨架 + 卡密商品台账；库存列直接读契约下发的 stock（可售/占用/已售）。 */
export function GoodsTab() {
  const { siteId, meta } = useCardShopScope();
  const { message } = App.useApp();
  const [categories, setCategories] = useState<CardShopCategory[]>([]);
  const [rows, setRows] = useState<CardShopGoods[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filter, setFilter] = useState<GoodsFilter>({ keyword: "" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(0);
  const [saving, setSaving] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<Partial<CardShopCategory>>({});
  const [form] = Form.useForm<CardShopGoodsSaveBody>();

  const loadCategories = useCallback(async () => {
    if (!siteId) return;
    try {
      setCategories((await cardShopApi.categories({ query: { siteId } })) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "分类读取失败");
    }
  }, [siteId, message]);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const result = await cardShopApi.goodsList({
        query: {
          siteId,
          keyword: filter.keyword.trim() || undefined,
          categoryId: filter.categoryId || undefined,
          status: filter.status,
          warnOnly: filter.warnOnly || undefined,
          page,
          pageSize,
        },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "商品读取失败");
    } finally {
      setLoading(false);
    }
  }, [siteId, filter, page, pageSize, message]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditingId(0);
    form.resetFields();
    form.setFieldsValue({
      siteId,
      price: 9.9,
      contactMode: "ANY",
      takeCardMode: "OFF",
      cardFormat: "SINGLE",
      status: "DRAFT",
      couponEnabled: true,
      notifyFlags: { merchantStation: true, buyerEmail: false },
      images: [],
      wholesaleTiers: [],
    });
    setDrawerOpen(true);
  }, [form, siteId]);

  const openEdit = async (row: CardShopGoods) => {
    try {
      const detail = await cardShopApi.goodsDetail({ query: { siteId, id: row.id } });
      if (!detail) throw new Error("商品已不存在，请刷新列表");
      setEditingId(row.id);
      form.resetFields();
      form.setFieldsValue({
        siteId,
        id: row.id,
        categoryId: detail.categoryId,
        name: detail.name,
        subtitle: detail.subtitle,
        coverImage: detail.coverImage,
        images: detail.images,
        price: detail.price,
        marketPrice: detail.marketPrice,
        wholesaleTiers: detail.wholesaleTiers,
        limitQuantity: detail.limitQuantity,
        maxQuantity: detail.maxQuantity,
        stockWarn: detail.stockWarn,
        couponEnabled: detail.couponEnabled,
        takeCardMode: detail.takeCardMode,
        contactMode: detail.contactMode,
        notifyFlags: detail.notifyFlags,
        cardFormat: detail.cardFormat,
        intro: detail.intro,
        detail: detail.detail,
        remark: detail.remark,
        cardOrderMode:
          detail.cardOrderMode === "OLDEST" || detail.cardOrderMode === "NEWEST" || detail.cardOrderMode === "RANDOM"
            ? detail.cardOrderMode
            : "",
        hot: detail.hot,
        sort: detail.sort,
        status: detail.status,
      });
      setDrawerOpen(true);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "商品详情读取失败");
    }
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await cardShopApi.goodsSave({ body: { ...values, siteId, id: editingId } });
      message.success(editingId ? "商品已更新" : "商品已创建");
      setDrawerOpen(false);
      await load();
      await loadCategories();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const batchStatus = async (row: CardShopGoods, status: CardShopGoodsStatus) => {
    try {
      const result = await cardShopApi.goodsStatus({ body: { siteId, ids: [row.id], status } });
      message.success(result?.message || "状态已更新");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const trash = async (row: CardShopGoods) => {
    try {
      await cardShopApi.goodsRemove({ body: { siteId, ids: [row.id] } });
      message.success("商品已移入回收站（卡密不受影响）");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<CardShopGoods> = useMemo(
    () => [
      {
        title: "封面",
        dataIndex: "coverImage",
        width: 72,
        render: (value: string) =>
          value ? (
            <Image src={value} alt="商品封面" width={44} height={44} style={{ objectFit: "cover", borderRadius: 6 }} />
          ) : (
            <span className="text-12 muted">—</span>
          ),
      },
      {
        title: "商品",
        dataIndex: "name",
        ellipsis: true,
        render: (_: string, row) => (
          <div style={{ display: "grid", gap: 2 }}>
            <span>{row.name}</span>
            <span className="text-12 muted">{row.categoryName || "未分类"}</span>
          </div>
        ),
      },
      { title: "价格", dataIndex: "price", width: 100, render: (value: number) => moneyCny(value) },
      {
        title: "库存（可售/占用/已售）",
        dataIndex: "stock",
        width: 180,
        render: (_: unknown, row) => (
          <Space size={4} wrap>
            <Tag color={row.stock.available > 0 ? "green" : "red"}>{row.stock.available}</Tag>
            <Tag>{row.stock.locked}</Tag>
            <Tag>{row.stock.sold}</Tag>
          </Space>
        ),
      },
      { title: "销量", dataIndex: "soldCount", width: 80 },
      {
        title: "状态",
        dataIndex: "status",
        width: 110,
        render: (value: string) => <StatusTag meta={meta} kind="goods" value={value} />,
      },
      {
        title: "操作",
        width: 220,
        render: (_: unknown, row) => (
          <Space size={4} wrap>
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => void openEdit(row)}>
              编辑
            </Button>
            {row.status === "ONLINE" ? (
              <Button size="small" type="text" onClick={() => void batchStatus(row, "OFFLINE")}>
                下架
              </Button>
            ) : row.status === "OFFLINE" || row.status === "DRAFT" ? (
              <Button size="small" type="text" onClick={() => void batchStatus(row, "ONLINE")}>
                上架
              </Button>
            ) : null}
            <Popconfirm title="移入回收站后买家端不再展示，可用「回收站」恢复" onConfirm={() => void trash(row)}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    // openEdit/batchStatus/trash 都是稳定的读取-刷新循环，依赖只放展示口径
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meta, siteId],
  );

  const saveCategory = async () => {
    const name = String(categoryDraft.name || "").trim();
    if (!name) {
      message.warning("请填写分类名称");
      return;
    }
    try {
      await cardShopApi.categorySave({
        body: {
          siteId,
          id: categoryDraft.id || 0,
          name,
          icon: categoryDraft.icon || "",
          remark: categoryDraft.remark || "",
          sort: categoryDraft.sort || 0,
          status: categoryDraft.status ?? true,
        },
      });
      message.success(categoryDraft.id ? "分类已更新" : "分类已创建");
      setCategoryDraft({});
      await loadCategories();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "分类保存失败");
    }
  };

  const removeCategory = async (row: CardShopCategory) => {
    try {
      await cardShopApi.categoryRemove({ body: { siteId, id: row.id } });
      message.success("分类已删除");
      await loadCategories();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="分类"
        titleExtra={<span className="muted text-12">{categories.length} 个分类</span>}
        extra={
          <Button size="small" icon={<PlusOutlined />} onClick={() => setCategoryOpen(true)}>
            新建分类
          </Button>
        }
      >
        <Space size={8} wrap>
          {categories.map((item) => (
            <Tag
              key={item.id}
              color={item.status ? "blue" : "default"}
              closable
              onClose={(event) => {
                event.preventDefault();
                void removeCategory(item);
              }}
              style={{ cursor: "pointer", padding: "2px 8px" }}
              onClick={() => setCategoryDraft(item)}
            >
              {item.name}（{item.goodsTotal}）
            </Tag>
          ))}
          {!categories.length ? <span className="muted text-12">还没有分类，点右上角新建</span> : null}
        </Space>
      </Panel>

      <Panel
        title="商品"
        titleExtra={<span className="muted text-12">上架后买家端可见</span>}
        extra={
          <Space size={6}>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
              重新读取
            </Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建商品
            </Button>
          </Space>
        }
      >
        <Space size={8} wrap style={{ marginBottom: 12 }}>
          <Input.Search
            allowClear
            placeholder="商品名称"
            style={{ width: 200 }}
            onSearch={(value) => {
              setPage(1);
              setFilter((prev) => ({ ...prev, keyword: value }));
            }}
          />
          <Select
            allowClear
            placeholder="分类"
            style={{ width: 150 }}
            options={categories.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => {
              setPage(1);
              setFilter((prev) => ({ ...prev, categoryId: value ?? undefined }));
            }}
          />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 130 }}
            options={STATUS_OPTIONS}
            onChange={(value) => {
              setPage(1);
              setFilter((prev) => ({ ...prev, status: value ?? undefined }));
            }}
          />
          <TabStrip
            items={[
              { key: "all", label: "全部" },
              { key: "warn", label: "库存预警" },
            ]}
            value={filter.warnOnly ? "warn" : "all"}
            onChange={(key) => {
              setPage(1);
              setFilter((prev) => ({ ...prev, warnOnly: key === "warn" }));
            }}
            style={{ width: "fit-content", marginBottom: 0 }}
          />
        </Space>
        {rows.length || loading ? (
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={rows}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (value) => `共 ${value} 件`,
              onChange: (nextPage, nextSize) => {
                setPage(nextPage);
                setPageSize(nextSize);
              },
            }}
          />
        ) : (
          <EmptyState text="还没有商品：先新建商品，再去「卡密」页导入卡密" />
        )}
      </Panel>

      <Drawer
        title={editingId ? "编辑商品" : "新建商品"}
        open={drawerOpen}
        width={720}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="name" label="商品名称" rules={[{ required: true, message: "请填写商品名称" }]}>
                <Input maxLength={200} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="subtitle" label="副标题">
                <Input maxLength={200} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="categoryId" label="分类">
                <Select
                  allowClear
                  options={categories.map((item) => ({ value: item.id, label: item.name }))}
                  placeholder="不选表示未分类"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="price" label="单价（元）" rules={[{ required: true, message: "请填写单价" }]}>
                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="marketPrice" label="划线价（元）">
                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="limitQuantity" label="起购数量" extra="0 = 不限">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="maxQuantity" label="单笔限购" extra="0 = 不限">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="stockWarn" label="库存预警阈值" extra="0 = 不预警">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="coverImage" label="封面图片地址">
                <Input maxLength={500} placeholder="https://..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="cardFormat" label="卡密形态">
                <Select
                  options={[
                    { value: "SINGLE", label: "仅卡密" },
                    { value: "PAIR", label: "卡号 + 卡密" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="takeCardMode" label="取卡密码">
                <Select
                  options={[
                    { value: "OFF", label: "不需要" },
                    { value: "REQUIRED", label: "买家必填" },
                    { value: "OPTIONAL", label: "买家选填" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contactMode" label="买家联系方式要求">
                <Select
                  options={[
                    { value: "ANY", label: "手机/邮箱/QQ 任一" },
                    { value: "MOBILE", label: "必须手机号" },
                    { value: "EMAIL", label: "必须邮箱" },
                    { value: "QQ", label: "必须 QQ" },
                    { value: "NONE", label: "不用留" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="cardOrderMode" label="出卡顺序" extra="留空跟随站点默认">
                <Select
                  allowClear
                  options={[
                    { value: "OLDEST", label: "先卖老卡" },
                    { value: "NEWEST", label: "先卖新卡" },
                    { value: "RANDOM", label: "随机出卡" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="visitPassword" label="访问密码" extra="留空不设置；填写后买家进详情要先输入">
                <Input maxLength={64} placeholder="不修改请留空" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="couponEnabled" label="允许优惠券" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="hot" label="首页热门" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sort" label="排序">
                <InputNumber min={0} max={9999} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="intro" label="简介">
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="detail" label="图文详情（HTML）">
                <Input.TextArea rows={4} maxLength={200000} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="使用说明" extra="买家取卡页会展示，例如「去 xxx 兑换」">
                <Input.TextArea rows={3} maxLength={200000} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      <Modal
        title={categoryDraft.id ? "编辑分类" : "新建分类"}
        open={categoryOpen || Boolean(categoryDraft.id)}
        onCancel={() => {
          setCategoryOpen(false);
          setCategoryDraft({});
        }}
        onOk={() => void saveCategory()}
        okText="保存"
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label="分类名称" required>
            <Input
              maxLength={60}
              value={categoryDraft.name || ""}
              onChange={(event) => setCategoryDraft((prev) => ({ ...prev, name: event.target.value }))}
            />
          </Form.Item>
          <Form.Item label="图标地址">
            <Input
              maxLength={500}
              value={categoryDraft.icon || ""}
              onChange={(event) => setCategoryDraft((prev) => ({ ...prev, icon: event.target.value }))}
            />
          </Form.Item>
          <Form.Item label="排序">
            <InputNumber
              min={0}
              max={9999}
              style={{ width: "100%" }}
              value={categoryDraft.sort ?? 0}
              onChange={(value) => setCategoryDraft((prev) => ({ ...prev, sort: Number(value || 0) }))}
            />
          </Form.Item>
          <Form.Item label="启用">
            <Switch
              checked={categoryDraft.status ?? true}
              onChange={(checked) => setCategoryDraft((prev) => ({ ...prev, status: checked }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
