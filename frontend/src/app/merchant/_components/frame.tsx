"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME } from "@/lib/brand";

/** 商户后台是独立账号体系（不走站内会话），因此不套企业工作台侧栏，只保留一条自己的顶栏。 */
export function MerchantFrame({
  title,
  subtitle,
  extra,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ fontWeight: 600, fontSize: 16, color: "inherit" }}>
          {PRODUCT_NAME}
        </Link>
        <span className="muted text-12">商户后台</span>
        <div style={{ flex: 1 }} />
        {extra}
      </header>
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 48px" }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>{title}</h1>
          {subtitle ? <div className="text-12 muted" style={{ marginTop: 4 }}>{subtitle}</div> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
