"use client";

import "@xyflow/react/dist/style.css";
import {
  AimOutlined,
  AppstoreOutlined,
  ArrowLeftOutlined,
  CloseOutlined,
  CloudUploadOutlined,
  CustomerServiceOutlined,
  FolderOpenOutlined,
  MenuUnfoldOutlined,
  MinusOutlined,
  MoonOutlined,
  PictureOutlined,
  PlusOutlined,
  ProfileOutlined,
  RedoOutlined,
  SaveOutlined,
  SettingOutlined,
  SunOutlined,
  UndoOutlined,
  VideoCameraOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { App, Badge, Button, Dropdown, Input, Skeleton, Tooltip } from "antd";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeTypes,
  type OnConnectEnd,
  type OnConnectStart,
} from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CanvasDoc,
  CanvasEdge,
  CanvasEdgeRole,
  CanvasMentionRef,
  CanvasNode,
  CanvasNodeData,
  CanvasProject,
  ContentJob,
  ContentDigitalAsset,
} from "@enterprise/contracts";
import { contentApi } from "@/api/content";
import { TERMINAL } from "@/components/content/generation-config";
import { AssetReferencePicker, isReferenceMedia } from "@/components/content/asset-reference-picker";
import { Notice } from "@/components/ui/panel";
import { TaskDock } from "@/components/content/task-dock";
import { CanvasNodeView, canvasNodeSize, EDGE_ROLE_LABEL, type CanvasFlowNode } from "./flow-nodes";
import { CanvasAssetSidebar } from "./canvas-asset-sidebar";
import { wiredMentions, type MentionCandidate } from "./mention-field";
import { NodePanel } from "./node-panel";

const nodeTypes: NodeTypes = { canvas: CanvasNodeView };

/** 与后端 planNodeRun 同一口径：入边按角色排序后，@ 记号才和实际喂进去的素材对得上。 */
const ROLE_ORDER: Record<CanvasEdgeRole, number> = {
  prompt: 0,
  asset: 1,
  config: 2,
  "first-frame": 3,
  "last-frame": 4,
};

const EMPTY_DOC: CanvasDoc = {
  version: 1,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

function canvasNodeMedia(data: CanvasNodeData) {
  return data.kind === "generate" || data.kind === "asset" ? data.media : undefined;
}

function toFlow(doc: CanvasDoc): { nodes: CanvasFlowNode[]; edges: Edge[] } {
  return {
    nodes: doc.nodes.map((node) => {
      const fallback = canvasNodeSize(node.data.kind, canvasNodeMedia(node.data));
      return {
        id: node.id,
        type: "canvas" as const,
        position: { x: node.x, y: node.y },
        data: { kind: node.data.kind, data: node.data },
        style: {
          width: node.width >= 280 ? node.width : fallback.width,
          height: node.height && node.height >= 180 ? node.height : fallback.height,
        },
      };
    }),
    edges: doc.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: EDGE_ROLE_LABEL[edge.role] || edge.role,
      data: { role: edge.role },
    })),
  };
}

function toDoc(
  nodes: CanvasFlowNode[],
  edges: Edge[],
  viewport: { x: number; y: number; zoom: number },
): CanvasDoc {
  return {
    version: 1,
    nodes: nodes.map(
      (node): CanvasNode => ({
        id: node.id,
        type: node.data.kind,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        width: Math.round(
          node.measured?.width ||
            (typeof node.style?.width === "number" ? node.style.width : canvasNodeSize(node.data.kind).width),
        ),
        height: Math.round(
          node.measured?.height ||
            (typeof node.style?.height === "number"
              ? node.style.height
              : canvasNodeSize(node.data.kind, canvasNodeMedia(node.data.data)).height),
        ),
        data: node.data.data,
      }),
    ),
    edges: edges.map(
      (edge): CanvasEdge => ({
        id: edge.id,
        from: edge.source,
        to: edge.target,
        role: ((edge.data?.role as CanvasEdgeRole) || "asset") as CanvasEdgeRole,
      }),
    ),
    viewport,
  };
}

function nextId(nodes: CanvasFlowNode[], prefix: string) {
  const max = nodes.reduce((acc, node) => {
    const num = Number(node.id.replace(/^[a-z]+/, ""));
    return Number.isFinite(num) && num > acc ? num : acc;
  }, 0);
  return `${prefix}${max + 1}`;
}

/** 素材类型决定连线角色：图片默认当素材，视频/音频也走素材；首尾帧由用户在连线上切。 */
function roleForNode(node?: CanvasFlowNode): CanvasEdgeRole {
  if (!node) return "asset";
  return node.data.kind === "config" ? "config" : node.data.kind === "prompt" ? "prompt" : "asset";
}

function pointerPosition(event: MouseEvent | TouchEvent) {
  const point = "touches" in event ? event.touches[0] || event.changedTouches[0] : event;
  return point ? { x: point.clientX, y: point.clientY } : null;
}

export function CanvasEditor({ id }: { id: number }) {
  return (
    <ReactFlowProvider>
      <CanvasEditorInner id={id} />
    </ReactFlowProvider>
  );
}

type CanvasTheme = "light" | "dark";
type CanvasGrid = "dots" | "lines" | "blank";
type CanvasSnapshot = {
  nodes: CanvasFlowNode[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };
};

function CanvasEditorInner({ id }: { id: number }) {
  const { message } = App.useApp();
  const router = useRouter();
  const { fitView, getViewport, zoomIn, zoomOut, setViewport, screenToFlowPosition } =
    useReactFlow<CanvasFlowNode, Edge>();
  const [project, setProject] = useState<CanvasProject | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [connectPoint, setConnectPoint] = useState<{ x: number; y: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<"digital" | "local">("digital");
  const [taskOpen, setTaskOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [theme, setTheme] = useState<CanvasTheme>("light");
  const [grid, setGrid] = useState<CanvasGrid>("dots");
  const [zoom, setZoom] = useState(1);
  const [, setHistoryVersion] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyRef = useRef<{ past: CanvasSnapshot[]; future: CanvasSnapshot[]; current: CanvasSnapshot | null }>({
    past: [],
    future: [],
    current: null,
  });
  const [channels, setChannels] = useState<{ value: number; label: string }[]>([]);
  const [jobs, setJobs] = useState<ContentJob[]>([]);
  const [taskVersion, setTaskVersion] = useState(0);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const nodesRef = useRef<CanvasFlowNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const suppressPortClickRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const openPanel = useCallback((nodeId: string) => setSelected(nodeId), []);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setConnectFrom(null);
      setDraggingFrom(null);
      setConnectPoint(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("canvas-appearance-theme");
    const savedGrid = window.localStorage.getItem("canvas-appearance-grid");
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
    if (savedGrid === "dots" || savedGrid === "lines" || savedGrid === "blank") setGrid(savedGrid);
  }, []);

  const changeTheme = (next: CanvasTheme) => {
    setTheme(next);
    window.localStorage.setItem("canvas-appearance-theme", next);
  };

  const changeGrid = (next: CanvasGrid) => {
    setGrid(next);
    window.localStorage.setItem("canvas-appearance-grid", next);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await contentApi.canvas({ params: { id: String(id) } });
      if (!row) throw new Error("画布不存在或无权查看");
      setProject(row);
      setTitle(row.title);
      const doc = (row.doc || EMPTY_DOC) as CanvasDoc;
      const flow = toFlow(doc);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      historyRef.current = { past: [], future: [], current: null };
      setCanUndo(false);
      setCanRedo(false);
      setHistoryVersion((value) => value + 1);
      setDirty(false);
      setTimeout(() => void fitView({ padding: 0.2 }), 80);
      setError("");
    } catch (caught) {
      setError((caught as Error).message || "画布加载失败");
    } finally {
      setLoading(false);
    }
  }, [id, fitView, setEdges, setNodes]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 只把服务端写回的节点结果并进本地（版本号 / 标题 / 位置 / 连线保持不动）。 */
  const refreshDoc = useCallback(async () => {
    try {
      const row = await contentApi.canvas({ params: { id: String(id) } });
      if (!row) return;
      const doc = (row.doc || EMPTY_DOC) as CanvasDoc;
      const generated = new Map(
        doc.nodes
          .filter((node) => node.data.kind === "generate" && node.data.results.length)
          .map((node) => [node.id, node.data]),
      );
      setNodes((prev) =>
        prev.map((node) => {
          const next = generated.get(node.id);
          if (!next || next.kind !== "generate") return node;
          return {
            ...node,
            data: {
              ...node.data,
              data: {
                ...node.data.data,
                results: next.results,
                lastRunId: next.lastRunId,
              },
            },
          };
        }),
      );
      // 后台回写也递增了行版本：本地同步跟上，下一次保存才不会误报版本冲突
      setProject((prev) => (prev ? { ...prev, version: row.version } : prev));
    } catch {
      // 刷新失败保持原样，任务收口时会再试
    }
  }, [id, setNodes]);

  useEffect(() => {
    void contentApi
      .settings()
      .then((settings) => {
        if (!settings) return;
        setChannels(
          settings.channels.map((item) => ({
            value: item.id,
            label: item.name,
          })),
        );
      })
      .catch(() => undefined);
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const result = await contentApi.jobs({
        query: { page: 1, pageSize: 60, canvasId: id },
      });
      setJobs(result?.list || []);
    } catch {
      // 任务区自己有错误提示，这里只影响卡片上的状态摘要
    }
  }, [id]);

  const pending = jobs.some((job) => !TERMINAL.has(job.status));
  const pendingCount = jobs.filter((job) => !TERMINAL.has(job.status)).length;
  useEffect(() => {
    void loadJobs();
  }, [loadJobs, taskVersion]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => void loadJobs(), 3000);
    return () => window.clearInterval(timer);
  }, [pending, loadJobs]);

  const settledRunsRef = useRef(new Set<string>());
  useEffect(() => {
    const runs = new Set(jobs.map((job) => job.runId).filter(Boolean));
    for (const runId of runs) {
      if (settledRunsRef.current.has(runId)) continue;
      const batch = jobs.filter((job) => job.runId === runId);
      if (!batch.length || batch.some((job) => !TERMINAL.has(job.status))) continue;
      settledRunsRef.current.add(runId);
      void refreshDoc();
    }
  }, [jobs, refreshDoc]);

  /** 保存当前画布；返回是否落库成功（「保存并退出」据此决定要不要跳回列表）。 */
  const persist = useCallback(
    async (silent: boolean) => {
      if (!project) return false;
      // 保存期间再有改动会置回 dirty，落库完成后再走下一轮自动保存，不会把新改动当成已保存
      setSaving(true);
      setDirty(false);
      try {
        const doc = toDoc(nodesRef.current, edges, getViewport());
        const updated = await contentApi.saveCanvas({
          params: { id: String(id) },
          body: { title: title.trim() || project.title, doc, version: project.version },
        });
        if (!updated) {
          message.error("保存失败：未返回画布");
          setDirty(true);
          return false;
        }
        setProject(updated);
        if (!silent) message.success("已保存");
        return true;
      } catch (caught) {
        setDirty(true);
        const reason = (caught as Error).message || "保存失败";
        // 单画布是单人私有，冲突只可能来自「同一账号的另一个标签页」：不做自动合并，提示刷新后重编
        message.error(
          reason.includes("别处更新")
            ? "画布已在别处更新：请刷新页面后重新编辑（不会自动合并）"
            : reason,
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [project, title, edges, getViewport, id, message],
  );

  // 自动保存：改动后停下 2.5 秒写一次；正在保存或没改动就跳过
  useEffect(() => {
    if (!dirty || saving || !project) return;
    const timer = window.setTimeout(() => void persist(true), 2500);
    return () => window.clearTimeout(timer);
  }, [dirty, saving, project, persist, nodes, edges]);

  useEffect(() => {
    if (loading) return;
    const history = historyRef.current;
    const snapshot: CanvasSnapshot = { nodes, edges, viewport: getViewport() };
    if (!history.current || (history.current.nodes === nodes && history.current.edges === edges)) return;
    const timer = window.setTimeout(() => {
      const latest = historyRef.current;
      if (!latest.current) {
        latest.current = snapshot;
      } else {
        latest.past = [...latest.past, latest.current].slice(-80);
        latest.current = snapshot;
      }
      latest.future = [];
      setCanUndo(latest.past.length > 0);
      setCanRedo(false);
      setHistoryVersion((value) => value + 1);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [nodes, edges, loading, getViewport]);

  const restoreSnapshot = (snapshot: CanvasSnapshot) => {
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    void setViewport(snapshot.viewport);
    historyRef.current.current = snapshot;
    setSelected(null);
    setDirty(true);
    setHistoryVersion((value) => value + 1);
  };

  const undo = () => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous || !history.current) return;
    history.future.push(history.current);
    restoreSnapshot(previous);
    setCanUndo(history.past.length > 0);
    setCanRedo(history.future.length > 0);
  };

  const redo = () => {
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next || !history.current) return;
    history.past.push(history.current);
    restoreSnapshot(next);
    setCanUndo(history.past.length > 0);
    setCanRedo(history.future.length > 0);
  };

  const addNode = useCallback(
    (kind: CanvasNodeData["kind"], extra?: Partial<CanvasNodeData>) => {
      const current = nodesRef.current;
      const prefix = kind === "prompt" ? "p" : kind === "asset" ? "a" : kind === "config" ? "c" : "g";
      const nodeId = nextId(current, prefix);
      const base: Record<string, CanvasNodeData> = {
        prompt: { kind: "prompt", text: "" },
        asset: {
          kind: "asset",
          assetId: 0,
          name: "",
          media: "image",
          url: "",
          previewUrl: "",
        },
        config: {
          kind: "config",
          channelId: 0,
          channelName: "",
          model: "",
          count: 1,
        },
        generate: {
          kind: "generate",
          media: "image",
          prompt: "",
          channelId: 0,
          channelName: "",
          model: "",
          count: 1,
          refs: [],
          results: [],
          lastRunId: "",
        },
      };
      const data = { ...base[kind], ...(extra || {}) } as CanvasNodeData;
      const size = canvasNodeSize(kind, data.kind === "generate" ? data.media : data.kind === "asset" ? data.media : undefined);
      const anchor = screenToFlowPosition({
        x: window.innerWidth * 0.56 + (current.length % 3) * 40,
        y: window.innerHeight * 0.42 + Math.floor(current.length / 3) * 40,
      });
      setNodes((prev) => [
        ...prev,
        {
          id: nodeId,
          type: "canvas",
          position: { x: Math.round(anchor.x), y: Math.round(anchor.y) },
          style: size,
          data: { kind, data },
        },
      ]);
      setSelected(nodeId);
      setDirty(true);
    },
    [setNodes, screenToFlowPosition],
  );

  const addAssetNodes = (
    assets: ContentDigitalAsset[],
    dropPosition?: { x: number; y: number },
  ) => {
    const current = nodesRef.current;
    let base = current.reduce((acc, node) => {
      const num = Number(node.id.replace(/^[a-z]+/, ""));
      return Number.isFinite(num) && num > acc ? num : acc;
    }, 0);
    const anchor = dropPosition || screenToFlowPosition({ x: window.innerWidth * 0.56, y: window.innerHeight * 0.42 });
    const added = assets
      .filter((asset): asset is ContentDigitalAsset & { type: "image" | "video" | "audio" } =>
        ["image", "video", "audio"].includes(asset.type),
      )
      .map((asset, index) => {
        base += 1;
        const size = canvasNodeSize("asset", asset.type);
        return {
          id: `a${base}`,
          type: "canvas" as const,
          position: {
            x: Math.round(anchor.x + (index % 2) * (size.width + 48)),
            y: Math.round(anchor.y + Math.floor(index / 2) * (size.height + 64)),
          },
          style: size,
          data: {
            kind: "asset" as const,
            data: {
              kind: "asset" as const,
              assetId: asset.id,
              name: asset.name,
              media: asset.type,
              url: asset.url,
              previewUrl: asset.previewUrl || asset.url,
            },
          },
        };
      });
    if (!added.length) return;
    setNodes((prev) => [...prev, ...added]);
    setDirty(true);
  };

  const connectNodes = useCallback((sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const source = nodesRef.current.find((node) => node.id === sourceId);
    const target = nodesRef.current.find((node) => node.id === targetId);
    if (!source || target?.data.kind !== "generate") return;
    const role = roleForNode(source);
    if (edgesRef.current.some((edge) =>
      edge.source === sourceId && edge.target === targetId && edge.data?.role === role,
    )) return;
    const edge: Edge = {
      id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      source: sourceId,
      target: targetId,
      sourceHandle: null,
      targetHandle: "in",
      label: EDGE_ROLE_LABEL[role],
      data: { role },
    };
    setEdges((prev) =>
      prev.some((item) =>
        item.source === sourceId && item.target === targetId && item.data?.role === role,
      ) ? prev : [...prev, edge],
    );
    setDirty(true);
  }, [setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => connectNodes(connection.source, connection.target),
    [connectNodes],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      Boolean(connection.source) &&
      connection.source !== connection.target &&
      nodesRef.current.find((node) => node.id === connection.target)?.data.kind === "generate",
    [],
  );

  const onConnectStart = useCallback<OnConnectStart>((event, state) => {
    const point = pointerPosition(event);
    dragStartRef.current = point;
    setConnectPoint(point);
    setDraggingFrom(state.nodeId);
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: Parameters<OnConnectEnd>[1]) => {
      const point = pointerPosition(event);
      const start = dragStartRef.current;
      const moved = Boolean(point && start && Math.hypot(point.x - start.x, point.y - start.y) > 5);
      if (moved) {
        suppressPortClickRef.current = true;
        window.setTimeout(() => { suppressPortClickRef.current = false; }, 0);
      }
      const sourceId = state.fromNode?.id || state.fromHandle?.nodeId || "";
      const targetId = point
        ? document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId || ""
        : "";
      if (targetId && targetId !== sourceId) {
        const target = nodesRef.current.find((node) => node.id === targetId);
        if (target?.data.kind === "generate") connectNodes(sourceId, targetId);
        else if (moved) message.warning("连线只能接到图片、视频或音乐生成节点");
      }
      dragStartRef.current = null;
      setDraggingFrom(null);
      setConnectPoint(null);
    },
    [connectNodes, message],
  );

  const onPortClick = useCallback((nodeId: string) => {
    if (suppressPortClickRef.current) {
      suppressPortClickRef.current = false;
      return;
    }
    setSelected(nodeId);
    setConnectFrom((current) => {
      if (current === nodeId) return null;
      const handle = document.querySelector(`[data-id="${nodeId}"] .react-flow__handle.source`);
      const rect = handle?.getBoundingClientRect();
      setConnectPoint(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null);
      return nodeId;
    });
  }, []);

  const onNodeClick = useCallback((nodeId: string) => {
    if (!connectFrom) {
      setSelected(nodeId);
      return;
    }
    if (connectFrom === nodeId) {
      setConnectFrom(null);
      setConnectPoint(null);
      return;
    }
    const target = nodesRef.current.find((node) => node.id === nodeId);
    if (target?.data.kind !== "generate") {
      message.warning("请选择图片、视频或音乐生成节点作为连线终点");
      setConnectFrom(null);
      setConnectPoint(null);
      setSelected(nodeId);
      return;
    }
    connectNodes(connectFrom, nodeId);
    setConnectFrom(null);
    setConnectPoint(null);
    setSelected(nodeId);
  }, [connectFrom, connectNodes, message]);

  /** 图片素材连到视频生成节点后，双击连线在 素材 / 首帧 / 尾帧 之间切换（连线语义由这里决定）。 */
  const cycleEdgeRole = useCallback(
    (edge: Edge) => {
      const current = (edge.data?.role as CanvasEdgeRole) || "asset";
      const order: CanvasEdgeRole[] = ["asset", "first-frame", "last-frame"];
      const next = order[(order.indexOf(current) + 1) % order.length];
      // 首帧 / 尾帧各只允许一条：同一目标上同角色的旧连线退回「素材」
      setEdges((prev) =>
        prev.map((item) => {
          if (item.id === edge.id) {
            return { ...item, label: EDGE_ROLE_LABEL[next], data: { role: next } };
          }
          if (
            item.target === edge.target &&
            item.data?.role === next &&
            (next === "first-frame" || next === "last-frame")
          ) {
            return { ...item, label: EDGE_ROLE_LABEL.asset, data: { role: "asset" } };
          }
          return item;
        }),
      );
      setDirty(true);
    },
    [setEdges],
  );

  const patchNode = useCallback((nodeId: string, patch: Partial<CanvasNodeData>) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, data: { ...node.data.data, ...patch } as CanvasNodeData } }
          : node,
      ),
    );
    setDirty(true);
  }, [setNodes]);

  const deleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((node) => node.id !== nodeId));
    setEdges((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelected(null);
    setDirty(true);
  };

  /** 连了「模型配置」节点的生成节点：渠道与模型以配置节点为准（与面板同一口径）。 */
  const configByNode = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const map = new Map<string, { channelId: number; model: string }>();
    for (const edge of edges) {
      const source = byId.get(edge.source);
      const data = source?.data.data;
      if (!data || data.kind !== "config") continue;
      if (map.has(edge.target)) continue;
      map.set(edge.target, { channelId: data.channelId, model: data.model });
    }
    return map;
  }, [edges, nodes]);

  /** 接了提示词节点的生成节点：没写提示词也能生成。 */
  const promptFedNodes = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const set = new Set<string>();
    for (const edge of edges) {
      const source = byId.get(edge.source);
      if (source?.data.kind === "prompt") set.add(edge.target);
    }
    return set;
  }, [edges, nodes]);

  /**
   * 每个生成节点能 @ 的连线素材：入边先按角色排序再按类型编号，
   * 与后端 planNodeRun 组装素材的顺序一致，提示词里的 @图片2 才对得上第二张参考图。
   */
  const wiredByNode = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const incoming = new Map<string, Edge[]>();
    for (const edge of edges) {
      const list = incoming.get(edge.target);
      if (list) list.push(edge);
      else incoming.set(edge.target, [edge]);
    }
    const map = new Map<string, MentionCandidate[]>();
    for (const [targetId, list] of incoming) {
      const target = byId.get(targetId)?.data.data;
      if (!target || target.kind !== "generate" || target.media === "music") continue;
      const sorted = [...list].sort(
        (a, b) =>
          ROLE_ORDER[(a.data?.role as CanvasEdgeRole) || "asset"] -
          ROLE_ORDER[(b.data?.role as CanvasEdgeRole) || "asset"],
      );
      const rows = sorted.flatMap((edge) => {
        const source = byId.get(edge.source)?.data.data;
        if (!source || source.kind !== "asset" || !source.url) return [];
        const role = (edge.data?.role as CanvasEdgeRole) || "asset";
        return [
          {
            role: EDGE_ROLE_LABEL[role] || "素材",
            media: source.media,
            name: source.name || source.url,
            url: source.url,
            previewUrl: source.previewUrl,
            assetId: source.assetId,
          },
        ];
      });
      map.set(targetId, wiredMentions(rows));
    }
    return map;
  }, [edges, nodes]);

  /** 卡片上的 @ 改写的是节点里存的引用（连线素材另走 edges，不进这里）。 */
  const patchNodeRefs = useCallback(
    (nodeId: string, refs: CanvasMentionRef[]) => patchNode(nodeId, { refs }),
    [patchNode],
  );

  /** 卡片上的「生成」：对着节点里的提示词框直接提交，不用先选中再开右侧面板。 */
  const runNode = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((item) => item.id === nodeId);
      if (!node) return;
      const data = node.data.data;
      if (data.kind !== "generate") return;
      if (data.media === "video" && !(Number(data.duration) > 0)) {
        message.warning("请先在右侧面板填写视频时长（秒），再生成");
        setSelected(nodeId);
        return;
      }
      const cfg = configByNode.get(nodeId);
      const channelId = cfg ? cfg.channelId : data.channelId || 0;
      const model = cfg ? cfg.model : data.model;
      setSelected(nodeId);
      try {
        const result = await contentApi.runCanvasNode({
          params: { id: String(id), nodeId },
          body: {
            channelId,
            model,
            channelName: cfg
              ? channels.find((item) => item.value === cfg.channelId)?.label || ""
              : data.channelName,
            size: data.size,
            ratio: data.ratio,
            resolution: data.resolution,
            duration: data.duration,
            count: data.count,
            prompt: data.prompt,
            lyrics: data.lyrics,
          },
        });
        const count = result?.jobs?.length || 0;
        message.success(`已提交 ${count} 个任务，生成中`);
        setTaskVersion((prev) => prev + 1);
        void loadJobs();
        void refreshDoc();
      } catch (caught) {
        message.error((caught as Error).message || "提交失败");
      }
    },
    [channels, configByNode, id, loadJobs, message, refreshDoc],
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selected) || null,
    [nodes, selected],
  );

  // 选中节点的入边摘要：配置节点接管渠道/模型、连了几张参考素材（面板据此只读与说明）
  const wiring = useMemo(() => {
    if (!selected) return null;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    let config: { channelId: number; model: string } | null = null;
    let imageRefs = 0;
    let videoRefs = 0;
    let audioRefs = 0;
    for (const edge of edges) {
      if (edge.target !== selected) continue;
      const source = byId.get(edge.source);
      if (!source) continue;
      const data = source.data.data;
      if (data.kind === "config") {
        if (!config) config = { channelId: data.channelId, model: data.model };
        continue;
      }
      if (data.kind !== "asset") continue;
      if (data.media === "image") imageRefs += 1;
      else if (data.media === "video") videoRefs += 1;
      else audioRefs += 1;
    }
    return { config, imageRefs, videoRefs, audioRefs };
  }, [edges, nodes, selected]);

  // 生成节点把最近一批任务的状态挂到卡片上：排队 / 生成中 / 已出几张，打开画布就能看到
  const batchState = useMemo(() => {
    const map = new Map<string, { status: string; progress?: number; message: string }>();
    for (const node of nodes) {
      const data = node.data.data;
      if (data.kind !== "generate" || !data.lastRunId) continue;
      const batch = jobs.filter((job) => job.runId === data.lastRunId);
      if (!batch.length) continue;
      const running = batch.find((job) => !TERMINAL.has(job.status));
      const done = batch.filter((job) => job.status === "SUCCESS").length;
      const failed = batch.filter((job) => job.status === "FAILED").length;
      if (running) {
        map.set(node.id, {
          status: running.status,
          progress: running.progress,
          message: "生成中",
        });
      } else {
        map.set(node.id, {
          status: failed ? "FAILED" : "SUCCESS",
          message: `已完成 ${done}/${batch.length}${failed ? ` · 失败 ${failed}` : ""}`,
        });
      }
    }
    return map;
  }, [nodes, jobs]);

  // 每个节点都带上「双击开面板 / 卡片内改提示词 / 卡片内生成」，生成节点再挂上本批任务态
  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const data = node.data.data;
        const state = batchState.get(node.id);
        const blockedReason =
          data.kind !== "generate"
            ? ""
            : !(Boolean(data.prompt.trim()) || promptFedNodes.has(node.id))
              ? "先写提示词，或连一个提示词节点进来"
              : data.media === "video" && !(Number(data.duration) > 0)
                ? "先在右侧面板填写视频时长（秒）"
                : "";
        const canRun = data.kind !== "generate" ? undefined : blockedReason === "";
        return {
          ...node,
          data: {
            ...node.data,
            ...(state || {}),
            onOpen: openPanel,
            onPatch: (nodeId: string, patch: Partial<CanvasNodeData>) => patchNode(nodeId, patch),
            onRun: (nodeId: string) => void runNode(nodeId),
            onRefs: patchNodeRefs,
            onPortClick,
            wired: wiredByNode.get(node.id) || [],
            canRun,
            runBlockedReason: blockedReason,
            running: Boolean(state && (state.status === "RUNNING" || state.status === "PENDING")),
          },
        };
      }),
    [nodes, batchState, openPanel, onPortClick, patchNode, patchNodeRefs, promptFedNodes, runNode, wiredByNode],
  );

  // 画布内的「+」菜单：先按产出类型选（图片 / 视频 / 音乐），再是提示词 / 素材 / 模型配置
  const addMenu = [
    {
      key: "image",
      label: "图片生成节点",
      icon: <PictureOutlined />,
      onClick: () => addNode("generate", { media: "image" }),
    },
    {
      key: "video",
      label: "视频生成节点",
      icon: <VideoCameraOutlined />,
      onClick: () => addNode("generate", { media: "video" }),
    },
    {
      key: "music",
      label: "音乐生成节点",
      icon: <CustomerServiceOutlined />,
      onClick: () => addNode("generate", { media: "music" }),
    },
    { type: "divider" as const },
    {
      key: "prompt",
      label: "提示词节点（喂给生成节点）",
      icon: <FileTextOutlined />,
      onClick: () => addNode("prompt"),
    },
    {
      key: "asset",
      label: "从数字资产选素材",
      icon: <PictureOutlined />,
      onClick: () => setPickerOpen(true),
    },
    {
      key: "config",
      label: "模型配置节点（喂给生成节点）",
      icon: <SettingOutlined />,
      onClick: () => addNode("config"),
    },
  ];

  const openPicker = (tab: "digital" | "local") => {
    setPickerTab(tab);
    setPickerOpen(true);
  };

  const dropAssets = (event: React.DragEvent<HTMLDivElement>) => {
    const raw = event.dataTransfer.getData("application/x-aipdd-canvas-asset");
    if (!raw) return;
    event.preventDefault();
    try {
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) return;
      const assets = value.filter(
        (item): item is ContentDigitalAsset =>
          Boolean(item) &&
          typeof item === "object" &&
          Number.isInteger((item as ContentDigitalAsset).id) &&
          typeof (item as ContentDigitalAsset).url === "string" &&
          isReferenceMedia((item as ContentDigitalAsset).type),
      );
      if (assets.length) {
        addAssetNodes(assets, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        setSelected(null);
      }
    } catch {
      message.warning("素材数据无法识别，请重新从素材库拖入");
    }
  };

  const existingAssetUrls = nodes
    .filter((node) => node.data.kind === "asset")
    .map((node) => String((node.data.data as { url?: string }).url || ""));
  const appearanceMenu = {
    items: [
      {
        key: "appearance",
        label: "画布外观",
        type: "group" as const,
        children: [
          { key: "light", label: "浅色画布", icon: <SunOutlined />, onClick: () => changeTheme("light") },
          { key: "dark", label: "深色画布", icon: <MoonOutlined />, onClick: () => changeTheme("dark") },
          { type: "divider" as const },
          { key: "dots", label: "点阵网格", onClick: () => changeGrid("dots") },
          { key: "lines", label: "直线网格", onClick: () => changeGrid("lines") },
          { key: "blank", label: "无网格", onClick: () => changeGrid("blank") },
        ],
      },
    ],
    selectedKeys: [theme, grid],
  };

  const activeConnectFrom = connectFrom || draggingFrom;
  const connectPreview = (() => {
    if (!activeConnectFrom || !connectPoint || typeof document === "undefined") return null;
    const canvas = document.querySelector<HTMLElement>(".cv-canvas");
    const handle = document.querySelector<HTMLElement>(`[data-id="${activeConnectFrom}"] .react-flow__handle.source`);
    if (!canvas || !handle) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const handleRect = handle.getBoundingClientRect();
    const x = handleRect.left - canvasRect.left + handleRect.width / 2;
    const y = handleRect.top - canvasRect.top + handleRect.height / 2;
    return `M ${x} ${y} L ${connectPoint.x - canvasRect.left} ${connectPoint.y - canvasRect.top}`;
  })();

  return (
    <div className={`cv-immersive cv-theme-${theme}`}>
      {error ? <Notice variant="error">{error}</Notice> : null}
      {loading ? (
        <div className="cv-loading">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      ) : (
        <div className={`cv-editor cv-theme-${theme}${sidebarOpen ? " sidebar-open" : ""}`} style={{ "--cv-sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}>
          <div
            className={`cv-canvas${activeConnectFrom ? " cv-connecting" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropAssets}
            onPointerMove={(event) => {
              if (activeConnectFrom) setConnectPoint({ x: event.clientX, y: event.clientY });
            }}
          >
            <ReactFlow<CanvasFlowNode, Edge>
              nodes={displayNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={{
                type: "smoothstep",
                style: { strokeWidth: 1.8 },
                labelStyle: { fill: "var(--cv-muted)", fontSize: 11 },
                labelBgStyle: { fill: "var(--cv-canvas)", fillOpacity: 0.9 },
                labelBgPadding: [5, 8],
                labelBgBorderRadius: 6,
              }}
              onNodesChange={(changes) => {
                onNodesChange(changes);
                if (changes.some((item) =>
                  (item.type === "position" && item.dragging === false) ||
                  (item.type === "dimensions" && item.resizing === true) ||
                  item.type === "remove",
                )) setDirty(true);
              }}
              onEdgesChange={(changes) => {
                onEdgesChange(changes);
                if (changes.some((item) => item.type === "remove" || item.type === "add")) setDirty(true);
              }}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              onEdgeDoubleClick={(_, edge) => cycleEdgeRole(edge)}
              onNodeClick={(_, node) => onNodeClick(node.id)}
              onNodeDoubleClick={(_, node) => onNodeClick(node.id)}
              onPaneClick={() => {
                setConnectFrom(null);
                setConnectPoint(null);
                setSelected(null);
              }}
              onSelectionChange={({ nodes: selectedNodes }) => {
                if (selectedNodes.length === 1) setSelected(selectedNodes[0].id);
                else if (selectedNodes.length === 0) {
                  setSelected(null);
                  setConnectFrom(null);
                  setConnectPoint(null);
                }
              }}
              onNodesDelete={() => setDirty(true)}
              onMoveEnd={(_, viewport) => setZoom(viewport.zoom)}
              minZoom={0.05}
              maxZoom={5}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              {grid !== "blank" ? (
                <Background
                  gap={48}
                  size={grid === "dots" ? 1.2 : 1}
                  color="var(--cv-grid)"
                  variant={grid === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Dots}
                />
              ) : null}
              <MiniMap
                pannable
                zoomable
                nodeColor={(node) => node.data.kind === "generate" ? "#8b7cf6" : node.data.kind === "asset" ? "#78a991" : "#b0aaa0"}
                maskColor="rgba(41, 37, 36, .12)"
                className="cv-minimap"
              />
            </ReactFlow>
            {connectPreview ? (
              <svg className="cv-connect-preview" aria-hidden="true">
                <path d={connectPreview} fill="none" strokeDasharray="5 5" strokeWidth={2} />
              </svg>
            ) : null}
            {!nodes.length ? (
              <div className="cv-hint">
                <span className="cv-hint-mark"><AppstoreOutlined /></span>
                <strong>从一个想法开始</strong>
                <span>添加图片、视频或音乐生成节点，再从素材库拖入参考素材</span>
              </div>
            ) : null}

            <div className="cv-topbar">
              <div className="cv-topbar-left">
                {!sidebarOpen ? (
                  <Tooltip title="打开素材库">
                    <Button type="text" icon={<MenuUnfoldOutlined />} onClick={() => setSidebarOpen(true)} />
                  </Tooltip>
                ) : null}
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push("/content/canvas")}>
                  画布
                </Button>
                <span className="cv-topbar-divider" />
                <Input
                  value={title}
                  maxLength={120}
                  variant="borderless"
                  className="cv-topbar-title"
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setDirty(true);
                  }}
                  onBlur={() => {
                    if (project && title.trim() && title !== project.title) void persist(true);
                  }}
                />
                <span className={`cv-save-state${dirty ? " dirty" : ""}`}>
                  {saving ? "保存中…" : dirty ? "未保存" : "已保存"}
                </span>
              </div>
              <div className="cv-topbar-actions">
                <Tooltip title="撤销">
                  <Button type="text" icon={<UndoOutlined />} disabled={!canUndo} onClick={undo} />
                </Tooltip>
                <Tooltip title="重做">
                  <Button type="text" icon={<RedoOutlined />} disabled={!canRedo} onClick={redo} />
                </Tooltip>
                <Dropdown menu={appearanceMenu} trigger={["click"]} placement="bottomRight">
                  <Button type="text" icon={theme === "dark" ? <MoonOutlined /> : <SunOutlined />}>外观</Button>
                </Dropdown>
                <Button icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={() => void persist(false)}>保存</Button>
                <Button
                  type="primary"
                  icon={<CloudUploadOutlined />}
                  loading={saving}
                  onClick={() => {
                    void (async () => {
                      if (await persist(false)) router.push("/content/canvas");
                    })();
                  }}
                >
                  保存并退出
                </Button>
              </div>
            </div>

            <div className="cv-dock">
              <Dropdown menu={{ items: addMenu }} trigger={["click"]} placement="topLeft">
                <Button type="primary" className="cv-dock-add" icon={<PlusOutlined />}>添加节点</Button>
              </Dropdown>
              <span className="cv-dock-divider" />
              <Button className="cv-dock-tool" icon={<FolderOpenOutlined />} onClick={() => setSidebarOpen(true)}>素材库</Button>
              <Badge count={pendingCount} size="small" offset={[-2, 2]}>
                <Button className="cv-dock-tool" icon={<ProfileOutlined />} onClick={() => setTaskOpen((prev) => !prev)}>任务</Button>
              </Badge>
            </div>

            {connectFrom ? (
              <div className="cv-dock-hint" role="status">
                已选上游节点，点击下游生成节点完成连线
                <span>Esc 取消</span>
              </div>
            ) : null}

            <div className="cv-zoom-control">
              <Button type="text" icon={<MinusOutlined />} onClick={() => void zoomOut({ duration: 160 })} aria-label="缩小" />
              <button type="button" className="cv-zoom-value" onClick={() => void fitView({ padding: 0.2, duration: 180 })}>
                {Math.round(zoom * 100)}%
              </button>
              <Button type="text" icon={<PlusOutlined />} onClick={() => void zoomIn({ duration: 160 })} aria-label="放大" />
              <span />
              <Tooltip title="适应画布">
                <Button type="text" icon={<AimOutlined />} onClick={() => void fitView({ padding: 0.2, duration: 180 })} />
              </Tooltip>
            </div>
          </div>

          <CanvasAssetSidebar
            open={sidebarOpen}
            width={sidebarWidth}
            existingUrls={existingAssetUrls}
            onWidth={setSidebarWidth}
            onClose={() => setSidebarOpen(false)}
            onAdd={(assets) => addAssetNodes(assets)}
            onOpenPicker={openPicker}
          />

          {selectedNode ? (
            <NodePanel
              canvasId={id}
              node={{
                id: selectedNode.id,
                type: selectedNode.data.kind,
                x: selectedNode.position.x,
                y: selectedNode.position.y,
                width: Math.round(
                  selectedNode.measured?.width ||
                    (typeof selectedNode.style?.width === "number"
                      ? selectedNode.style.width
                      : canvasNodeSize(selectedNode.data.kind).width),
                ),
                data: selectedNode.data.data,
              }}
              channels={channels}
              wiring={wiring}
              wired={wiredByNode.get(selectedNode.id) || []}
              onPatch={(patch) => patchNode(selectedNode.id, patch)}
              onDelete={() => deleteNode(selectedNode.id)}
              onChanged={() => {
                setTaskVersion((prev) => prev + 1);
                void load();
              }}
              onRefreshed={() => void refreshDoc()}
            />
          ) : null}

          {taskOpen ? (
            <div className="cv-taskdock">
              <div className="cv-taskdock-head">
                <strong>画布任务</strong>
                <Button
                  size="small"
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={() => setTaskOpen(false)}
                />
              </div>
              <div className="cv-taskdock-body">
                <TaskDock canvasId={id} title="" refreshKey={taskVersion} />
              </div>
            </div>
          ) : null}
        </div>
      )}

      <AssetReferencePicker
        open={pickerOpen}
        initialTab={pickerTab}
        existingUrls={existingAssetUrls}
        onCancel={() => setPickerOpen(false)}
        onPick={(assets) => {
          addAssetNodes(assets);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

