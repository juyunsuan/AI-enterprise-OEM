"use client";
import {
  BoldOutlined,
  CodeOutlined,
  EyeOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PictureOutlined,
  UnderlineOutlined,
} from "@ant-design/icons";
import { Button, Input, Popover, Space } from "antd";
import { useEffect, useRef, useState } from "react";

/**
 * 商品详情富文本：产出小程序 `rich-text` 认得的标签子集（p/br/strong/em/u/h2/h3/ul/ol/li/blockquote/img/a）。
 *
 * 图片只插 URL 而不是内联 base64 —— 契约 `detail` 上限 20 万字符，
 * 一张手机拍照转 base64 就能吃掉大半，端上渲染也会卡。
 */
export function HtmlField({
  value = "",
  onChange,
  minHeight = 220,
}: {
  value?: string;
  onChange?: (html: string) => void;
  minHeight?: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [source, setSource] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [imageText, setImageText] = useState("");

  // 外部值与 DOM 内容不一致时才回填，否则每敲一个字都会被重置光标。
  useEffect(() => {
    const host = hostRef.current;
    if (!host || source) return;
    if (host.innerHTML !== value) host.innerHTML = value;
  }, [value, source]);

  const emit = () => onChange?.(hostRef.current?.innerHTML ?? "");

  const exec = (command: string, arg?: string) => {
    hostRef.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const tool = (
    title: string,
    icon: React.ReactNode,
    command: string,
    arg?: string,
  ) => (
    <Button
      key={title}
      size="small"
      type="text"
      title={title}
      aria-label={title}
      icon={icon}
      // mousedown 阻止默认，否则点工具栏会先把编辑区的选区清掉
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => exec(command, arg)}
    />
  );

  return (
    <div
      style={{
        border: "1px solid var(--border, #d9d9d9)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
          padding: "4px 6px",
          borderBottom: "1px solid var(--border, #d9d9d9)",
          background: "#fafafa",
          alignItems: "center",
        }}
      >
        {tool("加粗", <BoldOutlined aria-hidden />, "bold")}
        {tool("斜体", <ItalicOutlined aria-hidden />, "italic")}
        {tool("下划线", <UnderlineOutlined aria-hidden />, "underline")}
        {tool("小标题", <span className="text-12">H3</span>, "formatBlock", "h3")}
        {tool("段落", <span className="text-12">P</span>, "formatBlock", "p")}
        {tool("引用", <span className="text-12">❝</span>, "formatBlock", "blockquote")}
        {tool("无序列表", <span className="text-12">•≡</span>, "insertUnorderedList")}
        {tool("有序列表", <OrderedListOutlined aria-hidden />, "insertOrderedList")}
        <Popover
          open={linkOpen}
          onOpenChange={setLinkOpen}
          trigger="click"
          content={
            <Space orientation="vertical" size={6} style={{ display: "flex" }}>
              <Input
                autoFocus
                style={{ width: 260 }}
                placeholder="https://…"
                value={linkText}
                onChange={(event) => setLinkText(event.target.value.trim())}
              />
              <Space>
                <Button
                  size="small"
                  type="primary"
                  onClick={() => {
                    if (linkText) exec("createLink", linkText);
                    setLinkText("");
                    setLinkOpen(false);
                  }}
                >
                  插入链接
                </Button>
                <Button size="small" onClick={() => setLinkOpen(false)}>
                  取消
                </Button>
              </Space>
            </Space>
          }
        >
          <Button
            size="small"
            type="text"
            title="链接"
            aria-label="插入链接"
            icon={<LinkOutlined aria-hidden />}
          />
        </Popover>
        <Popover
          open={imageOpen}
          onOpenChange={setImageOpen}
          trigger="click"
          content={
            <Space orientation="vertical" size={6} style={{ display: "flex" }}>
              <Input
                autoFocus
                style={{ width: 280 }}
                placeholder="图片地址 https://…"
                value={imageText}
                onChange={(event) => setImageText(event.target.value.trim())}
              />
              <Space>
                <Button
                  size="small"
                  type="primary"
                  onClick={() => {
                    if (imageText) {
                      exec(
                        "insertHTML",
                        `<p><img src="${imageText}" style="max-width:100%"></p>`,
                      );
                    }
                    setImageText("");
                    setImageOpen(false);
                  }}
                >
                  插入图片
                </Button>
                <Button size="small" onClick={() => setImageOpen(false)}>
                  取消
                </Button>
              </Space>
            </Space>
          }
        >
          <Button
            size="small"
            type="text"
            title="图片"
            aria-label="插入图片"
            icon={<PictureOutlined aria-hidden />}
          />
        </Popover>
        <Button
          size="small"
          type={source ? "primary" : "text"}
          aria-label="切换源码编辑"
          icon={source ? <EyeOutlined aria-hidden /> : <CodeOutlined aria-hidden />}
          onClick={() => setSource((current) => !current)}
        >
          源码
        </Button>
      </div>
      {source ? (
        <Input.TextArea
          rows={10}
          value={value}
          placeholder="直接编辑 HTML"
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : (
        <div
          ref={hostRef}
          contentEditable
          role="textbox"
          aria-multiline
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          style={{
            minHeight,
            padding: "10px 12px",
            outline: "none",
            fontSize: 14,
            lineHeight: 1.7,
            overflow: "auto",
          }}
        />
      )}
      <div className="muted text-12" style={{ padding: "4px 10px", borderTop: "1px dashed var(--border, #f0f0f0)" }}>
        当前 {value.length} 字符（上限 200000）；图片请填地址，内联 base64 会把详情撑爆
      </div>
    </div>
  );
}
