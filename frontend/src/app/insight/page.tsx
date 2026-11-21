"use client";

import {
  CompassOutlined,
  DeploymentUnitOutlined,
  LineChartOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { PageHero, Panel } from "@/components/ui/panel";
import { ToolCard } from "@/components/ui/tool-card";
import { useToolVisibility } from "@/lib/feature-visibility";

/**
 * 智慧分析（「工作台」栏目 · 营销工具同款卡片式）：一个菜单，进页面多张工具卡。
 * 全域内容热点分析、流行趋势分析、AI-FDE实施分析与企业咨询并列；点卡片进入对应工具，各工具页内自带页签。
 */
const TOOLS = [
  {
    key: "hotspot",
    name: "全域内容热点分析",
    icon: <SearchOutlined aria-hidden />,
    path: "/insight/hotspot",
    desc: "采集先行：本页的「采集数据源」只管「内容互动热度」这一采集目的（平台搜索页 / 话题页 / 博主主页 / 自定义网站源头），用 AWBotDSH 主机托管窗口（主）或本机浏览器代理（备）定时采进「热点内容」表；再做热点大盘、榜单、聚类纠偏、追踪台账与 AI 快报。",
  },
  {
    key: "trends",
    name: "流行趋势分析",
    icon: <LineChartOutlined aria-hidden />,
    path: "/insight/trends",
    desc: "同一套采集模式、另一份配置：「采集数据源 / 采集排班 / 采集批次」只管趋势类采集目的（元素 / 色彩 / 商业选品），电商源头与「电商选品趋势采集包」都在本页配与下；分析侧只做元素 / 色彩时序、价格带打分与社媒互动 × 电商商业四象限。",
  },
  {
    key: "fde",
    name: "AI-FDE实施分析",
    icon: <DeploymentUnitOutlined aria-hidden />,
    path: "/insight/fde",
    desc: "提交企业画像、流程痛点、系统与数据条件、目标与约束，由统一模型网关按 AI-FDE（AI 前置交付工程师）方法产出就绪度诊断、场景优先级、交付组织、技术架构、分阶段路线图、KPI 与风险清单；可补充行业成果资料，报告按账号留存。",
  },
  {
    key: "consulting",
    name: "企业咨询",
    icon: <CompassOutlined aria-hidden />,
    path: "/insight/consulting",
    desc: "提交企业数据并勾选分析模型：波士顿矩阵、SWOT、PEST、大战略矩阵、价值链、SPACE、易经、特劳特定位、营销 4Ps/4Cs/4Rs、麦肯锡方法、波特五力、第一性原理、人力资源与企业资源分析等；逐维度产出结论，再汇总成跨模型的综合建议，报告按账号留存。",
  },
];

export default function InsightPage() {
  const router = useRouter();
  const { isOpen } = useToolVisibility();
  // 子卡各自有功能码（insight-hotspot 等），「智慧分析」整组关掉时同样要收掉入口。
  const tools = isOpen("insight", "insight")
    ? TOOLS.filter((tool) => isOpen(`insight-${tool.key}`, "insight"))
    : [];
  return (
    <>
      <PageHero
        title="智慧分析"
        desc="趋势研判、垂类热点洞察与企业咨询的工具箱：每张卡片一个工具、点卡片进入使用。各工具可独立开关，共用底座采集、数据资产、多维表格与统一模型网关；采集只发生在用户自有设备的公开页面、全程留痕。"
      />
      <div style={{ display: "grid", gap: 20 }}>
        <Panel title="分析工具" extra={<span className="muted text-12">{tools.length} 个工具</span>}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {tools.map((tool) => (
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
