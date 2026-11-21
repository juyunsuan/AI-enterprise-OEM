"use client";

import Image from "next/image";

import { GlobalOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Input, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";
import type {
  OverseasNavCategoryNode,
  OverseasNavCategoryRow,
  OverseasNavItemNode,
} from "@enterprise/contracts";
import { overseasNavApi } from "@/api/overseas-nav";
import styles from "./overseas-nav-tab.module.css";

function SiteLogo({
  logoUrl,
  title,
}: {
  logoUrl: string;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);
  if (!logoUrl || failed) {
    return (
      <div className={styles.logoFallback} aria-hidden>
        {(title || "?").slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <Image
      className={styles.logo}
      src={logoUrl}
      alt=""
      width={40}
      height={40}
      unoptimized
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

type SearchRow = { item: OverseasNavItemNode; path: string };

/** 接口返回扁平分类与条目，这里按 parentId 组回两级树；父级隐藏时子级不单独升为一级。 */
function buildTree(
  rows: OverseasNavCategoryRow[],
  items: OverseasNavItemNode[],
): OverseasNavCategoryNode[] {
  const nodes = rows.map((row) => ({
    ...row,
    items: [] as OverseasNavItemNode[],
    children: [] as OverseasNavCategoryNode[],
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const item of items) {
    byId.get(item.categoryId)?.items.push(item);
  }
  const roots: OverseasNavCategoryNode[] = [];
  for (const node of nodes) {
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      if (parent) parent.children.push(node);
      continue;
    }
    roots.push(node);
  }
  return roots;
}

function flatten(
  category: OverseasNavCategoryNode,
  path: string,
  out: SearchRow[],
) {
  const label = path ? `${path} · ${category.name}` : category.name;
  for (const item of category.items) out.push({ item, path: label });
  for (const child of category.children) flatten(child, label, out);
}

/**
 * 出海导航：复刻 2345 出海导航的目录结构（分类 / 子分类 / 站点卡片 + 搜索），
 * 不含 banner、头条、文章与 AI 工具区块。默认数据随迁移写入，后台可维护。
 */
export function OverseasNavTab() {
  const [rawCategories, setRawCategories] = useState<OverseasNavCategoryRow[]>([]);
  const [rawItems, setRawItems] = useState<OverseasNavItemNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [activeTabs, setActiveTabs] = useState<Record<number, number>>({});
  const [reloadAt, setReloadAt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    overseasNavApi
      .tree()
      .then((data) => {
        if (!alive) return;
        setRawCategories(data?.categories || []);
        setRawItems(data?.items || []);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message || "出海导航加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadAt]);

  const categories = useMemo(
    () => buildTree(rawCategories, rawItems),
    [rawCategories, rawItems],
  );

  const totalItems = useMemo(
    () =>
      categories.reduce((sum, category) => {
        const own = category.items.length;
        const children = category.children.reduce(
          (count, child) => count + child.items.length,
          0,
        );
        return sum + own + children;
      }, 0),
    [categories],
  );

  const sections = useMemo(
    () =>
      categories.map((category) => {
        // 一级分类自身也可能挂站点（后台可直接把站点归到一级分类），此时并作第一个页签。
        const tabs = category.items.length
          ? [category, ...category.children]
          : category.children;
        const chosen = activeTabs[category.id] ?? tabs[0]?.id ?? category.id;
        const node = tabs.find((tab) => tab.id === chosen) || category;
        return { category, tabs, node };
      }),
    [categories, activeTabs],
  );

  const searchText = keyword.trim().toLowerCase();
  const searchRows = useMemo(() => {
    if (!searchText) return [];
    const rows: SearchRow[] = [];
    for (const category of categories) flatten(category, "", rows);
    return rows.filter(({ item, path }) => {
      const haystack = `${item.title} ${item.description} ${item.url} ${path}`.toLowerCase();
      return haystack.includes(searchText);
    });
  }, [categories, searchText]);

  const scrollToCategory = (id: number) => {
    document
      .getElementById(`overseas-nav-cat-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <h2 className={styles.heroTitle}>出海导航</h2>
        <p className={styles.heroDesc}>
          {totalItems
            ? `${categories.length} 个分类 · ${totalItems} 个常用站点，覆盖代理 IP / VPS、跨境电商、广告投放、支付、社媒与内容制作`
            : "出海常用站点导航：代理 IP / VPS、跨境电商、广告投放、支付、社媒与内容制作"}
        </p>
        <Input
          className={styles.search}
          size="large"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索站点名称、用途或网址，例如：住宅代理、VPS、Shopify、Facebook"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin />
        </div>
      ) : error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => setReloadAt((value) => value + 1)}
            >
              重试
            </Button>
          }
        />
      ) : searchText ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>搜索结果</h3>
            <span className={styles.count}>
              关键词「{keyword.trim()}」· {searchRows.length} 个站点
            </span>
          </div>
          {searchRows.length ? (
            <div className={styles.grid}>
              {searchRows.map(({ item, path }) => (
                <SiteCard key={item.id} item={item} meta={path} />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>没有匹配的站点，试试更短的关键词。</div>
          )}
        </section>
      ) : !categories.length ? (
        <Empty description="还没有出海导航数据，请到平台后台维护" />
      ) : (
        <>
          <div className={styles.chips}>
            <GlobalOutlined style={{ color: "#93c5fd", lineHeight: "28px" }} />
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={styles.chip}
                onClick={() => scrollToCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>

          {sections.map(({ category, tabs, node }) => (
            <section
              key={category.id}
              id={`overseas-nav-cat-${category.id}`}
              className={styles.section}
            >
              <div className={styles.sectionHead}>
                <h3 className={styles.sectionTitle}>{category.name}</h3>
                <span className={styles.count}>{node.items.length} 个站点</span>
                {tabs.length > 1 ? (
                  <div className={styles.tabs}>
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`${styles.tab} ${
                          tab.id === node.id ? styles.tabActive : ""
                        }`}
                        onClick={() =>
                          setActiveTabs((current) => ({
                            ...current,
                            [category.id]: tab.id,
                          }))
                        }
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {node.items.length ? (
                <div className={styles.grid}>
                  {node.items.map((item) => (
                    <SiteCard key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>该分类下暂无站点。</div>
              )}
            </section>
          ))}

          <div className={styles.footer}>
            默认数据随系统初始化写入，平台管理员可在「后台 → 系统与内容 → 出海导航」维护分类与站点。
          </div>
        </>
      )}
    </div>
  );
}

function SiteCard({
  item,
  meta,
}: {
  item: OverseasNavItemNode;
  meta?: string;
}) {
  return (
    <a
      className={styles.card}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={item.description || item.title}
    >
      <SiteLogo logoUrl={item.logoUrl} title={item.title} />
      <div className={styles.cardBody}>
        <span className={styles.cardTitle}>{item.title}</span>
        {item.description ? (
          <span className={styles.cardDesc}>{item.description}</span>
        ) : null}
        {meta ? <span className={styles.resultMeta}>{meta}</span> : null}
      </div>
    </a>
  );
}