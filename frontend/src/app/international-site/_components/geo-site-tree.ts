import {
  CONTAINER_TYPES,
  isContainer,
  newId,
  type GeoSiteNode,
} from "./geo-site-elements";

/**
 * 元素树的纯函数操作：编辑器只在内存里改这棵树，点保存才落库。
 * 全部返回新数组/新对象，历史栈直接引用旧树即可实现撤销，不必做深拷贝快照。
 */

export type DropPosition = "before" | "after" | "inside";

/** 画布当前落点：拖到节点上边缘=排到它前面，下边缘=后面，容器中部=放进去。 */
export type DropTarget = { id: string; position: DropPosition };

const kids = (node: GeoSiteNode): GeoSiteNode[] =>
  Array.isArray(node.content) ? node.content : [];

const withKids = (node: GeoSiteNode, list: GeoSiteNode[]): GeoSiteNode => ({
  ...node,
  content: list,
});

/** 契约侧 content 收成 JSON，进编辑器前统一规范化成可用的节点树。 */
export function normalizeTree(input: unknown): GeoSiteNode[] {
  if (!Array.isArray(input)) return [];
  const walk = (list: unknown[]): GeoSiteNode[] =>
    list.flatMap((item): GeoSiteNode[] => {
      if (!item || typeof item !== "object") return [];
      const raw = item as Record<string, unknown>;
      if (typeof raw.type !== "string") return [];
      const id =
        typeof raw.id === "string" && raw.id.length <= 64 ? raw.id : newId();
      const styles =
        raw.styles && typeof raw.styles === "object" && !Array.isArray(raw.styles)
          ? (raw.styles as Record<string, string | number>)
          : {};
      const name = typeof raw.name === "string" ? raw.name.slice(0, 80) : raw.type;
      const category = typeof raw.category === "string" ? raw.category : "";
      const content = raw.content;
      if (Array.isArray(content)) {
        return [{ id, name, type: raw.type, category, styles, content: walk(content) }];
      }
      if (content && typeof content === "object") {
        return [
          {
            id,
            name,
            type: raw.type,
            category,
            styles,
            content: content as Record<string, unknown>,
          },
        ];
      }
      return [
        {
          id,
          name,
          type: raw.type,
          category,
          styles,
          content: CONTAINER_TYPES.has(raw.type) ? [] : {},
        },
      ];
    });
  return walk(input);
}

export function findNode(
  list: GeoSiteNode[],
  id: string,
): { node: GeoSiteNode; parentId: string | null; index: number } | null {
  for (let index = 0; index < list.length; index += 1) {
    const node = list[index];
    if (node.id === id) return { node, parentId: null, index };
    if (isContainer(node)) {
      const found = findNode(kids(node), id);
      // 深层命中要保留最近一层父级：每层都覆盖的话，两级以上嵌套会被错认成根的子级
      if (found) {
        return {
          node: found.node,
          parentId: found.parentId ?? node.id,
          index: found.index,
        };
      }
    }
  }
  return null;
}

/** 深度优先遍历，图层面板与节点计数共用。 */
export function walkTree(
  list: GeoSiteNode[],
  visit: (node: GeoSiteNode, depth: number, parentId: string | null) => void,
  depth = 0,
  parentId: string | null = null,
): void {
  for (const node of list) {
    visit(node, depth, parentId);
    if (isContainer(node)) walkTree(kids(node), visit, depth + 1, node.id);
  }
}

export function countNodes(list: GeoSiteNode[]): number {
  let total = 0;
  walkTree(list, () => {
    total += 1;
  });
  return total;
}

export function mapTree(list: GeoSiteNode[], fn: (node: GeoSiteNode) => GeoSiteNode): GeoSiteNode[] {
  return list.map((node) => {
    const next = fn(node);
    return isContainer(next) ? withKids(next, mapTree(kids(next), fn)) : next;
  });
}

/** 改样式/文案：只替换目标节点本身，不动子树。 */
export function patchNode(
  list: GeoSiteNode[],
  id: string,
  patch: (node: GeoSiteNode) => GeoSiteNode,
): GeoSiteNode[] {
  return mapTree(list, (node) => (node.id === id ? patch(node) : node));
}

export function setStyle(list: GeoSiteNode[], id: string, key: string, value: string | number): GeoSiteNode[] {
  return patchNode(list, id, (node) => ({ ...node, styles: { ...node.styles, [key]: value } }));
}

export function unsetStyle(list: GeoSiteNode[], id: string, key: string): GeoSiteNode[] {
  return patchNode(list, id, (node) => {
    const styles = { ...node.styles };
    delete styles[key];
    return { ...node, styles };
  });
}

export function setContentField(
  list: GeoSiteNode[],
  id: string,
  key: string,
  value: unknown,
): GeoSiteNode[] {
  return patchNode(list, id, (node) =>
    Array.isArray(node.content)
      ? node
      : { ...node, content: { ...node.content, [key]: value } },
  );
}

function splice(list: GeoSiteNode[], index: number, insert: GeoSiteNode[]): GeoSiteNode[] {
  const next = [...list];
  next.splice(index, 0, ...insert);
  return next;
}

function replaceChild(
  list: GeoSiteNode[],
  parentId: string,
  next: (node: GeoSiteNode) => GeoSiteNode[],
): GeoSiteNode[] {
  return list.map((node) => {
    if (node.id === parentId && isContainer(node)) return withKids(node, next(node));
    if (isContainer(node)) return withKids(node, replaceChild(kids(node), parentId, next));
    return node;
  });
}

/** 在 parentId 的第 index 位插入节点；parentId 为 null 表示根层。 */
export function insertNode(
  list: GeoSiteNode[],
  parentId: string | null,
  index: number,
  node: GeoSiteNode,
): GeoSiteNode[] {
  if (!parentId) {
    const at = Math.max(0, Math.min(index, list.length));
    return splice(list, at, [node]);
  }
  return replaceChild(list, parentId, (parent) =>
    splice(kids(parent), Math.max(0, Math.min(index, kids(parent).length)), [node]),
  );
}

export function removeNode(list: GeoSiteNode[], id: string): GeoSiteNode[] {
  const without = list.filter((node) => node.id !== id);
  return without.map((node) =>
    isContainer(node) ? withKids(node, removeNode(kids(node), id)) : node,
  );
}

/** 深层取节点（用于把被拖动的子树搬到新位置）。 */
export function pickNode(list: GeoSiteNode[], id: string): GeoSiteNode | null {
  return findNode(list, id)?.node ?? null;
}

/** 目标是否位于被拖动节点的子树内：防止把父容器拖进自己的子节点。 */
export function containsId(node: GeoSiteNode, id: string): boolean {
  if (node.id === id) return true;
  return isContainer(node) && kids(node).some((child) => containsId(child, id));
}

/**
 * 新建元素按落点插入：before/after 以目标为参照插入同级，
 * inside 追加到容器末尾。目标是 __body 时 before/after 落到它的首/末子级，
 * 否则会在根层多出一个与 __body 平级的节点，渲染层只认第一个 __body。
 */
export function insertNear(
  list: GeoSiteNode[],
  targetId: string,
  position: DropPosition,
  node: GeoSiteNode,
): GeoSiteNode[] {
  const found = findNode(list, targetId);
  if (!found) return list;
  const { node: target, parentId, index } = found;
  if (position === "inside") {
    return isContainer(target)
      ? insertNode(list, target.id, kids(target).length, node)
      : list;
  }
  if (!parentId) {
    if (isContainer(target)) {
      return insertNode(
        list,
        target.id,
        position === "before" ? 0 : kids(target).length,
        node,
      );
    }
    // 无 __body 的存量树：节点就排在根数组里，直接按根层索引插
    return insertNode(list, null, position === "before" ? index : index + 1, node);
  }
  return insertNode(list, parentId, position === "before" ? index : index + 1, node);
}

/**
 * 移动节点：先摘出子树，再按目标位置插回。
 * inside 只允许落进容器；目标是 __body 时 before/after 落到它的首/末子级。
 */
export function moveNode(
  list: GeoSiteNode[],
  dragId: string,
  targetId: string,
  position: DropPosition,
): GeoSiteNode[] {
  if (dragId === targetId) return list;
  const drag = pickNode(list, dragId);
  const target = findNode(list, targetId);
  if (!drag || !target) return list;
  if (containsId(drag, targetId)) return list;
  const stripped = removeNode(list, dragId);
  if (position === "inside") {
    if (!isContainer(target.node)) return list;
    return insertNode(stripped, targetId, kids(target.node).length, drag);
  }
  if (!target.parentId) {
    if (isContainer(target.node)) {
      return insertNode(
        stripped,
        targetId,
        position === "before" ? 0 : kids(target.node).length,
        drag,
      );
    }
    const rootIndex = stripped.findIndex((node) => node.id === targetId);
    if (rootIndex < 0) return list;
    return insertNode(stripped, null, position === "before" ? rootIndex : rootIndex + 1, drag);
  }
  const parent = findNode(stripped, target.parentId);
  if (!parent) return list;
  const siblingIndex = kids(parent.node).findIndex((node) => node.id === targetId);
  if (siblingIndex < 0) return list;
  return insertNode(
    stripped,
    target.parentId,
    position === "before" ? siblingIndex : siblingIndex + 1,
    drag,
  );
}

/** 复制节点并把子树 id 全部换新，避免同页出现重复 key。 */
export function cloneWithNewIds(node: GeoSiteNode): GeoSiteNode {
  const id = newId();
  if (isContainer(node)) {
    return withKids({ ...node, id }, kids(node).map(cloneWithNewIds));
  }
  return { ...node, id };
}

export function duplicateNode(list: GeoSiteNode[], id: string): GeoSiteNode[] {
  const found = findNode(list, id);
  if (!found) return list;
  if (!found.parentId) {
    const rootIndex = list.findIndex((node) => node.id === id);
    return insertNode(list, null, rootIndex + 1, cloneWithNewIds(found.node));
  }
  const parent = findNode(list, found.parentId);
  if (!parent) return list;
  const index = kids(parent.node).findIndex((node) => node.id === id);
  return insertNode(list, found.parentId, index + 1, cloneWithNewIds(found.node));
}

/** 同级左右移动：容器内的排序，根层不允许（__body 只有一个）。 */
export function shiftNode(
  list: GeoSiteNode[],
  id: string,
  delta: -1 | 1,
): GeoSiteNode[] {
  const found = findNode(list, id);
  if (!found || !found.parentId) return list;
  const parent = findNode(list, found.parentId);
  if (!parent) return list;
  const siblings = kids(parent.node);
  const to = found.index + delta;
  if (to < 0 || to >= siblings.length) return list;
  const reordered = [...siblings];
  const [row] = reordered.splice(found.index, 1);
  reordered.splice(to, 0, row);
  return replaceChild(list, found.parentId, () => reordered);
}
