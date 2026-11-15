"use client";

import type { GeoSiteLanguage } from "@enterprise/contracts";
import { createContext, useContext, useMemo, useState } from "react";
import { Input } from "antd";
import { RawImg } from "@/components/ui/raw-img";
import {
  useGeoSiteContents,
  useGeoSiteMenus,
  useGeoSitePages,
  type GeoSiteContentRow,
  type GeoSiteMenuRow,
} from "@/query/geo-site";
import {
  DYNAMIC_PREVIEW,
  isContainer,
  isDynamicType,
  type DynamicPreview,
  type GeoSiteNode,
} from "./geo-site-elements";
import type { DropPosition, DropTarget } from "./geo-site-tree";

/**
 * 画布渲染：与后端 geo-site.render.service.ts 同一套标签与样式口径，
 * 所见即所得的目标是「编辑器里看到的就是发布后的样子」，差异只留在交互层。
 */

type CanvasApi = {
  selectedId: string | null;
  select: (id: string | null) => void;
  dropNew: (type: string, target: DropTarget) => void;
  dropMove: (dragId: string, targetId: string, position: DropPosition) => void;
  setText: (id: string, value: string) => void;
  /** 拖拽落点：before/after 在目标上下画插入线，inside 高亮容器边框，同时只留一个。 */
  dropTarget: DropTarget | null;
  setDrop: (target: DropTarget | null) => void;
  /**
   * 站点模块的数据来源：导航读菜单树、列表读内容库，都按站点取草稿态数据，
   * 这样站长刚加的菜单项不用先发布站点就能在画布里排版。
   */
  cms: {
    siteId: number;
    brand: string;
    contentType: string;
    lang: GeoSiteLanguage | "";
  };
};

const CanvasContext = createContext<CanvasApi | null>(null);
export const useCanvas = () => {
  const value = useContext(CanvasContext);
  if (!value) throw new Error("画布节点必须在 Canvas 内渲染");
  return value;
};

const NEW_PREFIX = "gs-new:";
const MOVE_PREFIX = "gs-move:";

export const paletteDragStart = (
  event: React.DragEvent,
  type: string,
): void => {
  event.dataTransfer.setData("text/plain", `${NEW_PREFIX}${type}`);
  event.dataTransfer.effectAllowed = "copy";
};

const readDragData = (event: React.DragEvent): { kind: "new" | "move"; value: string } | null => {
  const raw = event.dataTransfer.getData("text/plain");
  if (raw.startsWith(NEW_PREFIX)) return { kind: "new", value: raw.slice(NEW_PREFIX.length) };
  if (raw.startsWith(MOVE_PREFIX)) return { kind: "move", value: raw.slice(MOVE_PREFIX.length) };
  return null;
};

const leafText = (node: GeoSiteNode): string => {
  const content = node.content as Record<string, unknown>;
  return typeof content.innerText === "string" ? content.innerText : "";
};

const contentField = (node: GeoSiteNode, key: string): string => {
  const content = node.content as Record<string, unknown>;
  return typeof content[key] === "string" ? (content[key] as string) : "";
};

const TAG_BY_TYPE: Record<string, "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span"> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  p: "p",
  span: "span",
};

/** 可双击改文案的类型。 */
const TEXT_TYPES = new Set(Object.keys(TAG_BY_TYPE));

/** 默认为 flex 横排的容器类型：与渲染层默认样式保持一致。 */
const FLEX_TYPES = new Set(["2Col", "3Col", "row"]);

/** 子菜单标题：契约里 children 是 unknown[]（递归 schema 会打爆 openapi），这里按同型收敛。 */
const subLabels = (children: unknown): string[] =>
  (Array.isArray(children) ? children : [])
    .filter(
      (row): row is GeoSiteMenuRow =>
        !!row && typeof row === "object" && (row as GeoSiteMenuRow).visible === true,
    )
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map((row) => row.label);

function EditableText({ node }: { node: GeoSiteNode }) {
  const canvas = useCanvas();
  const [editing, setEditing] = useState(false);
  const Tag = TAG_BY_TYPE[node.type] ?? "p";
  const text = leafText(node);
  if (editing) {
    return (
      <Input.TextArea
        autoFocus
        defaultValue={text}
        autoSize={{ minRows: 1, maxRows: 16 }}
        style={{ fontSize: 14, margin: 0 }}
        onBlur={(event) => {
          canvas.setText(node.id, event.target.value);
          setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            canvas.setText(node.id, (event.target as HTMLTextAreaElement).value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <Tag
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      // 模板给了字号、行高、颜色等排版，画布必须一并套上，否则所见非所得
      style={{ ...(node.styles as React.CSSProperties), cursor: "text" }}
    >
      {text || <span style={{ color: "#94a3b8" }}>双击编辑文案</span>}
    </Tag>
  );
}

/** 动态区块的空态底：既告诉站长这里将来放什么，也让区块在画布上可选中。 */
function DynamicEmpty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "18px 16px",
        textAlign: "center",
        color: "#94a3b8",
        fontSize: 13,
        background: "#f8fafc",
        border: "1px dashed #cbd5e1",
        borderRadius: 12,
      }}
    >
      {text}
    </div>
  );
}

/** 导航预览：读草稿菜单树，与渲染层的 navBar/footerNav 取同一 location 的可见项。 */
function NavPreview({
  style,
  location,
  footer,
}: {
  style: React.CSSProperties;
  location: "HEADER" | "FOOTER";
  footer: boolean;
}) {
  const canvas = useCanvas();
  const menus = useGeoSiteMenus(canvas.cms.siteId, canvas.cms.lang || undefined);
  const items = useMemo(
    () =>
      (menus.data ?? [])
        .filter((row) => row.location === location && row.visible)
        .slice()
        .sort((a, b) => a.sort - b.sort)
        .map((row) => ({
          label: row.label,
          children: subLabels(row.children),
        })),
    [menus.data, location],
  );
  if (!items.length)
    return (
      <DynamicEmpty
        text={
          footer
            ? "页脚导航还没有菜单项：点上方「菜单」，位置选「页脚导航」"
            : "顶部导航还没有菜单项：点上方「菜单」，位置选「顶部导航」"
        }
      />
    );
  const link = {
    padding: "8px 14px",
    color: (style.color as string) || "#334155",
    borderRadius: 8,
    fontSize: (style.fontSize as number) || 15,
    whiteSpace: "nowrap" as const,
  };
  return (
    <nav style={{ ...style, outline: "none" }}>
      {!footer && (
        <span style={{ fontWeight: 700, fontSize: 18, color: "#0f172a" }}>
          {canvas.cms.brand || "站点名称"}
        </span>
      )}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexWrap: "wrap",
          marginLeft: footer ? 0 : "auto",
        }}
      >
        {items.map((item, index) => (
          <span key={`${item.label}-${index}`} style={{ position: "relative" }}>
            <span style={link}>{item.label}</span>
            {item.children.length > 0 && (
              <span
                style={{
                  display: "block",
                  color: "#94a3b8",
                  fontSize: 12,
                  paddingLeft: 14,
                }}
              >
                {item.children.join(" / ")}
              </span>
            )}
          </span>
        ))}
        {footer && <span style={{ color: "#cbd5e1" }}>·</span>}
      </span>
    </nav>
  );
}

/** 内容卡片预览：标题与价格来自内容库，取前 4 条足够判断版式。 */
function CardsPreview({
  style,
  contentKind,
}: {
  style: React.CSSProperties;
  contentKind: "article" | "product";
}) {
  const canvas = useCanvas();
  const query = useGeoSiteContents(canvas.cms.siteId, contentKind, {
    lang: canvas.cms.lang || undefined,
  });
  const rows = (query.data?.items ?? []).filter(
    (row) => row.status === "PUBLISHED",
  );
  const total = query.data?.total ?? rows.length;
  if (!rows.length)
    return (
      <DynamicEmpty
        text={
          contentKind === "product"
            ? "内容库里还没有已发布的产品：点上方「内容」新建并发布"
            : "内容库里还没有已发布的文章：点上方「内容」新建并发布"
        }
      />
    );
  return (
    <div style={style}>
      {rows.slice(0, 4).map((row) => (
        <CardPreview key={row.id} row={row} contentKind={contentKind} />
      ))}
      {total > rows.length && (
        <div style={{ color: "#94a3b8", fontSize: 13 }}>
          另有 {total - rows.length} 条已发布内容按分页展示
        </div>
      )}
    </div>
  );
}

function CardPreview({
  row,
  contentKind,
}: {
  row: GeoSiteContentRow;
  contentKind: "article" | "product";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 16,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 14,
      }}
    >
      {row.coverImage ? (
        <RawImg
          src={row.coverImage}
          alt={row.title}
          style={{ borderRadius: 10, maxHeight: 160, objectFit: "cover" }}
        />
      ) : null}
      <span style={{ fontWeight: 600, fontSize: 17, color: "#0f172a" }}>
        {row.title}
      </span>
      <span style={{ color: "#94a3b8", fontSize: 13 }}>
        {row.category ? `${row.category} · ` : ""}
        {(row.publishedAt || row.updatedAt).slice(0, 10)}
      </span>
      <span style={{ color: "#475569", fontSize: 14, lineHeight: 1.7 }}>
        {row.summary || "（暂无摘要）"}
      </span>
      {contentKind === "product" && (
        <span style={{ color: "#ea580c", fontWeight: 600 }}>
          {row.priceOnAsk ? "价格面议" : `${row.price ?? 0}${row.unit || "元"}`}
        </span>
      )}
    </div>
  );
}

/** 语言切换预览：当前页若在其它语言没有对应页面，渲染层不会生成链接，这里保持一致。 */
function LanguagesPreview({ style }: { style: React.CSSProperties }) {
  const canvas = useCanvas();
  const pages = useGeoSitePages(canvas.cms.siteId);
  const languages = pages.data?.languages ?? [];
  const defaultLanguage = pages.data?.defaultLanguage ?? "zh-CN";
  const options = pages.data?.languageOptions ?? [];
  const labelOf = (code: string) =>
    options.find((item) => item.code === code)?.label || code;
  if (languages.length < 2)
    return (
      <DynamicEmpty text="只启用了 1 种语言：在「站点设置」里添加语言后，这里才会出现切换入口" />
    );
  return (
    <div style={style}>
      {languages.map((code, index) => {
        const active = code === canvas.cms.lang;
        return (
          <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {index > 0 ? <span style={{ color: "#cbd5e1" }}>/</span> : null}
            <span
              style={{
                fontWeight: active ? 600 : 400,
                color: active ? "#2563eb" : undefined,
                textDecoration: active ? "underline" : "none",
              }}
            >
              {labelOf(code)}
              {code === defaultLanguage ? "（默认）" : ""}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function DynamicBlock({ node }: { node: GeoSiteNode }) {
  const spec = DYNAMIC_PREVIEW[node.type] as DynamicPreview | undefined;
  const style = node.styles as React.CSSProperties;
  if (!spec) return <EditableText node={node} />;
  if (spec.kind === "nav")
    return (
      <NavPreview
        style={style}
        location={spec.location}
        footer={spec.location === "FOOTER"}
      />
    );
  if (spec.kind === "cards")
    return <CardsPreview style={style} contentKind={spec.contentKind} />;
  if (spec.kind === "languages")
    return <LanguagesPreview style={style} />;
  return (
    <div style={style}>
      <DynamicEmpty text={`${spec.label}：${spec.note}`} />
    </div>
  );
}

function Leaf({ node }: { node: GeoSiteNode }) {
  const style = node.styles as React.CSSProperties;
  if (isDynamicType(node.type)) return <DynamicBlock node={node} />;
  switch (node.type) {
    case "image": {
      const src = contentField(node, "imageUrl");
      return src ? (
        <RawImg src={src} alt={contentField(node, "altText")} style={{ ...style, display: "block" }} />
      ) : (
        <div
          style={{
            padding: "28px 16px",
            textAlign: "center",
            color: "#94a3b8",
            background: "#f1f5f9",
            border: "1px dashed #cbd5e1",
            borderRadius: 12,
            ...style,
          }}
        >
          图片待替换：在右侧填图片链接或从数字资产选择
        </div>
      );
    }
    case "button":
      return (
        <span
          style={{
            display: "inline-block",
            cursor: "pointer",
            ...style,
          }}
        >
          {leafText(node) || "按钮文案"}
        </span>
      );
    case "link":
      return (
        <span style={{ color: "#2563eb", textDecoration: "underline", ...style }}>
          {leafText(node) || contentField(node, "href") || "链接地址"}
        </span>
      );
    case "list": {
      const items = leafText(node)
        .split(/\r?\n/)
        .map((item) => item.replace(/^[-•*\d.、\s]+/, "").trim())
        .filter(Boolean);
      return (
        <ul style={{ paddingLeft: 20, ...style }}>
          {(items.length ? items : ["一行一条要点"]).map((item, index) => (
            <li key={`${node.id}-${index}`}>{item}</li>
          ))}
        </ul>
      );
    }
    case "video": {
      const url = contentField(node, "href") || contentField(node, "imageUrl");
      return (
        <div
          style={{
            padding: "26px 16px",
            textAlign: "center",
            color: "#475569",
            background: "#0f172a",
            borderRadius: 12,
            ...style,
          }}
        >
          {url ? `视频：${url}` : "视频待填链接（YouTube / B 站 / Vimeo / mp4）"}
        </div>
      );
    }
    case "divider":
      return <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", ...style }} />;
    case "spacer":
      return (
        <div
          style={{
            height: typeof style.height === "number" ? style.height : 48,
            background: "repeating-linear-gradient(45deg,#f8fafc,#f8fafc 8px,#f1f5f9 8px,#f1f5f9 16px)",
          }}
        />
      );
    default:
      return <EditableText node={node} />;
  }
}

/** 指针落在元素的上/下三分之一算「排到它前后」，容器中段算「放进容器」。 */
function dropPositionOf(
  event: React.DragEvent,
  container: boolean,
): DropPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.height <= 0) return container ? "inside" : "after";
  const ratio = (event.clientY - rect.top) / rect.height;
  if (!container) return ratio < 0.5 ? "before" : "after";
  if (ratio < 0.3) return "before";
  if (ratio > 0.7) return "after";
  return "inside";
}

export function NodeView({ node }: { node: GeoSiteNode }) {
  const canvas = useCanvas();
  const selected = canvas.selectedId === node.id;
  const container = isContainer(node);
  const drop = canvas.dropTarget?.id === node.id ? canvas.dropTarget.position : null;
  const common = {
    "data-node": node.id,
    onClick: (event: React.MouseEvent) => {
      event.stopPropagation();
      canvas.select(node.id);
    },
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.stopPropagation();
      event.dataTransfer.setData("text/plain", `${MOVE_PREFIX}${node.id}`);
      event.dataTransfer.effectAllowed = "move";
    },
    // 叶子节点也接拖拽：不接的话，页面上只有 container 能动，
    // 想插到第一个区块前面就没有落点可用（根层的 __body 覆盖不到上沿）
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const position = dropPositionOf(event, container);
      event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === "copy"
        ? "copy"
        : "move";
      if (canvas.dropTarget?.id !== node.id || canvas.dropTarget.position !== position) {
        canvas.setDrop({ id: node.id, position });
      }
    },
    onDragLeave: (event: React.DragEvent) => {
      // 移动到子节点会触发父节点的 leave，交给子节点的 over 接管，不在这里清
      const next = event.relatedTarget as Node | null;
      if (next && event.currentTarget.contains(next)) return;
      if (canvas.dropTarget?.id === node.id) canvas.setDrop(null);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      canvas.setDrop(null);
      const payload = readDragData(event);
      if (!payload) return;
      const position = dropPositionOf(event, container);
      if (payload.kind === "new") {
        canvas.dropNew(payload.value, { id: node.id, position });
        return;
      }
      canvas.dropMove(payload.value, node.id, position);
    },
  };
  const ring = selected
    ? { outline: "2px solid #2563eb", outlineOffset: -2 }
    : drop === "inside"
      ? { outline: "2px dashed #2563eb", outlineOffset: -2 }
      : {};

  /** 插入位指示线：before 画在元素上沿，after 画在下沿。 */
  const insertion =
    drop === "before" || drop === "after" ? (
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: drop === "before" ? 0 : undefined,
          bottom: drop === "after" ? 0 : undefined,
          height: 3,
          borderRadius: 2,
          background: "#2563eb",
          zIndex: 3,
          pointerEvents: "none",
        }}
      />
    ) : null;

  if (container) {
    const children = Array.isArray(node.content) ? node.content : [];
    const style = {
      ...(FLEX_TYPES.has(node.type)
        ? { display: "flex", gap: 20, flexWrap: "wrap" as const, alignItems: "stretch" }
        : {}),
      ...(node.styles as React.CSSProperties),
      ...ring,
      position: "relative" as const,
    };
    return (
      <div {...common} style={style}>
        {insertion}
        {children.map((child) => (
          <NodeView key={child.id} node={child} />
        ))}
        {!children.length ? (
          <div
            style={{
              width: "100%",
              padding: "18px 12px",
              textAlign: "center",
              color: drop ? "#2563eb" : "#94a3b8",
              border: `1px dashed ${drop ? "#2563eb" : "#cbd5e1"}`,
              borderRadius: 10,
              fontSize: 13,
              background: drop ? "#eff6ff" : "transparent",
            }}
          >
            从左侧拖入元素
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div
      {...common}
      style={{
        position: "relative",
        ...(TEXT_TYPES.has(node.type) ? {} : { display: "inline-block" }),
        ...ring,
      }}
    >
      {insertion}
      <Leaf node={node} />
    </div>
  );
}

export function Canvas({
  api,
  children,
  onBackgroundClick,
}: {
  api: CanvasApi;
  children: React.ReactNode;
  onBackgroundClick: () => void;
}) {
  return (
    <CanvasContext.Provider value={api}>
      <div onClick={onBackgroundClick}>{children}</div>
    </CanvasContext.Provider>
  );
}

export type { CanvasApi };
