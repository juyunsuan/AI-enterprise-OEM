import { RC_PERSIST_MODES } from '@enterprise/contracts';
import { Prisma } from '../../generated/prisma';
import { text } from '../common/api';
import { asJsonArray, toJsonObject } from '../shared/json-value';

/**
 * 采集产物的落库口径（docs/浏览器代理网页采集落表方案.md §五 H、§D8）。
 *
 * `persist` 是会话/计划级的「存不存、存哪」，`landing` 是「存成什么样」（表名、表头、幂等锚）。
 * 两者一起决定引擎在 harvest 回执后如何把行**直传**落表——不经模型复述，
 * 定时重跑也靠 `dedupBy` 做到「同一页跑两次不多出行」。
 */

export type RcLandingField = {
  name: string;
  key?: string;
  type?: string;
};

export type RcLandingSpec = {
  tableName: string;
  fields: RcLandingField[];
  dedupBy: string[];
};

/** 落表列数与幂等锚列数上限：与 DataTable_landRows 的契约口径一致。 */
const LANDING_FIELDS_MAX = 40;
const LANDING_DEDUP_MAX = 5;

/** persist 档位收敛：只认闭集，其余按 none——话里没要求存就不落库。 */
export function pickPersist(raw: unknown): string {
  const value = text(raw).trim().toLowerCase();
  return (RC_PERSIST_MODES as readonly string[]).includes(value)
    ? value
    : 'none';
}

/** 期望表头（入参/留档均可）：无名即丢，脏项不拦整批。 */
export function landingFields(raw: unknown): RcLandingField[] {
  return asJsonArray(raw as Prisma.JsonValue)
    .slice(0, LANDING_FIELDS_MAX)
    .map((item) => {
      const field = toJsonObject(item);
      const name = text(field.name).trim().slice(0, 40);
      if (!name) return null;
      const key = text(field.key).trim().slice(0, 40);
      const type = text(field.type).trim().slice(0, 16);
      return { name, ...(key ? { key } : {}), ...(type ? { type } : {}) };
    })
    .filter((item): item is RcLandingField => Boolean(item));
}

/** 幂等锚列（列键或表头名均可）。 */
export function landingKeys(raw: unknown): string[] {
  return asJsonArray(raw as Prisma.JsonValue)
    .map((item) => text(item).trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, LANDING_DEDUP_MAX);
}

/** 入参里的落表口径：表名 / 表头 / 幂等锚全空时返回 null（会话不需要落表细节）。 */
export function normalizeLanding(
  body: Record<string, unknown>,
): RcLandingSpec | null {
  const spec: RcLandingSpec = {
    tableName: text(body.tableName).trim().slice(0, 60),
    fields: landingFields(body.fields),
    dedupBy: landingKeys(body.dedupBy),
  };
  if (!spec.tableName && !spec.fields.length && !spec.dedupBy.length) {
    return null;
  }
  return spec;
}

/** 留档里的落表口径（会话/计划行上的 landing JSON）。 */
export function landingOf(value: Prisma.JsonValue | null): RcLandingSpec {
  const row = toJsonObject(value);
  return {
    tableName: text(row.tableName).trim().slice(0, 60),
    fields: landingFields(row.fields),
    dedupBy: landingKeys(row.dedupBy),
  };
}

/**
 * 计划任务/回放行 → `startSession` 的落表入参。
 * persist=none 时什么都不给，会话保持「只在对话里回结果」的缺省。
 */
export function landingBodyOf(row: {
  persist: string;
  tableId: number;
  landing: Prisma.JsonValue | null;
}): Record<string, unknown> {
  if (row.persist === 'none') return {};
  const spec = landingOf(row.landing);
  return {
    persist: row.persist,
    tableId: row.tableId,
    ...(spec.tableName ? { tableName: spec.tableName } : {}),
    ...(spec.fields.length ? { fields: spec.fields } : {}),
    ...(spec.dedupBy.length ? { dedupBy: spec.dedupBy } : {}),
  };
}
