"use client";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Spin } from "antd";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  Suspense,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BrandMeta, BrandShop } from "@enterprise/contracts";
import { useBrandMeta, useBrandShops } from "@/query/brand-mall";
import { ColumnSwitch, Notice, PageHero, Panel } from "@/components/ui/panel";
import { BRAND_NAV, withShop, type BrandNavKey } from "./brand-common";
import { ShopOnboarding } from "./shop-onboarding";
import { ShopSwitcher } from "./shop-switcher";

/**
 * 电商小程序工具的页面外壳：一个页头（板块导航 + 店铺切换器）+ 统一的「没有店铺」拦截。
 *
 * shopId 只从 query string 取，缺省落到第一家店：这样自检清单里的跳转链接
 * （`/brand-mall/publish?shopId=12`）和收藏的链接都能直接打开对应店铺，不存在第二份状态源。
 */
type BrandScopeValue = {
  shopId: number;
  shop: BrandShop | null;
  shops: BrandShop[];
  meta: BrandMeta | null;
  selectShop: (shopId: number) => void;
};

const BrandScopeContext = createContext<BrandScopeValue>({
  shopId: 0,
  shop: null,
  shops: [],
  meta: null,
  selectShop: () => {},
});

export const useBrandScope = () => useContext(BrandScopeContext);
/** 页面内取当前店铺：0 表示还没选到（外壳已经拦成开通引导，正常不会渲染到这里）。 */
export const useBrandShopId = () => useContext(BrandScopeContext).shopId;
export const useBrandShop = () => useContext(BrandScopeContext).shop;
export const useBrandMetaInfo = () => useContext(BrandScopeContext).meta;

export function BrandShell({
  active,
  title,
  desc,
  extra,
  children,
}: {
  active: BrandNavKey;
  title: string;
  desc?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<Panel title={title}>正在读取商城信息…</Panel>}>
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
  active: BrandNavKey;
  title: string;
  desc?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/brand-mall";
  const params = useSearchParams();
  const shopsQuery = useBrandShops();
  const metaQuery = useBrandMeta();
  const [switching, setSwitching] = useState(false);

  const shops = useMemo(() => shopsQuery.data ?? [], [shopsQuery.data]);
  const meta = metaQuery.data ?? null;
  const wanted = Number(params.get("shopId") || 0);
  const shopId = shops.some((item) => item.id === wanted)
    ? wanted
    : (shops[0]?.id ?? 0);
  const shop = shops.find((item) => item.id === shopId) ?? null;

  const selectShop = (id: number) => {
    setSwitching(true);
    router.replace(withShop(pathname, id), { scroll: false });
    window.setTimeout(() => setSwitching(false), 300);
  };

  const goTab = (key: string) => {
    const target = BRAND_NAV.find((item) => item.key === key);
    if (!target) return;
    router.push(shopId ? withShop(target.path, shopId) : target.path);
  };

  if (shopsQuery.isPending && !shopsQuery.data) {
    return (
      <Panel title={title}>
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      </Panel>
    );
  }

  if (shopsQuery.isError) {
    return (
      <Panel title={title}>
        <Notice variant="error">
          商城信息读取失败：{shopsQuery.error.message || "请稍后重试"}
        </Notice>
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
            {shops.length ? (
              <>
                <ShopSwitcher
                  shops={shops}
                  value={shopId}
                  onChange={selectShop}
                  loading={switching}
                />
                {extra}
              </>
            ) : null}
          </>
        }
      />
      <ColumnSwitch
        value={active}
        onChange={goTab}
        options={BRAND_NAV.map((item) => ({ value: item.key, label: item.label }))}
      />
      {!shops.length ? (
        <ShopOnboarding meta={meta} />
      ) : (
        <BrandScopeContext.Provider
          value={{ shopId, shop, shops, meta, selectShop }}
        >
          {metaQuery.isError ? (
            <Notice variant="warn">
              商城选项读取失败：{metaQuery.error.message || "部分功能可能不可用"}
            </Notice>
          ) : null}
          {children}
        </BrandScopeContext.Provider>
      )}
    </>
  );
}
