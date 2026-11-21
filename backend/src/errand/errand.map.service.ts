import { BusinessException } from '../common/business.exception';
import { httpRequest, TransportError } from '../http/transport';
import type {
  MiniAppService,
  MiniAppSubject,
} from '../private-mini/mini-app.service';
import { coordinatesUsable, straightKilometers } from './errand.shared';

const MAP_API_BASE = 'https://apis.map.qq.com';
const MAP_TIMEOUT_MS = 6000;

export type ErrandDistance = {
  kilometers: number;
  source: 'DRIVING' | 'STRAIGHT' | 'INPUT';
};

/**
 * 跑腿距离：优先腾讯地图驾车距离，没配 Key/超时/无坐标时按直线降级，
 * 端上填写的公里数只在完全没有坐标时作为输入。报价与下单共用同一入口。
 */
export class ErrandMapService {
  constructor(private readonly miniApp: MiniAppService) {}

  private async drivingKilometers(
    mapKey: string,
    from: { lng: number; lat: number },
    to: { lng: number; lat: number },
  ): Promise<number | null> {
    if (!mapKey) return null;
    const query = new URLSearchParams({
      mode: 'driving',
      from: `${from.lat},${from.lng}`,
      to: `${to.lat},${to.lng}`,
      key: mapKey,
    });
    try {
      const result = await httpRequest<{
        status?: number;
        result?: { elements?: Array<{ distance?: number }> };
      }>(`${MAP_API_BASE}/ws/distance/v1/?${query.toString()}`, {
        method: 'GET',
        timeoutMs: MAP_TIMEOUT_MS,
        readAs: 'json',
        maxBytes: 64 * 1024,
        operation: 'errand-map-distance',
      });
      const payload = result.data;
      if (!result.ok || Number(payload?.status ?? -1) !== 0) return null;
      const meters = Number(payload?.result?.elements?.[0]?.distance ?? 0);
      if (!Number.isFinite(meters) || meters <= 0) return null;
      return Number((meters / 1000).toFixed(2));
    } catch (error) {
      // 地图配额或网络问题不影响下单：调用方按直线/端上输入降级
      if (error instanceof TransportError || error instanceof BusinessException)
        return null;
      return null;
    }
  }

  async resolve(
    subject: MiniAppSubject,
    input: {
      fromLng?: number;
      fromLat?: number;
      toLng?: number;
      toLat?: number;
      distanceKm?: number;
    },
  ): Promise<ErrandDistance> {
    const from = {
      lng: Number(input.fromLng) || 0,
      lat: Number(input.fromLat) || 0,
    };
    const to = { lng: Number(input.toLng) || 0, lat: Number(input.toLat) || 0 };
    if (!coordinatesUsable(from.lng, from.lat, to.lng, to.lat)) {
      return {
        kilometers: Math.max(0, Number(input.distanceKm) || 0),
        source: 'INPUT',
      };
    }
    const mapKey = await this.miniApp.mapKey(subject);
    const driving = await this.drivingKilometers(mapKey, from, to);
    if (driving !== null) return { kilometers: driving, source: 'DRIVING' };
    return {
      kilometers: straightKilometers(from.lng, from.lat, to.lng, to.lat),
      source: 'STRAIGHT',
    };
  }

  /** 骑手到取货点的直线距离：用于抢单半径与自动派单排序，不额外调地图配额。 */
  riderToPickupKm(
    rider: { lng?: number | null; lat?: number | null },
    order: { fromLng: number; fromLat: number },
  ): number | null {
    const lng = Number(rider.lng) || 0;
    const lat = Number(rider.lat) || 0;
    if (!coordinatesUsable(lng, lat, order.fromLng, order.fromLat)) return null;
    return straightKilometers(lng, lat, order.fromLng, order.fromLat);
  }
}
