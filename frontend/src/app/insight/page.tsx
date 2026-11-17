"use client";

import { LineChartOutlined, SearchOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { PageHero, Panel } from "@/components/ui/panel";
import { ToolCard } from "@/components/ui/tool-card";

/**
 * 智慧分析（「工作台」栏目 · 营销工具同款卡片式）：一个菜单，进页面两张工具卡。
 * 全域内容热点分析放第一位、流行趋势分析第二位；点卡片进入对应工具，各工具页内自带页签。
 */
const TOOLS = [
  {
    key: "hotspot",
    name: "全域内容热点分析",
    icon: <SearchOutlined aria-hidden />,
    path: "/insight/hotspot",
    desc: "订阅自己的垂类（关键词 / 话题 / 博主），用 BotBuddy 主机托管窗口（主）或本机浏览器代理（备）把公开内容采进「热点内容」多维表格，热点引擎按时段分层打分，给出热点大盘、榜单、聚类纠偏、追踪台账与 AI 快报。",
  },
  {
    key: "trends",
    name: "流行趋势分析",
    icon: <LineChartOutlined aria-hidden />,
    path: "/insight/trends",
    desc: "对自有数字资产图片与电商采集结果做趋势量化：批量 VLM 打标出元素热度时序、价格带与爆款打分；开启联动后，用社媒互动热度 × 电商商业热度看概念商业化潜力四象限。数据面限定自有资产 + 自有采集。",
  },
];

export default function InsightPage() {
  const router = useRouter();
  return (
    <>
      <PageHero
        title="智慧分析"
        desc="趋势研判与垂类热点洞察的工具箱：每张卡片一个工具、点卡片进入使用。两个工具可各自开关，共用底座采集、数据资产、多维表格与统一模型网关；采集只发生在用户自有设备的公开页面、全程留痕。"
      />
      <div style={{ display: "grid", gap: 20 }}>
        <Panel title="分析工具" extra={<span className="muted text-12">{TOOLS.length} 个工具</span>}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {TOOLS.map((tool) => (
              <ToolCard
                key={tool.key}
                icon={tool.icon}
                title={tool.name}
                description={tool.desc}
                onClick={() => router.push(tool.path)}
              />
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
