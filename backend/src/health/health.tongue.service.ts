import { randomUUID } from 'node:crypto';
import type {
  HealthTongueConfig,
  HealthTongueRecord,
} from '@enterprise/contracts';
import type { ChatContentPart } from '../geo/geo-llm.client';
import { aiChat, parseJsonObject } from '../ai/ai-gateway';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import { requireShop, requireShopWritable, toIso } from './health.shared';

/** 舌象分析只收图片；8MB 足够手机原图，再大就给端上「压缩后重试」的明确提示。 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const SYSTEM_PROMPT = [
  '你是中医舌诊辅助分析助手。只根据照片中可见的舌象特征做健康参考，不做疾病诊断、不开药，不替代医生面诊。',
  '严格只输出一个 JSON 对象，不要 Markdown 围栏、不要任何解释：',
  '{',
  '  "isTongue": true,',
  '  "quality": "GOOD|FAIR|POOR",',
  '  "qualityNote": "拍摄质量说明（光线、清晰度、伸舌是否充分）",',
  '  "tongueColor": "舌质颜色，如 淡红/淡白/红/绛红/紫暗",',
  '  "coatingColor": "舌苔颜色与厚薄，如 薄白苔/白厚腻苔/黄腻苔/少苔",',
  '  "tongueShape": "舌形与润燥，如 胖大有齿痕/瘦薄/裂纹/腻滑",',
  '  "constitution": "最接近的中医体质倾向，可给 1-2 个，如 气虚质、湿热质",',
  '  "interpretation": "结合中医理论解释这些舌象的常见意义，120-220 字",',
  '  "suggestions": ["3-6 条饮食、作息、运动、情绪等生活建议"],',
  '  "cautions": ["2-4 条何时应就医的提醒，不写具体药名与剂量"],',
  '  "confidence": 0',
  '}',
  '识别要求：只看舌头本身，不根据人脸、背景或文字推测；看不清的维度写「不明显」。',
  '照片不是舌象、舌头被遮挡或清晰度严重不足时，isTongue=false 或 quality=POOR，绝不臆测。',
  '所有字段必须使用简体中文；confidence 为 0-100 的整数，表示你对舌象判断的把握。',
].join('\n');

type TongueShop = {
  shopId: number;
  ownerUserId: string;
  name: string;
  tongueAiEnabled: boolean;
  tongueAiChannelId: number;
  tongueAiModel: string;
};

type TongueCustomer = { id: number; nickname: string; phone: string };

type ParsedTongue = {
  quality: string;
  qualityNote: string;
  tongueColor: string;
  coatingColor: string;
  tongueShape: string;
  constitution: string;
  interpretation: string;
  suggestions: string[];
  cautions: string[];
  confidence: number;
};

const textOf = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text.length > max ? text.slice(0, max) : text;
};

const listOf = (value: unknown, max: number): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => textOf(item, 200))
    .filter(Boolean)
    .slice(0, max);
};

/**
 * 模型回复 → 结构化舌象结论。
 *
 * 只做「有就收、没有就空」的收敛，不在服务端替模型补编舌象；
 * `isTongue=false` 或 `quality=POOR` 返回 null，由调用方给重拍提示。
 */
export function parseTongueAnalysis(
  parsed: Record<string, unknown> | null,
): ParsedTongue | null {
  if (!parsed) return null;
  if (parsed.isTongue === false) return null;
  const quality = textOf(parsed.quality, 8).toUpperCase();
  if (quality === 'POOR') return null;
  const interpretation = textOf(parsed.interpretation, 2000);
  const suggestions = listOf(parsed.suggestions, 6);
  if (!interpretation && !suggestions.length) return null;
  const confidenceValue = Number(parsed.confidence);
  return {
    quality: quality === 'FAIR' ? 'FAIR' : 'GOOD',
    qualityNote: textOf(parsed.qualityNote, 200),
    tongueColor: textOf(parsed.tongueColor, 40),
    coatingColor: textOf(parsed.coatingColor, 40),
    tongueShape: textOf(parsed.tongueShape, 60),
    constitution: textOf(parsed.constitution, 100),
    interpretation,
    suggestions,
    cautions: listOf(parsed.cautions, 4),
    confidence: Number.isFinite(confidenceValue)
      ? Math.min(100, Math.max(0, Math.trunc(confidenceValue)))
      : 0,
  };
}

/**
 * 健康管理小程序·舌象分析增值服务。
 *
 * 边界：
 * 1. 店铺级开关由店主在工作台维护；关闭后公开分析接口直接拒绝，端上入口隐藏；
 * 2. 模型走统一 AI 网关的视觉槽位，店铺指定模型只作为本轮 override，不存 Key；
 * 3. 原图先入数字资产台账（店主名下），失败会删字节，不留孤儿；
 * 4. 记录同时按 shopId + customerId 过滤，店主侧也不跨店读取。
 */
export class HealthTongueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: SystemAssetService,
  ) {}

  // ---------- 店主侧 ----------

  async config(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthTongueConfig> {
    const context = await requireShop(this.prisma, user, query.shopId, 'shop');
    return this.configOf(await this.shopOf(context.shop.id));
  }

  async saveConfig(
    user: CurrentUser,
    body: {
      shopId: number;
      enabled: boolean;
      channelId: number;
      model: string;
    },
  ): Promise<HealthTongueConfig> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    await requireShopWritable(context);
    // 渠道 Key 按店主账号的模型服务解析：店员自选的渠道在店主名下可能不存在。
    if (!context.isOwner) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '仅店主可设置舌象分析的模型与开关',
      );
    }
    await this.prisma.healthShop.update({
      where: { id: context.shop.id },
      data: {
        tongueAiEnabled: body.enabled === true,
        tongueAiChannelId: Math.trunc(Number(body.channelId) || 0),
        tongueAiModel: textOf(body.model, 128),
      },
    });
    return this.configOf(await this.shopOf(context.shop.id));
  }

  async records(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'archive',
    );
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Number(query.pageSize ?? 20) || 20),
    );
    const customerId = Number(query.customerId ?? 0) || 0;
    const keyword = textOf(query.keyword, 60);
    const matched = keyword
      ? await this.prisma.healthCustomer.findMany({
          where: {
            shopId: context.shop.id,
            OR: [
              { nickname: { contains: keyword } },
              { phone: { contains: keyword } },
            ],
          },
          select: { id: true },
          take: 200,
        })
      : null;
    const matchedIds = matched
      ? matched
          .map((row) => row.id)
          .filter((id) => !customerId || id === customerId)
      : null;
    const where = {
      shopId: context.shop.id,
      ...(customerId > 0 && !matchedIds ? { customerId } : {}),
      ...(matchedIds ? { customerId: { in: matchedIds } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.healthTongueRecord.count({ where }),
      this.prisma.healthTongueRecord.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const names = await this.customerNames(rows.map((row) => row.customerId));
    const list = rows.map((row) =>
      this.toRecord(row, names.get(row.customerId) || ''),
    );
    return { list, total, page, pageSize };
  }

  async recordDetail(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'archive',
    );
    const row = await this.prisma.healthTongueRecord.findFirst({
      where: {
        id: Number(query.id) || 0,
        shopId: context.shop.id,
      },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '舌象记录不存在');
    }
    const names = await this.customerNames([row.customerId]);
    return this.toRecord(row, names.get(row.customerId) || '');
  }

  async recordRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const context = await requireShop(
      this.prisma,
      user,
      body.shopId,
      'archive',
    );
    const row = await this.prisma.healthTongueRecord.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '舌象记录不存在');
    }
    await this.assets.remove(row.imageKey).catch(() => undefined);
    await this.prisma.healthTongueRecord.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ---------- 顾客侧（public 通道已做店铺/顾客令牌校验） ----------

  async analyze(
    shop: TongueShop,
    customer: TongueCustomer,
    file: File,
  ): Promise<HealthTongueRecord> {
    if (!shop.tongueAiEnabled) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '本店尚未开通舌象分析增值服务，请联系店铺客服',
      );
    }
    const mime = textOf(file.type, 64).toLowerCase();
    const ext = ALLOWED_IMAGE_TYPES[mime];
    if (!ext) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请上传 JPG / PNG / WebP 格式的舌象照片',
      );
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '照片大小需在 8MB 以内，请在拍照后压缩再上传',
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await this.assets.put({
      ownerUserId: shop.ownerUserId,
      path: `health/tongue/${shop.shopId}/${customer.id}/${randomUUID()}.${ext}`,
      bytes,
      name: `tongue-${Date.now()}.${ext}`,
      assetType: 'image',
      bizRef: `health-tongue:${shop.shopId}`,
      labels: ['health', 'tongue'],
    });
    const imageUrl = this.assets.urlOf(uploaded.key);
    let parsed: ParsedTongue | null = null;
    let model = '';
    try {
      const parts: ChatContentPart[] = [
        { type: 'image', url: imageUrl, mediaType: mime },
        { type: 'text', text: '请分析这张舌象照片，并严格只输出 JSON。' },
      ];
      const out = await aiChat(this.prisma, {
        userId: shop.ownerUserId,
        ...(shop.tongueAiModel
          ? {
              model: shop.tongueAiModel,
              channelId: shop.tongueAiChannelId,
            }
          : {}),
        mediaType: 'vision',
        module: 'health',
        operation: 'tongue_analysis',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: parts },
        ],
        maxTokens: 900,
        timeoutMs: 60_000,
        purpose: 'batch',
      });
      model = out.model;
      parsed = parseTongueAnalysis(parseJsonObject(out.reply));
    } catch (cause) {
      await this.assets.remove(uploaded.key).catch(() => undefined);
      if (cause instanceof BusinessException) throw cause;
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '舌象分析服务暂时不可用，请稍后重试或联系店铺客服',
      );
    }
    if (!parsed) {
      await this.assets.remove(uploaded.key).catch(() => undefined);
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '未能从照片中识别出清晰舌象：请在自然光下、舌头自然伸出后重拍，避免美颜与逆光',
      );
    }
    const row = await this.prisma.healthTongueRecord
      .create({
        data: {
          shopId: shop.shopId,
          customerId: customer.id,
          imageKey: uploaded.key,
          imageUrl,
          quality: parsed.quality,
          tongueColor: parsed.tongueColor,
          coatingColor: parsed.coatingColor,
          tongueShape: parsed.tongueShape,
          constitution: parsed.constitution,
          interpretation: [
            parsed.interpretation,
            parsed.qualityNote ? `拍摄质量：${parsed.qualityNote}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          suggestionsJson: parsed.suggestions,
          cautionsJson: parsed.cautions,
          confidence: parsed.confidence,
          model,
        },
      })
      .catch(async (cause: unknown) => {
        await this.assets.remove(uploaded.key).catch(() => undefined);
        throw cause;
      });
    return this.toRecord(row, customer.nickname || customer.phone || '');
  }

  async publicRecords(
    shopId: number,
    customerId: number,
    query: Record<string, unknown>,
  ) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(
      30,
      Math.max(1, Number(query.pageSize ?? 10) || 10),
    );
    const where = { shopId, customerId };
    const [total, rows] = await Promise.all([
      this.prisma.healthTongueRecord.count({ where }),
      this.prisma.healthTongueRecord.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      list: rows.map((row) => this.toRecord(row, '')),
      total,
      page,
      pageSize,
    };
  }

  async publicRecordDetail(shopId: number, customerId: number, id: number) {
    const row = await this.prisma.healthTongueRecord.findFirst({
      where: { id, shopId, customerId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '舌象记录不存在');
    }
    return this.toRecord(row, '');
  }

  // ---------- 内部 ----------

  private async shopOf(shopId: number) {
    const row = await this.prisma.healthShop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        tongueAiEnabled: true,
        tongueAiChannelId: true,
        tongueAiModel: true,
      },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    return row;
  }

  private configOf(row: {
    tongueAiEnabled: boolean;
    tongueAiChannelId: number;
    tongueAiModel: string;
  }): HealthTongueConfig {
    return {
      enabled: row.tongueAiEnabled,
      channelId: row.tongueAiChannelId,
      model: row.tongueAiModel,
    };
  }

  private async customerNames(ids: number[]) {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    if (!unique.length) return new Map<number, string>();
    const rows = await this.prisma.healthCustomer.findMany({
      where: { id: { in: unique } },
      select: { id: true, nickname: true, phone: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        row.nickname || row.phone || `顾客#${row.id}`,
      ]),
    );
  }

  private toRecord(
    row: {
      id: number;
      customerId: number;
      imageUrl: string;
      quality: string;
      tongueColor: string;
      coatingColor: string;
      tongueShape: string;
      constitution: string;
      interpretation: string;
      suggestionsJson: unknown;
      cautionsJson: unknown;
      confidence: number;
      model: string;
      createdAt: Date;
    },
    customerName: string,
  ): HealthTongueRecord {
    return {
      id: row.id,
      customerId: row.customerId,
      customerName,
      imageUrl: row.imageUrl,
      quality: row.quality,
      tongueColor: row.tongueColor,
      coatingColor: row.coatingColor,
      tongueShape: row.tongueShape,
      constitution: row.constitution,
      interpretation: row.interpretation,
      suggestions: Array.isArray(row.suggestionsJson)
        ? row.suggestionsJson.map((item) => String(item))
        : [],
      cautions: Array.isArray(row.cautionsJson)
        ? row.cautionsJson.map((item) => String(item))
        : [],
      confidence: row.confidence,
      model: row.model,
      createdAt: toIso(row.createdAt),
    };
  }
}
