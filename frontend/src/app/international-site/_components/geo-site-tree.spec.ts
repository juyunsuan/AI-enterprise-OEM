import { describe, expect, it } from "vitest";
import {
  insertNear,
  moveNode,
  normalizeTree,
  type DropPosition,
} from "./geo-site-tree";
import type { GeoSiteNode } from "./geo-site-elements";

const text = (id: string, inner = id): GeoSiteNode => ({
  id,
  name: id,
  type: "p",
  category: "text",
  styles: {},
  content: { innerText: inner },
});

const box = (id: string, children: GeoSiteNode[] = []): GeoSiteNode => ({
  id,
  name: id,
  type: "container",
  category: "container",
  styles: {},
  content: children,
});

/** 真实站点的树根：唯一 __body，区块都是它的子级。 */
const page = (...children: GeoSiteNode[]): GeoSiteNode[] => [
  { id: "body", name: "root", type: "__body", category: "container", styles: {}, content: children },
];

const rootIds = (tree: GeoSiteNode[]): string[] =>
  ((tree[0].content as GeoSiteNode[]) ?? []).map((node) => node.id);

const idsOf = (nodes: GeoSiteNode[]): string[] =>
  nodes.map((node) => (Array.isArray(node.content) ? `${node.id}[${idsOf(node.content)}]` : node.id));

/**
 * 落点是画布最容易「看起来能用、其实永远排到最后」的地方：
 * 根 __body 盖住整页，只要只有容器接事件，指针落在第一个区块上也会被 __body 接走。
 * 这里钉住三档落点的语义，前端画布据此算 before/after/inside。
 */
describe("GEO 建站器 · 落点插入", () => {
  it("插到第一个区块之前：before 落到 __body 的首个子级，而不是末尾", () => {
    const tree = insertNear(page(text("a"), text("b")), "a", "before", text("new"));
    expect(rootIds(tree)).toEqual(["new", "a", "b"]);
  });

  it("插到最后一个区块之后：after 落到它的下一位", () => {
    const tree = insertNear(page(text("a"), text("b")), "b", "after", text("new"));
    expect(rootIds(tree)).toEqual(["a", "b", "new"]);
  });

  it("直接落在 __body 的上沿/下沿：首/末子级，绝不在根层再造一个 __body", () => {
    const before = insertNear(page(text("a")), "body", "before", text("new"));
    expect(rootIds(before)).toEqual(["new", "a"]);
    expect(before.filter((node) => node.type === "__body")).toHaveLength(1);

    const after = insertNear(page(text("a")), "body", "after", text("new"));
    expect(rootIds(after)).toEqual(["a", "new"]);
  });

  it("inside 追加到容器末尾，且不允许落进叶子", () => {
    const tree = insertNear(page(box("c", [text("a")])), "c", "inside", text("new"));
    expect(idsOf(tree[0].content as GeoSiteNode[])).toEqual(["c[a,new]"]);
    // 叶子不是容器：inside 无处可放，原始树不动
    const tree2 = page(text("a"));
    expect(insertNear(tree2, "a", "inside", text("new"))).toBe(tree2);
  });

  it("嵌套容器里也按同级插入：不改动其它兄弟", () => {
    const tree = insertNear(
      page(box("c", [text("a"), text("b")]), text("z")),
      "b",
      "before",
      text("new"),
    );
    expect(idsOf(tree[0].content as GeoSiteNode[])).toEqual(["c[a,new,b]", "z"]);
  });
});

describe("GEO 建站器 · 拖动排序", () => {
  const move = (tree: GeoSiteNode[], drag: string, target: string, position: DropPosition) =>
    rootIds(moveNode(tree, drag, target, position));

  it("把最后一个拖到第一个之前：这是「拖不到最顶部」的回归点", () => {
    expect(move(page(text("a"), text("b"), text("c")), "c", "a", "before")).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("拖到 __body 上沿同样落到第一位，且不产生第二个 __body", () => {
    const tree = moveNode(page(text("a"), text("b")), "b", "body", "before");
    expect(rootIds(tree)).toEqual(["b", "a"]);
    expect(tree.filter((node) => node.type === "__body")).toHaveLength(1);
  });

  it("拖进容器内部＝追加到末尾", () => {
    const tree = moveNode(page(box("c", [text("a")]), text("b")), "b", "c", "inside");
    expect(idsOf(tree[0].content as GeoSiteNode[])).toEqual(["c[a,b]"]);
  });

  it("不允许把父容器拖进自己的子树，也不允许拖到自己身上", () => {
    const tree = page(box("c", [box("d")]));
    expect(moveNode(tree, "c", "d", "inside")).toBe(tree);
    expect(moveNode(tree, "c", "c", "after")).toBe(tree);
  });

  it("before/after 以目标在同级里的位置为准，不受被拖走节点的影响", () => {
    expect(move(page(text("a"), text("b"), text("c")), "a", "c", "after")).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});

describe("GEO 建站器 · 存量树回落", () => {
  it("没有 __body 的老站点：叶子节点也能按根层索引插入，不会静默失败", () => {
    const legacy: GeoSiteNode[] = [text("a"), text("b")];
    const tree = insertNear(legacy, "a", "before", text("new"));
    expect(tree.map((node) => node.id)).toEqual(["new", "a", "b"]);
  });

  it("normalizeTree 保留给动态区块的空对象 content，不会被误当成容器", () => {
    const tree = normalizeTree([{ id: "n1", type: "navBar", content: {} }]);
    expect(Array.isArray(tree[0].content)).toBe(false);
    expect(insertNear(page(...tree), "n1", "before", text("x"))).toHaveLength(1);
  });
});
