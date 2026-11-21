"use client";
import {
  NotificationOutlined,
  PhoneOutlined,
  PictureOutlined,
  QrcodeOutlined,
  SearchOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import {
  BRAND_DEFAULT_DIY_STYLES,
  BRAND_LINK_TYPES,
  sanitizeRichTextHtml,
  type BrandDiyComponent,
  type BrandDiyLink,
  type BrandDiyPageStyles,
  type BrandDiyWidget,
} from "@enterprise/contracts";
import { RawImg } from "@/components/ui/raw-img";

/**
 * DIY 组件渲染器：编辑器（`/brand-mall/decorate`）与将来的顾客端预览页共用这一份。
 *
 * 只吃 props，不发请求：装修数据里的商品/券只存 id，端上是按 id 现查的，
 * 这里用骨架占位表达布局（列数、卡片/列表、显隐字段），保证所见即所得的**结构**一致。
 *
 * 尺寸口径：组件 props 里的像素值按小程序 750rpx 设计稿存，预览视口 375px，故一律折半；
 * 页面级 `styles.paddingTop` 契约里写明是 px，不折半。
 */

export type DiyProps = Record<string, unknown>;
export type DiyMode = "edit" | "preview";
/** 手机视口宽度：编辑器外框与顾客端预览都按这个宽度排版。 */
export const DIY_VIEWPORT_WIDTH = 375;

const THEME_RED = "#fa3534";
const LINE = "#eeeeee";

// ---------------------------------------------------------------- props 取值
// 后端把未知字段与 defaultProps 合并后原样回传，任何字段都可能是缺的或类型错的。

const asText = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number => {
  const raw = Number(value);
  return Number.isFinite(raw) ? raw : fallback;
};

export const propStr = (props: DiyProps, key: string, fallback = ""): string =>
  asText(props[key], fallback);

export const propNum = (props: DiyProps, key: string, fallback = 0): number =>
  asNumber(props[key], fallback);

export const propBool = (props: DiyProps, key: string, fallback = false): boolean =>
  typeof props[key] === "boolean" ? props[key] : fallback;

export const propList = (props: DiyProps, key: string): DiyProps[] =>
  Array.isArray(props[key])
    ? (props[key] as unknown[]).map((item) =>
        item && typeof item === "object" ? (item as DiyProps) : {},
      )
    : [];

/** 链接对象归一：脏数据（类型不认识）一律退回「不跳转」而不是崩掉渲染。 */
export function linkOf(raw: unknown): BrandDiyLink {
  const item = raw && typeof raw === "object" ? (raw as DiyProps) : {};
  const type = asText(item.type, "NONE");
  return {
    type: (BRAND_LINK_TYPES as readonly string[]).includes(type)
      ? (type as BrandDiyLink["type"])
      : "NONE",
    name: asText(item.name),
    path: asText(item.path),
    targetId: asNumber(item.targetId, 0),
  };
}

export const propLink = (props: DiyProps, key: string): BrandDiyLink =>
  linkOf(props[key]);

/** 页面级样式：契约里 styles 是自由对象，缺字段回落默认值。 */
export function normalizeDiyStyles(raw: unknown): BrandDiyPageStyles {
  const styles = raw && typeof raw === "object" ? (raw as DiyProps) : {};
  return {
    backgroundColor: asText(styles.backgroundColor, BRAND_DEFAULT_DIY_STYLES.backgroundColor),
    backgroundImage: asText(styles.backgroundImage),
    headerColor: asText(styles.headerColor, BRAND_DEFAULT_DIY_STYLES.headerColor),
    paddingTop: Math.min(200, Math.max(0, asNumber(styles.paddingTop, 0))),
  };
}

/** rpx（750 设计稿）→ 375px 视口的 CSS 像素。 */
export const rpx = (value: number): string => `${Math.round((value / 2) * 10) / 10}px`;

// ---------------------------------------------------------------- 通用小块

function Placeholder({
  height,
  text,
  radius = 0,
}: {
  height: number | string;
  text: string;
  radius?: number | string;
}) {
  return (
    <div
      style={{
        height,
        borderRadius: radius,
        background: "#f4f5f7",
        border: "1px dashed #dcdfe6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#adb2bb",
        fontSize: 12,
        boxSizing: "border-box",
      }}
    >
      {text}
    </div>
  );
}

/** 图片位：有地址就真显示，没有留占位（顾客端拿到的是同一份地址，不会错位）。 */
function ImageTile({
  url,
  height,
  radius,
  hint,
}: {
  url: string;
  height: number | string;
  radius: number | string;
  hint: string;
}) {
  if (!url) return <Placeholder height={height} text={hint} radius={radius} />;
  return (
    <RawImg
      src={url}
      alt=""
      style={{
        width: "100%",
        height,
        objectFit: "cover",
        display: "block",
        borderRadius: radius,
      }}
    />
  );
}

function TextLine({
  width = "60%",
  color = "#e6e8eb",
  height = 10,
  marginTop = 6,
}: {
  width?: string;
  color?: string;
  height?: number;
  marginTop?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        marginTop,
        borderRadius: height / 2,
        background: color,
      }}
    />
  );
}

const blockStyle = { boxSizing: "border-box" as const, width: "100%" };

/** 编辑态角标：说明这份骨架背后取的是哪批数据，顾客态不显示。 */
function EditHint({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "2px 8px 4px",
        fontSize: 11,
        color: "#98a0ad",
        textAlign: "right",
      }}
    >
      {text}
    </div>
  );
}

// ---------------------------------------------------------------- 14 个组件

function SearchBar({ props }: { props: DiyProps }) {
  const radius = rpx(propNum(props, "radius", 28));
  return (
    <div style={{ ...blockStyle, padding: `${rpx(16)} ${rpx(24)}` }}>
      <div
        style={{
          height: rpx(72),
          borderRadius: radius,
          background: "#f7f8fa",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: `0 ${rpx(24)}`,
          color: "#9aa0aa",
          fontSize: 13,
          boxSizing: "border-box",
          opacity: propBool(props, "disabled", true) ? 0.85 : 1,
        }}
      >
        <SearchOutlined aria-hidden style={{ fontSize: 14 }} />
        <span style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap" }}>
          {propStr(props, "placeholder", "搜索商品")}
        </span>
      </div>
    </div>
  );
}

function ImageAds({ props, mode }: { props: DiyProps; mode: DiyMode }) {
  const items = propList(props, "items");
  const height = rpx(propNum(props, "height", 320));
  const radius = rpx(propNum(props, "radius", 12));
  const gutter = rpx(propNum(props, "gutter", 16));
  const swiper = propStr(props, "mode", "swiper") === "swiper";
  if (!items.length) {
    return (
      <div style={{ ...blockStyle, padding: gutter }}>
        <Placeholder height={height} text="图片广告：还没配图" radius={radius} />
        {mode === "edit" ? <EditHint text="右侧「添加图片」后可配跳转" /> : null}
      </div>
    );
  }
  if (swiper) {
    const first = items[0];
    return (
      <div style={{ ...blockStyle, padding: gutter, boxSizing: "border-box" }}>
        <div style={{ position: "relative" }}>
          <ImageTile
            url={propStr(first, "image")}
            height={height}
            radius={radius}
            hint="轮播第 1 张"
          />
          <div
            style={{
              position: "absolute",
              right: 10,
              bottom: 8,
              display: "flex",
              gap: 4,
            }}
          >
            {items.slice(0, 5).map((_, index) => (
              <span
                key={index}
                style={{
                  width: index === 0 ? 12 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: index === 0 ? "#fff" : "rgba(255,255,255,.55)",
                }}
              />
            ))}
          </div>
        </div>
        {mode === "edit" ? (
          <EditHint
            text={`共 ${items.length} 张 · 每 ${propNum(props, "interval", 4)} 秒切换`}
          />
        ) : null}
      </div>
    );
  }
  return (
    <div style={{ ...blockStyle, display: "grid", gap: gutter, padding: gutter }}>
      {items.map((item, index) => (
        <ImageTile
          key={index}
          url={propStr(item, "image")}
          height={height}
          radius={radius}
          hint={`第 ${index + 1} 张`}
        />
      ))}
    </div>
  );
}

function ImageCube({ props, mode }: { props: DiyProps; mode: DiyMode }) {
  const items = propList(props, "items");
  const isFour = propStr(props, "layout", "FOUR") === "FOUR";
  const total = isFour ? 4 : 2;
  const radius = rpx(propNum(props, "radius", 8));
  const rows = isFour ? 2 : 1;
  // 四宫格两行、两栏一行：格子高度按设计稿给固定值，端上渲染同一套尺寸。
  const cellHeight = rpx(isFour ? 240 : 300);
  return (
    <div
      style={{
        ...blockStyle,
        display: "grid",
        gridTemplateColumns: `repeat(2, 1fr)`,
        gridTemplateRows: `repeat(${rows}, ${cellHeight})`,
        gap: rpx(propNum(props, "gutter", 8)),
        padding: rpx(propNum(props, "gutter", 8)),
        boxSizing: "border-box",
      }}
    >
      {Array.from({ length: total }).map((_, index) => {
        const item = items[index];
        return (
          <ImageTile
            key={index}
            url={propStr(item, "image")}
            height="100%"
            radius={radius}
            hint={mode === "edit" ? `${isFour ? "四宫格" : "两栏"} ${index + 1}` : ""}
          />
        );
      })}
    </div>
  );
}

function NavGrid({ props, mode }: { props: DiyProps; mode: DiyMode }) {
  const items = propList(props, "items");
  const columns = Math.min(6, Math.max(2, propNum(props, "columns", 4)));
  const rows = Math.max(1, Math.ceil((items.length || columns) / columns));
  return (
    <div style={{ ...blockStyle, padding: rpx(24) }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: `${rpx(24)} 0`,
        }}
      >
        {Array.from({ length: columns * rows }).map((_, index) => {
          const item = items[index];
          const icon = propStr(item, "icon");
          if (!item) return <div key={index} style={{ height: 0 }} />;
          return (
            <div
              key={index}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
            >
              {icon ? (
                <RawImg
                  src={icon}
                  alt=""
                  style={{ width: rpx(88), height: rpx(88), objectFit: "contain" }}
                />
              ) : (
                <div
                  style={{
                    width: rpx(88),
                    height: rpx(88),
                    borderRadius: "50%",
                    background: "#f4f5f7",
                    border: "1px dashed #dcdfe6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#adb2bb",
                    fontSize: 11,
                  }}
                >
                  图标
                </div>
              )}
              <span style={{ fontSize: 12, color: "#333" }}>
                {propStr(item, "text", "导航")}
              </span>
            </div>
          );
        })}
      </div>
      {mode === "edit" && !items.length ? (
        <EditHint text="图标导航：右侧添加导航项（图标+文字+跳转）" />
      ) : null}
    </div>
  );
}

function NoticeBar({ props }: { props: DiyProps }) {
  const text = propStr(props, "text");
  return (
    <div
      style={{
        ...blockStyle,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: `${rpx(20)} ${rpx(24)}`,
        background: "#fffbe6",
        color: "#8a6d1b",
        fontSize: 12,
        boxSizing: "border-box",
      }}
    >
      {propStr(props, "icon") ? (
        <RawImg
          src={propStr(props, "icon")}
          alt=""
          style={{ width: 14, height: 14, objectFit: "contain" }}
        />
      ) : (
        <NotificationOutlined aria-hidden style={{ fontSize: 14 }} />
      )}
      {/* 顾客端按 speed 做跑马灯滚动，预览只静态展示，避免编辑器里一直动。 */}
      <span style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
        {text || "公告内容（未填写）"}
      </span>
    </div>
  );
}

function TitleBlock({ props }: { props: DiyProps }) {
  const align = propStr(props, "align", "left");
  return (
    <div style={{ ...blockStyle, padding: `${rpx(28)} ${rpx(24)} ${rpx(8)}` }}>
      <div
        style={{
          textAlign: align === "center" ? "center" : align === "right" ? "right" : "left",
          fontSize: 17,
          fontWeight: propBool(props, "bold", true) ? 700 : 400,
          color: "#1f1f1f",
          lineHeight: 1.4,
        }}
      >
        {propStr(props, "main", "标题")}
      </div>
      {propStr(props, "sub") ? (
        <div
          style={{
            textAlign: align === "center" ? "center" : align === "right" ? "right" : "left",
            fontSize: 12,
            color: "#9aa0aa",
            marginTop: 2,
          }}
        >
          {propStr(props, "sub")}
        </div>
      ) : null}
    </div>
  );
}

function RichTextBlock({ props }: { props: DiyProps }) {
  const html = propStr(props, "html").trim();
  return (
    <div style={{ ...blockStyle, padding: `${rpx(16)} ${rpx(24)}` }}>
      {html ? (
        <div
          // 富文本由店主自己录入，写入前过 sanitize 白名单标签
          dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(html) }}
          style={{ fontSize: 14, lineHeight: 1.7, color: "#333", wordBreak: "break-word" }}
        />
      ) : (
        <Placeholder height={64} text="富文本：内容为空" radius={8} />
      )}
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  RECOMMEND: "推荐商品",
  CATEGORY: "指定分类",
  ALL: "全部商品",
  MANUAL: "手动选品",
};

function GoodsList({ props, mode }: { props: DiyProps; mode: DiyMode }) {
  const style = propStr(props, "style", "CARD");
  const source = propStr(props, "source", "RECOMMEND");
  const columns = Math.min(3, Math.max(1, propNum(props, "columns", 2)));
  const limit = Math.min(60, Math.max(1, propNum(props, "limit", 10)));
  const rawIds = Array.isArray(props.productIds) ? (props.productIds as unknown[]) : [];
  const count = source === "MANUAL" ? Math.max(1, rawIds.length) : limit;
  const shown = Math.min(count, 6);
  const showTitle = propBool(props, "showTitle", true);
  const showSubtitle = propBool(props, "showSubtitle", false);
  const showPrice = propBool(props, "showPrice", true);
  const showSales = propBool(props, "showSales", true);

  const card = (index: number) => (
    <div
      key={index}
      style={{
        background: "#fff",
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${LINE}`,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          aspectRatio: "1 / 1",
          width: "100%",
          background: "#f4f5f7",
        }}
      />
      <div style={{ padding: "6px 8px 8px" }}>
        {showTitle ? <TextLine width="85%" /> : null}
        {showSubtitle ? <TextLine width="60%" height={8} /> : null}
        {showPrice || showSales ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginTop: 6,
            }}
          >
            {showPrice ? (
              <span style={{ color: THEME_RED, fontSize: 13, fontWeight: 600 }}>¥ —</span>
            ) : null}
            {showSales ? <span style={{ color: "#b0b5bd", fontSize: 11 }}>销量 —</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  const row = (index: number) => (
    <div
      key={index}
      style={{
        display: "flex",
        gap: 8,
        background: "#fff",
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        padding: 8,
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: 78, flexShrink: 0 }}>
        <div style={{ width: 78, height: 78, borderRadius: 6, background: "#f4f5f7" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {showTitle ? <TextLine width="80%" marginTop={0} /> : null}
        {showSubtitle ? <TextLine width="55%" height={8} /> : null}
        {showPrice || showSales ? (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
            {showPrice ? (
              <span style={{ color: THEME_RED, fontSize: 13, fontWeight: 600 }}>¥ —</span>
            ) : null}
            {showSales ? <span style={{ color: "#b0b5bd", fontSize: 11 }}>销量 —</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div style={{ ...blockStyle, padding: `${rpx(16)} ${rpx(24)}` }}>
      {style === "LIST" ? (
        <div style={{ display: "grid", gap: 8 }}>{Array.from({ length: shown }, (_, i) => row(i))}</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: 8,
          }}
        >
          {Array.from({ length: shown }, (_, i) => card(i))}
        </div>
      )}
      {mode === "edit" ? (
        <EditHint
          text={`数据源：${SOURCE_LABELS[source] ?? source} · 最多 ${count} 个${shown < count ? `（预览只画 ${shown} 个）` : ""}`}
        />
      ) : null}
    </div>
  );
}

function CategoryLine({ props, mode }: { props: DiyProps; mode: DiyMode }) {
  const limit = Math.min(12, Math.max(1, propNum(props, "limit", 10)));
  return (
    <div style={{ ...blockStyle, padding: `${rpx(20)} ${rpx(24)}` }}>
      <div style={{ display: "flex", gap: 10, overflow: "hidden" }}>
        {Array.from({ length: limit }).map((_, index) => (
          <div
            key={index}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                background: "#f4f5f7",
                border: "1px dashed #dcdfe6",
              }}
            />
            <span style={{ fontSize: 11, color: "#666" }}>分类</span>
          </div>
        ))}
      </div>
      {mode === "edit" ? <EditHint text={`取一级分类，最多 ${limit} 个（横滑）`} /> : null}
    </div>
  );
}

function CouponBlock({ props, mode }: { props: DiyProps; mode: DiyMode }) {
  const rawIds = Array.isArray(props.couponIds) ? (props.couponIds as unknown[]) : [];
  const total = Math.max(2, rawIds.length || 2);
  const shown = Math.min(total, 4);
  const isTwo = propStr(props, "style", "TWO") === "TWO";
  return (
    <div style={{ ...blockStyle, padding: `${rpx(16)} ${rpx(24)}` }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isTwo ? "repeat(2, 1fr)" : "1fr",
          gap: 8,
        }}
      >
        {Array.from({ length: shown }).map((_, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#fff3f3",
              border: `1px solid #ffd6d6`,
              borderRadius: 8,
              padding: 8,
              boxSizing: "border-box",
            }}
          >
            <div style={{ color: THEME_RED, fontWeight: 700, fontSize: 15, minWidth: 46 }}>
              {isTwo ? "¥—" : "¥ —"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#333" }}>优惠券名称</div>
              <div style={{ fontSize: 11, color: "#b78a86" }}>满 — 元可用</div>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#fff",
                background: THEME_RED,
                borderRadius: 10,
                padding: "3px 8px",
                whiteSpace: "nowrap",
              }}
            >
              领取
            </div>
          </div>
        ))}
      </div>
      {mode === "edit" ? (
        <EditHint text={rawIds.length ? `已选 ${rawIds.length} 张券` : "未指定券：端上取可领取的前几张"} />
      ) : null}
    </div>
  );
}

function StoreHead({ props }: { props: DiyProps }) {
  return (
    <div
      style={{
        ...blockStyle,
        background: "linear-gradient(180deg, #fdeaea 0%, #ffffff 100%)",
        padding: `${rpx(36)} ${rpx(24)}`,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {propBool(props, "showLogo", true) ? (
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 8,
              background: "#fff",
              border: "1px dashed #dcdfe6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#adb2bb",
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            <ShopOutlined aria-hidden />
          </div>
        ) : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#1f1f1f" }}>店铺名称</div>
          {propBool(props, "showSlogan", true) ? (
            <div style={{ fontSize: 12, color: "#7b8089", marginTop: 2 }}>店铺一句话简介</div>
          ) : null}
        </div>
      </div>
      {propBool(props, "showPhone", true) ? (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "#5c626b",
          }}
        >
          <PhoneOutlined aria-hidden />
          客服电话（在店铺设置里填写）
        </div>
      ) : null}
    </div>
  );
}

function AssistBlock({ props }: { props: DiyProps }) {
  const mode = propStr(props, "mode", "PHONE");
  const label = propStr(props, "label", "联系客服");
  if (mode === "QRCODE") {
    return (
      <div style={{ ...blockStyle, padding: `${rpx(20)} ${rpx(24)}`, textAlign: "center" }}>
        <div
          style={{
            width: 96,
            height: 96,
            margin: "0 auto",
            borderRadius: 8,
            border: "1px dashed #dcdfe6",
            background: "#fafafa",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#adb2bb",
          }}
        >
          <QrcodeOutlined aria-hidden style={{ fontSize: 28 }} />
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{label}</div>
      </div>
    );
  }
  return (
    <div style={{ ...blockStyle, padding: `${rpx(16)} ${rpx(24)}` }}>
      <div
        style={{
          height: 40,
          borderRadius: 20,
          border: `1px solid ${LINE}`,
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontSize: 13,
          color: "#333",
        }}
      >
        {mode === "COPY" ? <PictureOutlined aria-hidden /> : <PhoneOutlined aria-hidden />}
        {label}
      </div>
    </div>
  );
}

function Spacer({ props }: { props: DiyProps }) {
  const color = propStr(props, "color", "transparent");
  return (
    <div
      style={{
        ...blockStyle,
        height: rpx(propNum(props, "height", 12)),
        background: color || "transparent",
      }}
    />
  );
}

function PageFoot({ props, mode }: { props: DiyProps; mode: DiyMode }) {
  const items = propList(props, "items");
  const shown = items.length ? items.slice(0, 5) : [{ text: "首页" }, { text: "分类" }, { text: "我的" }];
  return (
    <div
      style={{
        ...blockStyle,
        display: "flex",
        borderTop: `1px solid ${LINE}`,
        background: "#fff",
        boxSizing: "border-box",
      }}
    >
      {shown.map((item, index) => {
        const icon = propStr(item, "iconPath");
        return (
          <div
            key={`${index}-${propStr(item, "text")}`}
            style={{
              flex: 1,
              padding: "6px 0 8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              fontSize: 11,
              color: index === 0 ? THEME_RED : "#8a8f99",
            }}
          >
            {icon ? (
              <RawImg
                src={index === 0 ? propStr(item, "selectedIconPath", icon) : icon}
                alt=""
                style={{ width: 22, height: 22, objectFit: "contain" }}
              />
            ) : (
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: index === 0 ? "#ffeceb" : "#f2f3f5",
                }}
              />
            )}
            <span>{propStr(item, "text", "导航")}</span>
          </div>
        );
      })}
      {mode === "edit" && !items.length ? (
        <EditHint text="底部导航：右侧填 tabBar 项（页面路径 + 图标）" />
      ) : null}
    </div>
  );
}

const RENDERERS: Record<BrandDiyWidget, (args: { props: DiyProps; mode: DiyMode }) => ReactNode> = {
  searchBar: ({ props }) => <SearchBar props={props} />,
  imageAds: ({ props, mode }) => <ImageAds props={props} mode={mode} />,
  imageCube: ({ props, mode }) => <ImageCube props={props} mode={mode} />,
  nav: ({ props, mode }) => <NavGrid props={props} mode={mode} />,
  notice: ({ props }) => <NoticeBar props={props} />,
  title: ({ props }) => <TitleBlock props={props} />,
  goodsList: ({ props, mode }) => <GoodsList props={props} mode={mode} />,
  categoryLine: ({ props, mode }) => <CategoryLine props={props} mode={mode} />,
  coupon: ({ props, mode }) => <CouponBlock props={props} mode={mode} />,
  storeHead: ({ props }) => <StoreHead props={props} />,
  assist: ({ props }) => <AssistBlock props={props} />,
  spacer: ({ props }) => <Spacer props={props} />,
  pageFoot: ({ props, mode }) => <PageFoot props={props} mode={mode} />,
  richText: ({ props }) => <RichTextBlock props={props} />,
};

/** 单个组件：编辑器画布里每个块用它，块级工具条（选中/上下移/复制/删除）由编辑器负责。 */
export function DiyBlock({
  component,
  mode = "preview",
}: {
  component: BrandDiyComponent;
  mode?: DiyMode;
}) {
  const render = RENDERERS[component.type];
  const props = (component.props ?? {}) as DiyProps;
  return (
    <div style={{ width: "100%", boxSizing: "border-box" }}>
      {render ? (
        render({ props, mode })
      ) : (
        // 白名单外的类型后端已丢弃，这里只兜底极旧的缓存数据。
        <Placeholder height={48} text={`未知组件：${String(component.type)}`} radius={6} />
      )}
    </div>
  );
}

/**
 * 整页渲染：顾客端预览页直接用 `mode="preview"`，编辑器可传 `mode="edit"` 得到点选能力。
 * 商品/券/分类的实际内容仍由调用方数据决定，这里不发起任何请求。
 */
export function DiyPreview({
  components,
  styles,
  mode = "preview",
  selectedId,
  onSelect,
}: {
  components: BrandDiyComponent[];
  styles?: unknown;
  mode?: DiyMode;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const pageStyles = normalizeDiyStyles(styles);
  const list = Array.isArray(components) ? components : [];
  return (
    <div
      style={{
        width: "100%",
        minHeight: 240,
        boxSizing: "border-box",
        background: pageStyles.backgroundColor,
        backgroundImage: pageStyles.backgroundImage
          ? `url(${pageStyles.backgroundImage})`
          : undefined,
        backgroundSize: "100% auto",
        backgroundRepeat: "no-repeat",
        paddingTop: pageStyles.paddingTop,
        color: "#1f1f1f",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      }}
    >
      {list.length ? null : (
        <div style={{ padding: 40, textAlign: "center", color: "#adb2bb", fontSize: 12 }}>
          页面还没有组件
        </div>
      )}
      {list.map((component) =>
        mode === "edit" ? (
          <div
            key={component.id}
            onClick={() => onSelect?.(component.id)}
            style={{
              cursor: "pointer",
              outline: selectedId === component.id ? `2px solid #1677ff` : "none",
              outlineOffset: -2,
              background: selectedId === component.id ? "rgba(22,119,255,.04)" : undefined,
            }}
          >
            <DiyBlock component={component} mode="edit" />
          </div>
        ) : (
          <DiyBlock key={component.id} component={component} />
        ),
      )}
    </div>
  );
}
