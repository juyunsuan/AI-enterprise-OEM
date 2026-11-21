"use client";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Input, InputNumber, Select, Space, Switch, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { BrandProductSkuInput, BrandProductSpec } from "@enterprise/contracts";
import {
  BRAND_SKU_LIMITS,
  BRAND_SPEC_LIMITS,
  cellOf,
  cartesian,
  valuesToKey,
  type SpecCells,
} from "./sku-model";

/**
 * 规格 → SKU：SKU 行永远由「规格值的笛卡尔积」生成，用户只改每行的价格库存，
 * 不能手工加一行组合表里没有的 SKU（否则端上选规格时对不上）。
 *
 * 单元格按组合键存（见 sku-model 的 valuesToKey）：改规格值后旧键的行不再出现，
 * 提交时也不会带上它们，而契约口径正是「未提交的既有 SKU 删除」，两边对上。
 */
export function SpecSkuEditor({
  specs,
  cells,
  multiSpec,
  onSpecsChange,
  onCellsChange,
  onMultiSpecChange,
}: {
  specs: BrandProductSpec[];
  cells: SpecCells;
  multiSpec: boolean;
  onSpecsChange: (specs: BrandProductSpec[]) => void;
  onCellsChange: (cells: SpecCells) => void;
  onMultiSpecChange: (value: boolean) => void;
}) {
  const usable = specs.filter((spec) => spec.name.trim() && spec.values.length);
  const combos = cartesian(usable);

  const patchCell = (key: string, patch: Partial<BrandProductSkuInput>) => {
    const current = cells[key] ?? cellOf(cells, key);
    onCellsChange({ ...cells, [key]: { ...current, ...patch } });
  };

  const numberColumn = (
    field: "price" | "marketPrice" | "costPrice",
    title: string,
    width: number,
  ): ColumnsType<{ key: string; specValues: Record<string, string> }>[number] => ({
    title,
    width,
    render: (_, row) => (
      <InputNumber
        size="small"
        min={0}
        precision={2}
        style={{ width: "100%" }}
        value={cellOf(cells, row.key)[field]}
        onChange={(value) => patchCell(row.key, { [field]: Number(value ?? 0) })}
      />
    ),
  });

  const columns: ColumnsType<{ key: string; specValues: Record<string, string> }> = [
    {
      title: "规格组合",
      dataIndex: "key",
      width: 180,
      render: (_, row) =>
        usable.length ? (
          <Space size={4} wrap>
            {usable.map((spec) => (
              <span key={spec.name} className="text-12">
                {spec.name.trim()}：{row.specValues[spec.name.trim()]}
              </span>
            ))}
          </Space>
        ) : (
          <span className="muted text-12">单规格</span>
        ),
    },
    numberColumn("price", "售价", 120),
    numberColumn("marketPrice", "市场价", 120),
    numberColumn("costPrice", "成本价", 120),
    {
      title: "库存",
      width: 110,
      render: (_, row) => (
        <InputNumber
          size="small"
          min={0}
          max={BRAND_SKU_LIMITS.stockMax}
          precision={0}
          style={{ width: "100%" }}
          value={cellOf(cells, row.key).stock}
          onChange={(value) => patchCell(row.key, { stock: Math.trunc(Number(value ?? 0)) })}
        />
      ),
    },
    {
      title: "重量(kg)",
      width: 100,
      render: (_, row) => (
        <InputNumber
          size="small"
          min={0}
          max={BRAND_SKU_LIMITS.weightMax}
          style={{ width: "100%" }}
          value={cellOf(cells, row.key).weight}
          onChange={(value) => patchCell(row.key, { weight: Number(value ?? 0) })}
        />
      ),
    },
    {
      title: "体积(m³)",
      width: 100,
      render: (_, row) => (
        <InputNumber
          size="small"
          min={0}
          max={BRAND_SKU_LIMITS.volumeMax}
          style={{ width: "100%" }}
          value={cellOf(cells, row.key).volume}
          onChange={(value) => patchCell(row.key, { volume: Number(value ?? 0) })}
        />
      ),
    },
    {
      title: "条码",
      width: 140,
      render: (_, row) => (
        <Input
          size="small"
          maxLength={BRAND_SKU_LIMITS.barcodeMax}
          value={cellOf(cells, row.key).barcode}
          onChange={(event) => patchCell(row.key, { barcode: event.target.value.trim() })}
        />
      ),
    },
    {
      title: "规格图",
      width: 170,
      render: (_, row) => (
        <Input
          size="small"
          maxLength={500}
          placeholder="图片地址"
          value={cellOf(cells, row.key).image}
          onChange={(event) => patchCell(row.key, { image: event.target.value.trim() })}
        />
      ),
    },
    {
      title: "启用",
      width: 70,
      render: (_, row) => (
        <Switch
          size="small"
          checked={cellOf(cells, row.key).enabled}
          onChange={(checked) => patchCell(row.key, { enabled: checked })}
        />
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={10} style={{ width: "100%" }}>
      <Space wrap>
        <Switch
          checked={multiSpec}
          onChange={(checked) => {
            onMultiSpecChange(checked);
            if (!checked) onSpecsChange([]);
          }}
          checkedChildren="多规格"
          unCheckedChildren="单规格"
        />
        <span className="muted text-12">
          多规格：下面这张表由规格值组合自动生成；单规格：价格库存直接填在基础信息里
        </span>
      </Space>

      {multiSpec ? (
        <>
          {specs.map((spec, index) => (
            <Space key={`spec-${index}`} align="start" wrap>
              <Input
                style={{ width: 150 }}
                maxLength={BRAND_SPEC_LIMITS.nameMax}
                placeholder="规格名，如 颜色"
                value={spec.name}
                onChange={(event) =>
                  onSpecsChange(
                    specs.map((item, position) =>
                      position === index ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              <Select
                mode="tags"
                style={{ minWidth: 320, maxWidth: 520 }}
                placeholder="规格值，回车逐个添加，如 红 / 蓝"
                maxCount={BRAND_SPEC_LIMITS.valuesMax}
                value={spec.values}
                onChange={(values: string[]) =>
                  onSpecsChange(
                    specs.map((item, position) =>
                      position === index
                        ? {
                            ...item,
                            values: values
                              .map((one) => one.trim().slice(0, BRAND_SPEC_LIMITS.valueMax))
                              .filter(Boolean),
                          }
                        : item,
                    ),
                  )
                }
              />
              <Button
                size="small"
                type="text"
                danger
                aria-label="删除该规格"
                icon={<DeleteOutlined aria-hidden />}
                onClick={() => onSpecsChange(specs.filter((_, position) => position !== index))}
              />
            </Space>
          ))}
          <div>
            <Button
              size="small"
              icon={<PlusOutlined aria-hidden />}
              disabled={specs.length >= BRAND_SPEC_LIMITS.countMax}
              onClick={() => onSpecsChange([...specs, { name: "", values: [] }])}
            >
              添加规格
            </Button>
            <span className="muted text-12" style={{ marginLeft: 8 }}>
              最多 {BRAND_SPEC_LIMITS.countMax} 个规格、每个最多 {BRAND_SPEC_LIMITS.valuesMax} 个值
            </span>
          </div>
          {!usable.length ? (
            <Alert
              type="warning"
              showIcon
              message="至少要有一个规格填好了规格名与规格值，否则组合不出 SKU"
            />
          ) : null}
          {combos.length > BRAND_SKU_LIMITS.max ? (
            <Alert
              type="error"
              showIcon
              message={`当前会组合出 ${combos.length} 个 SKU，超过单次保存上限 ${BRAND_SKU_LIMITS.max} 个，请减少规格值`}
            />
          ) : null}
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={combos.map((specValues) => ({ key: valuesToKey(specValues), specValues }))}
            columns={columns}
            scroll={{ x: 1240 }}
          />
          <span className="muted text-12">
            共 {combos.length} 个 SKU；商品售价取其中最低价、库存取汇总，列表页只展示这两个派生值
          </span>
        </>
      ) : null}
    </Space>
  );
}
