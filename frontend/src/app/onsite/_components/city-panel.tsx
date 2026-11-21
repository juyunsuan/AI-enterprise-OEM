"use client";
// 城市与车费页签：开通城市（省市区三级 + 中心点）与按城市的车费规则，附带一段「试算」用于自检。
import {
  type OnsiteCityInput,
  type OnsiteCityRow,
  type OnsiteFeeEstimateInput,
  type OnsiteFeeRuleInput,
  type OnsiteFeeRuleRow,
} from "@enterprise/contracts";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import { useState } from "react";
import {
  useOnsiteCities,
  useOnsiteCityActions,
  useOnsiteFeeRules,
} from "@/query/onsite";
import { Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import { cents, statusText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const CITY_LEVELS = [
  { value: "PROVINCE", label: "省" },
  { value: "CITY", label: "市" },
  { value: "DISTRICT", label: "区县" },
];

const emptyCity: OnsiteCityInput = {
  parentId: 0,
  name: "",
  level: "CITY",
  provinceCode: "",
  cityCode: "",
  areaCode: "",
  lng: 0,
  lat: 0,
  enabled: true,
  sortOrder: 0,
};

const emptyRule: OnsiteFeeRuleInput = {
  cityId: 0,
  freeKilometers: 0,
  startFeeCents: 0,
  startKilometers: 0,
  pricePerKilometerCents: 0,
  virtualExtraKilometers: 0,
  publicTransitEnabled: false,
  minFeeCents: 0,
  enabled: true,
};

export function CityPanel() {
  const { shopId, shop } = useOnsiteScope();
  const { message, modal } = App.useApp();
  const actions = useOnsiteCityActions();
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [editingCity, setEditingCity] = useState<OnsiteCityRow | null>(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<OnsiteFeeRuleRow | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [cityForm] = Form.useForm<OnsiteCityInput>();
  const [ruleForm] = Form.useForm<OnsiteFeeRuleInput>();
  const [estimateForm] = Form.useForm<OnsiteFeeEstimateInput>();
  const citiesQuery = useOnsiteCities({ shopId }, keyword);
  const rulesQuery = useOnsiteFeeRules({ shopId });
  const cities = citiesQuery.data?.list ?? [];
  const rules = rulesQuery.data?.list ?? [];
  const trade = shop?.trade;

  const openCity = (row?: OnsiteCityRow) => {
    cityForm.setFieldsValue(
      row
        ? {
            id: row.id,
            parentId: row.parentId,
            name: row.name,
            level: row.level as OnsiteCityInput["level"],
            provinceCode: row.provinceCode,
            cityCode: row.cityCode,
            areaCode: row.areaCode,
            lng: row.lng,
            lat: row.lat,
            enabled: row.enabled,
            sortOrder: row.sortOrder,
          }
        : { ...emptyCity },
    );
    setEditingCity(row ?? null);
    setCityOpen(true);
  };

  const saveCity = async (values: OnsiteCityInput) => {
    await actions.saveCity.mutateAsync({
      params: { id: String(shopId) },
      body: { ...values, id: editingCity?.id ?? values.id },
    });
    message.success(editingCity ? "城市已更新" : "城市已开通");
    setCityOpen(false);
  };

  const openRule = (row?: OnsiteFeeRuleRow) => {
    ruleForm.setFieldsValue(row ? { ...row } : { ...emptyRule });
    setEditingRule(row ?? null);
    setRuleOpen(true);
  };

  const saveRule = async (values: OnsiteFeeRuleInput) => {
    await actions.saveFeeRule.mutateAsync({
      params: { id: String(shopId) },
      body: { ...values, id: editingRule?.id ?? values.id },
    });
    message.success("车费规则已保存，只对之后的订单生效，历史订单金额不改");
    setRuleOpen(false);
  };

  const runEstimate = async (values: OnsiteFeeEstimateInput) => {
    const result = await actions.estimateFee.mutateAsync({
      params: { id: String(shopId) },
      body: values,
    });
    if (!result) return;
    modal.info({
      title: `试算结果：${cents(result.feeCents)}`,
      content: (
        <div>
          <div>距离 {result.kilometers.toFixed(2)} 公里（{result.distanceMeters} 米）</div>
          <div>
            距离来源 <Tag>{statusText("feeSource", result.source)}</Tag>
            命中规则 {result.ruleHit || "—"}
          </div>
          {result.note ? <div className="muted">{result.note}</div> : null}
        </div>
      ),
    });
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel title="开通城市">
        <FilterBar
          action={
            <Button type="primary" onClick={() => openCity()}>
              新增城市
            </Button>
          }
        >
          <Input.Search
            allowClear
            placeholder="按名称搜索"
            style={{ width: 220 }}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
        </FilterBar>
        <DataTable
          rows={cities}
          page={page}
          loading={citiesQuery.isFetching}
          onPage={setPage}
          columns={[
            { title: "名称", dataIndex: "name" },
            {
              title: "层级",
              dataIndex: "level",
              render: (value: string) => (
                <Tag>{CITY_LEVELS.find((item) => item.value === value)?.label ?? value}</Tag>
              ),
            },
            { title: "区划码", render: (_, row) => row.areaCode || row.cityCode || row.provinceCode || "—" },
            {
              title: "中心点",
              render: (_, row) => (row.lng && row.lat ? `${row.lng.toFixed(4)}, ${row.lat.toFixed(4)}` : "未填"),
            },
            { title: "技师", dataIndex: "staffCount" },
            {
              title: "车费规则",
              render: (_, row) => {
                const rule = rules.find((item) => item.id === row.ruleId);
                return rule
                  ? `起步 ${cents(rule.startFeeCents)} / ${rule.startKilometers}km 起 ${cents(rule.pricePerKilometerCents)}/km`
                  : "沿用店铺默认";
              },
            },
            {
              title: "状态",
              dataIndex: "enabled",
              render: (value: boolean) => (value ? <Tag color="green">已启用</Tag> : <Tag>已停用</Tag>),
            },
            {
              title: "操作",
              render: (_, row) => (
                <Space size={4}>
                  <Button type="link" size="small" onClick={() => openCity(row)}>
                    编辑
                  </Button>
                  <Popconfirm
                    title="移除城市"
                    description="移除后该城市顾客不可下单；已产生的订单不受影响。"
                    okText="确认移除"
                    cancelText="再想想"
                    onConfirm={() =>
                      void actions.removeCity.mutateAsync({
                        params: { id: String(shopId) },
                        body: { id: row.id },
                      })
                    }
                  >
                    <Button type="link" size="small" danger>
                      移除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
        {cities.length === 0 && !citiesQuery.isFetching ? (
          <Notice variant="warn">
            还没开通城市：小程序端顾客选不到服务地址、技师也归不到城市。先加一个地级市，再给它配车费规则。
          </Notice>
        ) : null}
      </Panel>

      <Panel title="车费规则">
        <FilterBar
          action={
            <Button type="primary" onClick={() => openRule()}>
              新增规则
            </Button>
          }
        >
          <span className="muted">
            车费口径来自店铺交易参数：
            {trade?.travelFeeEnabled ? "已开启收取车费" : "已关闭车费（订单不算距离）"}
            ，地图算不出时兜底 {cents(trade?.travelFeeFallbackCents ?? 0)}。
          </span>
        </FilterBar>
        <DataTable
          rows={rules}
          page={1}
          loading={rulesQuery.isFetching}
          columns={[
            { title: "城市", render: (_, row) => row.cityName || "全店默认" },
            { title: "免运费里程", render: (_, row) => `${row.freeKilometers} km` },
            { title: "起步价", render: (_, row) => cents(row.startFeeCents) },
            {
              title: "起步里程",
              render: (_, row) => `${row.startKilometers} km`,
            },
            {
              title: "超出每公里",
              render: (_, row) => cents(row.pricePerKilometerCents),
            },
            {
              title: "最低收费",
              render: (_, row) => (row.minFeeCents ? cents(row.minFeeCents) : "—"),
            },
            {
              title: "虚拟号额外里程",
              render: (_, row) => (row.virtualExtraKilometers ? `+${row.virtualExtraKilometers} km` : "—"),
            },
            {
              title: "公交换乘",
              render: (_, row) => (row.publicTransitEnabled ? <Tag color="blue">按公交折算</Tag> : <Tag>直线</Tag>),
            },
            {
              title: "状态",
              render: (_, row) => (row.enabled ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
            },
            {
              title: "操作",
              render: (_, row) => (
                <Space size={4}>
                  <Button type="link" size="small" onClick={() => openRule(row)}>
                    编辑
                  </Button>
                  <Popconfirm
                    title="删除规则"
                    description="删除后该城市回落到店铺默认车费口径。"
                    okText="确认删除"
                    cancelText="再想想"
                    onConfirm={() =>
                      void actions.removeFeeRule.mutateAsync({
                        params: { id: String(shopId) },
                        body: { id: row.id },
                      })
                    }
                  >
                    <Button type="link" size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="车费试算">
        <Form form={estimateForm} layout="inline" onFinish={(values) => void runEstimate(values)}>
          <Form.Item name="fromLng" label="技师经度" rules={[{ required: true, message: "必填" }]}>
            <InputNumber style={{ width: 120 }} step={0.0001} />
          </Form.Item>
          <Form.Item name="fromLat" label="技师纬度" rules={[{ required: true, message: "必填" }]}>
            <InputNumber style={{ width: 120 }} step={0.0001} />
          </Form.Item>
          <Form.Item name="toLng" label="顾客经度" rules={[{ required: true, message: "必填" }]}>
            <InputNumber style={{ width: 120 }} step={0.0001} />
          </Form.Item>
          <Form.Item name="toLat" label="顾客纬度" rules={[{ required: true, message: "必填" }]}>
            <InputNumber style={{ width: 120 }} step={0.0001} />
          </Form.Item>
          <Form.Item name="cityId" label="城市">
            <Select
              allowClear
              style={{ width: 160 }}
              placeholder="按城市规则"
              options={cities.map((city) => ({ value: city.id, label: city.name }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={actions.estimateFee.isPending}>
            试算
          </Button>
        </Form>
        <div className="muted" style={{ marginTop: 8 }}>
          试算不落库，只用来核对「同一对坐标在你当前规则下会收多少车费」。
        </div>
      </Panel>

      <Modal
        title={editingCity ? `编辑城市：${editingCity.name}` : "新增开通城市"}
        open={cityOpen}
        onCancel={() => setCityOpen(false)}
        onOk={() => cityForm.submit()}
        confirmLoading={actions.saveCity.isPending}
        destroyOnHidden
        width={640}
      >
        <Form form={cityForm} layout="vertical" onFinish={(values) => void saveCity(values)}>
          <Space wrap size={12}>
            <Form.Item
              name="name"
              label="名称"
              rules={[{ required: true, message: "请填写城市名称" }]}
            >
              <Input style={{ width: 200 }} maxLength={60} />
            </Form.Item>
            <Form.Item name="level" label="层级">
              <Select style={{ width: 120 }} options={CITY_LEVELS} />
            </Form.Item>
            <Form.Item name="parentId" label="上级编号" extra="市填省的编号，区县填市的编号；顶层填 0">
              <InputNumber style={{ width: 120 }} min={0} />
            </Form.Item>
            <Form.Item name="provinceCode" label="省区划码">
              <Input style={{ width: 120 }} maxLength={12} />
            </Form.Item>
            <Form.Item name="cityCode" label="市区划码">
              <Input style={{ width: 120 }} maxLength={12} />
            </Form.Item>
            <Form.Item name="areaCode" label="区县区划码">
              <Input style={{ width: 120 }} maxLength={12} />
            </Form.Item>
            <Form.Item name="lng" label="中心点经度" extra="用于算不出精确距离时的城市中心兜底">
              <InputNumber style={{ width: 140 }} step={0.0001} min={-180} max={180} />
            </Form.Item>
            <Form.Item name="lat" label="中心点纬度">
              <InputNumber style={{ width: 140 }} step={0.0001} min={-90} max={90} />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序">
              <InputNumber style={{ width: 100 }} min={0} max={9999} />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        title={editingRule ? "编辑车费规则" : "新增车费规则"}
        open={ruleOpen}
        onCancel={() => setRuleOpen(false)}
        onOk={() => ruleForm.submit()}
        confirmLoading={actions.saveFeeRule.isPending}
        destroyOnHidden
        width={640}
      >
        <Form form={ruleForm} layout="vertical" onFinish={(values) => void saveRule(values)}>
          <Form.Item name="cityId" label="适用城市" extra="选「全店默认」表示没有单独规则的城市都用这套">
            <Select
              style={{ width: 220 }}
              options={[
                { value: 0, label: "全店默认" },
                ...cities.map((city) => ({ value: city.id, label: city.name })),
              ]}
            />
          </Form.Item>
          <Space wrap size={12}>
            <Form.Item name="freeKilometers" label="免运费里程（km）" extra="此距离内不收车费">
              <InputNumber style={{ width: 130 }} min={0} max={100} step={0.01} />
            </Form.Item>
            <Form.Item name="startFeeCents" label="起步价（分）" extra="例：15 元填 1500">
              <InputNumber style={{ width: 130 }} min={0} max={999999} />
            </Form.Item>
            <Form.Item name="startKilometers" label="起步含里程（km）">
              <InputNumber style={{ width: 130 }} min={0} max={100} step={0.01} />
            </Form.Item>
            <Form.Item name="pricePerKilometerCents" label="超出每公里（分）">
              <InputNumber style={{ width: 130 }} min={0} max={999999} />
            </Form.Item>
            <Form.Item name="minFeeCents" label="最低车费（分）">
              <InputNumber style={{ width: 130 }} min={0} max={999999} />
            </Form.Item>
            <Form.Item
              name="virtualExtraKilometers"
              label="虚拟号额外里程（km）"
              extra="公交换乘场景给司机的余量，0 表示不加"
            >
              <InputNumber style={{ width: 130 }} min={0} max={100} step={0.01} />
            </Form.Item>
            <Form.Item name="publicTransitEnabled" label="按公交换乘折算" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
