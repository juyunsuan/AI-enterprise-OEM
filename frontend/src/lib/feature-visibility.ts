"use client";

import { useEffect, useMemo, useState } from "react";
import { governanceApi, type FeatureNode } from "@/api/governance";
import { deniedModuleKeysFor } from "@/config/routes";
import { useSession } from "@/lib/session";

/**
 * 工具入口的功能可见性（§5.10 的另一半）。
 *
 * 侧栏菜单在 pro-layout 里已按「功能开关 closed + 子账号授权」双重裁剪，但建站工具卡、
 * 营销工具页签、智慧分析子卡这些**不是菜单叶子**的入口此前不受任何开关约束：后台关掉
 * 「健康管理小程序」只是让接口 403，卡片照常能点进去。本 hook 把两份数据合成一个判定，
 * 供卡片页/页签页自查。
 *
 * 判定口径与侧栏一致：只收窄、不放开；接口不可用时 fail-open（后端 FEATURE_CLOSED 仍会拦）。
 */

type Cache = { userId: string; promise: Promise<FeatureNode[]> };
let cache: Cache | null = null;

function loadMenu(userId: string): Promise<FeatureNode[]> {
  if (cache?.userId === userId) return cache.promise;
  const promise = governanceApi
    .menu({})
    .then((nodes) => nodes || [])
    .catch(() => [] as FeatureNode[]);
  cache = { userId, promise };
  return promise;
}

/** 有效目录里 closed 节点的 code 与 path 合集（父组关掉会级联到叶子，后端已算好）。 */
function closedKeysOf(nodes: FeatureNode[]): Set<string> {
  const out = new Set<string>();
  for (const node of nodes) {
    if (node.state !== "closed") continue;
    if (node.code) out.add(node.code);
    if (node.path) out.add(node.path);
  }
  return out;
}

export type ToolVisibility = {
  /** 该入口是否可展示：功能目录未关，且子账号已被授权对应模块。 */
  isOpen: (feature: string, moduleKey?: string) => boolean;
  /** 目录接口是否已就绪（未就绪时先展示，避免刷新瞬间卡片闪烁）。 */
  ready: boolean;
};

export function useToolVisibility(): ToolVisibility {
  const { me } = useSession();
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);
  const userId = me?.userId || "";

  useEffect(() => {
    if (!userId) {
      setClosed(new Set());
      setReady(false);
      return;
    }
    let alive = true;
    void loadMenu(userId).then((nodes) => {
      if (!alive) return;
      setClosed(closedKeysOf(nodes));
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const denied = useMemo(() => deniedModuleKeysFor(me), [me]);

  return {
    ready,
    isOpen: (feature, moduleKey) => {
      if (closed.has(feature)) return false;
      if (closed.has(`/${feature}`)) return false;
      if (moduleKey && denied.has(moduleKey)) return false;
      return true;
    },
  };
}
