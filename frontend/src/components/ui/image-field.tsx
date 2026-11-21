"use client";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Input, Space } from "antd";
import { RawImg } from "@/components/ui/raw-img";

/**
 * 图片地址输入 + 缩略预览。
 *
 * 后台表单没有统一的图片上传通道（各业务上传接口按自己的鉴权发放令牌），
 * 所以统一收 OSS/CDN 地址字符串：商品图、店铺 Logo、装修图都用它，
 * 保存的仍然是契约里的 `string`。
 */
export function ImageUrlField({
  value = "",
  onChange,
  size = 88,
  placeholder = "图片地址 https://…",
}: {
  value?: string;
  onChange?: (url: string) => void;
  size?: number;
  placeholder?: string;
}) {
  const patch = (url: string) => onChange?.(url);
  return (
    <Space align="start" style={{ width: "100%" }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "#fafafa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {value ? (
          <RawImg
            src={value}
            alt="图片预览"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <PlusOutlined aria-hidden className="muted" />
        )}
      </div>
      <Input
        style={{ maxWidth: 420 }}
        value={value}
        maxLength={500}
        placeholder={placeholder}
        onChange={(event) => patch(event.target.value.trim())}
        suffix={
          value ? (
            <Button
              type="text"
              size="small"
              aria-label="清除图片"
              icon={<DeleteOutlined aria-hidden />}
              onClick={() => patch("")}
            />
          ) : null
        }
      />
    </Space>
  );
}

/** 图片清单：顺序即小程序端的展示顺序，支持上下移动与增删。 */
export function ImageUrlsField({
  value = [],
  onChange,
  max = 20,
}: {
  value?: string[];
  onChange?: (urls: string[]) => void;
  max?: number;
}) {
  const patch = (index: number, url: string) =>
    onChange?.(value.map((item, position) => (position === index ? url : item)));

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    onChange?.(next);
  };

  return (
    <Space orientation="vertical" size={8} style={{ width: "100%" }}>
      {value.map((url, index) => (
        <Space key={`${index}-${url.slice(-12)}`} align="start" wrap>
          <span className="muted text-12" style={{ width: 44 }}>
            图 {index + 1}
          </span>
          <ImageUrlField
            value={url}
            size={64}
            onChange={(next) => patch(index, next)}
          />
          <Button size="small" type="text" onClick={() => move(index, -1)}>
            上移
          </Button>
          <Button size="small" type="text" onClick={() => move(index, 1)}>
            下移
          </Button>
          <Button
            size="small"
            type="text"
            danger
            onClick={() => onChange?.(value.filter((_, position) => position !== index))}
          >
            删除
          </Button>
        </Space>
      ))}
      <div>
        <Button
          icon={<PlusOutlined aria-hidden />}
          disabled={value.length >= max}
          onClick={() => onChange?.([...value, ""])}
        >
          添加图片
        </Button>
        <span className="muted text-12" style={{ marginLeft: 8 }}>
          已用 {value.length}/{max}，顺序即小程序端轮播顺序
        </span>
      </div>
    </Space>
  );
}
