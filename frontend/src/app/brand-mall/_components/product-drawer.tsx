"use client";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
} from "antd";
import { useState } from "react";
import {
  BRAND_PRODUCT_STATUSES,
  BRAND_PRODUCT_STATUS_LABELS,
  BRAND_PRODUCT_TYPES,
  BRAND_PRODUCT_TYPE_LABELS,
  type BrandCategoryTree,
  type BrandProductParamItem,
} from "@enterprise/contracts";
import {
  useBrandGoodsActions,
  useBrandProduct,
  useBrandShipping,
} from "@/query/brand-mall";
import { ActionLink, withShop } from "./brand-common";
import { ImageUrlField, ImageUrlsField } from "@/components/ui/image-field";
import { HtmlField } from "./html-field";
import { SpecSkuEditor } from "./spec-sku-editor";
import {
  BRAND_SKU_LIMITS,
  buildSkus,
  minSkuPrice,
  sumSkuStock,
  type SpecCells,
} from "./sku-model";
import {
  BRAND_PRODUCT_LIMITS,
  bodyFromDraft,
  draftFromDetail,
  emptyProductDraft,
  type ProductDraft,
  type ProductScalars,
} from "./product-model";

/**
 * 商品编辑抽屉：基础信息 + 图片 + 富文本详情 + 规格/SKU + 标签与状态。
 *
 * 规格与 SKU 用受控 state 而不是 Form.List：SKU 行是规格值的笛卡尔积，
 * Form.List 表达不了「组合键 → 单元格」这层映射（详见 spec-sku-editor）。
 */
export function ProductDrawer({
  open,
  shopId,
  productId,
  categories,
  onClose,
}: {
  open: boolean;
  shopId: number;
  productId: number;
  categories: BrandCategoryTree[];
  onClose: () => void;
}) {
  const detailQuery = useBrandProduct({ shopId }, productId);
  const initial =
    productId > 0 ? (detailQuery.data ? draftFromDetail(detailQuery.data) : null) : emptyProductDraft;

  return (
    <Drawer
      open={open}
      size={960}
      destroyOnHidden
      onClose={onClose}
      title={productId ? "编辑商品" : "新建商品"}
    >
      {!open ? null : initial ? (
        <ProductForm
          key={`${shopId}-${productId}`}
          shopId={shopId}
          productId={productId}
          initial={initial}
          categories={categories}
          onClose={onClose}
        />
      ) : detailQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message={`商品详情读取失败：${detailQuery.error.message || "请稍后重试"}`}
        />
      ) : (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin />
        </div>
      )}
    </Drawer>
  );
}

function ProductForm({
  shopId,
  productId,
  initial,
  categories,
  onClose,
}: {
  shopId: number;
  productId: number;
  initial: ProductDraft;
  categories: BrandCategoryTree[];
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ProductScalars>();
  const actions = useBrandGoodsActions();
  const shippingQuery = useBrandShipping({ shopId });
  const [images, setImages] = useState<string[]>(initial.images);
  const [detail, setDetail] = useState(initial.detail);
  const [tags, setTags] = useState<string[]>(initial.guaranteeTags);
  const [params, setParams] = useState<BrandProductParamItem[]>(initial.params);
  const [specs, setSpecs] = useState(initial.specs);
  const [cells, setCells] = useState<SpecCells>(initial.cells);
  const [multiSpec, setMultiSpec] = useState(initial.specs.length > 0);
  const type = Form.useWatch("type", form) ?? initial.type;
  const coverImage = Form.useWatch("coverImage", form) ?? "";

  const skus = buildSkus(specs, cells);
  const livePrice = minSkuPrice(specs, cells, 0);
  const liveStock = sumSkuStock(specs, cells);

  const submit = async () => {
    const values = await form.validateFields();
    if (params.some((item) => !item.name.trim() && item.value.trim())) {
      message.warning("商品参数有填了值但没填参数名的行，请补上参数名或删掉该行");
      return;
    }
    if (multiSpec && !skus.length) {
      message.warning("多规格商品至少要有一个填好名称与规格值的规格，否则组合不出 SKU");
      return;
    }
    const body = bodyFromDraft(
      {
        ...values,
        images,
        detail,
        guaranteeTags: tags,
        params: params
          .map((item) => ({ name: item.name.trim(), value: item.value.trim() }))
          .filter((item) => item.name),
        specs,
        cells,
      },
      { shopId, id: productId || undefined, multiSpec, skus },
    );
    await actions.saveProduct.mutateAsync({ body });
    message.success(productId ? "商品已保存" : "商品已创建，上架后才会出现在小程序里");
    onClose();
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initial}
      style={{ maxWidth: 860 }}
    >
      <Divider orientation="horizontal" titlePlacement="left" plain>
        基础信息
      </Divider>
      <Form.Item
        name="title"
        label="商品标题"
        rules={[{ required: true, message: "请填写商品标题" }]}
      >
        <Input maxLength={BRAND_PRODUCT_LIMITS.titleMax} placeholder="小程序列表与详情页的标题" />
      </Form.Item>
      <Form.Item name="subtitle" label="副标题">
        <Input maxLength={BRAND_PRODUCT_LIMITS.subtitleMax} placeholder="一句话卖点，可留空" />
      </Form.Item>
      <Form.Item
        name="categoryId"
        label="所属分类"
        extra="决定小程序分类页归属；留空即未分类"
      >
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={categories.length ? "选择分类" : "还没有分类"}
          options={flattenCategories(categories)}
        />
      </Form.Item>
      {!categories.length ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              本店还没有分类，商品会全部落在「未分类」。
              <ActionLink path={withShop("/brand-mall/goods", shopId)}>先在左侧分类树新建</ActionLink>
            </span>
          }
        />
      ) : null}
      <Form.Item name="type" label="商品类型">
        <Select
          options={BRAND_PRODUCT_TYPES.map((value) => ({
            value,
            label: BRAND_PRODUCT_TYPE_LABELS[value],
          }))}
        />
      </Form.Item>
      {type === "VIRTUAL" ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="虚拟商品下单即完成、不占库存不发货，请在下方「虚拟商品说明」写清核销方式"
        />
      ) : null}
      <Space wrap align="start" style={{ width: "100%" }}>
        <Form.Item
          label="售价（元）"
          extra={multiSpec ? "多规格：自动取 SKU 最低价" : undefined}
          style={{ width: 170 }}
        >
          {multiSpec ? (
            <InputNumber disabled value={livePrice} min={0} precision={2} style={{ width: "100%" }} />
          ) : (
            <Form.Item name="price" noStyle rules={[{ required: true, message: "请填写售价" }]}>
              <InputNumber min={0} precision={2} style={{ width: "100%" }} />
            </Form.Item>
          )}
        </Form.Item>
        <Form.Item label="市场价（元）" style={{ width: 170 }}>
          <Form.Item name="marketPrice" noStyle>
            <InputNumber min={0} precision={2} placeholder="划线价" style={{ width: "100%" }} />
          </Form.Item>
        </Form.Item>
        <Form.Item
          label="成本价（元）"
          tooltip="仅本站可见，不进小程序端"
          style={{ width: 170 }}
        >
          <Form.Item name="costPrice" noStyle>
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
        </Form.Item>
        <Form.Item
          label="库存"
          extra={multiSpec ? "多规格：SKU 库存汇总" : undefined}
          style={{ width: 150 }}
        >
          {multiSpec ? (
            <InputNumber disabled value={liveStock} min={0} precision={0} style={{ width: "100%" }} />
          ) : (
            <Form.Item name="stock" noStyle>
              <InputNumber
                min={0}
                max={BRAND_SKU_LIMITS.stockMax}
                precision={0}
                style={{ width: "100%" }}
              />
            </Form.Item>
          )}
        </Form.Item>
        <Form.Item label="单位" name="unit" style={{ width: 110 }}>
          <Input maxLength={BRAND_PRODUCT_LIMITS.unitMax} />
        </Form.Item>
      </Space>
      <Space wrap align="start" style={{ width: "100%" }}>
        <Form.Item
          label="重量（kg）"
          tooltip="算运费与快递预估用，实物商品建议填"
          style={{ width: 150 }}
        >
          <Form.Item name="weight" noStyle>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form.Item>
        <Form.Item label="体积（m³）" style={{ width: 150 }}>
          <Form.Item name="volume" noStyle>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form.Item>
        <Form.Item label="排序值" name="sortOrder" tooltip="同分类内数字越小越靠前" style={{ width: 150 }}>
          <InputNumber min={0} max={BRAND_PRODUCT_LIMITS.sortOrderMax} precision={0} style={{ width: "100%" }} />
        </Form.Item>
      </Space>
      {type === "VIRTUAL" ? null : (
        <Form.Item
          name="freightTemplateId"
          label="运费模板"
          extra="不指定时按店铺默认模板算；店铺没有默认模板就用交易设置里的统一运费"
        >
          <Select
            style={{ maxWidth: 360 }}
            loading={shippingQuery.isFetching}
            options={[
              { value: 0, label: "默认（店铺默认模板 / 统一运费）" },
              ...(shippingQuery.data ?? []).map((template) => ({
                value: template.id,
                label: `${template.name}${template.isDefault ? "（店铺默认）" : ""} · ${template.rules.length} 条规则`,
              })),
            ]}
          />
        </Form.Item>
      )}
      <Form.Item name="coverImage" label="封面图" extra="列表页与分享卡片用的那一张">
        <ImageUrlField value={coverImage} onChange={(url) => form.setFieldValue("coverImage", url)} />
      </Form.Item>
      {type === "VIRTUAL" ? (
        <Form.Item
          name="virtualRemark"
          label="虚拟商品说明"
          extra={`最多 ${BRAND_PRODUCT_LIMITS.virtualRemarkMax} 字`}
        >
          <Input.TextArea rows={2} maxLength={BRAND_PRODUCT_LIMITS.virtualRemarkMax} />
        </Form.Item>
      ) : null}

      <Divider orientation="horizontal" titlePlacement="left" plain>
        图片与详情
      </Divider>
      <Form.Item
        label="图集"
        extra={`详情页轮播，最多 ${BRAND_PRODUCT_LIMITS.imagesMax} 张`}
      >
        <ImageUrlsField value={images} max={BRAND_PRODUCT_LIMITS.imagesMax} onChange={setImages} />
      </Form.Item>
      <Form.Item label="详情正文">
        <HtmlField value={detail} onChange={setDetail} />
      </Form.Item>

      <Divider orientation="horizontal" titlePlacement="left" plain>
        规格与 SKU
      </Divider>
      <SpecSkuEditor
        specs={specs}
        cells={cells}
        multiSpec={multiSpec}
        onSpecsChange={setSpecs}
        onCellsChange={setCells}
        onMultiSpecChange={setMultiSpec}
      />

      <Divider orientation="horizontal" titlePlacement="left" plain>
        商品参数
      </Divider>
      <Form.Item
        label="参数表"
        extra={`详情页「商品参数」表格按这里的顺序展示，最多 ${BRAND_PRODUCT_LIMITS.paramMax} 行；参数名必填，值可留空`}
      >
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          {params.map((item, index) => (
            <Space key={index} align="start">
              <Input
                style={{ width: 200 }}
                placeholder="参数名，如 材质"
                maxLength={BRAND_PRODUCT_LIMITS.paramNameMax}
                value={item.name}
                onChange={(event) =>
                  setParams((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)),
                  )
                }
              />
              <Input
                style={{ width: 380 }}
                placeholder="参数值，如 头层牛皮"
                maxLength={BRAND_PRODUCT_LIMITS.paramValueMax}
                value={item.value}
                onChange={(event) =>
                  setParams((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, value: event.target.value } : row)),
                  )
                }
              />
              <Button
                type="text"
                danger
                aria-label="删除该参数"
                icon={<DeleteOutlined aria-hidden />}
                onClick={() => setParams((prev) => prev.filter((_, i) => i !== index))}
              />
            </Space>
          ))}
          <Button
            icon={<PlusOutlined aria-hidden />}
            disabled={params.length >= BRAND_PRODUCT_LIMITS.paramMax}
            onClick={() => setParams((prev) => [...prev, { name: "", value: "" }])}
          >
            添加参数
          </Button>
        </Space>
      </Form.Item>

      <Divider orientation="horizontal" titlePlacement="left" plain>
        标签、保障与状态
      </Divider>
      <Form.Item label="营销标签" extra="小程序列表页的角标与筛选依据">
        <Space wrap>
          <Form.Item name="isHot" valuePropName="checked" noStyle>
            <Switch checkedChildren="热销" unCheckedChildren="热销" />
          </Form.Item>
          <Form.Item name="isNew" valuePropName="checked" noStyle>
            <Switch checkedChildren="新品" unCheckedChildren="新品" />
          </Form.Item>
          <Form.Item name="isGood" valuePropName="checked" noStyle>
            <Switch checkedChildren="精品" unCheckedChildren="精品" />
          </Form.Item>
        </Space>
      </Form.Item>
      <Form.Item
        label="保障标签"
        extra={`如「7 天无理由」「顺丰包邮」，最多 ${BRAND_PRODUCT_LIMITS.tagMax} 条，详情页原样展示`}
      >
        <Select
          mode="tags"
          style={{ width: "100%" }}
          maxCount={BRAND_PRODUCT_LIMITS.tagMax}
          value={tags}
          onChange={(values: string[]) =>
            setTags(
              values
                .map((item) => item.trim().slice(0, BRAND_PRODUCT_LIMITS.tagLengthMax))
                .filter(Boolean),
            )
          }
          placeholder="输入后回车添加"
        />
      </Form.Item>
      <Form.Item name="status" label="上架状态">
        <Select
          options={BRAND_PRODUCT_STATUSES.map((value) => ({
            value,
            label: BRAND_PRODUCT_STATUS_LABELS[value],
          }))}
        />
      </Form.Item>
      <Form.Item label="当前配置">
        <Space wrap>
          {multiSpec ? <Tag color="blue">{skus.length} 个 SKU</Tag> : <Tag>单规格</Tag>}
          {images.length ? <Tag>{images.length} 张图集</Tag> : <Tag color="warning">没有图集</Tag>}
          {detail ? <Tag>详情 {detail.length} 字符</Tag> : <Tag color="warning">详情为空</Tag>}
          {params.length ? <Tag>{params.length} 条参数</Tag> : null}
          {coverImage ? null : <Tag color="warning">没有封面图</Tag>}
        </Space>
      </Form.Item>

      <Space>
        <Button type="primary" loading={actions.saveProduct.isPending} onClick={() => void submit()}>
          保存商品
        </Button>
        <Button onClick={onClose}>取消</Button>
        <span className="muted text-12">
          保存只改本站数据，小程序端启动时拉最新配置，改商品不用重新出包
        </span>
      </Space>
    </Form>
  );
}

/** 分类树 → 带缩进的下选项（契约口径最深三级）。 */
function flattenCategories(
  nodes: BrandCategoryTree[],
  level = 0,
): { value: number; label: string }[] {
  return nodes.flatMap((node) => [
    {
      value: node.id,
      label: `${"　".repeat(level)}${node.name}${node.productCount ? `（${node.productCount}）` : ""}`,
    },
    ...(level < 2 ? flattenCategories(node.children, level + 1) : []),
  ]);
}
