"use client";

import {
  CheckCircleFilled,
  ExportOutlined,
  FileTextOutlined,
  MoreOutlined,
  PictureOutlined,
  SettingOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import {
  Handle,
  NodeResizer,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { CanvasEdgeRole, CanvasMentionRef, CanvasNodeData } from "@enterprise/contracts";
import { RawImg } from "@/components/ui/raw-img";
import { MENTION_MEDIA, MentionField, type MentionCandidate } from "./mention-field";

export type CanvasFlowData = {
  kind: CanvasNodeData["kind"];
  data: CanvasNodeData;
  status?: string;
  progress?: number;
  message?: string;
  running?: boolean;
  onOpen?: (nodeId: string) => void;
  onPatch?: (nodeId: string, patch: Partial<CanvasNodeData>) => void;
  onRun?: (nodeId: string) => void;
  onRefs?: (nodeId: string, refs: CanvasMentionRef[]) => void;
  onPortClick?: (nodeId: string) => void;
  wired?: MentionCandidate[];
  canRun?: boolean;
  runBlockedReason?: string;
};

export type CanvasFlowNode = Node<CanvasFlowData, "canvas">;

const KIND_LABEL: Record<string, string> = {
  prompt: "提示词",
  asset: "素材",
  config: "模型配置",
  generate: "生成",
};

const MEDIA_LABEL: Record<string, string> = {
  image: "图片",
  video: "视频",
  music: "音乐",
};

export const EDGE_ROLE_LABEL: Record<CanvasEdgeRole, string> = {
  prompt: "提示词",
  asset: "素材",
  config: "配置",
  "first-frame": "首帧",
  "last-frame": "尾帧",
};

export function canvasNodeSize(kind: CanvasNodeData["kind"], media?: string) {
  if (kind === "asset") {
    return { width: media === "audio" ? 340 : 420, height: media === "audio" ? 190 : 312 };
  }
  if (kind === "prompt") return { width: 340, height: 240 };
  if (kind === "config") return { width: 440, height: 240 };
  return { width: 420, height: media === "music" ? 330 : 430 };
}

function Resizer({ kind, visible }: { kind: CanvasNodeData["kind"]; visible: boolean }) {
  const minWidth = kind === "asset" || kind === "prompt" ? 280 : 340;
  return (
    <NodeResizer
      isVisible={visible}
      lineClassName="cv-node-resize-line"
      handleClassName="cv-node-resize-handle"
      minWidth={minWidth}
      maxWidth={760}
      minHeight={180}
      maxHeight={900}
    />
  );
}

function NodeTitle({
  id,
  kind,
  label,
  icon,
  running,
  onOpen,
}: {
  id: string;
  kind: string;
  label: string;
  icon: React.ReactNode;
  running?: boolean;
  onOpen?: (nodeId: string) => void;
}) {
  return (
    <div className={`cv-node-title cv-node-title-${kind}${running ? " running" : ""}`}>
      <span className="cv-node-title-icon">{icon}</span>
      <span>{label}</span>
      <div className="cv-node-tools nodrag nowheel">
        <Button type="text" size="small" icon={<MoreOutlined />} onClick={() => onOpen?.(id)} />
      </div>
    </div>
  );
}

function AssetMedia({ media, url, previewUrl }: { media: string; url: string; previewUrl?: string }) {
  if (media === "image") {
    return (
      <a className="cv-node-media-link nodrag nowheel" href={url} target="_blank" rel="noreferrer">
        <RawImg src={previewUrl || url} alt="" />
        <span className="cv-node-media-open"><ExportOutlined /> 打开原图</span>
      </a>
    );
  }
  if (media === "video") {
    return <video className="cv-node-player nodrag nowheel" src={url} controls preload="metadata" playsInline />;
  }
  return <audio className="cv-node-audio nodrag nowheel" src={url} controls preload="metadata" />;
}

function ResultMedia({ media, url, assetId }: { media: string; url: string; assetId: string }) {
  return (
    <div className="cv-result-card">
      <div className="cv-result-media">
        {media === "image" ? (
          <a href={url} target="_blank" rel="noreferrer" className="nodrag nowheel">
            <RawImg src={url} alt="生成结果" />
          </a>
        ) : media === "video" ? (
          <video className="nodrag nowheel" src={url} controls preload="metadata" playsInline />
        ) : (
          <div className="cv-result-audio nodrag nowheel">
            <SoundOutlined />
            <audio src={url} controls preload="metadata" />
          </div>
        )}
      </div>
      <div className="cv-result-foot">
        <span>{media === "image" ? "生成图片" : media === "video" ? "生成视频" : "生成音乐"}</span>
        {assetId ? (
          <span className="cv-result-stored"><CheckCircleFilled /> 已入资产</span>
        ) : (
          <a href={url} target="_blank" rel="noreferrer">待入库</a>
        )}
      </div>
    </div>
  );
}

/** 四类画布节点使用参考项目的暖灰媒体卡片外观，业务交互仍由原节点数据驱动。 */
export function CanvasNodeView({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const node = data.data;
  const kind = node.kind;
  const running = data.running || data.status === "RUNNING" || data.status === "PENDING";

  if (kind === "generate") {
    return (
      <div
        className={`cv-node cv-node-generate cv-node-${node.media}${selected ? " selected" : ""}${running ? " running" : ""}`}
        data-node-id={id}
      >
        <NodeResizer
          isVisible={selected}
          lineClassName="cv-node-resize-line"
          handleClassName="cv-node-resize-handle"
          minWidth={360}
          maxWidth={760}
          minHeight={320}
          maxHeight={1000}
        />
        <Handle type="target" position={Position.Left} id="in" className="cv-handle cv-handle-target" title="生成节点的输入口" />
        <Handle
          type="source"
          position={Position.Right}
          className="cv-handle cv-handle-source"
          title="拖动到下游生成节点，或点击后再点下游节点完成连线"
          aria-label="连接下游生成节点"
          onClick={(event) => {
            event.stopPropagation();
            data.onPortClick?.(id);
          }}
        />
        <NodeTitle
          id={id}
          kind="generate"
          label={`${MEDIA_LABEL[node.media] || node.media}生成`}
          icon={node.media === "video" ? <VideoCameraOutlined /> : node.media === "music" ? <SoundOutlined /> : <PictureOutlined />}
          running={running}
          onOpen={data.onOpen}
        />
        <div className="cv-node-inner">
          <div className="cv-gen-meta">
            <span className="cv-gen-model">{node.model || "默认模型"}</span>
            <span>{node.count > 1 ? `${node.count} 张` : "单张"}</span>
          </div>
          {node.media === "music" && typeof node.lyrics === "string" && node.lyrics.trim() ? (
            <div className="cv-lyrics">{node.lyrics}</div>
          ) : null}
          <div className="cv-node-prompt-wrap nodrag" onMouseDown={(event) => event.stopPropagation()}>
            <MentionField
              className="cv-node-prompt nodrag nowheel"
              variant="borderless"
              autoSize={{ minRows: 3, maxRows: 6 }}
              value={node.prompt}
              placeholder="描述你想创作的内容，敲 @ 引用素材…"
              refs={node.refs}
              wired={data.wired || []}
              mediaTypes={MENTION_MEDIA[node.media]}
              onChange={(next) => data.onPatch?.(id, { prompt: next })}
              onRefsChange={(refs) => data.onRefs?.(id, refs)}
            />
          </div>
          {data.status ? (
            <div className={`cv-gen-state ${running ? "active" : data.status === "FAILED" ? "failed" : ""}`}>
              <span className="cv-gen-state-dot" />
              <span>{data.message || data.status}{typeof data.progress === "number" && running ? ` · ${data.progress}%` : ""}</span>
            </div>
          ) : null}
          <div className="cv-node-gen-foot">
            <button type="button" className="cv-settings-link nodrag nowheel" onClick={() => data.onOpen?.(id)}>
              <SettingOutlined /> 模型与规格
            </button>
            <Tooltip title={data.canRun === false ? data.runBlockedReason || "请先完善生成条件" : "提交生成任务"}>
              <Button
                type="primary"
                className="cv-node-run nodrag nowheel"
                icon={<ThunderboltOutlined />}
                loading={running}
                disabled={data.canRun === false}
                onClick={(event) => {
                  event.stopPropagation();
                  data.onRun?.(id);
                }}
              >
                生成
              </Button>
            </Tooltip>
          </div>
          {node.results.length ? (
            <div className={`cv-node-results${node.results.length > 1 ? " multiple" : ""}`}>
              {node.results.map((item) => (
                <ResultMedia key={item.jobId} media={item.media || node.media} url={item.url} assetId={item.assetId} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (kind === "asset") {
    return (
      <div
        className={`cv-node cv-node-asset cv-node-asset-${node.media}${selected ? " selected" : ""}`}
        data-node-id={id}
      >
        <Resizer kind={kind} visible={selected} />
        <Handle type="target" position={Position.Left} id="in" className="cv-handle cv-handle-target" />
        <Handle
          type="source"
          position={Position.Right}
          className="cv-handle cv-handle-source"
          title="拖动到下游生成节点，或点击后再点下游节点完成连线"
          aria-label="连接下游生成节点"
          onClick={(event) => {
            event.stopPropagation();
            data.onPortClick?.(id);
          }}
        />
        <NodeTitle
          id={id}
          kind="asset"
          label={node.name || "未命名素材"}
          icon={node.media === "video" ? <VideoCameraOutlined /> : node.media === "audio" ? <SoundOutlined /> : <PictureOutlined />}
          onOpen={data.onOpen}
        />
        <div className="cv-node-inner cv-asset-inner">
          <AssetMedia media={node.media} url={node.url} previewUrl={node.previewUrl} />
          <div className="cv-asset-foot">
            <span>{node.media === "image" ? "图片素材" : node.media === "video" ? "视频素材" : "音频素材"}</span>
            <span className="cv-asset-stored"><CheckCircleFilled /> 数字资产</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`cv-node cv-node-${kind}${selected ? " selected" : ""}`}
      data-node-id={id}
      onDoubleClick={() => data.onOpen?.(id)}
    >
      <Resizer kind={kind} visible={selected} />
      <Handle type="target" position={Position.Left} id="in" className="cv-handle cv-handle-target" />
      <Handle
        type="source"
        position={Position.Right}
        className="cv-handle cv-handle-source"
        title="拖动到下游生成节点，或点击后再点下游节点完成连线"
        aria-label="连接下游生成节点"
        onClick={(event) => {
          event.stopPropagation();
          data.onPortClick?.(id);
        }}
      />
      <NodeTitle
        id={id}
        kind={kind}
        label={KIND_LABEL[kind]}
        icon={kind === "prompt" ? <FileTextOutlined /> : <SettingOutlined />}
        onOpen={data.onOpen}
      />
      <div className="cv-node-inner">
        {kind === "prompt" ? (
          <>
            <div className="cv-prompt-copy">{node.text.trim() || "双击节点输入提示词"}</div>
            <button type="button" className="cv-settings-link nodrag nowheel" onClick={() => data.onOpen?.(id)}>
              编辑提示词 <MoreOutlined />
            </button>
          </>
        ) : (
          <>
            <div className="cv-config-channel"><span>渠道</span><strong>{node.channelName || "默认渠道"}</strong></div>
            <div className="cv-config-model">{node.model || "默认模型"}</div>
            <div className="cv-config-specs">
              {[node.size, node.ratio, node.resolution, node.duration ? `${node.duration}s` : "", node.count ? `×${node.count}` : ""].filter(Boolean).join(" · ") || "规格由模型能力决定"}
            </div>
            <button type="button" className="cv-settings-link nodrag nowheel" onClick={() => data.onOpen?.(id)}>
              编辑模型与规格 <MoreOutlined />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
