"use client";

// 图片上传控件：分类封面 / 内容封面 / 轮播图 / 精选封面共用，走 uploadKnowledgePayMedia 换回可回显的 URL。
import { DeleteOutlined, PictureOutlined } from "@ant-design/icons";
import { App, Image, Spin, Upload } from "antd";
import { useState } from "react";
import { uploadKnowledgePayMedia } from "@/api/knowledge-pay";

/**
 * 上传即入库（先传本站 OSS 拿 URL，保存表单时只存字符串）：
 * 不用 antd Upload 的默认列表，是为了失败时给出可执行的中文提示并允许直接重选。
 */
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
      const meta = await uploadKnowledgePayMedia(file);
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
          style={{ borderRadius: 8, border: "1px solid var(--border)", objectFit: "cover" }}
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
