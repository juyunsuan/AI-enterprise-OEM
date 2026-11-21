"use client";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Spin } from "antd";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  Suspense,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { OnsiteOverview, OnsiteShopRow } from "@enterprise/contracts";
import { useOnsiteOverview, useOnsiteShops } from "@/query/onsite";
import { ColumnSwitch, Notice, PageHero, Panel } from "@/components/ui/panel";
import {
  LEGACY_TAB_ROUTE,
  ONSITE_NAV,
  withShop,
  type OnsiteNavKey,
} from "./onsite-common";
import { ShopOnboarding } from "./shop-onboarding";

/**
 * 上门服务小程序工具的页面外壳：板块导航 + 「没有店铺」拦截。
 *
 * 一个账号只有一家店铺（不开放多开），所以没有店铺切换器：shopId 从 query string
 * 取只为兼容站内通知与收藏里的老链接，实际一律落到这家店，不存在第二份状态源。
 * 早期单页四页签留下的 `?tab=` 深链（已入库的通知）在这里换成新路由。
 */
type OnsiteScopeValue = {
  shopId: number;
  shop: OnsiteShopRow | null;
  overview: OnsiteOverview | null;
  reloadOverview: () => Promise<void>;
};

const OnsiteScopeContext = createContext<OnsiteScopeValue>({
  shopId: 0,
  shop: null,
  overview: null,
  reloadOverview: async () => {},
});

export const useOnsiteScope = () => useContext(OnsiteScopeContext);
/** 页面内取当前店铺：0 表示还没选到（外壳已拦成开通引导，正常渲染不到这里）。 */
export const useOnsiteShopId = () => useContext(OnsiteScopeContext).shopId;
export const useOnsiteShop = () => useContext(OnsiteScopeContext).shop;

export function OnsiteShell({
  active,
  title,
  desc,
  extra,
  children,
}: {
  active: OnsiteNavKey;
  title: string;
  desc?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<Panel title={title}>正在读取店铺信息…</Panel>}>
      <ShellInner active={active} title={title} desc={desc} extra={extra}>
        {children}
      </ShellInner>
    </Suspense>
  );
}

function ShellInner({
  active,
  title,
  desc,
  extra,
  children,
}: {
  active: OnsiteNavKey;
  title: string;
  desc?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/onsite";
  const params = useSearchParams();
  const shopsQuery = useOnsiteShops();
  const overviewQuery = useOnsiteOverview();

  const shops = useMemo(() => shopsQuery.data?.list ?? [], [shopsQuery.data]);
  const overview = overviewQuery.data ?? null;
  const shop = shops[0] ?? null;
  const shopId = shop?.id ?? 0;

  const legacyTab = params.get("tab") ?? "";
  useEffect(() => {
    const target = LEGACY_TAB_ROUTE[legacyTab];
    if (!target || target === pathname) return;
    const [, search = ""] = target.split("?");
    const merged = new URLSearchParams(search);
    params.forEach((value, key) => {
      if (key !== "tab" && !merged.has(key)) merged.set(key, value);
    });
    if (shopId) merged.set("shopId", String(shopId));
    router.replace(`${target.split("?")[0]}?${merged.toString()}`);
  }, [legacyTab, pathname, params, router, shopId]);

  const goNav = (key: string) => {
    const target = ONSITE_NAV.find((item) => item.key === key);
    if (!target) return;
    router.push(shopId ? withShop(target.path, shopId) : target.path);
  };

  // 绑定/自检/出包都会改变引导步骤的完成态，改完必须重拉一次总览。
  const reloadOverview = useCallback(async () => {
    await overviewQuery.refetch();
  }, [overviewQuery]);

  if (shopsQuery.isError) {
    return (
      <Panel title={title}>
        <Notice variant="error">
          店铺信息读取失败：{shopsQuery.error.message || "请稍后重试"}
        </Notice>
      </Panel>
    );
  }
  if (shopsQuery.isPending && !shopsQuery.data) {
    return (
      <Panel title={title}>
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      </Panel>
    );
  }

  return (
    <>
      <PageHero
        title={title}
        desc={desc}
        extra={
          <>
            <Button
              icon={<ArrowLeftOutlined aria-hidden />}
              onClick={() => router.push("/site-builder")}
            >
              返回工具总览
            </Button>
            {shop ? extra : null}
          </>
        }
      />
      <ColumnSwitch
        value={active}
        onChange={goNav}
        options={ONSITE_NAV.map((item) => ({ value: item.key, label: item.label }))}
      />
      {overview && !overview.open ? (
        <Notice variant="warn">
          上门服务板块已由平台关闭：不能新建店铺与出包，已生成的代码包仍可下载，
          历史订单照常处理。需要恢复请联系平台管理员在「平台管理后台 → 能力开通」启用「上门服务小程序」。
        </Notice>
      ) : null}
      {!shops.length ? (
        <ShopOnboarding onCreated={() => void shopsQuery.refetch()} />
      ) : (
        <OnsiteScopeContext.Provider
          value={{
            shopId,
            shop,
            overview,
            reloadOverview,
          }}
        >
          {overviewQuery.isError ? (
            <Notice variant="warn">
              开通引导读取失败：{overviewQuery.error.message || "部分提示可能不准确"}
            </Notice>
          ) : null}
          {children}
        </OnsiteScopeContext.Provider>
      )}
    </>
  );
}
