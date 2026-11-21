import { text } from '../common/api';
import { PrismaService } from '../prisma/prisma.service';
import { aiEmbed, parseJsonObject, tryChat } from '../ai/ai-gateway';
import {
  insightColorChoices,
  insightTagValues,
  WEAR_VISION_JSON_SHAPE,
} from '@enterprise/contracts';
import type { InsightTagDimension } from '@enterprise/contracts';
import {
  hashEmbed,
  LOCAL_EMBED_ID,
  remoteEmbedId,
} from '../ai/retrieval-kernel';
import type { ChatContentPart } from '../geo/geo-llm.client';

/**
 * 数字资产 AI（AI 底座方案 §7 P1-C）：把「图片/文档」变成可复用的文本与标签。
 *
 * 原则与底座一致：
 * - 一律走统一网关取模型（视觉槽位优先，缺槽位退回文本模型）；
 * - 缺 Key / 调用失败**不抛穿**，回落规则式摘要（文件名 + 类型），只标 mode=rule；
 * - 向量与知识库同一套可插拔口径：默认本地袋装，配了「向量嵌入」槽位才用真实向量。
 */
export type AssetVisionOutcome = {
  kind: 'image' | 'text';
  text: string;
  caption: string;
  labels: string[];
  model: string;
  mode: 'llm' | 'rule';
};

/** 结构化款式理解结果：女装五维标签（色彩带 HEX），供趋势打标直接消费。 */
export type WearTagOutcome = {
  category: string;
  colors: { name: string; hex: string }[];
  silhouette: string;
  length: string;
  patterns: string[];
  details: string[];
  fabrics: string[];
  model: string;
  mode: 'llm' | 'rule';
};

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

/** 维度 → 受控词表（逗号连接，塞进打标 system 提示收敛模型输出）。 */
function wearVocabLine(dim: InsightTagDimension): string {
  return insightTagValues(dim).join('、');
}

/** 把模型给的色名收敛到词表，补上词表 HEX；词表外的色名保留但 HEX 留空。 */
function snapWearColors(raw: unknown): { name: string; hex: string }[] {
  const list = Array.isArray(raw) ? raw : [];
  const palette = insightColorChoices();
  const seen = new Set<string>();
  const out: { name: string; hex: string }[] = [];
  for (const item of list) {
    const rec = (item ?? {}) as Record<string, unknown>;
    let name = text(rec.name).trim().slice(0, 12);
    let hex = text(rec.hex).trim();
    if (!name && hex) {
      const matched = palette.find(
        (c) => c.hex?.toLowerCase() === hex.toLowerCase(),
      );
      name = matched ? matched.value : '';
    }
    if (!name) continue;
    const canonical = palette.find((c) => c.value === name);
    if (canonical?.hex) hex = canonical.hex;
    if (!HEX_RE.test(hex)) hex = canonical?.hex ?? '';
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, hex });
    if (out.length >= 3) break;
  }
  return out;
}

/** 取值收敛到受控词表：只保留命中词表的标签，按出现顺序去重限量。 */
function snapWearValues(
  raw: unknown,
  dim: InsightTagDimension,
  limit: number,
): string[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const allowed = new Set(insightTagValues(dim));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const value = text(item).trim();
    if (!value || !allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function snapWearSingle(raw: unknown, dim: InsightTagDimension): string {
  const value = text(raw).trim();
  return insightTagValues(dim).includes(value) ? value : '';
}

/** 图片 MIME：只认 OSS 键里的扩展名，认不出按 jpeg。 */
function mediaTypeOf(name: string, url: string): string {
  const source = (name || url).split('?')[0].toLowerCase();
  const ext = source.includes('.') ? source.split('.').pop() || '' : '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

/** 从模型回复里收标签：数组或 {labels:[...]} 都吃，去重、限长、限数。 */
function pickLabels(
  parsed: Record<string, unknown> | null,
  limit = 6,
): string[] {
  const raw = Array.isArray(parsed?.labels)
    ? parsed?.labels
    : Array.isArray(parsed?.tags)
      ? parsed?.tags
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw as unknown[]) {
    const label = text(item).trim().slice(0, 12);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

/** 规则式兜底：拿文件名（去掉扩展名与时间戳前缀）当标签，至少给一个「未分类」。 */
function ruleLabels(name: string, type: string): string[] {
  const base = (name || '').replace(/\.[a-z0-9]+$/i, '').trim();
  const cleaned = base
    .replace(/^\d{10,}[-_]/, '')
    .replace(/[-_]{2,}/g, ' ')
    .slice(0, 24);
  const labels = cleaned ? [cleaned] : [];
  if (type && type !== 'file' && !labels.includes(type)) labels.push(type);
  return labels.slice(0, 6);
}

const VISION_SYSTEM = [
  '你是数字资产理解助手。看这张图，输出一个 JSON 对象：',
  '{"caption":"一句话中文描述（不超过 60 字）","labels":["3-6 个中文标签"]}',
  '标签用常见中文词（如 海报、产品图、人物、风景、图表），不要英文、不要编号、不要解释。',
].join('\n');

const TEXT_SYSTEM = [
  '你是资料理解助手。读这段文本，输出一个 JSON 对象：',
  '{"caption":"一句话中文摘要（不超过 60 字）","labels":["3-6 个中文标签"]}',
  '标签用常见中文词，不要英文、不要编号、不要解释。',
].join('\n');

export class AssetVisionService {
  constructor(private readonly prisma: PrismaService) {}

  /** 图片理解：视觉槽位模型 + 图像分片（公网 URL）。 */
  private async understandImage(
    userId: string,
    input: { name: string; url: string },
    token?: string,
  ): Promise<AssetVisionOutcome | null> {
    const message: ChatContentPart[] = [
      {
        type: 'image',
        url: input.url,
        mediaType: mediaTypeOf(input.name, input.url),
      },
      { type: 'text', text: '请按要求输出 JSON。' },
    ];
    const out = await tryChat(this.prisma, {
      userId,
      token,
      mediaType: 'vision',
      module: 'assets',
      operation: 'asset_vision',
      messages: [
        { role: 'system', content: VISION_SYSTEM },
        { role: 'user', content: message },
      ],
      maxTokens: 400,
      timeoutMs: 30000,
      purpose: 'batch',
    });
    if (!out) return null;
    const parsed = parseJsonObject(out.reply);
    const caption = text(parsed?.caption).trim().slice(0, 200);
    const labels = pickLabels(parsed);
    if (!caption && !labels.length) return null;
    return {
      kind: 'image',
      text: caption,
      caption,
      labels,
      model: out.model,
      mode: 'llm',
    };
  }

  /**
   * 结构化款式理解（女装趋势打标）：视觉槽位模型按受控词表输出五维标签。
   * 缺 Key / 失败返回 null（不抛穿），由调用方按规则兜底，绝不编造标签。
   */
  async understandWear(
    userId: string,
    input: { name: string; url: string },
    token?: string,
  ): Promise<WearTagOutcome | null> {
    if (!input.url) return null;
    const system = [
      '你是资深服装视觉分析师。只看这张女装图，输出关键设计元素，严格只输出一个 JSON 对象：',
      WEAR_VISION_JSON_SHAPE,
      `silhouette（廓形）只能取：${wearVocabLine('silhouette')}。`,
      `length（长度）只能取：${wearVocabLine('length')}。`,
      `patterns（图案，至多3个）只能取：${wearVocabLine('pattern')}。`,
      `details（细节工艺，至多4个）只能取：${wearVocabLine('detail')}。`,
      `fabrics（材质，至多3个）只能取：${wearVocabLine('fabric')}。`,
      `colors 给1-3个主/辅色，每项含 name（优先取：${wearVocabLine('color')}）与 hex（#RRGGBB）。`,
      'category 用简短中文写单品（如 连衣裙/半身裙/针织衫）。',
      '识别不出的维度用空字符串或空数组，不要编造、不要解释。',
    ].join('\n');
    const message: ChatContentPart[] = [
      {
        type: 'image',
        url: input.url,
        mediaType: mediaTypeOf(input.name, input.url),
      },
      { type: 'text', text: '请按受控词表输出 JSON。' },
    ];
    let out: Awaited<ReturnType<typeof tryChat>> = null;
    try {
      out = await tryChat(this.prisma, {
        userId,
        token,
        mediaType: 'vision',
        module: 'insight',
        operation: 'trend.wear_tag',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: message },
        ],
        maxTokens: 500,
        timeoutMs: 30000,
        purpose: 'batch',
      });
    } catch {
      return null;
    }
    if (!out) return null;
    const parsed = parseJsonObject(out.reply);
    if (!parsed) return null;
    const colors = snapWearColors(parsed.colors);
    const silhouette = snapWearSingle(parsed.silhouette, 'silhouette');
    const length = snapWearSingle(parsed.length, 'length');
    const patterns = snapWearValues(parsed.patterns, 'pattern', 3);
    const details = snapWearValues(parsed.details, 'detail', 4);
    const fabrics = snapWearValues(parsed.fabrics, 'fabric', 3);
    if (
      !colors.length &&
      !silhouette &&
      !length &&
      !patterns.length &&
      !details.length &&
      !fabrics.length
    ) {
      return null;
    }
    return {
      category: text(parsed.category).trim().slice(0, 24),
      colors,
      silhouette,
      length,
      patterns,
      details,
      fabrics,
      model: out.model,
      mode: 'llm',
    };
  }

  /** 文档理解：已有抽取正文时喂文本模型出摘要与标签。 */
  private async understandText(
    userId: string,
    input: { name: string; body: string },
    token?: string,
  ): Promise<AssetVisionOutcome | null> {
    const body = input.body.slice(0, 6000);
    if (!body.trim()) return null;
    const out = await tryChat(this.prisma, {
      userId,
      token,
      mediaType: 'text',
      module: 'assets',
      operation: 'asset_text_understand',
      messages: [
        { role: 'system', content: TEXT_SYSTEM },
        {
          role: 'user',
          content: `文件名：${input.name}\n\n正文：\n${body}`,
        },
      ],
      maxTokens: 400,
      timeoutMs: 30000,
      purpose: 'batch',
    });
    if (!out) return null;
    const parsed = parseJsonObject(out.reply);
    const caption = text(parsed?.caption).trim().slice(0, 200);
    const labels = pickLabels(parsed);
    if (!caption && !labels.length) return null;
    return {
      kind: 'text',
      text: caption || body.slice(0, 200),
      caption,
      labels,
      model: out.model,
      mode: 'llm',
    };
  }

  /**
   * 理解一条资产：图片 → 视觉；可读文档 → 文本；其它（音视频/压缩包）→ 规则兜底。
   * 返回 null 表示完全没有可用信息（连文件名都没有）。
   */
  async understand(
    userId: string,
    input: { name: string; type: string; url: string; text?: string | null },
    token?: string,
  ): Promise<AssetVisionOutcome> {
    try {
      if (input.type === 'image' && input.url) {
        const vision = await this.understandImage(userId, input, token);
        if (vision) return vision;
      }
      if (input.text && input.text.trim()) {
        const read = await this.understandText(
          userId,
          {
            name: input.name,
            body: input.text,
          },
          token,
        );
        if (read) return read;
      }
    } catch {
      // 明确动作下的模型报错也走兜底：资产理解不该因缺 Key 阻断主流程
    }
    const labels = ruleLabels(input.name, input.type);
    return {
      kind: input.text ? 'text' : 'image',
      text: input.text ? input.text.slice(0, 200) : input.name,
      caption: '',
      labels,
      model: '',
      mode: 'rule',
    };
  }

  /** 资产向量：与知识库同一套写路径（远端优先、失败回落本地袋装）。 */
  async embed(
    userId: string,
    body: string,
    token?: string,
  ): Promise<{ model: string; vector: number[] }> {
    const one = await this.embedMany(userId, [body], token);
    return { model: one.model, vector: one.vectors[0] || [] };
  }

  /**
   * 批量资产向量：一次远端调用拿整批（省 quota），远端不可用整批回落本地袋装。
   * 供「找相似」用同一个模型空间比较，避免远端/本地混算导致余弦无意义。
   */
  async embedMany(
    userId: string,
    bodies: string[],
    token?: string,
  ): Promise<{ model: string; vectors: number[][] }> {
    const payloads = bodies.map((body) => String(body || '').slice(0, 4000));
    if (!payloads.length) return { model: LOCAL_EMBED_ID, vectors: [] };
    const remote = await aiEmbed(this.prisma, {
      userId,
      token,
      texts: payloads,
      module: 'assets',
      operation: 'asset_similar',
    }).catch(() => null);
    const vectors = remote?.vectors || [];
    if (
      remote &&
      vectors.length === payloads.length &&
      vectors.every((v) => v?.length)
    ) {
      return { model: remoteEmbedId(remote.model), vectors };
    }
    return {
      model: LOCAL_EMBED_ID,
      vectors: payloads.map((body) => hashEmbed(body)),
    };
  }
}
