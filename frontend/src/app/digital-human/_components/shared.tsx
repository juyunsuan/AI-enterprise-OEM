"use client";

// 数字人后台页签共用：分页加载、金额口径、图片上传控件。
import { DeleteOutlined, PictureOutlined } from "@ant-design/icons";
import { App, Image, Spin, Upload } from "antd";
import { useCallback, useEffect, useState } from "react";
import { uploadDigitalHumanMedia } from "@/api/digital-human";

export const PAGE_SIZE = 20;

/** 分位金额（后端一律存分）。 */
export function yuan(cents: number): string {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

type Paged<Row> = { list: Row[]; total: number };

/**
 * 标准分页列表：`fetcher` 必须是稳定引用（useCallback），筛选条件变化时调用方先 setPage(1)。
 */
export function usePagedList<Row>(
  fetcher: (page: number) => Promise<Paged<Row> | null>,
) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (target: number) => {
      setLoading(true);
      try {
        const data = await fetcher(target);
        setRows(data?.list ?? []);
        setTotal(data?.total ?? 0);
      } catch (cause) {
        message.error(cause instanceof Error ? cause.message : "列表加载失败");
      } finally {
        setLoading(false);
      }
    },
    [fetcher, message],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const reload = useCallback(() => {
    void load(page);
  }, [load, page]);

  return {
    rows,
    total,
    page,
    setPage,
    loading,
    reload,
  };
}

/** 后台图片上传：先落本站 OSS 拿 URL，表单里只存字符串。 */
export function ImageUploadField({
  value,
  onChange,
  size = 96,
}: {
  value: string;
  onChange: (url: string) => void;
  size?: number;
}) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const meta = await uploadDigitalHumanMedia(file);
      onChange(meta.url);
      message.success("图片已上传");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  if (value) {
    return (
      <div style={{ position: "relative", width: size, height: size }}>
        <Image
          src={value}
          alt="已上传图片"
          width={size}
          height={size}
          style={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            objectFit: "cover",
          }}
        />
        <span
          role="button"
          tabIndex={0}
          aria-label="移除图片"
          onClick={() => onChange("")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onChange("");
          }}
          style={{
            position: "absolute",
            right: 4,
            top: 4,
            lineHeight: 0,
            cursor: "pointer",
            borderRadius: 4,
            background: "rgba(0, 0, 0, 0.55)",
            padding: 3,
          }}
        >
          <DeleteOutlined style={{ color: "#fff" }} aria-hidden />
        </span>
      </div>
    );
  }

  return (
    <Upload
      showUploadList={false}
      accept="image/*"
      disabled={uploading}
      beforeUpload={(file) => {
        void upload(file as File);
        return false;
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          border: "1px dashed var(--border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          cursor: "pointer",
          color: "var(--muted, #888)",
          fontSize: 12,
        }}
      >
        <Spin spinning={uploading} size="small">
          <PictureOutlined style={{ fontSize: 20 }} aria-hidden />
        </Spin>
        {uploading ? "上传中…" : "上传图片"}
      </div>
    </Upload>
  );
}
