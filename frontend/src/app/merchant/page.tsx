"use client";

import { Alert, Button, ConfigProvider, Spin, Tabs, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@enterprise/contracts";
import type { MpMerchantOptions, MpMerchantProfile } from "@enterprise/contracts";
import { MP_MERCHANT_ROLE_LABELS } from "@enterprise/contracts";
import {
  fetchMerchantOptions,
  mpMerchantApi,
  readMerchantToken,
  writeMerchantToken,
} from "@/api/marketplace";
import { MpCouponPanel, type MpCouponApiAdapter } from "@/components/mp-store/coupon-panel";
import { MpDiyPanel, type MpDiyApiAdapter } from "@/components/mp-store/diy-panel";
import { MpScrmPanel, type MpScrmApiAdapter } from "@/components/mp-store/scrm-panel";
import { AccountPanel } from "./_components/account-panel";
import { AfterSalePanel } from "./_components/aftersale-panel";
import { FinancePanel } from "./_components/finance-panel";
import { MerchantFrame } from "./_components/frame";
import { MerchantLoginCard } from "./_components/login-card";
import { OrderPanel } from "./_components/order-panel";
import { ProductPanel } from "./_components/product-panel";
import { ShopPanel } from "./_components/shop-panel";
import { StaffPanel } from "./_components/staff-panel";

/** 店铺级装修：后端强制按本人店铺记账，query 里的 shopId 只是占位。 */
const shopDiyApi: MpDiyApiAdapter = {
  widgets: () => mpMerchantApi.diyWidgets(),
  list: () => mpMerchantApi.diyList({ shopId: 0, type: "" }),
  detail: (id) => mpMerchantApi.diyDetail(id),
  save: (body) => mpMerchantApi.diySave(body),
  publish: (id) => mpMerchantApi.diyPublish(id),
  remove: (id) => mpMerchantApi.diyRemove(id),
};

/** 商户券只在本店可用，不提供「指定店铺」作用域。 */
const shopCouponApi: MpCouponApiAdapter = {
  list: (query) => mpMerchantApi.coupons(query),
  save: (body) => mpMerchantApi.couponSave(body),
  status: (body) => mpMerchantApi.couponStatus(body),
};

const shopScrmApi: MpScrmApiAdapter = {
  state: () => mpMerchantApi.scrm(),
};

/**
 * 商户后台（免站内会话）：商户是独立账号体系，用入驻时申请的账号登录。
 * 页面上只有本商户的店铺与账号；市场运营方与买家都在各自的入口。
 */
export default function MerchantPortalPage() {
  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <MerchantPortal />
    </ConfigProvider>
  );
}

function MerchantPortal() {
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState<MpMerchantProfile | null>(null);
  const [categories, setCategories] = useState<MpMerchantOptions["categories"]>([]);
  const [tab, setTab] = useState("shop");

  const loadProfile = useCallback(async () => {
    const token = readMerchantToken();
    if (!token) {
      setProfile(null);
      setBooting(false);
      return;
    }
    try {
      const next = await mpMerchantApi.profile();
      if (!next) throw new Error("商户信息不存在，请联系市场运营方");
      setProfile(next);
      const options = await fetchMerchantOptions(next.marketShopCode);
      setCategories(options?.categories ?? []);
      setNotice("");
    } catch (cause) {
      writeMerchantToken("");
      setProfile(null);
      setNotice(
        cause instanceof ApiError && cause.status === 401
          ? "登录已过期，请重新登录"
          : cause instanceof Error
            ? cause.message
            : "商户信息读取失败",
      );
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const logout = () => {
    writeMerchantToken("");
    setProfile(null);
    setCategories([]);
    setTab("shop");
    setNotice("");
  };

  if (booting) {
    return (
      <MerchantFrame title="商户后台">
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin description="正在读取商户信息…" />
        </div>
      </MerchantFrame>
    );
  }

  if (!profile) {
    return (
      <MerchantFrame title="商户后台">
        <MerchantLoginCard
          notice={notice}
          onLoggedIn={(session) => {
            writeMerchantToken(session.token);
            setBooting(true);
            void loadProfile();
          }}
        />
      </MerchantFrame>
    );
  }

  const workspaceReady = profile.marketStatus === "ONLINE" && Boolean(profile.shop);
  const tabs = [
    {
      key: "shop",
      label: "店铺",
      children: <ShopPanel profile={profile} categories={categories} onRefresh={loadProfile} />,
    },
    ...(profile.shop
      ? [
          {
            key: "diy",
            label: "装修",
            children: (
              <MpDiyPanel
                title="店铺装修（店铺级页面）"
                api={shopDiyApi}
                emptyHint="还没有店铺页面，先新建一个"
              />
            ),
          },
        ]
      : []),
    {
      key: "product",
      label: "商品",
      children: <ProductPanel categories={categories} workspaceReady={workspaceReady} />,
    },
    ...(profile.shop
      ? [
          {
            key: "coupon",
            label: "优惠券",
            children: (
              <MpCouponPanel
                title="店铺优惠券"
                api={shopCouponApi}
                emptyHint="还没有优惠券，新建一张给买家"
              />
            ),
          },
        ]
      : []),
    {
      key: "order",
      label: "订单",
      children: <OrderPanel workspaceReady={Boolean(profile.shop)} />,
    },
    ...(profile.shop
      ? [
          {
            key: "aftersale",
            label: "售后",
            children: <AfterSalePanel workspaceReady={Boolean(profile.shop)} />,
          },
          {
            key: "finance",
            label: "结算",
            children: <FinancePanel workspaceReady={Boolean(profile.shop)} />,
          },
          {
            key: "scrm",
            label: "企业微信",
            children: (
              <MpScrmPanel title="企业微信对接（只读）" api={shopScrmApi} readonly />
            ),
          },
        ]
      : []),
    ...(profile.role === "OWNER"
      ? [{ key: "staff", label: "店员", children: <StaffPanel profile={profile} /> }]
      : []),
    { key: "account", label: "账号", children: <AccountPanel profile={profile} /> },
  ];

  return (
    <MerchantFrame
      title={profile.shop?.name || profile.merchantName}
      subtitle={`${profile.marketName} · ${profile.username}（${MP_MERCHANT_ROLE_LABELS[profile.role] ?? profile.role}）`}
      extra={
        <Button size="small" onClick={logout}>
          退出登录
        </Button>
      }
    >
      {profile.marketStatus !== "ONLINE" ? (
        <Alert
          type="warning"
          showIcon
          title={`市场当前${profile.marketStatus === "SUSPENDED" ? "被平台停服" : "未营业"}`}
          description="资料可查看；保存、开店与店员变更暂不可用，请联系市场运营方。"
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {profile.shop ? (
        <div style={{ marginBottom: 12 }}>
          <Tag>店铺编号 {profile.shop.shopCode}</Tag>
          {profile.shop.payEnabled ? <Tag color="green">微信支付已开启</Tag> : <Tag>微信支付未开启</Tag>}
        </div>
      ) : null}
      <Tabs activeKey={tab} onChange={setTab} items={tabs} />
    </MerchantFrame>
  );
}
