"use client";

import {
  CheckOutlined,
  CloudUploadOutlined,
  FolderOpenOutlined,
  MenuFoldOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import { Button, Empty, Input, Skeleton, Tooltip } from "antd";
import { useEffect, useMemo, useState } from "react";
import type {
  ContentDigitalAsset,
  ContentSharedAsset,
} from "@enterprise/contracts";
import { contentApi } from "@/api/content";
import {
  isReferenceMedia,
  mergeAssets,
  sharedAssetToDigital,
  type ReferenceMedia,
} from "@/components/content/asset-reference-picker";
import { RawImg } from "@/components/ui/raw-img";

type AssetFilter = "all" | ReferenceMedia;
type LibraryTab = "all" | "owned" | "shared";

const FILTERS: { key: AssetFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
];

function Cover({ asset }: { asset: ContentDigitalAsset }) {
  const url = asset.previewUrl || asset.url;
  if (asset.type === "image") {
    return <RawImg src={url} alt="" loading="lazy" />;
  }
  if (asset.type === "video" && url) {
    return <video src={url} preload="metadata" muted playsInline aria-label={asset.name} />;
  }
  return (
    <span className="cv-sidebar-cover-placeholder">
      {asset.type === "audio" ? <SoundOutlined /> : <PictureOutlined />}
    </span>
  );
}

/** 参考项目的常驻素材栏：资产可直接点入画布，也可拖到画布上落点。 */
export function CanvasAssetSidebar({
  open,
  width,
  existingUrls,
  onWidth,
  onClose,
  onAdd,
  onOpenPicker,
}: {
  open: boolean;
  width: number;
  existingUrls: string[];
  onWidth: (width: number) => void;
  onClose: () => void;
  onAdd: (assets: ContentDigitalAsset[]) => void;
  onOpenPicker: (tab: "digital" | "local") => void;
}) {
  const [owned, setOwned] = useState<ContentDigitalAsset[]>([]);
  const [shared, setShared] = useState<ContentDigitalAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<LibraryTab>("all");
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError("");
    void Promise.allSettled([
      contentApi.digitalAssets({ query: { page: 1, pageSize: 100 } }),
      contentApi.sharedAssets(),
    ]).then(([digital, sharedResult]) => {
      if (!alive) return;
      const errors: string[] = [];
      if (digital.status === "fulfilled") {
        setOwned((digital.value?.list || []).filter((item) => isReferenceMedia(item.type)));
      } else {
        setOwned([]);
        errors.push("数字资产读取失败");
      }
      if (sharedResult.status === "fulfilled") {
        const received = (sharedResult.value?.received || []) as ContentSharedAsset[];
        setShared(mergeAssets(received.map(sharedAssetToDigital)));
      } else {
        setShared([]);
        errors.push("共享资料读取失败");
      }
      setError(errors.join("；"));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, refreshKey]);

  const assets = useMemo(() => {
    const source = tab === "owned" ? owned : tab === "shared" ? shared : mergeAssets([owned, shared]);
    const word = keyword.trim().toLowerCase();
    return source.filter((asset) => {
      if (filter !== "all" && asset.type !== filter) return false;
      if (!word) return true;
      return [asset.name, asset.caption, ...asset.labels].join(" ").toLowerCase().includes(word);
    });
  }, [owned, shared, tab, filter, keyword]);
  const existing = useMemo(() => new Set(existingUrls.filter(Boolean)), [existingUrls]);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (next: PointerEvent) => {
      onWidth(Math.min(480, Math.max(220, startWidth + next.clientX - startX)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!open) return null;

  return (
    <aside className="cv-asset-sidebar" style={{ width }} aria-label="画布素材库">
      <div className="cv-sidebar-head">
        <div className="cv-sidebar-brand">
          <span className="cv-sidebar-brand-mark"><FolderOpenOutlined /></span>
          <div>
            <strong>素材库</strong>
            <span>数字资产 · 共享资料</span>
          </div>
        </div>
        <Tooltip title="收起素材栏">
          <Button type="text" size="small" icon={<MenuFoldOutlined />} onClick={onClose} />
        </Tooltip>
      </div>

      <div className="cv-sidebar-actions">
        <Button block icon={<PlusOutlined />} onClick={() => onOpenPicker("digital")}>添加素材</Button>
        <Button block icon={<CloudUploadOutlined />} onClick={() => onOpenPicker("local")}>本地上传</Button>
      </div>

      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="搜索素材"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
      />
      <div className="cv-sidebar-tabs" role="tablist" aria-label="素材来源">
        {([
          ["all", "全部"],
          ["owned", "我的"],
          ["shared", "共享"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
            {key === "shared" && shared.length ? <span>{shared.length}</span> : null}
          </button>
        ))}
      </div>
      <div className="cv-sidebar-filters">
        {FILTERS.map((item) => (
          <button
            type="button"
            key={item.key}
            className={filter === item.key ? "active" : ""}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="cv-sidebar-scroll">
        {error ? <div className="cv-sidebar-error">{error}</div> : null}
        {loading ? <Skeleton active paragraph={{ rows: 8 }} /> : assets.length ? (
          <div className="cv-sidebar-grid">
            {assets.map((asset) => {
              const added = existing.has(asset.url);
              const sharedAsset = asset.labels.includes("共享资料");
              return (
                <Tooltip key={asset.id} title={added ? "已在画布中" : "点击添加，或拖到画布"}>
                  <button
                    type="button"
                    draggable={!added}
                    className={`cv-sidebar-card${added ? " added" : ""}`}
                    disabled={added}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-aipdd-canvas-asset", JSON.stringify(asset));
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onAdd([asset])}
                  >
                    <span className="cv-sidebar-cover">
                      <Cover asset={asset} />
                      <span className="cv-sidebar-kind">
                        {asset.type === "image" ? <PictureOutlined /> : asset.type === "video" ? <PlayCircleOutlined /> : <SoundOutlined />}
                      </span>
                      {added ? <span className="cv-sidebar-added"><CheckOutlined /> 已添加</span> : null}
                      {sharedAsset ? <span className="cv-sidebar-shared">共享</span> : null}
                    </span>
                    <span className="cv-sidebar-card-name">{asset.name || "未命名素材"}</span>
                    <span className="cv-sidebar-card-meta">{sharedAsset ? asset.caption || "共享资料" : "我的数字资产"}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的素材">
            <Button size="small" onClick={() => onOpenPicker("local")}>上传本地素材</Button>
          </Empty>
        )}
      </div>
      <div className="cv-sidebar-foot">
        <span>素材可拖入画布</span>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>刷新</button>
      </div>
      <div className="cv-sidebar-resizer" role="separator" aria-orientation="vertical" onPointerDown={startResize} />
    </aside>
  );
}
