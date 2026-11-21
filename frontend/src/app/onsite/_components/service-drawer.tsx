"use client";
// 服务编辑抽屉：字段与契约 onsiteServiceInputSchema 一一对应，金额一律按整数分填。
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
import {
  ONSITE_SERVICE_STATUSES,
  ONSITE_SERVICE_STATUS_LABELS,
  ONSITE_TRAVEL_FEE_MODES,
  type OnsiteCategoryRow,
  type OnsiteLabelRow,
  type OnsiteServiceInput,
  type OnsiteServiceRow,
} from "@enterprise/contracts";
import { RawImg } from "@/components/ui/raw-img";
import { useOnsiteCatalogActions, useOnsiteService } from "@/query/onsite";
import { cents } from "./onsite-common";

const IMAGES_MAX = 12;
const LABELS_MAX = 12;
const CATEGORIES_MAX = 8;

/** 车费口径：契约只导出了枚举常量、没带文案字典，按业务语义补齐。 */
const TRAVEL_FEE_LABELS: Record<OnsiteServiceInput["travelFeeMode"], string> = {
  CITY: "按城市车费规则（在「城市与车费」里配）",
  CUSTOM: "本服务固定车费（不看距离）",
};

const EMPTY_SERVICE: OnsiteServiceInput = {
  title: "",
  subtitle: "",
  coverImage: "",
  images: [],
  detail: "",
  priceCents: 0,
  marketPriceCents: 0,
  durationMinutes: 60,
  maxDurationMinutes: 0,
  addonEnabled: true,
  addonUnitMinutes: 30,
  addonRate: 100,
  materialFeeCents: 0,
  travelFeeMode: "CITY",
  customTravelFeeCents: 0,
  labelIds: [],
  categoryIds: [],
  doorEnabled: true,
  storeEnabled: false,
  status: "DRAFT",
  sortOrder: 0,
  salesVirtual: 0,
};

/** 契约只认整数分，界面不做小数换算，只把等值金额念一遍。 */
const centsHint = (value: unknown) => `整数分（1 元 = 100 分），当前约 ${cents(value)}`;

function draftFromRow(row: OnsiteServiceRow, labels: OnsiteLabelRow[]): OnsiteServiceInput {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    coverImage: row.coverImage,
    images: row.images,
    detail: row.detail,
    priceCents: row.priceCents,
    marketPriceCents: row.marketPriceCents,
    durationMinutes: row.durationMinutes,
    maxDurationMinutes: row.maxDurationMinutes,
    addonEnabled: row.addonEnabled,
    addonUnitMinutes: row.addonUnitMinutes,
    addonRate: row.addonRate,
    materialFeeCents: row.materialFeeCents,
    travelFeeMode: row.travelFeeMode,
    customTravelFeeCents: row.customTravelFeeCents,
    // 服务行只回标签名快照（highlights），编辑时按名字反查 FEATURE 标签 id
    labelIds: row.highlights.flatMap((name) => {
      const found = labels.find((item) => item.name === name);
      return found ? [found.id] : [];
    }),
    categoryIds: row.categoryIds,
    doorEnabled: row.doorEnabled,
    storeEnabled: row.storeEnabled,
    status: row.status,
    sortOrder: row.sortOrder,
    salesVirtual: row.salesVirtual,
  };
}

export function ServiceDrawer({
  open,
  shopId,
  serviceId,
  categories,
  featureLabels,
  onOpenCategory,
  onClose,
}: {
  open: boolean;
  shopId: number;
  serviceId: number;
  categories: OnsiteCategoryRow[];
  featureLabels: OnsiteLabelRow[];
  onOpenCategory: () => void;
  onClose: () => void;
}) {
  const detailQuery = useOnsiteService({ shopId }, serviceId);
  const initial =
    serviceId > 0
      ? detailQuery.data
        ? draftFromRow(detailQuery.data, featureLabels)
        : null
      : EMPTY_SERVICE;

  return (
    <Drawer
      open={open}
      size={920}
      destroyOnHidden
      onClose={onClose}
      title={serviceId ? "编辑服务" : "新建服务"}
    >
      {!open ? null : initial ? (
        <ServiceForm
          key={`${shopId}-${serviceId}`}
          shopId={shopId}
          serviceId={serviceId}
          initial={initial}
          categories={categories}
          featureLabels={featureLabels}
          onOpenCategory={onOpenCategory}
          onClose={onClose}
        />
      ) : detailQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message={`服务详情读取失败：${detailQuery.error.message || "请稍后重试"}`}
        />
      ) : (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin />
        </div>
      )}
    </Drawer>
  );
}

function ServiceForm({
  shopId,
  serviceId,
  initial,
  categories,
  featureLabels,
  onOpenCategory,
  onClose,
}: {
  shopId: number;
  serviceId: number;
  initial: OnsiteServiceInput;
  categories: OnsiteCategoryRow[];
  featureLabels: OnsiteLabelRow[];
  onOpenCategory: () => void;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const actions = useOnsiteCatalogActions();
  const [form] = Form.useForm<OnsiteServiceInput>();

  const travelFeeMode = Form.useWatch("travelFeeMode", form) ?? initial.travelFeeMode;
  const addonEnabled = Form.useWatch("addonEnabled", form) ?? initial.addonEnabled;
  const priceCents = Form.useWatch("priceCents", form) ?? 0;
  const marketPriceCents = Form.useWatch("marketPriceCents", form) ?? 0;
  const materialFeeCents = Form.useWatch("materialFeeCents", form) ?? 0;
  const customTravelFeeCents = Form.useWatch("customTravelFeeCents", form) ?? 0;
  const coverImage = Form.useWatch("coverImage", form) ?? "";
  const detail = Form.useWatch("detail", form) ?? "";

  const categoryOptions = categories.map((item) => ({
    value: item.id,
    label: `${item.parentId ? "　" : ""}${item.name}${item.enabled ? "" : "（已停用）"}`,
  }));

  const submit = async () => {
    const values = await form.validateFields();
    if (!values.doorEnabled && !values.storeEnabled) {
      message.warning("上门与到店至少开一种，否则顾客下单时没有服务场景");
      return;
    }
    if (values.maxDurationMinutes > 0 && values.maxDurationMinutes < values.durationMinutes) {
      message.warning("最长可加到时若填写，需不小于标准时长");
      return;
    }
    await actions.saveService.mutateAsync({
      params: { id: String(shopId) },
      body: { ...values, id: serviceId || undefined },
    });
    message.success(
      serviceId
        ? "服务已保存，小程序端下次启动即生效"
        : "服务已创建（草稿），上架后顾客才能看到",
    );
    onClose();
  };

  return (
    <Form form={form} layout="vertical" initialValues={initial} style={{ maxWidth: 860 }}>
      <Divider orientation="horizontal" titlePlacement="left" plain>
        基础信息
      </Divider>
      <Form.Item
        name="title"
        label="服务名称"
        rules={[{ required: true, message: "请填写服务名称" }]}
        extra="小程序列表与详情页的标题"
      >
        <Input maxLength={120} placeholder="如：中式推拿 60 分钟" />
      </Form.Item>
      <Form.Item name="subtitle" label="副标题" extra="一句话卖点，可留空">
        <Input maxLength={160} />
      </Form.Item>
      <Form.Item
        name="categoryIds"
        label="所属分类"
        extra={`一个服务可挂多个分类（最多 ${CATEGORIES_MAX} 个），首页金刚区与分类页据此聚合`}
      >
        <Select
          mode="multiple"
          allowClear
          maxCount={CATEGORIES_MAX}
          optionFilterProp="label"
          showSearch
          placeholder={categories.length ? "选择分类" : "还没有分类"}
          options={categoryOptions}
        />
      </Form.Item>
      {!categories.length ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              本店还没有分类，服务会落在「未分类」，顾客端分类页是空的。
              <Button size="small" type="link" onClick={onOpenCategory}>
                去新建分类
              </Button>
            </span>
          }
        />
      ) : null}
      <Form.Item
        name="labelIds"
        label="服务卖点标签"
        extra={`详情页展示的短词，最多 ${LABELS_MAX} 个；标签本身在「标签」页签维护`}
      >
        <Select
          mode="multiple"
          allowClear
          maxCount={LABELS_MAX}
          optionFilterProp="label"
          placeholder={featureLabels.length ? "勾选卖点" : "还没有服务卖点标签，先去「标签」页签新建"}
          options={featureLabels.map((item) => ({
            value: item.id,
            label: item.enabled ? item.name : `${item.name}（已停用）`,
          }))}
        />
      </Form.Item>
      <Form.Item name="coverImage" label="封面图" extra="列表卡片与分享卡片用的那一张，填直链">
        <Input maxLength={500} placeholder="https://…" />
      </Form.Item>
      {coverImage ? (
        <RawImg
          src={coverImage}
          alt=""
          style={{
            width: 120,
            height: 120,
            borderRadius: 8,
            objectFit: "cover",
            marginBottom: 16,
          }}
        />
      ) : null}
      <Form.Item label="详情页图集" extra={`详情页轮播，最多 ${IMAGES_MAX} 张直链`}>
        <Form.List name="images">
          {(fields, { add, remove }) => (
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              {fields.map((field, index) => (
                <Space key={field.key} align="start">
                  <Form.Item name={field.name} noStyle>
                    <Input
                      maxLength={500}
                      placeholder={`第 ${index + 1} 张图直链`}
                      style={{ width: 420 }}
                    />
                  </Form.Item>
                  <Button size="small" onClick={() => remove(field.name)}>
                    移除
                  </Button>
                </Space>
              ))}
              <div>
                <Button size="small" disabled={fields.length >= IMAGES_MAX} onClick={() => add("")}>
                  添加图片
                </Button>
                <span className="muted text-12" style={{ marginLeft: 8 }}>
                  已加 {fields.length} / {IMAGES_MAX} 张
                </span>
              </div>
            </Space>
          )}
        </Form.List>
      </Form.Item>
      <Form.Item
        name="detail"
        label="服务详情正文"
        extra="可写 HTML 片段，小程序用 rich-text 渲染；一期不引入富文本编辑器"
      >
        <Input.TextArea
          rows={8}
          maxLength={60000}
          showCount
          placeholder="服务流程、适用人群、注意事项…"
        />
      </Form.Item>
      <Space wrap align="start">
        <Form.Item
          name="doorEnabled"
          label="支持上门服务"
          valuePropName="checked"
          extra="关掉后该服务只能到店"
          style={{ width: 180 }}
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name="storeEnabled"
          label="支持到店服务"
          valuePropName="checked"
          extra="两种都没开无法保存"
          style={{ width: 180 }}
        >
          <Switch />
        </Form.Item>
      </Space>

      <Divider orientation="horizontal" titlePlacement="left" plain>
        价格与时长
      </Divider>
      <Space wrap align="start">
        <Form.Item
          name="priceCents"
          label="服务价格（分）"
          rules={[{ required: true, message: "请填写服务价格" }]}
          extra={centsHint(priceCents)}
          style={{ width: 200 }}
        >
          <InputNumber min={0} max={99999999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="marketPriceCents"
          label="划线价（分）"
          extra={marketPriceCents ? `详情页原价 ${cents(marketPriceCents)} 划线` : "0 = 不展示划线价"}
          style={{ width: 200 }}
        >
          <InputNumber min={0} max={99999999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="materialFeeCents"
          label="耗材费（分）"
          extra={`下单按次加收，当前约 ${cents(materialFeeCents)}`}
          style={{ width: 200 }}
        >
          <InputNumber min={0} max={9999999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
      </Space>
      <Space wrap align="start">
        <Form.Item
          name="durationMinutes"
          label="标准时长（分钟）"
          rules={[{ required: true, message: "请填写标准时长" }]}
          extra="占用技师档期的长度"
          style={{ width: 200 }}
        >
          <InputNumber min={5} max={1440} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="maxDurationMinutes"
          label="最长可加到时（分钟）"
          extra="0 = 不设上限；填了需不小于标准时长"
          style={{ width: 200 }}
        >
          <InputNumber min={0} max={2880} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="salesVirtual"
          label="虚拟销量"
          extra="展示销量 = 虚拟 + 真实，真实值来自已完成订单"
          style={{ width: 200 }}
        >
          <InputNumber min={0} max={999999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
      </Space>
      <Space wrap align="start">
        <Form.Item
          name="addonEnabled"
          label="允许加钟"
          valuePropName="checked"
          style={{ width: 160 }}
        >
          <Switch />
        </Form.Item>
        {addonEnabled ? (
          <>
            <Form.Item
              name="addonUnitMinutes"
              label="加钟单位（分钟）"
              extra="顾客每次加钟增加的时长"
              style={{ width: 200 }}
            >
              <InputNumber min={5} max={240} precision={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              name="addonRate"
              label="加钟费率（%）"
              extra="100 = 按原价加收一个单位时长"
              style={{ width: 200 }}
            >
              <InputNumber min={0} max={300} precision={0} style={{ width: "100%" }} />
            </Form.Item>
          </>
        ) : null}
      </Space>
      <Space wrap align="start">
        <Form.Item name="travelFeeMode" label="车费口径" style={{ width: 280 }}>
          <Select
            options={ONSITE_TRAVEL_FEE_MODES.map((value) => ({
              value,
              label: TRAVEL_FEE_LABELS[value],
            }))}
          />
        </Form.Item>
        {travelFeeMode === "CUSTOM" ? (
          <Form.Item
            name="customTravelFeeCents"
            label="固定车费（分）"
            extra={centsHint(customTravelFeeCents)}
            style={{ width: 200 }}
          >
            <InputNumber min={0} max={999999} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        ) : (
          <span className="muted text-12" style={{ alignSelf: "center" }}>
            按城市规则计费：请到「店铺设置 → 城市与车费」为覆盖城市配规则
          </span>
        )}
      </Space>

      <Divider orientation="horizontal" titlePlacement="left" plain>
        上架与排序
      </Divider>
      <Space wrap align="start">
        <Form.Item
          name="status"
          label="上架状态"
          extra="与列表行的「上架 / 下架」同一口径"
          style={{ width: 200 }}
        >
          <Select
            options={ONSITE_SERVICE_STATUSES.map((value) => ({
              value,
              label: ONSITE_SERVICE_STATUS_LABELS[value],
            }))}
          />
        </Form.Item>
        <Form.Item name="sortOrder" label="排序值" extra="越小越靠前" style={{ width: 160 }}>
          <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
      </Space>
      <Form.Item label="当前配置">
        <Space wrap>
          {coverImage ? null : <Tag color="warning">没有封面图</Tag>}
          {initial.images.length ? <Tag>{initial.images.length} 张图集</Tag> : null}
          {detail ? <Tag>详情 {detail.length} 字符</Tag> : <Tag color="warning">详情为空</Tag>}
          {initial.categoryIds.length ? (
            <Tag>{initial.categoryIds.length} 个分类</Tag>
          ) : (
            <Tag color="warning">未分类</Tag>
          )}
          {initial.labelIds.length ? <Tag>{initial.labelIds.length} 个卖点</Tag> : null}
        </Space>
      </Form.Item>
      <Space wrap>
        <Button
          type="primary"
          loading={actions.saveService.isPending}
          onClick={() => void submit()}
        >
          保存服务
        </Button>
        <Button onClick={onClose}>取消</Button>
        <span className="muted text-12">
          保存只改本站数据、不用重新出包；价格与时长会影响顾客端算价，核对后再上架
        </span>
      </Space>
    </Form>
  );
}
