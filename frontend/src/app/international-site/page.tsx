"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, ConfigProvider } from "antd";
import { useRouter } from "next/navigation";
import { PageHero } from "@/components/ui/panel";
import { GeoSiteView } from "./_components/geo-site-list";
import { ToolLaunchBanner } from "@/components/tool-launch/launch-banner";

/**
 * 国际独立站（工作台 → 建站管理 → Web建站）：本页是建站管理卡片的正式入口，
 * 营销工具页内仍保留同名页签（数据同一套），两边共用 `GeoSiteView`。
 */
export default function InternationalSitePage() {
  const router = useRouter();

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <PageHero
        title="国际独立站"
        desc="拖拽搭建多语言独立站：页面、菜单、文章与产品按语言分别维护，模板库、发布台账与域名绑定；可发布到平台子域或客户自有域名，欠费只停服不删数据。"
        extra={
          <Button
            icon={<ArrowLeftOutlined aria-hidden />}
            onClick={() => router.push("/site-builder")}
          >
            返回工具总览
          </Button>
        }
      />
      <ToolLaunchBanner tool="global-site" />
      <GeoSiteView />
    </ConfigProvider>
  );
}
