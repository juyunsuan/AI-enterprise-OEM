"use client";

// 小程序发布：微信凭据（主体/商户号）与源码包直接下载两条子流程。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell, useOnsiteScope } from "../_components/onsite-shell";
import { ReleaseTab } from "../_components/release-tab";
import { WechatTab } from "../_components/wechat-tab";

const PANELS = ["wechat", "release"];

function PublishView() {
  const { shopId, reloadOverview } = useOnsiteScope();
  const [panel, setPanel] = useOnsitePanel("wechat", PANELS);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        {
          key: "wechat",
          label: "微信凭据",
          children: <WechatTab shopId={shopId} onReload={reloadOverview} />,
        },
        {
          key: "release",
          label: "代码包",
          children: <ReleaseTab shopId={shopId} onOpenTab={setPanel} />,
        },
      ]}
    />
  );
}

export default function OnsitePublishPage() {
  return (
    <OnsiteShell
      active="publish"
      title="小程序发布"
      desc="微信凭据是发布与收款的钥匙：AppID / AppSecret 决定这部小程序属于哪个主体，微信支付商户号与 APIv3 凭据让顾客的钱直接进你自己的账户（平台不经手资金）。代码包是平台统一输出的源码分发包（zip），参数由你在微信开发者工具里自填，上传、提审与发布都在你自己的微信公众平台完成，本站不代编译、不代传。"
    >
      <PublishView />
    </OnsiteShell>
  );
}
