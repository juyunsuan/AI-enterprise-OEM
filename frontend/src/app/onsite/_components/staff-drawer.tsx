"use client";
// 技师档案抽屉：字段与契约 onsiteStaffInputSchema 一一对应；金额按整数分录入，旁边只给元的换算提示。
import {
  ONSITE_STAFF_STATUSES,
  type OnsiteCityRow,
  type OnsiteStaffInput,
  type OnsiteStaffLevelRow,
  type OnsiteStaffRow,
} from "@enterprise/contracts";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Avatar,
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
import { useOnsiteStaffActions, useOnsiteStaffDetail } from "@/query/onsite";
import { Notice } from "@/components/ui/panel";
import { cents, dayText, statusText, timeText } from "./onsite-common";

/** 契约里的数组上限与长度上限：先在前端拦住，省一次 400。 */
const LICENSE_MAX = 9;
const IMAGES_MAX = 12;
const INTRO_MAX = 2000;
const URL_MAX = 500;
const CLOCK_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 契约只约束 gender 取 0..2、没有文案字典，端上补齐。 */
const GENDER_OPTIONS = [
  { value: 0, label: "未填" },
  { value: 1, label: "男" },
  { value: 2, label: "女" },
];

const STATUS_OPTIONS = ONSITE_STAFF_STATUSES.map((value) => ({
  value,
  label: statusText("staff", value),
}));

const emptyStaff: OnsiteStaffInput = {
  name: "",
  gender: 0,
  phone: "",
  avatar: "",
  licenseImages: [],
  workYears: 0,
  intro: "",
  images: [],
  video: "",
  levelId: 0,
  cityId: 0,
  serviceCity: "",
  lng: 0,
  lat: 0,
  address: "",
  serviceStartAt: "09:00",
  serviceEndAt: "19:00",
  crossDay: false,
  dailyOrderLimit: 0,
  selfPriceEnabled: true,
  carFeeEnabled: false,
  carFeeCents: 0,
  recommendTop: false,
  sortTop: 0,
  locationEnabled: false,
  orderCountVirtual: 0,
  status: "ONLINE",
};

/** 详情行 → 录入体：只取 input schema 里的键，身份证密文不回显（留空即不改）。 */
function draftFromRow(row: OnsiteStaffRow): OnsiteStaffInput {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    phone: row.phone,
    avatar: row.avatar,
    licenseImages: row.licenseImages,
    workYears: row.workYears,
    intro: row.intro,
    images: row.images,
    video: row.video,
    levelId: row.levelId,
    cityId: row.cityId,
    serviceCity: row.serviceCity,
    lng: row.lng,
    lat: row.lat,
    address: row.address,
    serviceStartAt: row.serviceStartAt,
    serviceEndAt: row.serviceEndAt,
    crossDay: row.crossDay,
    dailyOrderLimit: row.dailyOrderLimit,
    selfPriceEnabled: row.selfPriceEnabled,
    carFeeEnabled: row.carFeeEnabled,
    carFeeCents: row.carFeeCents,
    recommendTop: row.recommendTop,
    sortTop: row.sortTop,
    locationEnabled: row.locationEnabled,
    orderCountVirtual: row.orderCountVirtual,
    status: row.status,
  };
}

export function StaffDrawer({
  open,
  shopId,
  staffId,
  levels,
  cities,
  onClose,
}: {
  open: boolean;
  shopId: number;
  staffId: number;
  levels: OnsiteStaffLevelRow[];
  cities: OnsiteCityRow[];
  onClose: () => void;
}) {
  const detailQuery = useOnsiteStaffDetail({ shopId }, staffId);
  const row = detailQuery.data;
  const initial = staffId > 0 ? (row ? draftFromRow(row) : null) : emptyStaff;

  return (
    <Drawer
      open={open}
      size={860}
      destroyOnHidden
      onClose={onClose}
      title={staffId > 0 ? `编辑技师：${row?.name || `#${staffId}`}` : "新增技师"}
    >
      {!open ? null : initial ? (
        <StaffForm
          key={`${shopId}-${staffId}`}
          shopId={shopId}
          staffId={staffId}
          row={row ?? null}
          initial={initial}
          levels={levels}
          cities={cities}
          onClose={onClose}
        />
      ) : detailQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message={`技师档案读取失败：${detailQuery.error.message || "请稍后重试"}`}
        />
      ) : (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin />
        </div>
      )}
    </Drawer>
  );
}

function StaffForm({
  shopId,
  staffId,
  row,
  initial,
  levels,
  cities,
  onClose,
}: {
  shopId: number;
  staffId: number;
  row: OnsiteStaffRow | null;
  initial: OnsiteStaffInput;
  levels: OnsiteStaffLevelRow[];
  cities: OnsiteCityRow[];
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const actions = useOnsiteStaffActions();
  const [form] = Form.useForm<OnsiteStaffInput>();
  const avatar = Form.useWatch("avatar", form) ?? "";
  const carFeeCents = Form.useWatch("carFeeCents", form) ?? 0;
  const carFeeEnabled = Form.useWatch("carFeeEnabled", form) ?? false;
  const status = Form.useWatch("status", form) ?? initial.status;

  const save = async (values: OnsiteStaffInput) => {
    const idCard = String(values.idCard ?? "").trim();
    await actions.saveStaff.mutateAsync({
      params: { id: String(shopId) },
      body: { ...values, id: staffId || undefined, idCard: idCard || undefined },
    });
    message.success(
      staffId
        ? "技师档案已保存，小程序端下次进入即生效"
        : "技师已创建；状态为「在岗」才会出现在小程序技师列表里",
    );
    onClose();
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initial}
      onFinish={(values) => void save(values)}
      style={{ maxWidth: 820 }}
    >
      <Divider orientation="horizontal" titlePlacement="left" plain>
        身份与联系方式
      </Divider>
      <Space wrap size={12} align="start">
        <Form.Item
          name="name"
          label="姓名"
          rules={[{ required: true, message: "请填写技师姓名" }]}
          style={{ width: 200 }}
        >
          <Input maxLength={60} placeholder="小程序技师列表展示的名字" />
        </Form.Item>
        <Form.Item name="gender" label="性别" style={{ width: 120 }}>
          <Select options={GENDER_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="phone"
          label="手机号"
          extra="本店唯一：与已有技师重复会被拒绝；成单后才向顾客展示"
          rules={[{ required: true, message: "请填写手机号" }]}
          style={{ width: 200 }}
        >
          <Input maxLength={32} />
        </Form.Item>
        <Form.Item
          name="idCard"
          label="身份证号"
          extra={
            row
              ? row.idCardConfigured
                ? `已录入（${row.idCardMasked}），留空表示不改动`
                : "尚未录入实名信息，填写后档案标记为已实名"
              : "留空即不做实名认证"
          }
          style={{ width: 220 }}
        >
          <Input maxLength={32} placeholder={row?.idCardConfigured ? "不改动请留空" : ""} />
        </Form.Item>
        <Form.Item
          name="avatar"
          label="头像地址"
          extra="技师列表与订单页的头像"
          style={{ width: 320 }}
        >
          <Input maxLength={URL_MAX} />
        </Form.Item>
        <Form.Item label="头像预览">
          <Avatar src={avatar || undefined} size={48}>
            {initial.name.slice(0, 1) || "技"}
          </Avatar>
        </Form.Item>
      </Space>

      <Divider orientation="horizontal" titlePlacement="left" plain>
        展示资料
      </Divider>
      <Form.Item
        name="intro"
        label="个人简介"
        extra={`小程序详情页正文，最多 ${INTRO_MAX} 字`}
      >
        <Input.TextArea rows={3} maxLength={INTRO_MAX} showCount />
      </Form.Item>
      <Space wrap size={12} align="start">
        <Form.Item name="workYears" label="从业年限" style={{ width: 140 }}>
          <InputNumber style={{ width: "100%" }} min={0} max={60} />
        </Form.Item>
        <Form.Item
          name="video"
          label="介绍视频地址"
          extra="留空即不展示视频"
          style={{ width: 340 }}
        >
          <Input maxLength={URL_MAX} />
        </Form.Item>
        <Form.Item
          name="levelId"
          label="等级"
          extra="排期看板与技师卡片显示的等级名取自这里，分成与加钟费率按档位留档"
          style={{ width: 180 }}
        >
          <Select
            options={[
              { value: 0, label: "未定级" },
              ...levels.map((level) => ({ value: level.id, label: level.name })),
            ]}
          />
        </Form.Item>
      </Space>
      {!levels.length ? (
        <Notice variant="warn">
          本店还没有技师等级：技师只能留在「未定级」，分成与加钟的档位口径也无从记起。
          先切到旁边的「等级」页签建一档，再回来给技师选上。
        </Notice>
      ) : null}

      <Divider orientation="horizontal" titlePlacement="left" plain>
        照片与资质证书
      </Divider>
      <UrlArrayField
        name="images"
        label="相册"
        max={IMAGES_MAX}
        extra={`小程序技师详情页轮播，最多 ${IMAGES_MAX} 张`}
      />
      <UrlArrayField
        name="licenseImages"
        label="资质证书"
        max={LICENSE_MAX}
        extra={`如健康证、职业资格证，最多 ${LICENSE_MAX} 张；只用于你自查与顾客信任展示`}
      />

      <Divider orientation="horizontal" titlePlacement="left" plain>
        服务城市与常驻位置
      </Divider>
      <Space wrap size={12} align="start">
        <Form.Item
          name="cityId"
          label="归属城市"
          extra="用于列表筛选与车费口径；不选也能保存"
          style={{ width: 200 }}
        >
          <Select
            options={[
              { value: 0, label: "不限城市" },
              ...cities.map((city) => ({ value: city.id, label: city.name })),
            ]}
          />
        </Form.Item>
        <Form.Item name="serviceCity" label="服务城市文案" style={{ width: 180 }}>
          <Input maxLength={60} placeholder="例：上海 浦东新区" />
        </Form.Item>
        <Form.Item
          name="address"
          label="常驻地址"
          extra="算车费的起点之一，不对顾客公开展示"
          style={{ width: 320 }}
        >
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="lng" label="常驻经度" style={{ width: 150 }}>
          <InputNumber style={{ width: "100%" }} step={0.0001} min={-180} max={180} />
        </Form.Item>
        <Form.Item name="lat" label="常驻纬度" style={{ width: 150 }}>
          <InputNumber style={{ width: "100%" }} step={0.0001} min={-90} max={90} />
        </Form.Item>
      </Space>
      {!cities.length ? (
        <Notice variant="info">
          还没开通城市：这里可以先只填「服务城市文案」与常驻坐标，车费仍按店铺默认口径计算；
          要按城市差异化车费，请到「城市与车费」里开通城市后再回来关联。
        </Notice>
      ) : null}

      <Divider orientation="horizontal" titlePlacement="left" plain>
        可服务时段与接单上限
      </Divider>
      <Space wrap size={12} align="start">
        <Form.Item
          name="serviceStartAt"
          label="可服务开始（HH:mm）"
          rules={[
            { required: true, message: "请填写开始时间" },
            { pattern: CLOCK_PATTERN, message: "时段需为 HH:mm" },
          ]}
          style={{ width: 170 }}
        >
          <Input maxLength={5} placeholder="09:00" />
        </Form.Item>
        <Form.Item
          name="serviceEndAt"
          label="可服务结束（HH:mm）"
          dependencies={["serviceStartAt", "crossDay"]}
          rules={[
            { required: true, message: "请填写结束时间" },
            { pattern: CLOCK_PATTERN, message: "时段需为 HH:mm" },
            {
              validator: (_, value) => {
                const start = form.getFieldValue("serviceStartAt");
                if (form.getFieldValue("crossDay")) return Promise.resolve();
                if (typeof value !== "string" || typeof start !== "string") {
                  return Promise.resolve();
                }
                return value <= start
                  ? Promise.reject(new Error("结束需晚于开始；夜班请打开「跨零点」"))
                  : Promise.resolve();
              },
            },
          ]}
          style={{ width: 170 }}
        >
          <Input maxLength={5} placeholder="19:00" />
        </Form.Item>
        <Form.Item
          name="crossDay"
          label="跨零点夜班"
          valuePropName="checked"
          extra="打开后结束早于开始视为次日"
          style={{ width: 150 }}
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name="dailyOrderLimit"
          label="每日接单上限"
          extra="0 = 不限；达到上限后当天时间片全部置灰"
          style={{ width: 160 }}
        >
          <InputNumber style={{ width: "100%" }} min={0} max={50} />
        </Form.Item>
        <Form.Item
          name="selfPriceEnabled"
          label="允许技师自定服务价"
          valuePropName="checked"
          extra="关闭后一律按服务上的标价"
          style={{ width: 190 }}
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name="carFeeEnabled"
          label="允许技师自定车费"
          valuePropName="checked"
          extra="关闭后按城市/服务车费口径"
          style={{ width: 190 }}
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name="carFeeCents"
          label="技师自定车费（分）"
          extra={
            carFeeEnabled
              ? `当前等于 ${cents(carFeeCents)}；例 15 元填 1500`
              : "上面的自定车费开关关闭时不参与计价"
          }
          style={{ width: 180 }}
        >
          <InputNumber style={{ width: "100%" }} min={0} max={999999} />
        </Form.Item>
        <Form.Item
          name="locationEnabled"
          label="允许采集定位"
          valuePropName="checked"
          extra={
            row?.lastLocationAt
              ? `最近一次定位上报 ${timeText(row.lastLocationAt)}`
              : "开启后技师端上报位置，用于安全与距离核对"
          }
          style={{ width: 170 }}
        >
          <Switch />
        </Form.Item>
      </Space>

      <Divider orientation="horizontal" titlePlacement="left" plain>
        小程序排序、销量与状态
      </Divider>
      <Space wrap size={12} align="start">
        <Form.Item
          name="recommendTop"
          label="推荐位置顶"
          valuePropName="checked"
          extra="技师列表第一位"
          style={{ width: 150 }}
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name="sortTop"
          label="手工排序值"
          extra="数字越大越靠前"
          style={{ width: 150 }}
        >
          <InputNumber style={{ width: "100%" }} min={0} max={9999} />
        </Form.Item>
        <Form.Item
          name="orderCountVirtual"
          label="虚拟单量"
          extra={`与真实单量相加对外展示；真实单量 ${row?.orderCountTrue ?? 0} 单，由完成的服务累计`}
          style={{ width: 180 }}
        >
          <InputNumber style={{ width: "100%" }} min={0} max={999999} />
        </Form.Item>
        <Form.Item
          name="status"
          label="接单状态"
          extra={
            status === "ONLINE"
              ? "在岗：会出现在小程序技师列表与排期看板"
              : "非在岗：小程序技师列表、排期与派单候选都会把他排除"
          }
          style={{ width: 180 }}
        >
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Space>

      {row ? (
        <Notice variant="info">
          当前档案：技师编号 {row.staffNo}，评分 {row.rating.toFixed(1)}（{row.reviewCount} 条评价），
          已配置差异价的服务 {row.serviceCount} 个，实名认证 {row.authStatus === "VERIFIED" ? "已完成" : "未完成"}，
          来源 {row.source === "APPLY" ? "技师自助报名" : "店主录入"}
          {row.reviewRemark ? `，上次审核意见：${row.reviewRemark}` : ""}。
        </Notice>
      ) : null}
      {row?.hasPendingProfile ? (
        <Notice variant="warn">
          该技师有 {row.pendingDiff.length} 项资料变更待审核（
          {row.pendingDiff.map((item) => item.label).join("、")}）：
          审核通过前小程序端仍展示旧内容，请到列表行的「资料审核」处理。
        </Notice>
      ) : null}

      <Space style={{ marginTop: 16 }} wrap>
        <Button type="primary" htmlType="submit" loading={actions.saveStaff.isPending}>
          保存技师
        </Button>
        <Button onClick={onClose}>取消</Button>
        {staffId > 0 ? (
          <Tag>
            建档 {row ? dayText(row.createdAt) : "—"}
          </Tag>
        ) : (
          <span className="muted text-12">
            新建即建档，不用重新出包；小程序端下次进入就能看到。
          </span>
        )}
      </Space>
    </Form>
  );
}

/**
 * 图片地址数组（Form.List）：契约里 images / licenseImages 都是纯字符串数组，
 * 所以每一项直接用下标做字段路径，不再套对象。
 */
function UrlArrayField({
  name,
  label,
  max,
  extra,
}: {
  name: "images" | "licenseImages";
  label: string;
  max: number;
  extra: string;
}) {
  return (
    <Form.Item label={label} extra={`${extra}（每项一个地址，留空的项保存时会被忽略）`}>
      <Form.List
        name={name}
        rules={[
          {
            validator: (_, value) =>
              Array.isArray(value) && value.length > max
                ? Promise.reject(new Error(`${label}最多 ${max} 张`))
                : Promise.resolve(),
          },
        ]}
      >
        {(fields, { add, remove }) => (
          <div>
            {fields.map((field) => (
              <Space key={field.key} align="baseline">
                <Form.Item
                  name={[field.name]}
                  rules={[{ max: URL_MAX, message: `地址最长 ${URL_MAX} 字符` }]}
                  style={{ marginBottom: 8, minWidth: 460 }}
                >
                  <Input maxLength={URL_MAX} placeholder="图片地址（数字资产或对象存储外链）" />
                </Form.Item>
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<MinusCircleOutlined aria-hidden />}
                  onClick={() => remove(field.name)}
                >
                  移除
                </Button>
              </Space>
            ))}
            <Button
              type="dashed"
              icon={<PlusOutlined aria-hidden />}
              disabled={fields.length >= max}
              onClick={() => add("")}
            >
              添加{label}（{fields.length}/{max}）
            </Button>
          </div>
        )}
      </Form.List>
    </Form.Item>
  );
}
