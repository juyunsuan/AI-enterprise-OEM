import {
  ERRAND_RIDER_STATUSES,
  ERRAND_SERVICE_TYPES,
  ERRAND_VEHICLE_TYPES,
  type ErrandBankCard,
  type ErrandBankCardSaveBody,
  type ErrandRider,
  type ErrandRiderLoginBody,
  type ErrandRiderOnlineBody,
  type ErrandRiderRegisterBody,
  type ErrandRiderRoster,
  type ErrandRiderSaveBody,
  type ErrandRiderStatusBody,
  type ErrandWithdrawal,
} from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { ErrandSiteService } from './errand.site.service';
import type { ErrandWalletService } from './errand.wallet.service';
import { issueRiderToken, parseRiderToken } from './errand.rider.token';
import {
  ERRAND_SCENE,
  amount,
  clip,
  errandRiderNo,
  hashCardNo,
  hashIdCard,
  iso,
  jsonInput,
  jsonList,
  maskCardNo,
  maskIdCard,
  pageArgs,
  riderStatus,
  serviceType,
  vehicleType,
} from './errand.shared';

type RiderRow = {
  id: number;
  siteId: number;
  cityId: number;
  cityName: string;
  ownerUserId: string;
  riderNo: string;
  openid: string;
  unionid: string;
  name: string;
  mobile: string;
  idCardMasked: string;
  vehicleType: string;
  serviceTypes: unknown;
  status: string;
  online: boolean;
  rejectReason: string;
  idCardFront: string;
  idCardBack: string;
  vehiclePhoto: string;
  rating: unknown;
  orderCount: number;
  incomeTotal: unknown;
  balance: unknown;
  frozen: unknown;
  lastActiveAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 只保留契约声明的服务类型，空集合回落为两种都接。 */
function serviceTypesOf(value: unknown): ('SEND' | 'BUY')[] {
  const list = jsonList<unknown>(value)
    .map((item) => String(item))
    .filter((item): item is 'SEND' | 'BUY' =>
      (ERRAND_SERVICE_TYPES as readonly string[]).includes(item),
    );
  return list.length ? [...new Set(list)] : ['SEND', 'BUY'];
}

/**
 * 跑腿骑手：小程序内微信身份报名 → 店主审核 → 接单工作台。
 *
 * 骑手令牌使用独立 issuer（见 errand.rider.token.ts），与顾客令牌互不串用；
 * 一切写操作按 (riderId, siteId) 双条件过滤，店主侧再按站点归属校验。
 */
export class ErrandRiderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ErrandSiteService,
    private readonly client: MiniProgramClient,
    private readonly miniApp: MiniAppService,
    private readonly wallet: ErrandWalletService,
  ) {}

  private toRider(row: RiderRow): ErrandRider {
    return {
      id: row.id,
      riderNo: row.riderNo,
      cityId: row.cityId,
      cityName: row.cityName,
      name: row.name,
      mobile: row.mobile,
      idCardMasked: row.idCardMasked,
      vehicleType: vehicleType(row.vehicleType),
      status: riderStatus(row.status),
      online: row.online,
      serviceTypes: serviceTypesOf(row.serviceTypes),
      rating: Number(row.rating) || 5,
      orderCount: row.orderCount,
      incomeTotal: amount(row.incomeTotal),
      balance: amount(row.balance),
      frozen: amount(row.frozen),
      rejectReason: row.rejectReason,
      idCardFront: row.idCardFront,
      idCardBack: row.idCardBack,
      vehiclePhoto: row.vehiclePhoto,
      lastActiveAt: iso(row.lastActiveAt),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private toRoster(row: RiderRow): ErrandRiderRoster {
    return {
      id: row.id,
      riderNo: row.riderNo,
      cityId: row.cityId,
      cityName: row.cityName,
      name: row.name,
      mobile: row.mobile,
      vehicleType: vehicleType(row.vehicleType),
      status: riderStatus(row.status),
      online: row.online,
      serviceTypes: serviceTypesOf(row.serviceTypes),
      rating: Number(row.rating) || 5,
      orderCount: row.orderCount,
      balance: amount(row.balance),
      updatedAt: iso(row.updatedAt),
    };
  }

  // ---------------------------------------------------------------- 店主侧

  async list(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<PageResponse<ErrandRider>> {
    const ctx = await this.sites.require(user);
    const { page, pageSize, offset } = pageArgs(query);
    const where: Prisma.ErrandRiderWhereInput = { siteId: ctx.row.id };
    const status = clip(query.status, 16);
    if ((ERRAND_RIDER_STATUSES as readonly string[]).includes(status))
      where.status = status;
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { mobile: { contains: keyword } },
        { riderNo: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.errandRider.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.errandRider.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as RiderRow[]).map((row) => this.toRider(row)),
      total,
      page,
      pageSize,
    );
  }

  async roster(user: CurrentUser): Promise<ErrandRiderRoster[]> {
    const ctx = await this.sites.require(user);
    const rows = await this.prisma.errandRider.findMany({
      where: { siteId: ctx.row.id, status: 'APPROVED' },
      orderBy: [{ online: 'desc' }, { rating: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    return (rows as unknown as RiderRow[]).map((row) => this.toRoster(row));
  }

  async save(
    user: CurrentUser,
    body: ErrandRiderSaveBody,
  ): Promise<ErrandRider> {
    const ctx = await this.sites.require(user);
    const row = await this.prisma.errandRider.findFirst({
      where: { id: body.id, siteId: ctx.row.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '骑手不存在');
    const status = riderStatus(body.status);
    const city =
      body.cityId > 0
        ? await this.prisma.errandCity.findFirst({
            where: { id: body.cityId, siteId: ctx.row.id },
            select: { id: true, name: true },
          })
        : null;
    if (body.cityId > 0 && !city) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '所选服务城市不存在');
    }
    const updated = await this.prisma.errandRider.update({
      where: { id: row.id },
      data: {
        name: clip(body.name, 40).trim() || row.name,
        mobile: clip(body.mobile, 20),
        ...(city ? { cityId: city.id, cityName: city.name } : {}),
        vehicleType: vehicleType(body.vehicleType),
        serviceTypes: jsonInput(serviceTypesOf(body.serviceTypes)),
        status,
        online: status === 'APPROVED' ? row.online : false,
        rejectReason: status === 'APPROVED' ? '' : row.rejectReason,
      },
    });
    return this.toRider(updated);
  }

  async setStatus(
    user: CurrentUser,
    body: ErrandRiderStatusBody,
  ): Promise<ErrandRider> {
    const ctx = await this.sites.require(user);
    const row = await this.prisma.errandRider.findFirst({
      where: { id: body.id, siteId: ctx.row.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '骑手不存在');
    const status = riderStatus(body.status);
    const reason = clip(body.reason, 300);
    if (status === 'REJECTED' && !reason) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '拒绝骑手报名要写清楚原因，便于对方修改后重新提交',
      );
    }
    const updated = await this.prisma.errandRider.update({
      where: { id: row.id },
      data: {
        status,
        online: status === 'APPROVED' ? row.online : false,
        rejectReason:
          status === 'REJECTED' || status === 'SUSPENDED' ? reason : '',
        lastActiveAt: new Date(),
      },
    });
    return this.toRider(updated);
  }

  // ---------------------------------------------------------------- 骑手端

  private async siteForPublic(siteCode: string) {
    const found = await this.sites.byCode(siteCode);
    if (!found) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '跑腿站点不存在或已关闭，请返回首页重新进入',
      );
    }
    await this.sites.ensureToolOpen(found.row.ownerUserId);
    return found;
  }

  private async openidOf(
    site: { id: number; ownerUserId: string; name: string },
    code: string,
  ): Promise<string> {
    const value = clip(code, 128).trim();
    if (!value) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '缺少微信登录 code，请重新进入小程序',
      );
    }
    const runtime = await this.miniApp.requireRuntime(this.sites.subject(site));
    const session = await this.client.code2Session(runtime, value);
    return session.openId;
  }

  async register(
    body: ErrandRiderRegisterBody,
  ): Promise<{ message: string; rider: ErrandRider }> {
    const { row: site } = await this.siteForPublic(body.site);
    const openid = await this.openidOf(site, body.code);
    const existing = (await this.prisma.errandRider.findFirst({
      where: { siteId: site.id, openid },
    })) as unknown as RiderRow | null;
    if (existing) {
      if (existing.status === 'APPROVED') {
        return {
          message: '你已是本站骑手，可直接进入骑手工作台',
          rider: this.toRider(existing),
        };
      }
      if (existing.status === 'PENDING') {
        return {
          message: '报名资料已提交，请等待店主审核',
          rider: this.toRider(existing),
        };
      }
      if (existing.status === 'SUSPENDED') {
        throw new BusinessException(
          ErrorCode.FORBIDDEN,
          `你的骑手资格已被停用：${existing.rejectReason || '请联系店主了解原因'}`,
        );
      }
    }
    const city = await this.prisma.errandCity.findFirst({
      where: {
        siteId: site.id,
        status: 'ENABLED',
        ...(body.cityId > 0 ? { id: body.cityId } : {}),
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    if (!city) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '本站还没有开通服务城市，请先联系店主在后台添加城市',
      );
    }
    const name = clip(body.name, 40).trim();
    const mobile = clip(body.mobile, 20).trim();
    if (!name || !mobile) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写真实姓名与手机号',
      );
    }
    const data = {
      siteId: site.id,
      cityId: city.id,
      cityName: city.name,
      ownerUserId: site.ownerUserId,
      name,
      mobile,
      openid,
      idCardMasked: maskIdCard(body.idCardNo),
      idCardHash: hashIdCard(body.idCardNo),
      vehicleType: vehicleType(body.vehicleType),
      serviceTypes: jsonInput(serviceTypesOf(body.serviceTypes)),
      status: 'PENDING',
      rejectReason: '',
      idCardFront: clip(body.idCardFront, 500),
      idCardBack: clip(body.idCardBack, 500),
      vehiclePhoto: clip(body.vehiclePhoto, 500),
      lastActiveAt: new Date(),
    };
    const row = existing
      ? ((await this.prisma.errandRider.update({
          where: { id: existing.id },
          data,
        })) as unknown as RiderRow)
      : ((await this.prisma.errandRider.create({
          data: { ...data, riderNo: errandRiderNo() },
        })) as unknown as RiderRow);
    return {
      message: '报名已提交，店主审核通过后即可接单',
      rider: this.toRider(row),
    };
  }

  async login(
    body: ErrandRiderLoginBody,
  ): Promise<{ token: string; rider: ErrandRider }> {
    const { row: site } = await this.siteForPublic(body.site);
    const openid = await this.openidOf(site, body.code);
    const row = (await this.prisma.errandRider.findFirst({
      where: { siteId: site.id, openid },
    })) as unknown as RiderRow | null;
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '还没有骑手报名记录：先在「骑手报名」提交资料，等店主审核',
      );
    }
    if (row.status === 'REJECTED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        `报名未通过：${row.rejectReason || '请修改资料后重新提交'}`,
      );
    }
    if (row.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        `骑手资格已停用：${row.rejectReason || '请联系店主了解原因'}`,
      );
    }
    await this.prisma.errandRider.update({
      where: { id: row.id },
      data: { openid, lastActiveAt: new Date() },
    });
    return {
      token: issueRiderToken({
        scene: ERRAND_SCENE,
        shopId: site.id,
        riderId: row.id,
      }),
      rider: this.toRider(row),
    };
  }

  async identity(
    token: string,
  ): Promise<{ siteId: number; ownerUserId: string; rider: RiderRow }> {
    const payload = parseRiderToken(token);
    if (payload.scene !== ERRAND_SCENE) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态不适用本跑腿小程序',
      );
    }
    const site = await this.prisma.errandSite.findUnique({
      where: { id: payload.shopId },
      select: { id: true, ownerUserId: true, status: true },
    });
    if (!site || site.status === 'CLOSED') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在或已关闭');
    }
    await this.sites.ensureToolOpen(site.ownerUserId);
    const row = (await this.prisma.errandRider.findFirst({
      where: { id: payload.riderId, siteId: site.id },
    })) as unknown as RiderRow | null;
    if (!row) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '骑手身份已失效，请重新进入小程序',
      );
    }
    if (row.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        `骑手资格已停用：${row.rejectReason || '请联系店主了解原因'}`,
      );
    }
    return { siteId: site.id, ownerUserId: site.ownerUserId, rider: row };
  }

  async setOnline(
    rider: RiderRow,
    body: ErrandRiderOnlineBody,
  ): Promise<ErrandRider> {
    if (rider.status !== 'APPROVED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '骑手资格还在审核中，通过后才能开始接单',
      );
    }
    const updated = await this.prisma.errandRider.update({
      where: { id: rider.id },
      data: {
        online: body.online === true,
        serviceTypes: jsonInput(serviceTypesOf(body.serviceTypes)),
        lastActiveAt: new Date(),
      },
    });
    return this.toRider(updated);
  }

  /** 骑手位置上报：用于抢单半径与自动派单排序，只在骑手端调用。 */
  async setLocation(
    rider: RiderRow,
    body: { lng: number; lat: number },
  ): Promise<ErrandRider> {
    const updated = await this.prisma.errandRider.update({
      where: { id: rider.id },
      data: {
        lng: Number(body.lng) || 0,
        lat: Number(body.lat) || 0,
        lastLocatedAt: new Date(),
        lastActiveAt: new Date(),
      },
    });
    return this.toRider(updated);
  }

  async bankCards(rider: RiderRow): Promise<ErrandBankCard[]> {
    const rows = await this.prisma.errandRiderBankCard.findMany({
      where: { siteId: rider.siteId, riderId: rider.id },
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return rows.map((row) => ({
      id: row.id,
      holder: row.holder,
      bankName: row.bankName,
      cardNoMasked: row.cardNoMasked,
      isDefault: row.isDefault,
      createdAt: iso(row.createdAt),
    }));
  }

  async saveBankCard(
    rider: RiderRow,
    body: ErrandBankCardSaveBody,
  ): Promise<ErrandBankCard> {
    const digits = String(body.cardNo || '').replace(/\D/g, '');
    if (digits.length < 12 || digits.length > 30) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '银行卡号格式不对，请填写 12–30 位数字',
      );
    }
    const hash = hashCardNo(digits);
    const current =
      body.id > 0
        ? await this.prisma.errandRiderBankCard.findFirst({
            where: { id: body.id, siteId: rider.siteId, riderId: rider.id },
          })
        : null;
    if (body.id > 0 && !current) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '银行卡不存在');
    }
    const dup = await this.prisma.errandRiderBankCard.findFirst({
      where: { siteId: rider.siteId, riderId: rider.id, cardNoHash: hash },
    });
    if (dup && dup.id !== current?.id) {
      throw new BusinessException(ErrorCode.CONFLICT, '这张卡已经添加过了');
    }
    const data = {
      holder: clip(body.holder, 40).trim(),
      bankName: clip(body.bankName, 60).trim(),
      cardNoMasked: maskCardNo(digits),
      cardNoHash: hash,
      isDefault: body.isDefault === true,
    };
    if (!data.holder || !data.bankName) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写持卡人与开户行',
      );
    }
    const saved = await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.errandRiderBankCard.updateMany({
          where: { siteId: rider.siteId, riderId: rider.id },
          data: { isDefault: false },
        });
      }
      return current
        ? tx.errandRiderBankCard.update({ where: { id: current.id }, data })
        : tx.errandRiderBankCard.create({
            data: { ...data, siteId: rider.siteId, riderId: rider.id },
          });
    });
    return {
      id: saved.id,
      holder: saved.holder,
      bankName: saved.bankName,
      cardNoMasked: saved.cardNoMasked,
      isDefault: saved.isDefault,
      createdAt: iso(saved.createdAt),
    };
  }

  async removeBankCard(rider: RiderRow, id: number) {
    const row = await this.prisma.errandRiderBankCard.findFirst({
      where: { id, siteId: rider.siteId, riderId: rider.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '银行卡不存在');
    await this.prisma.errandRiderBankCard.delete({ where: { id: row.id } });
    return { ok: true, message: '银行卡已删除' };
  }

  profile(rider: RiderRow): ErrandRider {
    return this.toRider(rider);
  }

  async requestWithdrawal(
    rider: RiderRow,
    amountYuan: number,
    bankInfo: string,
  ): Promise<ErrandWithdrawal> {
    if (rider.status !== 'APPROVED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '骑手资格未通过，暂不能提现',
      );
    }
    return this.wallet.requestWithdrawal(
      {
        id: rider.id,
        siteId: rider.siteId,
        ownerUserId: rider.ownerUserId,
        riderNo: rider.riderNo,
        name: rider.name,
        balance: rider.balance,
      },
      amountYuan,
      bankInfo,
    );
  }

  /** 订单服务接单前复核：骑手在线、资格有效、服务类型匹配、只归属本站。 */
  async requireAvailable(
    siteId: number,
    riderId: number,
    type: 'SEND' | 'BUY',
  ): Promise<RiderRow> {
    const row = (await this.prisma.errandRider.findFirst({
      where: { id: riderId, siteId },
    })) as unknown as RiderRow | null;
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '骑手不存在');
    if (row.status !== 'APPROVED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '骑手资格未通过，不能接单',
      );
    }
    if (!row.online) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '当前处于休息中，先切换到「接单中」再接单',
      );
    }
    const allowed = serviceTypesOf(row.serviceTypes);
    if (!allowed.includes(type)) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `当前骑手不接「${type === 'BUY' ? '帮我买' : '帮我送'}」类型的订单`,
      );
    }
    return row;
  }

  /** 统一入口：把「站内服务类型」字符串收敛成契约枚举。 */
  typeOf(value: unknown): 'SEND' | 'BUY' {
    return serviceType(value);
  }

  vehicleOf(value: unknown): (typeof ERRAND_VEHICLE_TYPES)[number] {
    return vehicleType(value);
  }
}
