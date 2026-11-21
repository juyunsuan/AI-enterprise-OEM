"use client";

import { DeleteOutlined, ExportOutlined, ImportOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Upload,
  type UploadProps,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type {
  CardShopCard,
  CardShopCardBatch,
  CardShopCardImportResult,
  CardShopGoods,
  CardShopImportSplitter,
} from "@enterprise/contracts";
import { cardShopApi } from "@/api/card-shop";
import { EmptyState, Notice, Panel, TabStrip } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { StatusTag } from "./common";
import { useCardShopScope } from "./scope";

const SPLITTER_OPTIONS: { value: CardShopImportSplitter; label: string }[] = [
  { value: "AUTO", label: "自动识别" },
  { value: "SPACE", label: "空格" },
  { value: "COMMA", label: "逗号" },
  { value: "PIPE", label: "竖线 |" },
  { value: "DASH", label: "四个连字符 ----" },
  { value: "TAB", label: "制表符" },
  { value: "NONE", label: "整行当卡密" },
];

/** 卡密：按商品看库存、导入批次、导出与回收站；列表卡密默认掩码，明文只走导出。 */
export function CardTab() {
  const { siteId, meta } = useCardShopScope();
  const { message } = App.useApp();
  const [goodsRows, setGoodsRows] = useState<CardShopGoods[]>([]);
  const [goodsId, setGoodsId] = useState<number | undefined>();
  const [rows, setRows] = useState<CardShopCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<string>("");
  const [trash, setTrash] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<CardShopCardImportResult | null>(null);
  const [batches, setBatches] = useState<CardShopCardBatch[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [importForm] = Form.useForm<{
    goodsId: number;
    splitter: CardShopImportSplitter;
    dedup: boolean;
    orderMode: "SEQUENTIAL" | "SHUFFLE";
    remark: string;
    content: string;
    fileName: string;
  }>();

  const loadGoods = useCallback(async () => {
    if (!siteId) return;
    try {
      const result = await cardShopApi.goodsList({ query: { siteId, page: 1, pageSize: 100 } });
      setGoodsRows(result?.list ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "商品读取失败");
    }
  }, [siteId, message]);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const result = await cardShopApi.cardList({
        query: {
          siteId,
          goodsId,
          status: (status || undefined) as CardShopCard["status"] | undefined,
          trash: trash ? 1 : 0,
          keyword: keyword.trim() || undefined,
          page,
          pageSize,
        },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
      setSelected([]);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "卡密读取失败");
    } finally {
      setLoading(false);
    }
  }, [siteId, goodsId, status, trash, keyword, page, pageSize, message]);

  useEffect(() => {
    void loadGoods();
  }, [loadGoods]);

  useEffect(() => {
    void load();
  }, [load]);

  const openImport = () => {
    importForm.resetFields();
    importForm.setFieldsValue({
      goodsId: goodsId || goodsRows[0]?.id,
      splitter: "AUTO",
      dedup: true,
      orderMode: "SEQUENTIAL",
      remark: "",
      content: "",
      fileName: "",
    });
    setImportResult(null);
    setImportOpen(true);
  };

  const fileReader: UploadProps["beforeUpload"] = async (file) => {
    const text = await file.text();
    importForm.setFieldsValue({ content: text, fileName: file.name });
    message.success(`已读入 ${file.name}，请核对分隔符后导入`);
    return Upload.LIST_IGNORE;
  };

  const submitImport = async () => {
    const values = await importForm.validateFields();
    if (!values.content.trim()) {
      message.warning("请粘贴卡密内容或选择文件");
      return;
    }
    setImporting(true);
    try {
      const result = await cardShopApi.cardImport({
        body: {
          siteId,
          goodsId: values.goodsId,
          source: values.fileName ? "FILE" : "TEXT",
          content: values.content,
          fileName: values.fileName || "",
          splitter: values.splitter,
          dedup: values.dedup,
          orderMode: values.orderMode,
          remark: values.remark || "",
        },
      });
      setImportResult(result);
      message.success(result?.message || "导入完成");
      await load();
      await loadGoods();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const loadBatches = async () => {
    try {
      setBatches((await cardShopApi.batchList({ query: { siteId, goodsId } })) ?? []);
      setBatchOpen(true);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "批次读取失败");
    }
  };

  const withdrawBatch = async (row: CardShopCardBatch) => {
    try {
      const result = await cardShopApi.batchRemove({
        body: { siteId, batchId: row.id, includeSold: false },
      });
      message.success(result?.message || "批次已撤回");
      await loadBatches();
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "撤回失败");
    }
  };

  const changeStatus = async (next: "AVAILABLE" | "DISABLED" | "VOID") => {
    if (!selected.length) {
      message.warning("请先勾选卡密");
      return;
    }
    try {
      const result = await cardShopApi.cardStatus({ body: { siteId, ids: selected, status: next } });
      message.success(result?.message || "状态已更新");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const removeCards = async (hard: boolean) => {
    if (!selected.length) {
      message.warning("请先勾选卡密");
      return;
    }
    try {
      const result = await cardShopApi.cardRemove({ body: { siteId, ids: selected, hard: hard ? 1 : 0 } });
      message.success(result?.message || "已处理");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const exportCards = async (plain: boolean) => {
    if (!goodsId) {
      message.warning("请先按商品筛选后再导出（导出按商品维度）");
      return;
    }
    try {
      const result = await cardShopApi.cardExport({
        body: { siteId, goodsId, status: (status || undefined) as CardShopCard["status"] | undefined, plain: plain ? 1 : 0 },
      });
      const blob = new Blob([`\ufeff${result?.content || ""}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result?.fileName || "cards.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      message.success(result?.message || `已导出 ${result?.count || 0} 行`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "导出失败");
    }
  };

  const columns: ColumnsType<CardShopCard> = [
    {
      title: "卡号",
      dataIndex: "number",
      width: 150,
      render: (value: string) => value || <span className="muted">—</span>,
    },
    {
      title: "卡密",
      dataIndex: "secret",
      render: (_: string, row) => (
        <span>
          {row.secret}
          {row.secretMasked ? <Tag style={{ marginLeft: 6 }}>已掩码</Tag> : null}
        </span>
      ),
    },
    { title: "批次", dataIndex: "batchNo", width: 150, render: (value: string) => value || "—" },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <StatusTag meta={meta} kind="card" value={value} />,
    },
    {
      title: "售出订单",
      dataIndex: "soldOrderNo",
      width: 160,
      render: (value: string, row) =>
        value ? (
          <span>
            {value}
            <br />
            <span className="text-12 muted">{row.soldAt ? fmtTime(row.soldAt) : ""}</span>
          </span>
        ) : (
          "—"
        ),
    },
    { title: "导入时间", dataIndex: "createdAt", width: 160, render: (value: string) => fmtTime(value) },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="卡密库存"
        titleExtra={<span className="muted text-12">{goodsId ? "当前按所选商品筛选" : "全部商品"}</span>}
        extra={
          <Space size={6}>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
              重新读取
            </Button>
            <Button size="small" onClick={() => void loadBatches()}>
              导入批次
            </Button>
            <Button size="small" icon={<ExportOutlined />} onClick={() => void exportCards(false)}>
              导出（掩码）
            </Button>
            <Popconfirm title="导出即含卡密明文，请只在可信设备上保存" onConfirm={() => void exportCards(true)}>
              <Button size="small">导出明文</Button>
            </Popconfirm>
            <Button size="small" type="primary" icon={<ImportOutlined />} onClick={openImport}>
              导入卡密
            </Button>
          </Space>
        }
      >
        <Space size={8} wrap style={{ marginBottom: 12 }}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部商品"
            style={{ width: 220 }}
            value={goodsId}
            options={goodsRows.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => {
              setPage(1);
              setGoodsId(value ?? undefined);
            }}
          />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 140 }}
            value={status || undefined}
            options={[
              { value: "AVAILABLE", label: "可售" },
              { value: "LOCKED", label: "占用中" },
              { value: "SOLD", label: "已售" },
              { value: "DISABLED", label: "已停用" },
              { value: "VOID", label: "已作废" },
            ]}
            onChange={(value) => {
              setPage(1);
              setStatus(value || "");
            }}
          />
          <Input.Search
            allowClear
            placeholder="卡号 / 卡密"
            style={{ width: 200 }}
            onSearch={(value) => {
              setPage(1);
              setKeyword(value);
            }}
          />
          <TabStrip
            items={[
              { key: "normal", label: "正常" },
              { key: "trash", label: "回收站" },
            ]}
            value={trash ? "trash" : "normal"}
            onChange={(key) => {
              setPage(1);
              setTrash(key === "trash");
            }}
            style={{ width: "fit-content", marginBottom: 0 }}
          />
          {selected.length ? (
            <Space size={4}>
              <span className="text-12 muted">已选 {selected.length}</span>
              {!trash ? (
                <>
                  <Button size="small" onClick={() => void changeStatus("DISABLED")}>
                    停用
                  </Button>
                  <Button size="small" onClick={() => void changeStatus("AVAILABLE")}>
                    恢复可售
                  </Button>
                  <Button size="small" onClick={() => void changeStatus("VOID")}>
                    作废
                  </Button>
                </>
              ) : null}
              <Popconfirm title="移入回收站（已售卡密默认保留以留取证）？" onConfirm={() => void removeCards(false)}>
                <Button size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          ) : null}
        </Space>
        {rows.length || loading ? (
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            dataSource={rows}
            columns={columns}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (keys) => setSelected(keys as number[]),
            }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (value) => `共 ${value} 张`,
              onChange: (nextPage, nextSize) => {
                setPage(nextPage);
                setPageSize(nextSize);
              },
            }}
          />
        ) : (
          <EmptyState text="还没有卡密：点右上角「导入卡密」按商品导入" />
        )}
      </Panel>

      <Modal
        title="导入卡密"
        open={importOpen}
        width={640}
        onCancel={() => setImportOpen(false)}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={() => setImportOpen(false)}>关闭</Button>
            <Button type="primary" loading={importing} onClick={() => void submitImport()}>
              开始导入
            </Button>
          </Space>
        }
      >
        <Form form={importForm} layout="vertical">
          <Form.Item name="goodsId" label="导入到商品" rules={[{ required: true, message: "请选择商品" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={goodsRows.map((item) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>
          <Form.Item label="卡密内容" extra="一行一张卡；「卡号 + 卡密」两列时选好分隔符即可">
            <Space direction="vertical" style={{ width: "100%" }} size={8}>
              <Upload beforeUpload={fileReader} showUploadList={false} accept=".txt,.csv">
                <Button size="small" icon={<ImportOutlined />}>
                  从文件读入
                </Button>
              </Upload>
              <Form.Item name="fileName" noStyle>
                <Input readOnly placeholder="未选择文件（也可以直接粘贴）" />
              </Form.Item>
              <Form.Item name="content" noStyle>
                <Input.TextArea rows={7} placeholder={"例如：\nAAAA-1111\nBBBB-2222"} />
              </Form.Item>
            </Space>
          </Form.Item>
          <Space size={12} wrap>
            <Form.Item name="splitter" label="分隔符">
              <Select options={SPLITTER_OPTIONS} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="orderMode" label="导入顺序">
              <Select
                style={{ width: 150 }}
                options={[
                  { value: "SEQUENTIAL", label: "按文件顺序" },
                  { value: "SHUFFLE", label: "打乱顺序" },
                ]}
              />
            </Form.Item>
            <Form.Item name="dedup" label="去重" valuePropName="checked">
              <Select
                style={{ width: 120 }}
                options={[
                  { value: true, label: "开启" },
                  { value: false, label: "关闭" },
                ]}
              />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="批次备注">
            <Input maxLength={200} placeholder="例如：渠道 A 第一批" />
          </Form.Item>
        </Form>
        {importResult ? (
          <Alert
            type={importResult.importedCount > 0 ? "success" : "warning"}
            showIcon
            message={importResult.message}
            description={
              <div style={{ display: "grid", gap: 4 }}>
                <span>
                  批次 {importResult.batchNo} · 分隔符 {importResult.splitterLabel} · 有效 {importResult.importedCount} · 重复{" "}
                  {importResult.duplicatedCount} · 无效 {importResult.invalidCount}
                </span>
                {importResult.samples.length ? (
                  <span>
                    无效行示例：
                    {importResult.samples
                      .slice(0, 5)
                      .map((item) => `第 ${item.line} 行（${item.reason}）`)
                      .join("；")}
                  </span>
                ) : null}
              </div>
            }
          />
        ) : null}
      </Modal>

      <Modal
        title="导入批次"
        open={batchOpen}
        width={860}
        footer={null}
        onCancel={() => setBatchOpen(false)}
        destroyOnHidden
      >
        <Notice variant="info">撤回批次只作废「未售出」卡密；已售卡密保留在回收站以留取证。</Notice>
        <Table
          size="small"
          rowKey="id"
          style={{ marginTop: 12 }}
          dataSource={batches}
          pagination={false}
          columns={[
            { title: "批次号", dataIndex: "batchNo", width: 150 },
            { title: "商品", dataIndex: "goodsName", ellipsis: true },
            { title: "导入", dataIndex: "importedCount", width: 70 },
            { title: "可售", dataIndex: "availableCount", width: 70 },
            { title: "已售", dataIndex: "soldCount", width: 70 },
            { title: "时间", dataIndex: "createdAt", width: 160, render: (value: string) => fmtTime(value) },
            {
              title: "操作",
              width: 100,
              render: (_: unknown, row) => (
                <Popconfirm title="撤回该批次未售出的卡密？" onConfirm={() => void withdrawBatch(row)}>
                  <Button size="small" danger type="text">
                    撤回
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
