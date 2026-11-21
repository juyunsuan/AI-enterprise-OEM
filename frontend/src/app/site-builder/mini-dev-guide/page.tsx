"use client";

import {
  CloudDownloadOutlined,
  CodeOutlined,
  CopyOutlined,
  RocketOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { App, Button, Select, Space, Tag } from "antd";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { MiniGuideView, ToolLaunchCode } from "@enterprise/contracts";
import { miniGuideApi } from "@/api/mini-guide";
import { GuideRichText } from "@/components/mini-program/publish-guide";
import { EmptyState, Notice, PageHero, Panel, TabStrip } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { formatBytes as formatSize } from "@/lib/format";

/**
 * 小程序开发与发布（工作台独立页）。
 *
 * 取代原「小程序发布说明」抽屉：先让用户下载平台统一源码包，再说明如何导入
 * Codex / Qoder / TRAE / AWBotDSH 等客户端改代码，最后回到微信开发者工具与
 * 微信公众平台完成编译、上传、提审与发布。平台不代编译、不代传微信。
 */

type TabKey = "develop" | "ai" | "publish";

const MINI_TOOLS: { code: ToolLaunchCode; label: string }[] = [
  { code: "knowledge-pay", label: "知识付费云课堂" },
  { code: "onsite", label: "上门服务小程序" },
  { code: "brand-mall", label: "品牌商城" },
  { code: "health", label: "健康管理小程序" },
  { code: "marketplace", label: "多店铺商城平台" },
  { code: "digital-human", label: "数字人小程序" },
  { code: "card-shop", label: "卡密商城小程序" },
  { code: "kuaidi", label: "快递寄件小程序" },
  { code: "errand", label: "跑腿小程序" },
  { code: "takeout", label: "外卖点餐小程序" },
];

const AI_CLIENTS: {
  key: string;
  name: string;
  icon: ReactNode;
  steps: string[];
}[] = [
  {
    key: "codex",
    name: "Codex",
    icon: <CodeOutlined aria-hidden />,
    steps: [
      "解压源码包，在终端进入该目录（或在 Codex IDE 插件里直接打开该文件夹）。",
      "在目录根新建或打开 AGENTS.md，把下方提示词粘进去，让 Codex 先读目录再改代码。",
      "用 Codex 对话改业务代码；每轮改完看它列出的改动文件与验证方法。",
      "改完回到微信开发者工具编译预览，确认页面与接口都正常。",
    ],
  },
  {
    key: "qoder",
    name: "Qoder",
    icon: <RobotOutlined aria-hidden />,
    steps: [
      "在 Qoder 里「打开文件夹」选择解压出来的小程序源码目录。",
      "把下方提示词发给 Agent，让它先输出目录结构、启动方式与待改点。",
      "按功能拆小步修改，逐轮在微信开发者工具里预览。",
      "敏感配置（AppSecret、支付密钥）不要交给 AI 读取或改写。",
    ],
  },
  {
    key: "trae",
    name: "TREA / TRAE",
    icon: <CodeOutlined aria-hidden />,
    steps: [
      "打开 TREA / TRAE，选择「打开项目」，指向解压后的源码目录。",
      "在对话里粘贴下方提示词，让它先读 app.json、project.config.json、config.js。",
      "按页面或接口分步改，避免一次让 AI 重写整个项目。",
      "每次改动后在微信开发者工具里编译，确认没有破坏登录与支付链路。",
    ],
  },
  {
    key: "awbotdsh",
    name: "AWBotDSH",
    icon: <RobotOutlined aria-hidden />,
    steps: [
      "在 AWBotDSH 客户端里新建或打开工作区，选择解压后的源码目录。",
      "把下方提示词发给它，先确认目录结构、配置项与启动方式。",
      "用它改页面、文案与小功能；预览仍以微信开发者工具为准。",
      "改完导出/保存改动，回到开发者工具编译并上传。",
    ],
  },
];

const AI_PROMPT = [
  "这是一个微信原生小程序源码目录（不是 Web 项目）。",
  "先读 app.json、project.config.json、config.js 与 utils/ 下的请求/会话代码，",
  "输出目录结构、启动方式、页面与接口的对应关系；不要读取或改写任何 AppSecret、支付密钥。",
  "然后按我的需求分步修改：每次先给改动计划，改完列出改动文件、风险点与验证方法。",
  "预览与上传仍在微信开发者工具完成；不要假设本机可以直接运行微信小程序。",
].join("\n");

const PUBLISH_STEPS = [
  "解压源码包，用微信开发者工具「导入项目」选择该目录。",
  "把 project.config.json 的 appid 换成你自己的小程序 AppID；本地调试可临时勾选「不校验合法域名」。",
  "编辑 config.js：apiBase 填本站地址（无尾斜杠），租户码填本页「本账号参数」给出的值。",
  "在微信公众平台配置 request / uploadFile / downloadFile 三类服务器域名（见本页域名清单）。",
  "开发者工具里编译、预览自测：登录、列表、下单/提交等主链路都要走通。",
  "点「上传」，回到微信公众平台 → 版本管理 → 提交审核。",
  "审核通过后在微信公众平台发布；后续改版重复上传与提审。",
];

function CopyValue({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const { message } = App.useApp();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      message.success(`已复制${label}`);
    } catch {
      message.error("复制失败，请手动选中文本复制");
    }
  };
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <Space wrap size={6} align="center">
        <span className="text-12 muted">{label}</span>
        <code>{value || "—"}</code>
        <Button size="small" icon={<CopyOutlined aria-hidden />} onClick={() => void copy()}>
          复制
        </Button>
      </Space>
      {hint ? <span className="text-12 muted">{hint}</span> : null}
    </div>
  );
}

export default function MiniDevGuidePage() {
  const { message } = App.useApp();
  const [tool, setTool] = useState<ToolLaunchCode>("brand-mall");
  const [tab, setTab] = useState<TabKey>("develop");
  const [view, setView] = useState<MiniGuideView | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await miniGuideApi.view({ query: { tool } });
      setView(data);
      setFailed(false);
    } catch (cause) {
      setFailed(true);
      message.error(cause instanceof Error ? cause.message : "小程序源码信息加载失败");
    } finally {
      setLoading(false);
    }
  }, [message, tool]);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async () => {
    setDownloading(true);
    try {
      const data = await miniGuideApi.downloadPackage({ body: { tool } });
      if (!data?.url) throw new Error("没有拿到源码包下载地址");
      const link = document.createElement("a");
      link.href = data.url;
      link.download = data.fileName || "miniprogram-source.zip";
      link.rel = "noopener";
      link.click();
      message.success(`开始下载 ${data.fileName}`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "源码包下载失败");
    } finally {
      setDownloading(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(`${label}已复制`);
    } catch {
      message.error("复制失败，请手动选择文本复制");
    }
  };

  const toolLabel = MINI_TOOLS.find((item) => item.code === tool)?.label ?? tool;
  const steps = view?.steps?.length
    ? view.steps
    : PUBLISH_STEPS.map((detail, index) => ({ title: `第 ${index + 1} 步`, detail }));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHero
        title="小程序开发与发布"
        desc="下载平台统一输出的微信小程序源码包，自己填本站地址、租户码与 AppID；可以导入 Codex、Qoder、TREA / TRAE、AWBotDSH 等客户端改代码，再回微信开发者工具编译预览、上传，最后在微信公众平台提审发布。平台不代编译、不代传微信。"
      />

      <Panel
        title="① 选择并下载小程序源码"
        titleExtra={
          <span className="text-12 muted">
            {view?.pkg?.version ? `模板版本 ${view.pkg.version}` : "版本以当前模板为准"}
            {view?.pkg?.sizeBytes ? ` · ${formatSize(view.pkg.sizeBytes)}` : ""}
            {view?.updatedAt ? ` · 说明更新于 ${fmtTime(view.updatedAt)}` : ""}
          </span>
        }
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <Space wrap size={8} align="center">
            <span className="text-12 muted">小程序</span>
            <Select
              style={{ width: 260 }}
              value={tool}
              onChange={(value: ToolLaunchCode) => setTool(value)}
              options={MINI_TOOLS.map((item) => ({ value: item.code, label: item.label }))}
            />
            <Button
              type="primary"
              icon={<CloudDownloadOutlined aria-hidden />}
              loading={downloading}
              disabled={loading || !view?.pkg?.available}
              onClick={() => void download()}
            >
              下载源码包（zip）
            </Button>
            {view?.pkg?.available ? (
              <Tag color={view.pkg.withinLimit ? "green" : "red"}>
                {view.pkg.withinLimit ? "未超微信 2MB 主包上限" : "已超微信 2MB 主包上限"}
              </Tag>
            ) : null}
          </Space>
          {view?.pkg?.available ? (
            <Notice variant="info">
              包内是平台统一模板源码，不含你的账号参数。解压后的目录名就是小程序名，
              可以直接在 AI 客户端里作为工作区打开；填参数与预览仍以微信开发者工具为准。
            </Notice>
          ) : (
            <Notice variant="warn">
              {loading
                ? "正在读取该工具的源码包信息…"
                : `${toolLabel} 暂未提供源码包，请确认仓库模板完整或稍后重试。`}
            </Notice>
          )}
          {view?.blockers?.length ? (
            <Notice variant="warn">
              <div style={{ marginBottom: 4 }}>开始前先补齐这些：</div>
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {view.blockers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </Space>
      </Panel>

      <TabStrip
        items={[
          { key: "develop", label: "开发指引" },
          { key: "ai", label: "AI 编程建议" },
          { key: "publish", label: "发布指引" },
        ]}
        value={tab}
        onChange={(key) => setTab(key as TabKey)}
      />

      {tab === "develop" ? (
        <>
          {failed ? (
            <Panel title="开发指引">
              <EmptyState text="该工具的源码说明暂时没取到，下载入口仍可重试；也可以到对应工具的发布页查看账号参数。" />
            </Panel>
          ) : (
            <>
              {view?.body ? (
                <Panel
                  title={`${toolLabel} · 开发说明`}
                  titleExtra={<span className="text-12 muted">正文由平台管理员维护</span>}
                >
                  <GuideRichText text={view.body} />
                </Panel>
              ) : null}

              <Panel
                title="② 本账号参数"
                titleExtra={<span className="text-12 muted">填进解压后的 config.js</span>}
              >
                {view?.values?.length ? (
                  <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                    {view.values.map((item) => (
                      <CopyValue
                        key={item.key}
                        label={item.label}
                        value={item.value}
                        hint={item.hint}
                      />
                    ))}
                  </Space>
                ) : (
                  <EmptyState text="该账号还没有可渲染的参数；先按工具页提示完成站点创建。" />
                )}
              </Panel>

              <Panel title="③ 开发与预览步骤">
                <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                  <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 1.9 }}>
                    {steps.map((item) => (
                      <li key={`${item.title}-${item.detail}`}>
                        <strong>{item.title}</strong>
                        {item.detail ? (
                          <div className="text-12 muted">{item.detail}</div>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  <Notice variant="info">
                    改代码可以在 AI 客户端里做，但小程序运行环境只有微信开发者工具能提供；
                    预览、真机调试与上传都以它为准。
                  </Notice>
                </Space>
              </Panel>
            </>
          )}
        </>
      ) : null}

      {tab === "ai" ? (
        <>
          <Panel
            title="把源码导入 AI 编程客户端"
            titleExtra={
              <span className="text-12 muted">
                客户端只负责改代码，不替代微信开发者工具
              </span>
            }
          >
            <Space orientation="vertical" size={14} style={{ width: "100%" }}>
              <Notice variant="warn">
                不要把自己的 AppSecret、微信支付密钥、商户号口令交给 AI；源码包本身不含这些。
                让 AI 先读目录再改，按页面/接口拆小步，每步都回开发者工具预览。
              </Notice>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                {AI_CLIENTS.map((client) => (
                  <div key={client.key} style={{ border: "1px solid #e5e6eb", borderRadius: 10, padding: 14 }}>
                    <Space size={8} align="center" style={{ marginBottom: 8 }}>
                      {client.icon}
                      <strong>{client.name}</strong>
                    </Space>
                    <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 1.8 }}>
                      {client.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    <Button
                      size="small"
                      icon={<CopyOutlined aria-hidden />}
                      style={{ marginTop: 10 }}
                      onClick={() => void copy(AI_PROMPT, `${client.name} 提示词`)}
                    >
                      复制提示词
                    </Button>
                  </div>
                ))}
              </div>
            </Space>
          </Panel>

          <Panel title="通用 AI 提示词" titleExtra={<span className="text-12 muted">可粘到任意客户端</span>}>
            <pre
              style={{
                margin: 0,
                padding: 12,
                background: "#f7f8fa",
                borderRadius: 8,
                whiteSpace: "pre-wrap",
                lineHeight: 1.7,
              }}
            >
              {AI_PROMPT}
            </pre>
            <Button
              size="small"
              icon={<CopyOutlined aria-hidden />}
              style={{ marginTop: 10 }}
              onClick={() => void copy(AI_PROMPT, "AI 提示词")}
            >
              复制提示词
            </Button>
          </Panel>

          <Panel title="AI 改码建议">
            <ul style={{ margin: 0, paddingInlineStart: 20, lineHeight: 1.9 }}>
              <li>先让 AI 输出目录结构、页面路由与接口清单，再提需求，避免它凭空新建一套。</li>
              <li>一次只改一个页面或一个接口；改完立刻在微信开发者工具里编译预览。</li>
              <li>涉及登录、支付、订单状态机的改动，要求 AI 先说明风险并保留原逻辑，不要整段重写。</li>
              <li>让 AI 在源码根维护一份 AGENTS.md，记录启动方式、配置项与禁止修改的文件。</li>
              <li>AI 说「已验证」不算验证：以开发者工具编译、真机预览和主链路走通为准。</li>
            </ul>
          </Panel>
        </>
      ) : null}

      {tab === "publish" ? (
        <>
          <Panel title="④ 微信开发者工具与发布" titleExtra={<RocketOutlined aria-hidden />}>
            <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 1.9 }}>
              {PUBLISH_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Panel>

          <Panel title="⑤ 服务器域名清单" titleExtra={<span className="text-12 muted">微信公众平台 → 开发设置</span>}>
            {view?.domains?.length ? (
              <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                {view.domains.map((item) => (
                  <CopyValue
                    key={item.label}
                    label={item.label}
                    value={item.origin}
                    hint={item.configured ? undefined : "站点域名还没配置，请先在平台站点设置里填写。"}
                  />
                ))}
              </Space>
            ) : (
              <EmptyState text="还没有可用的域名信息；请先在站点设置里配置站点域名。" />
            )}
          </Panel>

          <Panel title="发布注意">
            <ul style={{ margin: 0, paddingInlineStart: 20, lineHeight: 1.9 }}>
              <li>主包超过微信 2MB 会被拒，先按开发者工具提示拆包或压缩素材。</li>
              <li>提审前在「本地设置」里关闭「不校验合法域名」，用真实域名再跑一遍。</li>
              <li>发布后改版仍需重新上传与提审；微信公众平台可回退到上一个线上版本。</li>
              <li>平台不代编译、不代传微信，也不保存你的微信后台账号密码。</li>
            </ul>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
