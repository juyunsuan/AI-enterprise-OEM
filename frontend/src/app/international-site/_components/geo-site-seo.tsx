"use client";

import { Checkbox, Form, Input, Select, Switch, Typography } from "antd";

/**
 * 站点级 SEO/GEO 档案：与后端 seoViewOf 同口径（发布时写进 HTML 头，
 * 并决定 robots.txt / sitemap.xml / llms.txt 是否输出）。
 */
export type GeoSiteSeo = {
  title: string;
  description: string;
  keywords: string[];
  ogImage: string;
  themeColor: string;
  lang: string;
  noindex: boolean;
  llmsTxt: boolean;
  jsonld: { organization: boolean; website: boolean; product: boolean; faq: boolean };
};

export const EMPTY_SEO: GeoSiteSeo = {
  title: "",
  description: "",
  keywords: [],
  ogImage: "",
  themeColor: "",
  lang: "zh-CN",
  noindex: false,
  llmsTxt: true,
  jsonld: { organization: true, website: true, product: false, faq: false },
};

/** 后端可能给出缺字段的历史数据，进表单前先补齐。 */
export function normalizeSeo(raw: unknown): GeoSiteSeo {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const jsonld = (input.jsonld && typeof input.jsonld === "object"
    ? input.jsonld
    : {}) as Record<string, unknown>;
  return {
    title: typeof input.title === "string" ? input.title : "",
    description: typeof input.description === "string" ? input.description : "",
    keywords: Array.isArray(input.keywords) ? input.keywords.map(String).slice(0, 30) : [],
    ogImage: typeof input.ogImage === "string" ? input.ogImage : "",
    themeColor: typeof input.themeColor === "string" ? input.themeColor : "",
    lang: typeof input.lang === "string" && input.lang ? input.lang : "zh-CN",
    noindex: input.noindex === true,
    llmsTxt: input.llmsTxt !== false,
    jsonld: {
      organization: jsonld.organization !== false,
      website: jsonld.website !== false,
      product: jsonld.product === true,
      faq: jsonld.faq !== false,
    },
  };
}

const JSONLD_LABEL: Record<string, string> = {
  organization: "Organization（主体信息）",
  website: "WebSite（站点与检索）",
  product: "Product（首个产品）",
  faq: "FAQPage（正文问答）",
};

export function SeoForm({
  value,
  onChange,
}: {
  value: GeoSiteSeo;
  onChange: (next: GeoSiteSeo) => void;
}) {
  const patch = <K extends keyof GeoSiteSeo>(key: K, next: GeoSiteSeo[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <Form layout="vertical" component={false}>
      <Form.Item
        label="页面标题 title"
        extra="建议 20–60 字，写清「品牌 + 能解决什么」，留空则用站点名称。"
      >
        <Input
          value={value.title}
          maxLength={120}
          showCount
          onChange={(event) => patch("title", event.target.value)}
        />
      </Form.Item>
      <Form.Item label="描述 description" extra="建议 80–160 字，模型摘录时优先引用这段。">
        <Input.TextArea
          value={value.description}
          maxLength={500}
          autoSize={{ minRows: 2, maxRows: 5 }}
          showCount
          onChange={(event) => patch("description", event.target.value)}
        />
      </Form.Item>
      <Form.Item label="关键词" extra="回车确认，最多 30 个。">
        <Select
          mode="tags"
          open={false}
          value={value.keywords}
          maxLength={60}
          onChange={(next) => patch("keywords", (next as string[]).slice(0, 30))}
          tokenSeparators={[",", "，", " "]}
        />
      </Form.Item>
      <Form.Item label="分享图 og:image" extra="留空则不输出；使用数字资产图片链接。">
        <Input
          value={value.ogImage}
          maxLength={1000}
          placeholder="https://…"
          onChange={(event) => patch("ogImage", event.target.value)}
        />
      </Form.Item>
      <Form.Item label="语言 lang">
        <Select
          value={value.lang}
          style={{ width: 180 }}
          onChange={(next) => patch("lang", next)}
          options={[
            { value: "zh-CN", label: "简体中文 zh-CN" },
            { value: "zh-TW", label: "繁体中文 zh-TW" },
            { value: "en", label: "English en" },
            { value: "ja", label: "日本語 ja" },
          ]}
        />
      </Form.Item>
      <Form.Item label="主题色 theme-color">
        <Input
          value={value.themeColor}
          maxLength={32}
          placeholder="#2563eb"
          onChange={(event) => patch("themeColor", event.target.value)}
        />
      </Form.Item>

      <Typography.Text strong style={{ fontSize: 13 }}>
        结构化标记 JSON-LD
      </Typography.Text>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, margin: "8px 0 16px" }}>
        {(Object.keys(JSONLD_LABEL) as (keyof GeoSiteSeo["jsonld"])[]).map((key) => (
          <Checkbox
            key={key}
            checked={value.jsonld[key]}
            onChange={(event) =>
              patch("jsonld", { ...value.jsonld, [key]: event.target.checked })
            }
          >
            {JSONLD_LABEL[key]}
          </Checkbox>
        ))}
      </div>

      <Form.Item label="允许搜索引擎与 AI 抓取">
        <Switch
          checked={!value.noindex}
          onChange={(checked) => patch("noindex", !checked)}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 10 }}>
          关闭后输出 noindex，且不进 sitemap。
        </Typography.Text>
      </Form.Item>
      <Form.Item label="输出 llms.txt（供 AI 读取的站点说明）">
        <Switch checked={value.llmsTxt} onChange={(checked) => patch("llmsTxt", checked)} />
        <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 10 }}>
          路径：/llms.txt
        </Typography.Text>
      </Form.Item>
    </Form>
  );
}
