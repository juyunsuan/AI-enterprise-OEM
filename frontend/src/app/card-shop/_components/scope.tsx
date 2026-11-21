"use client";

import { App, Button, Form, Input, Modal, Spin } from "antd";
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
import type { CardShopMeta, CardShopSite } from "@enterprise/contracts";
import { cardShopApi } from "@/api/card-shop";
import { Notice, Panel } from "@/components/ui/panel";

/**
 * 卡密商城的作用域：一个账号一家商店，所有页签共用同一个 `siteId`。
 *
 * `siteId` 只从 query string 取，缺省落到自己的那家店：收藏的链接
 * `/card-shop?siteId=12&tab=goods` 能直接打开，不存在第二份状态源。
 * 没有商店时整页拦成开通引导——先建店，再谈分类/商品/卡密。
 */
type ScopeValue = {
  siteId: number;
  site: CardShopSite | null;
  sites: CardShopSite[];
  meta: CardShopMeta | null;
  selectSite: (siteId: number) => void;
  /** 站点增删改后重拉列表与元信息（配额计数会变）。 */
  reload: () => Promise<void>;
  tab: string;
  setTab: (tab: string) => void;
};

const ScopeContext = createContext<ScopeValue>({
  siteId: 0,
  site: null,
  sites: [],
  meta: null,
  selectSite: () => {},
  reload: async () => {},
  tab: "overview",
  setTab: () => {},
});

export const useCardShopScope = () => useContext(ScopeContext);
/** 页签内直接拿当前站点 id；0 表示还没有站点（外层已拦成开通引导）。 */
export const useCardShopSiteId = () => useContext(ScopeContext).siteId;

export function CardShopScope({
  tab,
  setTab,
  children: render,
}: {
  tab: string;
  setTab: (tab: string) => void;
  children: (scope: ScopeValue) => ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/card-shop";
  const params = useSearchParams();
  const { message } = App.useApp();
  const [sites, setSites] = useState<CardShopSite[]>([]);
  const [meta, setMeta] = useState<CardShopMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [siteRows, metaRow] = await Promise.all([
        cardShopApi.sites(),
        cardShopApi.meta(),
      ]);
      setSites(siteRows ?? []);
      setMeta(metaRow ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "卡密商城信息读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const wanted = Number(params.get("siteId") || 0);
  const siteId = useMemo(() => {
    if (sites.some((item) => item.id === wanted)) return wanted;
    return sites[0]?.id ?? 0;
  }, [sites, wanted]);
  const site = sites.find((item) => item.id === siteId) ?? null;

  const selectSite = useCallback(
    (next: number) => {
      const qs = new URLSearchParams(params.toString());
      qs.set("siteId", String(next));
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const scope: ScopeValue = {
    siteId,
    site,
    sites,
    meta,
    selectSite,
    reload: load,
    tab,
    setTab,
  };

  if (loading && !sites.length) {
    return (
      <Panel title="卡密商城">
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="卡密商城">
        <Notice variant="error">{error}</Notice>
      </Panel>
    );
  }

  if (!sites.length) {
    return (
      <Panel title="先建一个卡密商店">
        <div style={{ display: "grid", gap: 12 }}>
          <Notice variant="info">
            卡密商城用于自动发卡：导入卡密 → 上架商品 → 买家在小程序下单付款后立即拿到卡密。
            收款进你自己的微信商户号，平台不经手资金。
          </Notice>
          <div>
            <Button type="primary" onClick={() => setCreating(true)}>
              新建商店
            </Button>
          </div>
        </div>
        <Modal
          title="新建卡密商店"
          open={creating}
          onCancel={() => setCreating(false)}
          footer={null}
          destroyOnHidden
        >
          <Form
            layout="vertical"
            onFinish={async (values: { name: string }) => {
              try {
                const created = await cardShopApi.siteCreate({
                  body: { name: String(values.name || "").trim() },
                });
                message.success("商店已创建");
                setCreating(false);
                await load();
                if (created?.id) selectSite(created.id);
              } catch (cause) {
                message.error(cause instanceof Error ? cause.message : "创建失败");
              }
            }}
          >
            <Form.Item
              name="name"
              label="商店名称"
              rules={[{ required: true, message: "请填写商店名称" }]}
            >
              <Input maxLength={120} placeholder="例如：某某卡密小店" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>
              创建
            </Button>
          </Form>
        </Modal>
      </Panel>
    );
  }

  return (
    <ScopeContext.Provider value={scope}>{render(scope)}</ScopeContext.Provider>
  );
}
