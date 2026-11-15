"use client";

import { PageHero } from "@/components/ui/panel";
import { PAGE_META } from "@/config/routes";
import { GeoSiteView } from "./_components/geo-site-list";

/**
 * 国际独立站：从「营销工具 → GEO」里拆出来的独立入口。
 * 建站器、页面/菜单/内容库、多语言、域名绑定与账单都在这一页，GEO 原页签只保留优化分析。
 */
export default function InternationalSitePage() {
  const meta = PAGE_META["/international-site"];
  return (
    <>
      <PageHero
        title={meta?.title ?? "国际独立站"}
        desc={
          meta?.description ??
          "拖拽建站、发布到平台子域或客户自己的域名；页面与内容按多语言维护，绑定域名后即可按客户域名独立访问。"
        }
      />
      <GeoSiteView />
    </>
  );
}
