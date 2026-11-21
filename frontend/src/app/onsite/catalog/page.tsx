"use client";
// 服务目录：服务（主实体）+ 分类（分组维度）+ 标签（卖点与评价词）三套小 CRUD。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell, useOnsiteScope } from "../_components/onsite-shell";
import { CatalogPanel, LabelPanel } from "../_components/catalog-panel";
import { ServicePanel } from "../_components/service-panel";

function CatalogView() {
  const { shopId } = useOnsiteScope();
  const [panel, setPanel] = useOnsitePanel("service", ["service", "category", "label"]);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        {
          key: "service",
          label: "服务",
          children: (
            <ServicePanel
              key="service"
              shopId={shopId}
              onOpenCategory={() => setPanel("category")}
            />
          ),
        },
        {
          key: "category",
          label: "分类",
          children: (
            <CatalogPanel
              key="category"
              shopId={shopId}
              onOpenServices={() => setPanel("service")}
            />
          ),
        },
        {
          key: "label",
          label: "标签",
          children: (
            <LabelPanel
              key="label"
              shopId={shopId}
              onOpenServices={() => setPanel("service")}
            />
          ),
        },
      ]}
    />
  );
}

export default function OnsiteCatalogPage() {
  return (
    <OnsiteShell
      active="catalog"
      title="服务目录"
      desc="这里决定顾客在小程序里看到什么：「服务」是可直接下单的项目（名称、封面、时长、起价、加钟与车费口径都在这里）；「分类」是首页和分类页的分组，一个服务能挂多个分类；「标签」分两类——服务卖点勾进服务详情展示，评价词是顾客提交评价时勾选的那组词。改动只写本站数据，小程序端下次启动即生效，不用重新出包；但服务只有处于「已上架」才会出现在顾客端。"
    >
      <CatalogView />
    </OnsiteShell>
  );
}
