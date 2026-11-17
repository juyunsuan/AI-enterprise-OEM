"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 国际独立站已并入「营销工具」页内 tab 渲染（与其它工具同款版式）。
 * 保留本路由仅为兼容旧链接 / 收藏，进入即跳转到营销工具的对应页签。
 */
export default function InternationalSitePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/marketing-tools?tab=international-site");
  }, [router]);
  return null;
}
