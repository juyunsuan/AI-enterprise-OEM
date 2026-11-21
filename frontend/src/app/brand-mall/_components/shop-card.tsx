"use client";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  MinusCircleOutlined,
} from "@ant-design/icons";
import { Button, Space, Tag } from "antd";
import type { BrandMeta, BrandShop, BrandShopDetail } from "@enterprise/contracts";
import { fmtTime } from "@/lib/datetime";
import { ActionLink, StatusTag, dash } from "./brand-common";

/**
 * 总览页的店铺卡：状态、三个计数、微信小程序/收款徽标 + 上线自检清单。
 *
 * 自检项失败时必须同时给 `hint`（为什么）与 `action`（去哪儿修），
 * 链接由后端按当前 shopId 拼好，前端不再猜路径。
 */
export function ShopCard({
  shop,
  detail,
  meta,
  current,
  onSelect,
}: {
  shop: BrandShop;
  detail: BrandShopDetail | null;
  meta: BrandMeta | null;
  current: boolean;
  onSelect: () => void;
}) {
  const failed = (detail?.checks ?? []).filter((item) => !item.ok);
  return (
    <section
      style={{
        border: `1px solid ${current ? shop.themeColor || "#f0f0f0" : "var(--border, #f0f0f0)"}`,
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gap: 12,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            overflow: "hidden",
            background: "#fafafa",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {shop.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- OSS 直链域名随租户变化
            <img src={shop.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span className="muted">—</span>
          )}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Space size={6} wrap>
            <strong>{shop.name}</strong>
            <StatusTag meta={meta} kind="shop" value={shop.status} />
          </Space>
          <div className="muted text-12">
            店铺码 {dash(shop.shopCode)}
            {shop.slogan ? ` · ${shop.slogan}` : ""}
          </div>
        </div>
        <Button type={current ? "primary" : "default"} size="small" onClick={onSelect}>
          {current ? "当前" : "切到此店"}
        </Button>
      </div>

      {shop.status === "SUSPENDED" && shop.offReason ? (
        <Tag color="error">平台停服：{shop.offReason}</Tag>
      ) : null}

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }} className="text-12">
        <span className="muted">
          商品 <strong>{shop.onlineProductCount}</strong>/{shop.productCount}
        </span>
        <span className="muted">
          顾客 <strong>{shop.customerCount}</strong>
        </span>
        <span className="muted">
          待发货 <strong>{shop.pendingShipCount}</strong>
        </span>
        <span className="muted">
          开店时间 <strong>{fmtTime(shop.createdAt)}</strong>
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Tag color={shop.wechatReady ? "success" : "default"}>
          AppID {shop.wechatReady ? "已绑定" : "未绑定"}
        </Tag>
        <Tag color={shop.payReady ? "success" : "default"}>
          在线收款 {shop.payReady ? "可用" : "未配置"}
        </Tag>
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <div className="muted text-12">
          上线自检
          {failed.length ? `（${failed.length} 项待办）` : "（全部通过）"}
        </div>
        {!detail ? (
          <span className="muted text-12">自检清单读取中…</span>
        ) : (
          detail.checks.map((check) => (
            <div key={check.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {check.ok ? (
                <CheckCircleFilled style={{ color: "#52c41a" }} aria-hidden />
              ) : (
                <CloseCircleFilled style={{ color: "#faad14" }} aria-hidden />
              )}
              <span className="text-12">{check.label}</span>
              {check.ok ? null : (
                <>
                  <span className="muted text-12">{check.hint}</span>
                  {check.action ? (
                    <ActionLink path={check.action}>去处理</ActionLink>
                  ) : (
                    <MinusCircleOutlined className="muted" aria-hidden />
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
