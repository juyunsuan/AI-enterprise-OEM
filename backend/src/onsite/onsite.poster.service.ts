import type { CurrentUser } from '../auth/current-user';
import { stableAssetName } from '../common/asset-key';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { OnsiteReleaseService } from './onsite.release.service';
import type { OnsiteShopService } from './onsite.shop.service';

/** SVG 文本转义：店名/代理名/口号都可能来自用户输入。 */
const xml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const WIDTH = 750;
const HEIGHT = 1180;

export type PosterSvgInput = {
  shopName: string;
  title: string;
  subtitle: string;
  contact: string;
  /** 小程序码 PNG 的 base64，不带 data: 前缀。 */
  qr: string;
  shopCode: string;
};

/** 纯排版函数：方便单测校验转义与码位，不依赖微信与对象存储。 */
export function buildOnsitePosterSvg(input: PosterSvgInput) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3370ff"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="640" cy="120" r="180" fill="#ffffff" opacity="0.08"/>
  <circle cx="90" cy="1050" r="220" fill="#ffffff" opacity="0.06"/>
  <text x="375" y="150" text-anchor="middle" font-size="46" font-weight="700" fill="#ffffff">${xml(input.shopName)}</text>
  <text x="375" y="210" text-anchor="middle" font-size="26" fill="#dbeafe">${xml(input.title)}</text>
  <text x="375" y="256" text-anchor="middle" font-size="22" fill="#dbeafe" opacity="0.9">${xml(input.subtitle)}</text>
  <rect x="90" y="330" width="570" height="640" rx="28" fill="#ffffff"/>
  <text x="375" y="400" text-anchor="middle" font-size="28" font-weight="600" fill="#1f2937">微信扫码，马上预约</text>
  <rect x="225" y="440" width="300" height="300" rx="16" fill="#f3f4f6"/>
  <image x="240" y="455" width="270" height="270" xlink:href="data:image/png;base64,${input.qr}"/>
  <text x="375" y="800" text-anchor="middle" font-size="24" fill="#4b5563">长按识别小程序码</text>
  <text x="375" y="845" text-anchor="middle" font-size="22" fill="#9ca3af">店铺码 ${xml(input.shopCode)}</text>
  ${input.contact ? `<text x="375" y="900" text-anchor="middle" font-size="24" fill="#3370ff">${xml(input.contact)}</text>` : ''}
  <text x="375" y="1070" text-anchor="middle" font-size="20" fill="#dbeafe" opacity="0.85">专业上门 · 准时到达 · 售后无忧</text>
</svg>`;
}

/**
 * 店主 / 代理分享海报：店铺小程序码 + 店名口号排版成 750×1180 的 SVG。
 * OSS 禁止公开存储 SVG（脚本注入面），因此海报以内联 data URI 返回；
 * 小程序 canvas 重绘时用 qrcodeUrl（PNG）作底图即可。
 */
export class OnsitePosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly releases: OnsiteReleaseService,
    private readonly assets: SystemAssetService,
    private readonly shops: OnsiteShopService,
  ) {}

  async poster(
    user: CurrentUser,
    shopId: string,
    input: { kind: 'SHOP' | 'AGENT'; agentId: number },
  ) {
    // 先校验代理再取码：代理不存在时不浪费一次微信取码与一次对象存储上传。
    const shop = await this.shops.requireShop(user, shopId);
    if (input.kind !== 'AGENT') {
      return this.compose(shop, {
        kind: 'SHOP',
        title: '微信扫码 · 立即预约上门服务',
        subtitle: '专业技师上门，明码标价，在线下单有保障',
        contact: '',
      });
    }
    const agent = input.agentId
      ? await this.prisma.onsiteAgentAccount.findFirst({
          where: { id: input.agentId, shopId: shop.shopId },
        })
      : null;
    if (!agent) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '代理不存在');
    }
    if (agent.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该代理已停用，无法生成海报',
      );
    }
    return this.compose(shop, {
      kind: 'AGENT',
      title: `${agent.name} · 专属服务顾问`,
      subtitle: '扫码下单，由我为您安排上门服务',
      contact: agent.phone ? `电话 ${agent.phone}` : '',
    });
  }

  /** 代理端公开通道：身份已由代理令牌校验，只按店铺行 + 代理行出图。 */
  async agentPoster(
    shop: {
      ownerUserId: string;
      scene: string;
      shopId: number;
      shopName: string;
      shopCode: string;
    },
    agent: { name: string; phone: string },
  ) {
    return this.compose(shop, {
      kind: 'AGENT',
      title: `${agent.name} · 专属服务顾问`,
      subtitle: '扫码下单，由我为您安排上门服务',
      contact: agent.phone ? `电话 ${agent.phone}` : '',
    });
  }

  private async compose(
    shop: {
      ownerUserId: string;
      scene: string;
      shopId: number;
      shopName: string;
      shopCode: string;
    },
    copy: {
      kind: 'SHOP' | 'AGENT';
      title: string;
      subtitle: string;
      contact: string;
    },
  ) {
    const { png } = await this.releases.qrcodeForShop(
      shop,
      'pages/index/index',
    );
    // 海报底图的小程序码同样入账到店主名下（代理海报的字节归属仍是店铺店主）
    const uploaded = await this.assets.put({
      ownerUserId: shop.ownerUserId,
      // 海报码按（场景, 店铺, 海报类型）定名：SHOP / AGENT 两张各覆盖自己那一份，
      // 随机段会让店主每点一次生成海报就多付一份存储费
      path: `private-mini/poster/${shop.scene}/${shop.shopId}/qrcode-${stableAssetName(copy.kind)}.png`,
      bytes: png,
      assetType: 'image',
      bizRef: `onsite-poster:${copy.kind}:${shop.shopId}`,
    });
    const qrcodeUrl = this.assets.urlOf(uploaded.key);

    const svg = buildOnsitePosterSvg({
      shopName: shop.shopName,
      title: copy.title,
      subtitle: copy.subtitle,
      contact: copy.contact,
      qr: png.toString('base64'),
      shopCode: shop.shopCode,
    });
    return {
      kind: copy.kind,
      title: copy.title,
      subtitle: copy.subtitle,
      contact: copy.contact,
      shopName: shop.shopName,
      qrcodeUrl,
      posterUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString(
        'base64',
      )}`,
      width: WIDTH,
      height: HEIGHT,
    };
  }
}
