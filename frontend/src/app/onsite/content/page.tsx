"use client";
// 内容运营：首页轮播 + 图文资讯（可挂留资表单）+ 表单字段库。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell, useOnsiteScope } from "../_components/onsite-shell";
import { ArticlePanel } from "../_components/article-panel";
import { BannerPanel } from "../_components/banner-panel";
import { FormFieldPanel } from "../_components/form-field-panel";

function ContentView() {
  const { shopId } = useOnsiteScope();
  const [panel, setPanel] = useOnsitePanel("banner", ["banner", "article", "field"]);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "banner", label: "首页轮播", children: <BannerPanel key="banner" shopId={shopId} /> },
        {
          key: "article",
          label: "图文资讯",
          children: (
            <ArticlePanel
              key="article"
              shopId={shopId}
              onOpenFields={() => setPanel("field")}
            />
          ),
        },
        {
          key: "field",
          label: "留资表单",
          children: (
            <FormFieldPanel
              key="field"
              shopId={shopId}
              onOpenArticles={() => setPanel("article")}
            />
          ),
        },
      ]}
    />
  );
}

export default function OnsiteContentPage() {
  return (
    <OnsiteShell
      active="content"
      title="内容运营"
      desc="这三块管的是小程序里「非下单」的内容：「首页轮播」是首页顶部那圈广告位，每张图可跳到某个服务、分类、技师或文章；「图文资讯」既是文章列表（服务介绍、活动说明、用户协议都能写），也能在文末挂一张留资表单收集意向顾客与报名技师的联系方式；「留资表单」是字段库，先在这里定义要问什么（姓名、手机号、期望城市…），文章页勾选后顾客才填得到。改动即时生效，不用重新出包；轮播与文章只有启用 / 已发布状态才对顾客可见。"
    >
      <ContentView />
    </OnsiteShell>
  );
}
