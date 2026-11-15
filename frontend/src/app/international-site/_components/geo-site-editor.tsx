"use client";

import type { GeoSiteLanguage } from "@enterprise/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  App,
  Badge,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Tooltip,
  Typography,
} from "antd";
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  BlockOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  CopyOutlined,
  FileTextOutlined,
  GlobalOutlined,
  HistoryOutlined,
  LinkOutlined,
  MenuOutlined,
  RedoOutlined,
  SaveOutlined,
  SettingOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import {
  useGeoSiteActions,
  useGeoSiteCmsActions,
  useGeoSiteDetail,
  useGeoSiteMeta,
  useGeoSitePage,
  useGeoSitePages,
} from "@/query/geo-site";
import { Notice } from "@/components/ui/panel";
import {
  PALETTE,
  PALETTE_GROUPS,
  isContainer,
  paletteByType,
  type GeoSiteNode,
} from "./geo-site-elements";
import {
  countNodes,
  duplicateNode,
  findNode,
  insertNear,
  insertNode,
  moveNode,
  normalizeTree,
  patchNode,
  removeNode,
  setContentField,
  setStyle,
  shiftNode,
  unsetStyle,
  walkTree,
  type DropPosition,
  type DropTarget,
} from "./geo-site-tree";
import { Canvas, NodeView, paletteDragStart } from "./geo-site-canvas";
import { Inspector } from "./geo-site-inspector";
import { Layers } from "./geo-site-layers";
import { DomainPanel } from "./geo-site-domains";
import { BillingPanel } from "./geo-site-billing";
import { PagePanel } from "./geo-site-pages";
import { MenuPanel } from "./geo-site-menus";
import { ScriptPanel } from "./geo-site-scripts";
import { ContentPanel } from "./geo-site-contents";
import { TemplatePanel } from "./geo-site-templates";
import { PublishLogPanel } from "./geo-site-log";
import { SeoForm, normalizeSeo, type GeoSiteSeo } from "./geo-site-seo";

const DEVICES = [
  { value: "desktop", label: "电脑" },
  { value: "tablet", label: "平板" },
  { value: "mobile", label: "手机" },
];

const DEVICE_WIDTH: Record<string, number | string> = {
  desktop: "100%",
  tablet: 768,
  mobile: 390,
};

const HISTORY_LIMIT = 50;

/**
 * 建站编辑器：左（元素 + 图层）、中（画布）、右（属性）三栏。
 * 内容只在内存里改，点「保存」写草稿，点「发布」先存草稿再切公开快照——
 * 公开地址永远来自 publishedContent，编辑中的半成品不会漏出去。
 */
export function GeoSiteEditor({
  siteId,
  onClose,
}: {
  siteId: number;
  onClose: () => void;
}) {
  const { message, modal } = App.useApp();
  const detail = useGeoSiteDetail(siteId);
  const meta = useGeoSiteMeta();
  const actions = useGeoSiteActions();
  const cms = useGeoSiteCmsActions();
  const pages = useGeoSitePages(siteId);
  const [pageId, setPageId] = useState(0);
  const activePageId = pageId || pages.data?.homeId || 0;
  const pageQuery = useGeoSitePage(activePageId);
  const page = activePageId > 0 ? pageQuery.data : undefined;
  const [tree, setTree] = useState<GeoSiteNode[]>([]);
  const [seo, setSeo] = useState<GeoSiteSeo>(normalizeSeo(null));
  const [past, setPast] = useState<GeoSiteNode[][]>([]);
  const [future, setFuture] = useState<GeoSiteNode[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 拖拽落点：画布据此画插入线 / 高亮容器，拖完立刻清空。
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [device, setDevice] = useState("desktop");
  const [panel, setPanel] = useState<
    | ""
    | "seo"
    | "domain"
    | "billing"
    | "setting"
    | "pages"
    | "menu"
    | "scripts"
    | "contents"
    | "templates"
    | "log"
  >("");
  const [form] = Form.useForm();
  const loadedFor = useRef<string | null>(null);

  /**
   * 编辑源优先取当前页面；页面数据还没到位时回落站点内容，
   * 保证首屏与老站点（只有站点级内容）都能立刻可编辑。
   */
  const source = useMemo(
    () =>
      page
        ? { key: `p${page.id}`, content: page.content, seo: page.seo, id: page.id }
        : detail.data
          ? { key: `s${detail.data.id}`, content: detail.data.content, seo: detail.data.seo, id: 0 }
          : null,
    [page, detail.data],
  );

  useEffect(() => {
    if (!source || loadedFor.current === source.key) return;
    loadedFor.current = source.key;
    setTree(normalizeTree(source.content));
    setSeo(normalizeSeo(source.seo));
    setPast([]);
    setFuture([]);
    setDirty(false);
    setSelectedId(null);
  }, [source]);

  const apply = useCallback(
    (next: (current: GeoSiteNode[]) => GeoSiteNode[]) => {
      setTree((current) => {
        const produced = next(current);
        if (produced === current) return current;
        setPast((rows) => [...rows, current].slice(-HISTORY_LIMIT));
        setFuture([]);
        setDirty(true);
        return produced;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setPast((rows) => {
      if (!rows.length) return rows;
      const previous = rows[rows.length - 1];
      setTree((current) => {
        setFuture((next) => [current, ...next].slice(0, HISTORY_LIMIT));
        setDirty(true);
        return previous;
      });
      return rows.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((rows) => {
      if (!rows.length) return rows;
      const [next, ...rest] = rows;
      setTree((current) => {
        setPast((history) => [...history, current].slice(-HISTORY_LIMIT));
        setDirty(true);
        return next;
      });
      return rest;
    });
  }, []);

  const selected = selectedId ? findNode(tree, selectedId)?.node ?? null : null;
  const nodeCount = useMemo(() => countNodes(tree), [tree]);
  // 顶部导航不再由渲染层兜底生成，页面上没有导航区块时左栏要明确指路
  const hasNavBlock = useMemo(() => {
    let found = false;
    walkTree(tree, (node) => {
      if (node.type === "navBar") found = true;
    });
    return found;
  }, [tree]);
  const site = detail.data;
  const languageOptions = pages.data?.languageOptions ?? [];
  const languageLabel = (code: string) =>
    languageOptions.find((item) => item.code === code)?.label || code;

  /**
   * 采纳服务端刚写好的草稿（模板套用）：画布直接跟库里内容对齐并清掉脏标记，
   * 否则用户会因为「有未保存修改」被反复追问，甚至把刚套用的结果再覆盖回去。
   */
  const adoptTree = useCallback((content: unknown) => {
    setTree(normalizeTree(content));
    setPast([]);
    setFuture([]);
    setDirty(false);
    setSelectedId(null);
  }, []);

  const saveContent = useCallback(async () => {
    if (!source) return false;
    try {
      if (source.id) {
        await cms.pageSaveContent.mutateAsync({
          body: { id: source.id, content: tree },
        });
      } else {
        await actions.saveContent.mutateAsync({ body: { id: siteId, content: tree } });
      }
      setDirty(false);
      return true;
    } catch {
      return false;
    }
  }, [actions, cms, siteId, source, tree]);

  /** 切页面前先把未保存的改动问清楚：画布只有一份，静默切换等于丢工作。 */
  const switchPage = useCallback(
    (nextId: number) => {
      if (!nextId || nextId === activePageId) return;
      const go = () => {
        setPageId(nextId);
        setPanel("");
      };
      if (!dirty) {
        go();
        return;
      }
      modal.confirm({
        title: "当前页面还有未保存的修改",
        content: "保存后再切换，或放弃本次改动直接切换。",
        okText: "保存并切换",
        cancelText: "放弃修改",
        onOk: async () => {
          if (await saveContent()) go();
        },
        onCancel: () => go(),
      });
    },
    [activePageId, dirty, modal, saveContent],
  );

  // 键盘快捷键：保存与撤销是编辑器里最高频的两个动作，不该让人去找按钮。
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveContent().then((ok) => {
          if (ok) message.success("草稿已保存");
        });
        return;
      }
      if (typing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [message, redo, saveContent, undo]);

  const close = () => {
    if (!dirty) {
      onClose();
      return;
    }
    modal.confirm({
      title: "还有未保存的修改",
      content: "离开编辑器不会写入草稿，未保存的改动会丢失。",
      okText: "保存并退出",
      cancelText: "直接退出",
      onOk: async () => {
        if (await saveContent()) onClose();
      },
      onCancel: () => onClose(),
    });
  };

  const publish = async () => {
    if (dirty && !(await saveContent())) return;
    await actions.publish.mutateAsync({ body: { id: siteId } });
    message.success("已发布，公开地址即刻生效");
  };

  const unpublish = () => {
    modal.confirm({
      title: "下线站点？",
      content: "公开地址立即返回「尚未发布」，草稿与域名配置都保留，可随时重新发布。",
      okText: "确认下线",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.unpublish.mutateAsync({ body: { id: siteId } });
        message.success("站点已下线");
      },
    });
  };

  const openSetting = () => {
    if (!site) return;
    setPanel("setting");
  };

  // 弹窗用了 destroyOnHidden，Form 实例只在打开后才挂上，回填必须等它出现
  const seedSetting = (open: boolean) => {
    if (!open || !site) return;
    form.setFieldsValue({
      title: site.title,
      slug: site.slug,
      favicon: site.favicon,
      coverImage: site.coverImage,
      defaultLanguage: site.defaultLanguage,
      languages: site.languages,
    });
  };

  const saveSetting = async () => {
    const values = (await form.validateFields()) as Record<string, unknown>;
    const defaultLanguage = String(
      values.defaultLanguage ?? site?.defaultLanguage ?? "zh-CN",
    ) as GeoSiteLanguage;
    const enabled = Array.from(
      new Set<GeoSiteLanguage>([
        defaultLanguage,
        ...((values.languages as GeoSiteLanguage[]) ?? []),
      ]),
    );
    const updated = await actions.update.mutateAsync({
      body: { id: siteId, ...values, defaultLanguage, languages: enabled },
    });
    setSeo(normalizeSeo(updated?.seo ?? null));
    setPanel("");
    message.success("站点信息已更新");
  };

  const canvasApi = {
    selectedId,
    select: setSelectedId,
    dropTarget,
    setDrop: setDropTarget,
    dropNew: (type: string, target: DropTarget) => {
      const item = paletteByType(type);
      if (!item) return;
      apply((current) => insertNear(current, target.id, target.position, item.create()));
    },
    dropMove: (dragId: string, targetId: string, position: DropPosition) => {
      apply((current) => moveNode(current, dragId, targetId, position));
    },
    setText: (id: string, value: string) => {
      apply((current) => setContentField(current, id, "innerText", value));
    },
    cms: {
      siteId,
      brand: site?.title ?? "",
      contentType: page?.contentType ?? "",
      lang: (page?.lang ?? site?.defaultLanguage ?? "") as GeoSiteLanguage | "",
    },
  };

  const inspectorApi = {
    patchStyle: (key: string, value: string | number) =>
      selected && apply((current) => setStyle(current, selected.id, key, value)),
    clearStyle: (key: string) =>
      selected && apply((current) => unsetStyle(current, selected.id, key)),
    patchContent: (key: string, value: unknown) =>
      selected && apply((current) => setContentField(current, selected.id, key, value)),
    rename: (name: string) =>
      selected && apply((current) => patchNode(current, selected.id, (node) => ({ ...node, name }))),
    remove: () => {
      if (!selected) return;
      apply((current) => removeNode(current, selected.id));
      setSelectedId(null);
    },
    duplicate: () => {
      if (!selected) return;
      apply((current) => duplicateNode(current, selected.id));
    },
  };

  /** 点一下组件图标＝追加到页面末尾：老站点可能没有 __body 包裹，直接落到根数组。 */
  const dropOnRoot = (type: string) => {
    const item = paletteByType(type);
    if (!item) return;
    apply((current) => {
      const body = current.find((node) => node.type === "__body");
      if (body && isContainer(body)) {
        return insertNode(current, body.id, (body.content as GeoSiteNode[]).length, item.create());
      }
      return insertNode(current, null, current.length, item.create());
    });
  };

  if (detail.isError) {
    return (
      <Shell>
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <Notice variant="error">{detail.error?.message || "站点读取失败"}</Notice>
          <Button icon={<ArrowLeftOutlined aria-hidden />} onClick={onClose}>
            返回列表
          </Button>
        </Space>
      </Shell>
    );
  }

  return (
    <Shell>
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: 12,
          background: "#f1f5f9",
          borderBottom: "1px solid #e2e8f0",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Button icon={<ArrowLeftOutlined aria-hidden />} onClick={close}>
          返回列表
        </Button>
        <Typography.Text strong style={{ fontSize: 15 }}>
          {site?.title || "加载中"}
        </Typography.Text>
        <Badge
          count={dirty ? "未保存" : "已保存"}
          color={dirty ? "#f59e0b" : "#16a34a"}
          style={{ fontWeight: 400 }}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {nodeCount} 个元素
        </Typography.Text>
        <div style={{ flex: 1 }} />
        <Segmented
          options={DEVICES}
          value={device}
          onChange={(value) => setDevice(String(value))}
        />
        <Space>
          <Tooltip title="撤销（Ctrl+Z）">
            <Button icon={<UndoOutlined aria-hidden />} disabled={!past.length} onClick={undo} />
          </Tooltip>
          <Tooltip title="重做（Ctrl+Shift+Z）">
            <Button icon={<RedoOutlined aria-hidden />} disabled={!future.length} onClick={redo} />
          </Tooltip>
          <Select
            style={{ minWidth: 170 }}
            value={activePageId || undefined}
            placeholder="选择页面"
            loading={pages.isPending}
            onChange={(value) => switchPage(Number(value))}
            options={(pages.data?.pages ?? []).map((row) => ({
              value: row.id,
              label: `${languageLabel(row.lang)} · ${row.isHome ? "首页" : row.title}${row.published ? "" : "（未发布）"}`,
            }))}
          />
          <Button icon={<AppstoreOutlined aria-hidden />} onClick={() => setPanel("pages")}>
            页面
          </Button>
          <Button icon={<MenuOutlined aria-hidden />} onClick={() => setPanel("menu")}>
            菜单
          </Button>
          <Button icon={<FileTextOutlined aria-hidden />} onClick={() => setPanel("contents")}>
            内容库
          </Button>
          <Button icon={<CodeOutlined aria-hidden />} onClick={() => setPanel("scripts")}>
            脚本
          </Button>
          <Button icon={<BlockOutlined aria-hidden />} onClick={() => setPanel("templates")}>
            模板库
          </Button>
          <Button icon={<HistoryOutlined aria-hidden />} onClick={() => setPanel("log")}>
            台账
          </Button>
          <Button icon={<SettingOutlined aria-hidden />} onClick={openSetting}>
            站点设置
          </Button>
          <Button icon={<GlobalOutlined aria-hidden />} onClick={() => setPanel("seo")}>
            SEO / GEO
          </Button>
          <Button icon={<LinkOutlined aria-hidden />} onClick={() => setPanel("domain")}>
            域名
          </Button>
          <Button onClick={() => setPanel("billing")}>账单</Button>
          <Button
            icon={<CopyOutlined aria-hidden />}
            disabled={!site?.url}
            onClick={async () => {
              await navigator.clipboard.writeText(site?.url || "");
              message.success("访问地址已复制");
            }}
          >
            复制地址
          </Button>
          {site?.status === "PUBLISHED" ? (
            <Button
              icon={<CloudUploadOutlined aria-hidden />}
              onClick={() =>
                site.url && window.open(site.url, "_blank", "noopener,noreferrer")
              }
            >
              查看线上
            </Button>
          ) : null}
          <Button
            icon={<SaveOutlined aria-hidden />}
            loading={actions.saveContent.isPending}
            disabled={!dirty}
            onClick={async () => {
              if (await saveContent()) message.success("草稿已保存");
            }}
          >
            保存草稿
          </Button>
          {site?.status === "PUBLISHED" ? (
            <Button danger onClick={unpublish}>
              下线
            </Button>
          ) : null}
          <Button type="primary" loading={actions.publish.isPending} onClick={publish}>
            发布
          </Button>
        </Space>
      </div>

      {site?.status === "SUSPENDED" ? (
        <div style={{ padding: "8px 12px" }}>
          <Notice variant="error">
            站点已停止公开访问：
            {site.offReason ||
              site.billingNote ||
              "积分欠费"}
            。充值后由日批自动补扣恢复；编辑与保存不受影响。
          </Notice>
        </div>
      ) : null}

      {/* 三栏在窄窗口下宁可横向滚动，也不能把画布挤成 0 宽（画布是主工作区） */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflowX: "auto" }}>
        {/* 左栏：元素面板 + 图层 */}
        <div
          style={{
            width: 260,
            flexShrink: 0,
            background: "#fff",
            borderRight: "1px solid #e2e8f0",
            overflow: "auto",
            padding: 12,
          }}
        >
          {PALETTE_GROUPS.map((group) => (
            <div key={group} style={{ marginBottom: 14 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {group}
              </Typography.Text>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  marginTop: 6,
                }}
              >
                {PALETTE.filter((item) => item.group === group).map((item) => (
                  <Tooltip key={item.type} title={item.hint || `拖入画布添加${item.label}`}>
                    <div
                      draggable
                      onDragStart={(event) => paletteDragStart(event, item.type)}
                      onClick={() => dropOnRoot(item.type)}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        padding: "7px 8px",
                        fontSize: 12,
                        textAlign: "center",
                        cursor: "grab",
                        background: "#f8fafc",
                        userSelect: "none",
                      }}
                    >
                      {item.label}
                    </div>
                  </Tooltip>
                ))}
              </div>
              {group === "站点模块" && !hasNavBlock ? (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    fontSize: 12,
                    lineHeight: 1.7,
                    color: "#92400e",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: 8,
                  }}
                >
                  本页还没有导航。顶部那条不再自动生成：把「导航菜单」拖进页面就能自己排版，菜单项在「菜单」里维护。
                </div>
              ) : null}
            </div>
          ))}
          <Divider label="图层" />
          <Layers
            nodes={tree}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onShift={(id, delta) => apply((current) => shiftNode(current, id, delta))}
            onDuplicate={(id) => apply((current) => duplicateNode(current, id))}
            onRemove={(id) => {
              apply((current) => removeNode(current, id));
              setSelectedId((current) => (current === id ? null : current));
            }}
          />
        </div>

        {/* 中栏：画布 */}
        <div
          style={{ flex: 1, minWidth: 420, overflow: "auto", padding: 16 }}
          onClick={() => setSelectedId(null)}
        >
          <div
            style={{
              width: DEVICE_WIDTH[device],
              maxWidth: "100%",
              margin: "0 auto",
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 1px 3px rgba(15,23,42,0.12)",
              overflow: "hidden",
            }}
          >
            <Canvas
              api={canvasApi}
              onBackgroundClick={() => setSelectedId(null)}
            >
              {tree.map((node) => (
                <NodeView key={node.id} node={node} />
              ))}
            </Canvas>
          </div>
        </div>

        {/* 右栏：属性 */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            background: "#fff",
            borderLeft: "1px solid #e2e8f0",
            overflow: "auto",
            padding: 12,
          }}
        >
          {selected ? (
            <Inspector node={selected} api={inspectorApi} />
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              在画布点选一个元素后编辑内容与样式；双击文字可直接改文案。
            </Typography.Text>
          )}
        </div>
      </div>

      <Modal
        title={page ? `SEO / GEO 档案 · ${page.title}` : "SEO / GEO 档案"}
        open={panel === "seo"}
        onCancel={() => setPanel("")}
        onOk={async () => {
          if (source?.id) {
            await cms.pageUpdate.mutateAsync({ body: { id: source.id, seo } });
          } else {
            await actions.update.mutateAsync({ body: { id: siteId, seo } });
          }
          setPanel("");
          message.success("SEO 档案已保存，发布后写入页面");
        }}
        okText="保存"
        width={640}
        destroyOnHidden
      >
        <SeoForm value={seo} onChange={setSeo} />
        {page ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            页面级档案优先于站点级；留空的字段自动回落到站点档案。
          </Typography.Text>
        ) : null}
      </Modal>

      <Modal
        title="页面管理"
        open={panel === "pages"}
        onCancel={() => setPanel("")}
        footer={null}
        width={1000}
      >
        <PagePanel siteId={siteId} currentId={activePageId} onPick={switchPage} />
      </Modal>

      <Modal
        title="菜单管理"
        open={panel === "menu"}
        onCancel={() => setPanel("")}
        footer={null}
        width={860}
      >
        <MenuPanel siteId={siteId} onOpenPage={switchPage} />
      </Modal>

      <Modal
        title="内容库"
        open={panel === "contents"}
        onCancel={() => setPanel("")}
        footer={null}
        width={1080}
      >
        <ContentPanel siteId={siteId} />
      </Modal>

      <Modal
        title={page ? `页面脚本 · ${page.title}` : "页面脚本"}
        open={panel === "scripts"}
        onCancel={() => setPanel("")}
        footer={null}
        width={860}
      >
        {page ? (
          <ScriptPanel
            siteId={siteId}
            page={page}
            meta={meta.data}
            scriptsEnabled={site?.scriptsEnabled ?? true}
            adminSettingsUrl="/admin/geo-site"
          />
        ) : (
          <Notice variant="warn">页面数据还没加载完成，稍后再试。</Notice>
        )}
      </Modal>

      <Modal
        title="模板库"
        open={panel === "templates"}
        onCancel={() => setPanel("")}
        footer={null}
        width={900}
      >
        <TemplatePanel
          siteId={siteId}
          pageId={activePageId}
          pageTitle={page?.title ?? site?.title ?? ""}
          tree={tree}
          selected={selected}
          onApplied={adoptTree}
        />
      </Modal>

      <Modal
        title="发布台账"
        open={panel === "log"}
        onCancel={() => setPanel("")}
        footer={null}
        width={900}
      >
        <PublishLogPanel siteId={siteId} />
      </Modal>

      <Modal
        title="域名绑定"
        open={panel === "domain"}
        onCancel={() => setPanel("")}
        footer={null}
        width={860}
      >
        <DomainPanel
          siteId={siteId}
          customDomainEnabled={meta.data?.customDomainEnabled ?? false}
          needsIcpAck={meta.data?.needsIcpAck ?? false}
          maxDomains={meta.data?.maxDomainsPerSite ?? 5}
          adminSettingsUrl="/admin/geo-site"
        />
      </Modal>

      <Modal
        title="按月积分账单"
        open={panel === "billing"}
        onCancel={() => setPanel("")}
        footer={null}
        width={720}
      >
        <BillingPanel siteId={siteId} />
      </Modal>

      <Modal
        title="站点设置"
        open={panel === "setting"}
        onCancel={() => setPanel("")}
        onOk={saveSetting}
        afterOpenChange={seedSetting}
        okText="保存"
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="站点名称"
            rules={[{ required: true, message: "站点名称不能为空" }]}
          >
            <Input maxLength={120} showCount />
          </Form.Item>
          <Form.Item
            name="slug"
            label="访问标识"
            extra={
              meta.data?.rootDomain
                ? `站点将发布在 ${String(form.getFieldValue("slug") || "{标识}")}.${meta.data.rootDomain}`
                : "未配置平台根域名时，站点走本站路径 /geo-site/{标识}"
            }
          >
            <Input maxLength={63} placeholder="小写字母、数字与连字符" />
          </Form.Item>
          <Form.Item
            name="defaultLanguage"
            label="默认语言"
            extra="默认语言直接挂在站点根路径，并作为菜单、内容的兜底语言。切换前请先确认新默认语言已有首页。"
            rules={[{ required: true, message: "请选择默认语言" }]}
          >
            <Select
              options={languageOptions.map((item) => ({
                value: item.code,
                label: item.label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="languages"
            label="启用的语言"
            extra="非默认语言的页面发布在 /语言码/ 路径下；取消启用后该语言页面不再对外渲染，草稿仍保留。"
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="至少包含默认语言"
              options={languageOptions.map((item) => ({
                value: item.code,
                label: item.label,
              }))}
            />
          </Form.Item>
          <Form.Item name="favicon" label="站点图标 favicon（图片链接）">
            <Input maxLength={500} placeholder="https://…" />
          </Form.Item>
          <Form.Item name="coverImage" label="分享封面（图片链接）">
            <Input maxLength={500} placeholder="https://…" />
          </Form.Item>
        </Form>
        {site ? (
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: "url", label: "访问地址", children: <Typography.Text copyable>{site.url}</Typography.Text> },
              {
                key: "status",
                label: "状态",
                children: `${site.statusLabel} · 本月 ${site.monthlyPoints} 积分${site.billingNote ? `（${site.billingNote}）` : ""}`,
              },
              {
                key: "published",
                label: "最近发布",
                children: site.publishedAt
                  ? new Date(site.publishedAt).toLocaleString()
                  : "尚未发布",
              },
            ]}
          />
        ) : null}
      </Modal>
    </Shell>
  );
}

/** 全屏编辑器外壳：自绘顶栏，不用 antd Modal，避免画布滚动与层级互相打架。 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: "10px 0",
        color: "#94a3b8",
        fontSize: 12,
      }}
    >
      <span style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
      {label}
      <span style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
    </div>
  );
}
