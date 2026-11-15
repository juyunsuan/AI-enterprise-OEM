"use client";

import { useState } from "react";
import {
  Button,
  Divider,
  Input,
  Space,
  Tooltip,
  Typography,
} from "antd";
import { PictureOutlined, DeleteOutlined } from "@ant-design/icons";
import { AssetReferencePicker } from "@/components/content/asset-reference-picker";
import { STYLE_FIELDS, type GeoSiteNode } from "./geo-site-elements";

/**
 * 属性面板：内容字段 + 样式字段。
 * 样式只写白名单属性名（后端 cssTextFromStyles 还有一层值白名单），
 * 数值直接存数字，字符串原样存，渲染层负责转 kebab-case。
 */

export type InspectorApi = {
  patchStyle: (key: string, value: string | number) => void;
  clearStyle: (key: string) => void;
  patchContent: (key: string, value: unknown) => void;
  rename: (name: string) => void;
  remove: () => void;
  duplicate: () => void;
};

const COMMON_KEYS = new Set(STYLE_FIELDS.flatMap((group) => group.items.map((item) => item.key)));

const CONTENT_FIELDS: Record<string, { key: string; label: string; type: "text" | "area" }[]> = {
  h1: [{ key: "innerText", label: "标题文案", type: "area" }],
  h2: [{ key: "innerText", label: "标题文案", type: "area" }],
  h3: [{ key: "innerText", label: "标题文案", type: "area" }],
  h4: [{ key: "innerText", label: "标题文案", type: "area" }],
  h5: [{ key: "innerText", label: "标题文案", type: "area" }],
  h6: [{ key: "innerText", label: "标题文案", type: "area" }],
  p: [{ key: "innerText", label: "正文", type: "area" }],
  span: [{ key: "innerText", label: "文本", type: "text" }],
  image: [
    { key: "imageUrl", label: "图片链接", type: "text" },
    { key: "altText", label: "图片说明（SEO/无障碍）", type: "text" },
    { key: "destinationUrl", label: "点击跳转（可留空）", type: "text" },
  ],
  video: [
    { key: "href", label: "视频链接", type: "text" },
    { key: "altText", label: "视频标题", type: "text" },
  ],
  link: [
    { key: "innerText", label: "链接文字", type: "text" },
    { key: "href", label: "链接地址", type: "text" },
  ],
  button: [
    { key: "innerText", label: "按钮文字", type: "text" },
    { key: "href", label: "跳转地址（可留空）", type: "text" },
  ],
  list: [{ key: "innerText", label: "要点（一行一条）", type: "area" }],
};

const textOf = (node: GeoSiteNode, key: string): string => {
  const content = node.content as Record<string, unknown>;
  const value = content[key];
  return typeof value === "string" ? value : "";
};

export function Inspector({ node, api }: { node: GeoSiteNode; api: InspectorApi }) {
  const [assetOpen, setAssetOpen] = useState(false);
  const [extraKey, setExtraKey] = useState("");
  const [extraValue, setExtraValue] = useState("");
  const fields = CONTENT_FIELDS[node.type] ?? [];
  const style = node.styles as Record<string, string | number>;
  const extraKeys = Object.keys(style).filter((key) => !COMMON_KEYS.has(key));

  const numberOrText = (raw: string): string | number => {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  };

  return (
    <div style={{ padding: "0 2px 24px" }}>
      <Space orientation="vertical" size={10} style={{ width: "100%" }}>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            元素名称（仅图层面板可见）
          </Typography.Text>
          <Input
            value={node.name}
            maxLength={80}
            onChange={(event) => api.rename(event.target.value)}
          />
        </div>

        {fields.length ? (
          <>
            <Divider plain style={{ margin: "6px 0" }}>
              内容
            </Divider>
            {fields.map((field) => (
              <div key={field.key}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {field.label}
                </Typography.Text>
                {field.type === "area" ? (
                  <Input.TextArea
                    autoSize={{ minRows: 2, maxRows: 12 }}
                    value={textOf(node, field.key)}
                    maxLength={field.key === "innerText" ? 20000 : 1000}
                    onChange={(event) => api.patchContent(field.key, event.target.value)}
                  />
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <Input
                      value={textOf(node, field.key)}
                      maxLength={1000}
                      placeholder={
                        field.key.startsWith("image") || field.key === "href"
                          ? "https://…"
                          : undefined
                      }
                      onChange={(event) => api.patchContent(field.key, event.target.value)}
                    />
                    {(node.type === "image" || node.type === "video") &&
                    field.key === "imageUrl" ? (
                      <Tooltip title="从数字资产选择">
                        <Button
                          icon={<PictureOutlined aria-hidden />}
                          onClick={() => setAssetOpen(true)}
                        />
                      </Tooltip>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </>
        ) : null}

        {(node.type === "image" || node.type === "video") &&
        !fields.some((field) => field.key === "imageUrl") ? (
          <Button block onClick={() => setAssetOpen(true)} icon={<PictureOutlined aria-hidden />}>
            从数字资产选择
          </Button>
        ) : null}

        <Divider plain style={{ margin: "6px 0" }}>
          常用样式
        </Divider>
        {STYLE_FIELDS.map((group) => (
          <div key={group.group}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {group.group}
            </Typography.Text>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                marginTop: 4,
              }}
            >
              {group.items.map((item) => (
                <Input
                  key={item.key}
                  size="small"
                  prefix={item.label}
                  placeholder="—"
                  allowClear
                  value={
                    style[item.key] === undefined || style[item.key] === null
                      ? ""
                      : String(style[item.key])
                  }
                  onChange={(event) => {
                    const next = numberOrText(event.target.value);
                    if (next === "") api.clearStyle(item.key);
                    else api.patchStyle(item.key, next);
                  }}
                />
              ))}
            </div>
          </div>
        ))}

        {extraKeys.length ? (
          <>
            <Divider plain style={{ margin: "6px 0" }}>
              其他属性
            </Divider>
            {extraKeys.map((key) => (
              <Space.Compact key={key} block size="small">
                <Input value={key} readOnly style={{ width: "42%" }} />
                <Input
                  value={String(style[key] ?? "")}
                  onChange={(event) => api.patchStyle(key, numberOrText(event.target.value))}
                />
                <Button
                  size="small"
                  icon={<DeleteOutlined aria-hidden />}
                  onClick={() => api.clearStyle(key)}
                />
              </Space.Compact>
            ))}
          </>
        ) : null}

        <Space.Compact block size="small">
          <Input
            placeholder="属性名，如 opacity"
            value={extraKey}
            onChange={(event) => setExtraKey(event.target.value)}
          />
          <Input
            placeholder="值，如 0.8"
            value={extraValue}
            onChange={(event) => setExtraValue(event.target.value)}
          />
          <Button
            onClick={() => {
              const key = extraKey.trim();
              const value = numberOrText(extraValue);
              if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(key) || value === "") return;
              api.patchStyle(key, value);
              setExtraKey("");
              setExtraValue("");
            }}
          >
            添加
          </Button>
        </Space.Compact>

        <Divider plain style={{ margin: "6px 0" }}>
          节点操作
        </Divider>
        <Space.Compact block>
          <Button block onClick={api.duplicate}>
            复制
          </Button>
          <Button block danger onClick={api.remove}>
            删除
          </Button>
        </Space.Compact>
      </Space>

      <AssetReferencePicker
        open={assetOpen}
        existingUrls={[]}
        mediaTypes={node.type === "video" ? ["video", "audio"] : ["image"]}
        onCancel={() => setAssetOpen(false)}
        onPick={(assets) => {
          const first = assets[0];
          const url = first?.previewUrl || first?.url || "";
          if (url) {
            api.patchContent(node.type === "video" ? "href" : "imageUrl", url);
          }
          setAssetOpen(false);
        }}
      />
    </div>
  );
}
