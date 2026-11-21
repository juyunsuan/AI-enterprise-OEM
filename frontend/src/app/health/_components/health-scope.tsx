"use client";

import { App, Button, Form, Input, Modal, Select, Spin } from "antd";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { HealthMeta, HealthOverview, HealthShopRow } from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { Notice, Panel } from "@/components/ui/panel";

/**
 * 健康管理的作用域：店铺（shopId）是多租户边界，所有页签共用同一个 id。
 *
 * `shopId` 只从 query string 取，缺省落到第一家店：通知与收藏里的
 * `/health?shopId=3&tab=order` 能直接打开对应店铺，不存在第二份状态源。
 * 没有店铺时整页拦成开店引导——先建店，才谈得上机构、号源与订单。
 */
type ScopeValue = {
  shopId: number;
  shop: HealthShopRow | null;
  shops: HealthShopRow[];
  meta: HealthMeta | null;
  overview: HealthOverview | null;
  selectShop: (shopId: number) => void;
  reload: () => Promise<void>;
};

const ScopeContext = createContext<ScopeValue>({
  shopId: 0,
  shop: null,
  shops: [],
  meta: null,
  overview: null,
  selectShop: () => {},
  reload: async () => {},
});

export const useHealthScope = () => useContext(ScopeContext);
/** 页签内直接拿当前店铺 id；0 表示还没有店铺（外层已拦成开店引导）。 */
export const useHealthShopId = () => useContext(ScopeContext).shopId;
export const useHealthMeta = () => useContext(ScopeContext).meta;

export function HealthScope({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/health";
  const params = useSearchParams();
  const { message } = App.useApp();
  const [shops, setShops] = useState<HealthShopRow[]>([]);
  const [meta, setMeta] = useState<HealthMeta | null>(null);
  const [overview, setOverview] = useState<HealthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [shopRows, metaRow, overviewRow] = await Promise.all([
        healthApi.shops(),
        healthApi.meta(),
        healthApi.overview(),
      ]);
      setShops(shopRows ?? []);
      setMeta(metaRow ?? null);
      setOverview(overviewRow ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "健康管理信息读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const wanted = Number(params.get("shopId") || 0);
  const shopId = useMemo(() => {
    if (shops.some((item) => item.id === wanted)) return wanted;
    return shops[0]?.id ?? 0;
  }, [shops, wanted]);
  const shop = shops.find((item) => item.id === shopId) ?? null;

  const selectShop = useCallback(
    (next: number) => {
      const qs = new URLSearchParams(params.toString());
      qs.set("shopId", String(next));
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  if (loading && !shops.length) {
    return (
      <Panel title="健康管理">
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="健康管理">
        <Notice variant="error">{error}</Notice>
      </Panel>
    );
  }

  if (!shops.length) {
    const blocked = !overview?.open;
    return (
      <Panel title="开通健康管理小程序">
        <div style={{ display: "grid", gap: 14, maxWidth: 560 }}>
          <Notice variant={blocked ? "warn" : "info"}>
            {blocked
              ? "平台当前未开放健康管理板块；待平台开放后即可自助建店。"
              : "每个账号可开通一家健康管理店铺，对应一部独立小程序：机构与医护入驻、号源挂号、问诊、档案随访、体检、药品器械商城与分账提现都在店内完成，数据与其它工具互不影响。"}
          </Notice>
          <div>
            <Button type="primary" disabled={blocked} onClick={() => setCreating(true)}>
              新建健康管理店铺
            </Button>
          </div>
        </div>
        <Modal
          title="新建健康管理店铺"
          open={creating}
          onCancel={() => setCreating(false)}
          footer={null}
          destroyOnHidden
        >
          <Form
            layout="vertical"
            onFinish={async (values: Record<string, string>) => {
              setSaving(true);
              try {
                const created = await healthApi.shopCreate({
                  body: {
                    name: String(values.name || "").trim(),
                    city: String(values.city || "").trim(),
                    servicePhone: String(values.servicePhone || "").trim(),
                  },
                });
                message.success("店铺已创建：下一步绑定微信凭据并完善机构与医护");
                setCreating(false);
                await load();
                if (created?.id) selectShop(created.id);
              } catch (cause) {
                message.error(cause instanceof Error ? cause.message : "创建失败");
              } finally {
                setSaving(false);
              }
            }}
          >
            <Form.Item
              name="name"
              label="店铺名称"
              rules={[{ required: true, message: "请填写店铺名称" }]}
            >
              <Input maxLength={120} placeholder="例如：某某互联网医院" />
            </Form.Item>
            <Form.Item name="city" label="主营城市">
              <Input maxLength={60} placeholder="例如：杭州" />
            </Form.Item>
            <Form.Item name="servicePhone" label="客服电话">
              <Input maxLength={32} placeholder="顾客端展示的服务电话" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={saving}>
              创建
            </Button>
          </Form>
        </Modal>
      </Panel>
    );
  }

  return (
    <ScopeContext.Provider
      value={{ shopId, shop, shops, meta, overview, selectShop, reload: load }}
    >
      {children}
    </ScopeContext.Provider>
  );
}

/** 页头右侧的店铺切换器：只有一家店时不占位置，多店（含被邀为员工）时才需要切换。 */
export function ShopSwitcher() {
  const { shops, shopId, selectShop } = useHealthScope();
  if (shops.length <= 1) return null;
  return (
    <Select
      size="small"
      value={shopId}
      style={{ minWidth: 180 }}
      onChange={selectShop}
      options={shops.map((item) => ({
        value: item.id,
        label: `${item.name}（${item.shopCode}）`,
      }))}
    />
  );
}
