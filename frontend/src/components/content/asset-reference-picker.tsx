"use client";

import {
  CheckOutlined,
  InboxOutlined,
  PictureOutlined,
  SearchOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import type {
  ContentAgentReference,
  ContentDigitalAsset,
  ContentSharedAsset,
} from "@enterprise/contracts";
import { Empty, Input, Modal, Progress, Skeleton, Tag, Upload } from "antd";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  contentApi,
  uploadDigitalAsset,
  uploadDigitalAssetDirect,
} from "@/api/content";
import { Notice, PanelTabs, PillTabs } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";

export type ReferenceMedia = ContentAgentReference["media"];

export const REFERENCE_MEDIA_LABEL: Record<ReferenceMedia, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
};

const REFERENCE_MEDIA: ReferenceMedia[] = ["image", "video", "audio"];

type AssetFilter = "all" | ReferenceMedia;
type PickerTab = "digital" | "local";
type LocalUpload = { file: File; type: ReferenceMedia };
type UploadTask = { total: number; processed: number; current: string };

const ALL_FILTERS: { key: AssetFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
];

const TYPE_LABEL: Record<string, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
};

const EXT_MEDIA: Record<string, ReferenceMedia> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  gif: "image",
  mp4: "video",
  mov: "video",
  webm: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
};

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const UPLOAD_LABELS = ["content-reference"];

export function isReferenceMedia(value: string): value is ReferenceMedia {
  return REFERENCE_MEDIA.some((media) => media === value);
}

function isAssetFilter(value: string): value is AssetFilter {
  return value === "all" || isReferenceMedia(value);
}

/** 参考文件按类型从 1 编号（图片1 / 视频1 / 音频1），删掉中间的也不重排。 */
export function nextReferenceLabel(
  references: ContentAgentReference[],
  media: ReferenceMedia,
) {
  const used = references
    .filter((item) => item.media === media)
    .map((item) => Number((/^[^\d]*(\d+)$/.exec(item.label) || [])[1]) || 0);
  return `${REFERENCE_MEDIA_LABEL[media]}${Math.max(0, ...used) + 1}`;
}

/** 数字资产 → 参考文件：按选择顺序接着已有编号往后排，重复地址直接跳过。 */
export function referencesFromAssets(
  existing: ContentAgentReference[],
  assets: ContentDigitalAsset[],
) {
  const next = [...existing];
  for (const asset of assets) {
    if (!isReferenceMedia(asset.type)) continue;
    if (next.some((item) => item.url === asset.url)) continue;
    next.push({
      label: nextReferenceLabel(next, asset.type),
      fileName: asset.name || asset.url.split("/").pop() || asset.url,
      url: asset.url,
      media: asset.type,
    });
  }
  return next;
}

function formatSize(mb: number) {
  if (!mb) return "—";
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(mb * 1024)} KB`;
}

function errorText(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

function mediaTypeOf(file: File): ReferenceMedia | "" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  const extension = file.name.toLowerCase().split(".").pop() || "";
  return EXT_MEDIA[extension] || "";
}

export function sharedAssetToDigital(row: ContentSharedAsset): ContentDigitalAsset[] {
  const id = Number(row.assetId);
  if (
    !Number.isInteger(id) ||
    id === 0 ||
    !row.assetUrl ||
    !isReferenceMedia(row.assetType)
  ) {
    return [];
  }
  return [
    {
      id,
      type: row.assetType,
      name: row.assetName || row.assetUrl.split("/").pop() || "共享素材",
      url: row.assetUrl,
      previewUrl: row.assetUrl,
      fileSize: row.assetSize,
      labels: ["共享资料"],
      isOpen: true,
      caption: row.ownerName ? `来自${row.ownerName}` : "",
      moderation: "off",
      moderationNote: "",
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    },
  ];
}

export function mergeAssets(groups: ContentDigitalAsset[][]) {
  const seen = new Set<number>();
  const merged: ContentDigitalAsset[] = [];
  for (const group of groups) {
    for (const asset of group) {
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      merged.push(asset);
    }
  }
  return merged;
}

function validateLocalFiles(files: File[], allowedMedia: ReferenceMedia[]) {
  const accepted: LocalUpload[] = [];
  const errors: string[] = [];
  const supported = allowedMedia.map((media) => REFERENCE_MEDIA_LABEL[media]).join(" / ");
  for (const file of files) {
    const type = mediaTypeOf(file);
    if (!type || !allowedMedia.includes(type)) {
      errors.push(`「${file.name}」不是支持的${supported || "媒体"}文件`);
      continue;
    }
    if (!file.size) {
      errors.push(`「${file.name}」是空文件`);
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push(`「${file.name}」超过 100MB，请压缩后重试`);
      continue;
    }
    accepted.push({ file, type });
  }
  return { accepted, errors };
}

function assetTitle(asset: ContentDigitalAsset) {
  return asset.name || asset.url.split("/").pop() || "未命名素材";
}

function AssetCover({ asset }: { asset: ContentDigitalAsset }) {
  const style = {
    display: "block",
    width: "100%",
    aspectRatio: "4 / 3",
    objectFit: "cover",
  } as const;
  const preview = asset.previewUrl || (asset.type === "image" ? asset.url : "");
  if (asset.type === "image" && preview) {
    return <RawImg src={preview} alt={assetTitle(asset)} loading="lazy" style={style} />;
  }
  if (asset.type === "video" && preview && preview !== asset.url) {
    return <RawImg src={preview} alt={assetTitle(asset)} loading="lazy" style={style} />;
  }
  if (asset.type === "video") {
    return (
      <video
        src={asset.url}
        preload="metadata"
        muted
        playsInline
        aria-label={assetTitle(asset)}
        style={style}
      />
    );
  }
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "4 / 3",
        display: "grid",
        placeItems: "center",
        alignContent: "center",
        gap: 8,
        background: "var(--bg-muted, #fafafa)",
        color: "var(--text-3, #8c8c8c)",
      }}
    >
      {asset.type === "audio" ? (
        <SoundOutlined style={{ fontSize: 30 }} aria-hidden />
      ) : (
        <PictureOutlined style={{ fontSize: 30 }} aria-hidden />
      )}
      <span className="text-12">{TYPE_LABEL[asset.type] || asset.type}</span>
    </div>
  );
}

function AssetCard({
  asset,
  selected,
  added,
  onToggle,
}: {
  asset: ContentDigitalAsset;
  selected: boolean;
  added: boolean;
  onToggle: (asset: ContentDigitalAsset) => void;
}) {
  const title = assetTitle(asset);
  return (
    <button
      type="button"
      disabled={added}
      aria-pressed={selected}
      aria-label={`${added ? "已添加" : selected ? "取消选择" : "选择"}：${title}`}
      title={asset.caption ? `${title} · ${asset.caption}` : title}
      onClick={() => onToggle(asset)}
      style={{
        position: "relative",
        minWidth: 0,
        padding: 0,
        overflow: "hidden",
        textAlign: "left",
        cursor: added ? "not-allowed" : "pointer",
        opacity: added ? 0.58 : 1,
        border: `1px solid ${selected ? "var(--primary, #1677ff)" : "var(--border, #f0f0f0)"}`,
        borderRadius: 8,
        background: "var(--card, #fff)",
        transition: "border-color 160ms ease, box-shadow 160ms ease",
        boxShadow: selected ? "0 0 0 1px var(--primary, #1677ff) inset" : "none",
      }}
    >
      <AssetCover asset={asset} />
      <span
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "grid",
          placeItems: "center",
        }}
      >
        {added ? (
          <Tag style={{ margin: 0 }}>已添加</Tag>
        ) : (
          <span
            aria-hidden
            style={{
              width: 22,
              height: 22,
              display: "grid",
              placeItems: "center",
              borderRadius: 5,
              border: selected ? "1px solid var(--primary, #1677ff)" : "1px solid var(--border-strong, #d9d9d9)",
              background: selected ? "var(--primary, #1677ff)" : "var(--card, #fff)",
              color: selected ? "#fff" : "var(--text-3, #8c8c8c)",
            }}
          >
            {selected ? <CheckOutlined style={{ fontSize: 14 }} /> : null}
          </span>
        )}
      </span>
      <span style={{ display: "grid", gap: 5, padding: "10px 12px 12px" }}>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 500,
            color: "var(--text-1, #1f1f1f)",
          }}
        >
          {title}
        </span>
        <span
          className="text-12 muted"
          style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}
        >
          <span style={{ flexShrink: 0 }}>
            {`${TYPE_LABEL[asset.type] || asset.type} · ${formatSize(asset.fileSize)}`}
          </span>
          {asset.labels.includes("共享资料") ? (
            <Tag color="blue" style={{ margin: 0, marginInlineStart: "auto", flexShrink: 0 }}>
              共享
            </Tag>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function AssetGrid({
  assets,
  pickedIds,
  existing,
  onToggle,
}: {
  assets: ContentDigitalAsset[];
  pickedIds: Set<number>;
  existing: Set<string>;
  onToggle: (asset: ContentDigitalAsset) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          selected={pickedIds.has(asset.id)}
          added={existing.has(asset.url)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

/** 数字资产与本地上传共用的素材选择器；上传成功即登记并选中，调用方仍只接收资产数组。 */
export function AssetReferencePicker({
  open,
  existingUrls,
  onCancel,
  onPick,
  mediaTypes = REFERENCE_MEDIA,
  initialTab = "digital",
}: {
  open: boolean;
  existingUrls: string[];
  onCancel: () => void;
  onPick: (assets: ContentDigitalAsset[]) => void;
  /** 只列这几类素材；视频复刻等场景只收图片。 */
  mediaTypes?: ReferenceMedia[];
  initialTab?: PickerTab;
}) {
  const mediaKey = mediaTypes.join(",");
  const allowedMedia = useMemo(
    () => mediaKey.split(",").filter(isReferenceMedia),
    [mediaKey],
  );
  const [activeTab, setActiveTab] = useState<PickerTab>("digital");
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [digitalAssets, setDigitalAssets] = useState<ContentDigitalAsset[]>([]);
  const [sharedAssets, setSharedAssets] = useState<ContentDigitalAsset[]>([]);
  const [uploadedAssets, setUploadedAssets] = useState<ContentDigitalAsset[]>([]);
  const [pickedAssets, setPickedAssets] = useState<ContentDigitalAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadTask, setUploadTask] = useState<UploadTask | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadSummary, setUploadSummary] = useState("");

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setFilter("all");
    setKeyword("");
    setPickedAssets([]);
    setUploadedAssets([]);
    setUploadTask(null);
    setUploadError("");
    setUploadSummary("");
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setLoadError("");
    void Promise.allSettled([
      contentApi.digitalAssets({ query: { page: 1, pageSize: 100 } }),
      contentApi.sharedAssets(),
    ]).then(([digitalResult, sharedResult]) => {
      if (!active) return;
      const errors: string[] = [];
      if (digitalResult.status === "fulfilled") {
        setDigitalAssets(
          (digitalResult.value?.list || []).filter(
            (item) => isReferenceMedia(item.type) && allowedMedia.includes(item.type),
          ),
        );
      } else {
        setDigitalAssets([]);
        errors.push(`数字资产读取失败：${errorText(digitalResult.reason, "请稍后重试")}`);
      }
      if (sharedResult.status === "fulfilled") {
        setSharedAssets(
          (sharedResult.value?.received || []).flatMap((row) =>
            sharedAssetToDigital(row).filter(
              (asset) => isReferenceMedia(asset.type) && allowedMedia.includes(asset.type),
            ),
          ),
        );
      } else {
        setSharedAssets([]);
        errors.push(`共享资料读取失败：${errorText(sharedResult.reason, "请稍后重试")}`);
      }
      setLoadError(errors.join("；"));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, allowedMedia]);

  const assets = useMemo(
    () => mergeAssets([uploadedAssets, digitalAssets, sharedAssets]),
    [uploadedAssets, digitalAssets, sharedAssets],
  );
  const existing = useMemo(() => new Set(existingUrls), [existingUrls]);
  const pickedIds = useMemo(
    () => new Set(pickedAssets.map((asset) => asset.id)),
    [pickedAssets],
  );
  const selectedAssets = useMemo(
    () => pickedAssets.filter((asset) => !existing.has(asset.url)),
    [pickedAssets, existing],
  );
  const normalizedKeyword = keyword.trim().toLowerCase();
  const visibleAssets = useMemo(
    () =>
      assets.filter((asset) => {
        if (filter !== "all" && asset.type !== filter) return false;
        if (!normalizedKeyword) return true;
        return [asset.name, asset.caption, asset.url, ...asset.labels]
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);
      }),
    [assets, filter, normalizedKeyword],
  );
  const filters = ALL_FILTERS.filter(
    (item) => item.key === "all" || allowedMedia.some((media) => media === item.key),
  );
  const supportedLabel = allowedMedia.map((media) => REFERENCE_MEDIA_LABEL[media]).join(" / ");
  const accept = allowedMedia.map((media) => `${media}/*`).join(",") || undefined;

  const toggleAsset = (asset: ContentDigitalAsset) => {
    if (existing.has(asset.url)) return;
    setPickedAssets((previous) =>
      previous.some((item) => item.id === asset.id)
        ? previous.filter((item) => item.id !== asset.id)
        : [...previous, asset],
    );
  };

  const uploadFiles = async (files: File[]) => {
    if (uploading) {
      setUploadError("请等待当前文件上传完成");
      return;
    }
    const { accepted, errors } = validateLocalFiles(files, allowedMedia);
    if (!accepted.length) {
      setUploadError(errors.join("；") || "没有可上传的文件");
      return;
    }
    setUploadError("");
    setUploadSummary("");
    setUploadTask({
      total: accepted.length,
      processed: 0,
      current: accepted[0].file.name,
    });
    setUploading(true);
    let succeeded = 0;
    for (let index = 0; index < accepted.length; index += 1) {
      const { file, type } = accepted[index];
      try {
        const meta = {
          type,
          name: file.name.replace(/\.[^.]+$/, ""),
          labels: UPLOAD_LABELS,
        };
        let asset: ContentDigitalAsset;
        try {
          asset = await uploadDigitalAssetDirect(file, meta);
        } catch {
          asset = await uploadDigitalAsset(file, meta);
        }
        if (!isReferenceMedia(asset.type) || !allowedMedia.includes(asset.type)) {
          throw new Error("上传返回了不支持的素材类型");
        }
        succeeded += 1;
        setUploadedAssets((previous) =>
          previous.some((item) => item.id === asset.id) ? previous : [asset, ...previous],
        );
        setPickedAssets((previous) => {
          if (
            existing.has(asset.url) ||
            previous.some((item) => item.id === asset.id || item.url === asset.url)
          ) {
            return previous;
          }
          return [...previous, asset];
        });
      } catch (caught) {
        errors.push(`「${file.name}」上传失败：${errorText(caught, "请稍后重试")}`);
      }
      setUploadTask((previous) =>
        previous
          ? {
              ...previous,
              processed: index + 1,
              current: accepted[index + 1]?.file.name || "",
            }
          : previous,
      );
    }
    setUploading(false);
    setUploadError(errors.join("；"));
    setUploadSummary(
      succeeded
        ? `已上传并登记 ${succeeded} 个素材，并自动加入选择；已添加过的素材不会重复选择。`
        : "",
    );
  };

  return (
    <Modal
      open={open}
      title="添加素材"
      okText={selectedAssets.length ? `添加 ${selectedAssets.length} 个` : "添加"}
      cancelText="取消"
      okButtonProps={{ disabled: !selectedAssets.length || uploading }}
      cancelButtonProps={{ disabled: uploading }}
      confirmLoading={uploading}
      onOk={() => {
        if (selectedAssets.length) onPick(selectedAssets);
      }}
      onCancel={() => {
        if (!uploading) onCancel();
      }}
      closable={!uploading}
      mask={{ closable: !uploading }}
      keyboard={!uploading}
      width={860}
      destroyOnHidden
      styles={{ body: { padding: "0 24px 24px", minHeight: 480 } }}
    >
      <p className="text-12 muted" style={{ margin: "0 0 14px" }}>
        从数字资产或共享资料中选择，也可上传本地文件；支持多选，上传成功后自动登记到数字资产。
      </p>
      <PanelTabs
        value={activeTab}
        onChange={(key) => setActiveTab(key === "local" ? "local" : "digital")}
        items={[
          {
            key: "digital",
            label: "数字资产",
            children: (
              <div style={{ display: "grid", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <PillTabs
                    items={filters}
                    value={filter}
                    onChange={(key) => setFilter(isAssetFilter(key) ? key : "all")}
                    size="small"
                    variant="soft"
                  />
                  <Input
                    allowClear
                    prefix={<SearchOutlined aria-hidden />}
                    placeholder="搜索素材名称、标签或共享来源"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    style={{ width: 260, maxWidth: "100%", marginLeft: "auto" }}
                  />
                </div>
                {loadError ? <Notice variant="error">{loadError}</Notice> : null}
                {loading ? (
                  <Skeleton active paragraph={{ rows: 6 }} style={{ padding: "16px 0" }} />
                ) : visibleAssets.length ? (
                  <div style={{ maxHeight: 440, overflowY: "auto", paddingRight: 4 }}>
                    <AssetGrid
                      assets={visibleAssets}
                      pickedIds={pickedIds}
                      existing={existing}
                      onToggle={toggleAsset}
                    />
                  </div>
                ) : (
                  <Empty
                    style={{ padding: "36px 0" }}
                    description={
                      normalizedKeyword || filter !== "all"
                        ? "没有符合条件的素材"
                        : `数字资产里还没有${supportedLabel}，可切换到「本地上传」添加`
                    }
                  >
                    {!normalizedKeyword && filter === "all" ? (
                      <Link href="/assets">前往数字资产管理上传</Link>
                    ) : null}
                  </Empty>
                )}
              </div>
            ),
          },
          {
            key: "local",
            label: "本地上传",
            children: (
              <div style={{ display: "grid", gap: 14 }}>
                <Upload.Dragger
                  accept={accept}
                  multiple
                  disabled={uploading}
                  showUploadList={false}
                  beforeUpload={(file, fileList) => {
                    if (file === fileList[0]) void uploadFiles(fileList);
                    return false;
                  }}
                  style={{ padding: "18px 12px" }}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined aria-hidden />
                  </p>
                  <p className="ant-upload-text">
                    {uploading ? "正在上传，请稍候" : "点击选择文件，或拖拽文件到这里"}
                  </p>
                  <p className="ant-upload-hint" style={{ margin: 0 }}>
                    {`支持${supportedLabel}，单个文件不超过 100MB；可一次选择多个，上传后自动登记到数字资产。`}
                  </p>
                </Upload.Dragger>
                {uploadTask ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <Progress
                      percent={Math.round((uploadTask.processed / uploadTask.total) * 100)}
                      status={uploading ? "active" : uploadError ? "exception" : "success"}
                      size="small"
                    />
                    <span className="text-12 muted">
                      {uploading && uploadTask.current
                        ? `正在上传第 ${uploadTask.processed + 1} / ${uploadTask.total} 个：${uploadTask.current}`
                        : `已处理 ${uploadTask.processed} / ${uploadTask.total} 个文件`}
                    </span>
                  </div>
                ) : null}
                {uploadError ? <Notice variant="error">{uploadError}</Notice> : null}
                {uploadSummary ? <Notice variant="success">{uploadSummary}</Notice> : null}
                {uploadedAssets.length ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>本次上传</strong>
                      <span className="text-12 muted">上传成功即选中，可继续添加多个</span>
                    </div>
                    <AssetGrid
                      assets={uploadedAssets}
                      pickedIds={pickedIds}
                      existing={existing}
                      onToggle={toggleAsset}
                    />
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
}
