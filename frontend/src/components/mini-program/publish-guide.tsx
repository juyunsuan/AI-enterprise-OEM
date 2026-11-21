"use client";

// 小程序发布说明（三处入口共用一个组件、同一份后端接口）：
// ① 建站管理·小程序/Web建站那一行右侧的抽屉；② 每个工具自己的发布页；③ 帮助中心「小程序发布说明」章节。
// 口径：平台不代编译、不代传微信 —— 用户下载平台统一输出的源码分发包（zip），在微信开发者工具里自己填参数、
// 自己编译预览与上传，再在微信公众平台提审发布。正文由平台管理员后台维护，
// 服务器域名清单与本账号要填的值由后端按配置渲染，前端一处文案都不写死。
import {
  CloudDownloadOutlined,
  CopyOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Drawer, Skeleton, Space, Tag, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { MiniGuideView, ToolLaunchCode } from "@enterprise/contracts";
import { miniGuideApi } from "@/api/mini-guide";
import { Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { formatBytes as formatSize } from "@/lib/format";

/** 站点域名在平台后台的落点：域名没配置时的「下一步」指向这里。 */

/** 契约只导出视图类型，条目类型从视图上取，避免在 contracts 里再加一处导出。 */
type GuideValue = MiniGuideView["values"][number];

/** 极简行内渲染：只认 `**加粗**` 与 `code`，与帮助中心同一口径，不引第三方库。 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(
      match[1] !== undefined ? (
        <strong key={`${keyPrefix}-b${index}`}>{match[1]}</strong>
      ) : (
        <Typography.Text className="mono" code key={`${keyPrefix}-c${index}`}>
          {match[2]}
        </Typography.Text>
      ),
    );
    cursor = match.index + match[0].length;
    index += 1;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/** 后台正文渲染：空行分段，`- ` 项目符号，`1.` 序号，其余按段落走。 */
export function GuideRichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const key = `blk-${blocks.length}`;
    const items = list.items.map((item, i) => (
      <li key={i} style={{ margin: "3px 0" }}>
        {renderInline(item, `${key}-${i}`)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={key} style={{ margin: "6px 0 10px 22px", paddingInlineStart: 0 }}>
          {items}
        </ol>
      ) : (
        <ul key={key} style={{ margin: "6px 0 10px 22px", paddingInlineStart: 0 }}>
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    // 项目符号认三种：markdown 的 - 与 *，以及后台正文里常用的中文间隔号「·」。
    // 只认前两种会把平台自己的默认正文（用「·」列步骤）整段渲染成普通段落，
    // 列表排版的差别正是让人一眼看清「按这几步走」的关键。
    const unordered = /^[-*·•]\s+(.*)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered);
      const content = (unordered?.[1] ?? ordered?.[1] ?? "").trim();
      if (!list || list.ordered !== isOrdered) {
        flush();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push(content);
      continue;
    }
    flush();
    blocks.push(
      <Typography.Paragraph key={`blk-${blocks.length}`} style={{ marginBottom: 8 }}>
        {renderInline(line, `p-${blocks.length}`)}
      </Typography.Paragraph>,
    );
  }
  flush();
  return <div style={{ fontSize: 14, lineHeight: 1.9 }}>{blocks}</div>;
}

/** 一行「值 + 一键复制」：账号参数与域名都靠它进剪贴板，hint 说清落在哪个文件。 */
function ValueLine({ item }: { item: GuideValue }) {
  const { message } = App.useApp();
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(item.value);
      message.success(`已复制${item.label}`);
    } catch {
      message.error("浏览器拒绝了剪贴板访问，请手动选中后复制");
    }
  };
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <Space wrap size={6} align="center">
        <span className="text-12 muted">{item.label}</span>
        <Typography.Text className="mono" strong>
          {item.value || "—"}
        </Typography.Text>
        <Button
          type="link"
          size="small"
          icon={<CopyOutlined aria-hidden />}
          disabled={!item.value}
          onClick={() => void copy()}
        >
          复制
        </Button>
      </Space>
      {item.hint ? <span className="text-12 muted">{item.hint}</span> : null}
    </div>
  );
}

type GuideProps = {
  /** 传工具码＝按这个工具 + 当前账号渲染（含本账号要填的值）；不传＝通用版（建站管理板块行末入口用）。 */
  tool?: ToolLaunchCode;
  /** 发布页把「去本页签填微信凭据」之类的跳转交给组件，阻断项才有可点的下一步。 */
  onOpenSettings?: () => void;
  /** 源码包的具体说明（一般不再需要：下载按钮已内嵌在本组件里）。 */
  packageExtra?: ReactNode;
};

/** 阻断项 → 下一步的落点（关键词命中即给入口，兜底去帮助中心看完整步骤）。 */
function resolveBlockerStep(
  text: string,
  tool: ToolLaunchCode | undefined,
  onOpenSettings?: () => void,
): { label: string; path?: string; run?: () => void } {
  if (/启动|积分|欠费/.test(text))
    return {
      label: "去启动设置",
      path: `/site-builder/launch${tool ? `?tool=${tool}` : ""}`,
    };
  // 「域名」这个词在两类阻断里意思完全不同，顺序与判定都要分开：
  // 国际独立站要绑的是**用户自己的域名**（在本工具页填），小程序 apiBase 用的是
  // **平台的站点域名**（只有平台管理员能配）。把后者也做成「去平台后台·站点设置」，
  // 普通店主点了只会撞进一个他没权限的页面，等于给了个假入口。
  if (tool === "global-site" && /域名/.test(text))
    return onOpenSettings
      ? { label: "去本页绑定自有域名", run: onOpenSettings }
      : { label: "去国际独立站", path: "/marketing-tools?tab=international-site" };
  if (/域名/.test(text))
    return {
      label: "看域名说明",
      path: "/help",
    };
  if (/凭据|AppID|AppSecret|密钥|商户/.test(text))
    return onOpenSettings
      ? { label: "去填微信凭据", run: onOpenSettings }
      : { label: "去建站管理选工具", path: "/site-builder" };
  return { label: "去帮助中心看完整步骤", path: "/help" };
}

/**
 * 说明主体：源码包 → 你要填的值 → 服务器域名 → 固定步骤 →（正文在页头）。
 * 接口未就绪时整块降级成一句提示，不把宿主页面带崩，也不落下第二套写死文案。
 */
export function MiniProgramPublishGuide({ tool, onOpenSettings, packageExtra }: GuideProps) {
  const router = useRouter();
  const { message } = App.useApp();
  const [view, setView] = useState<MiniGuideView | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // 进页面（抽屉打开、工具码变化）自动拉一次；不提供手动刷新按钮。
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void (async () => {
      try {
        const data = tool
          ? await miniGuideApi.view({ query: { tool } })
          : await miniGuideApi.shared();
        if (!cancelled) setView(data);
      } catch {
        // 后端实现与前端并行落地：读不到就显示「暂未就绪」，页面其余部分照常可用。
        if (!cancelled) {
          setView(null);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tool]);

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (failed || !view) {
    return (
      <Notice variant="warn">
        小程序发布说明暂未就绪，稍后重试即可。说明正文、服务器域名与本账号要填的值都来自平台配置，
        这里不放一份写死的兜底文案，免得三处入口各说各话。
      </Notice>
    );
  }

  const domainsReady = view.domains.every((item) => item.configured);

  /** 直接下载：点一下按工具码现打 zip，不再有「生成代码包」和发布台账。 */
  const download = async () => {
    if (!view?.toolCode) return;
    setDownloading(true);
    try {
      const data = await miniGuideApi.downloadPackage({
        body: { tool: view.toolCode },
      });
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

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      {view.blockers.length ? (
        <Alert
          type="warning"
          showIcon
          message="发布前要先解决这些"
          description={
            <Space orientation="vertical" size={6} style={{ width: "100%" }}>
              {view.blockers.map((text) => {
                const step = resolveBlockerStep(text, tool, onOpenSettings);
                return (
                  <Space key={text} wrap size={8} align="center">
                    <span>{text}</span>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => {
                        if (step.run) step.run();
                        else void router.push(step.path || "/site-builder");
                      }}
                    >
                      {step.label}
                    </Button>
                  </Space>
                );
              })}
            </Space>
          }
        />
      ) : null}

      <Panel
        // 通用版（toolCode 为空）标题由外层给；工具内页显示工具名，避免抽屉里两遍同名标题
        title={view.toolCode ? `${view.toolName} · 发布说明` : '发布方式与步骤'}
        titleExtra={
          <span className="text-12 muted">
            {view.updatedAt ? `说明更新于 ${fmtTime(view.updatedAt)}` : '正文由平台管理员维护'}
          </span>
        }
      >
        {view.body ? (
          <GuideRichText text={view.body} />
        ) : (
          <span className="text-12 muted">平台还没有维护说明正文。</span>
        )}
      </Panel>

      <Panel
        title="① 下载统一源码包"
        titleExtra={
          view.pkg.available ? (
            <span className="text-12 muted">{view.pkg.fileName || "源码分发包.zip"}</span>
          ) : null
        }
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          {view.pkg.available ? (
            <>
              <Space wrap size={8} align="center">
                <Button
                  type="primary"
                  icon={<CloudDownloadOutlined aria-hidden />}
                  loading={downloading}
                  onClick={() => void download()}
                >
                  下载源码包（zip）
                </Button>
                <Tag>{formatSize(view.pkg.sizeBytes)}</Tag>
                <Tag>{view.pkg.version ? `版本 ${view.pkg.version}` : "版本以当前模板为准"}</Tag>
                {view.pkg.withinLimit ? (
                  <Tag color="green">未超微信 2MB 主包上限</Tag>
                ) : (
                  <Tag color="red">已超微信 2MB 主包上限，微信上传会被拒</Tag>
                )}
              </Space>
              <Notice variant="info">
                点「下载源码包」直接拿 zip，不需要先出包，也没有发布台账。包内是平台统一模板源码，
                不含你的账号参数：解压后要在微信开发者工具里把 config.js 的 apiBase 与租户码、
                project.config.json 的 AppID 与主题色逐项填好再编译预览。下面「② 你要填的值」就是这个账号该填什么。
              </Notice>
              {packageExtra}
            </>
          ) : (
            <Notice variant="info">
              {view.toolCode
                ? `${view.toolName} 是 Web 站点工具，不产出微信小程序源码包；下面的域名清单只在你发布自己的小程序时用得上。`
                : '各工具的源码包在对应工具的「发布」页直接下载；这里是通用流程与域名说明。'}
            </Notice>
          )}
        </Space>
      </Panel>

      <Panel
        title="② 你要填的值"
        titleExtra={<span className="text-12 muted">点「复制」取值，按提示落到对应文件</span>}
      >
        {view.values.length ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            {view.values.map((item) => (
              <ValueLine key={item.key} item={item} />
            ))}
          </Space>
        ) : (
          <span className="text-12 muted">
            {view.toolCode
              ? "这个工具不需要在 config.js 里填账号参数（Web 站点工具）。"
              : "各工具的取值（apiBase、shopCode / siteCode / marketCode、AppID）在对应工具的发布页逐项给出，并可一键复制。"}
          </span>
        )}
      </Panel>

      <Panel
        title="③ 服务器域名清单"
        titleExtra={
          <span className="text-12 muted">微信公众平台 → 开发管理 → 开发设置 → 服务器域名</span>
        }
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <span className="text-12 muted">
            request 合法域名、uploadFile 合法域名、downloadFile 合法域名三栏都填下面这同一个前缀
            （只填「协议 + 域名」，不带路径与斜杠）。
          </span>
          {view.domains.length ? (
            <Space orientation="vertical" size={10} style={{ width: "100%" }}>
              {view.domains.map((item) => (
                <ValueLine
                  key={`${item.label}-${item.origin}`}
                  item={{
                    key: `domain-${item.label}`,
                    label: item.label,
                    // 未配置时不给可复制的空值，直接把「下一步」说清（复制按钮同时禁用）。
                    value: item.configured ? item.origin : "",
                    hint: item.configured
                      ? "填到微信后台对应那一栏"
                      : "站点域名还没配置，平台暂时给不出可用前缀。",
                  }}
                />
              ))}
            </Space>
          ) : (
            <span className="text-12 muted">
              平台还没配出可用的站点域名，这里就先给不出前缀；配好后回到本页自动带上。
            </span>
          )}
          {domainsReady ? null : (
            <Notice variant="warn">
              域名清单要能填出真值，前提是本站的站点域名已经配好。站点域名归平台管理员维护
              （平台后台 → 系统与内容 → 站点设置），店主这边只能等它配完；
              <Button type="link" size="small" onClick={() => void router.push("/help")}>
                看域名与服务器配置说明
              </Button>
              配好后本页自动带上，微信侧改完服务器域名要等下一次生效。
            </Notice>
          )}
        </Space>
      </Panel>

      <Panel title="④ 发布步骤">
        {view.steps.length ? (
          <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.9 }}>
            {view.steps.map((step) => (
              <li key={step.title} style={{ marginBottom: 6 }}>
                <strong>{step.title}</strong>
                {step.detail ? (
                  <div className="text-12 muted">{renderInline(step.detail, step.title)}</div>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <span className="text-12 muted">
            {view.toolCode
              ? '这个工具不产出微信小程序源码包，请按上方 ① 的说明走它自己的发布路径。'
              : '本指南只覆盖八个微信小程序工具；国际独立站等 Web 工具在各自工具页发布。'}
          </span>
        )}
      </Panel>
    </Space>
  );
}

/**
 * 建站管理板块那一行右侧的入口：按钮 + 抽屉，抽屉里就是同一份说明（通用版，不带账号参数）。
 * 卡片区整卡是 button，入口只能挂在板块标题行的右侧。
 */
export function PublishGuideEntry({
  label = "小程序发布说明",
  tool,
}: {
  label?: string;
  tool?: ToolLaunchCode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="link"
        size="small"
        icon={<QuestionCircleOutlined aria-hidden />}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Drawer
        title={label}
        size={760}
        open={open}
        onClose={() => setOpen(false)}
        destroyOnHidden
        styles={{ body: { background: "var(--ant-color-bg-layout, #f5f5f5)" } }}
      >
        <MiniProgramPublishGuide tool={tool} />
      </Drawer>
    </>
  );
}
