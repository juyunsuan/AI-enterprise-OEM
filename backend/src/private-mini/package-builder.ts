import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 自营小程序出包器：读模板工程 → 产出 store（不压缩）zip。
 *
 * 建站 8 个工具的出包入口按「统一源码包」口径调用：collectTemplate → buildStoreZip →
 * assertPackageSize，中间**不再注入**任何账号参数（模板槽位保持空串占位原样分发）。
 *
 * 与 `scripts/pack-miniprogram.mjs` 同一套口径，但落在后端服务里（用户点一下就出包，
 * 不能依赖 shell）：
 * - 条目名固定 POSIX 分隔符——微信开发者工具与 Linux unzip 都不认反斜杠条目；
 * - 只改内存里的那份，模板源文件永不落盘改动，所有店铺共读一份源码；
 * - 注入项必须是**空串占位**才允许改写，占位被人填过就报错，避免静默注入失败出空包。
 */

export type PackageEntry = { name: string; content: Buffer; mtime: Date };

/** 微信开发者工具生成、不该随源码分发的文件。 */
const EXCLUDE = [/project\.private\.config\.json$/i, /^~\$/, /\.DS_Store$/i];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** zip 的 DOS 时间字段只支持 1980 年起。 */
function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function buildEntry(name: string, content: Buffer, mtime: Date) {
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(content);
  const dos = dosDateTime(mtime);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  // flags 0x0800：条目名按 UTF-8 存（中文页面名靠这一位才不乱）
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(dos.time, 10);
  local.writeUInt16LE(dos.date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  return { nameBuf, content, crc, local, offset: 0, mtime };
}

function centralHeader(entry: ReturnType<typeof buildEntry>, offset: number) {
  const dos = dosDateTime(entry.mtime);
  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(20, 6);
  head.writeUInt16LE(0x0800, 8);
  head.writeUInt16LE(0, 10);
  head.writeUInt16LE(dos.time, 12);
  head.writeUInt16LE(dos.date, 14);
  head.writeUInt32LE(entry.crc, 16);
  head.writeUInt32LE(entry.content.length, 20);
  head.writeUInt32LE(entry.content.length, 24);
  head.writeUInt16LE(entry.nameBuf.length, 28);
  head.writeUInt32LE(offset, 42);
  return head;
}

export function buildStoreZip(entries: PackageEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const built = buildEntry(entry.name, entry.content, entry.mtime);
    locals.push(built.local, built.nameBuf, built.content);
    centrals.push(Buffer.concat([centralHeader(built, offset), built.nameBuf]));
    offset += built.local.length + built.nameBuf.length + built.content.length;
  }
  const localBlob = Buffer.concat(locals);
  const centralBlob = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlob.length, 12);
  eocd.writeUInt32LE(localBlob.length, 16);
  return Buffer.concat([localBlob, centralBlob, eocd]);
}

/** 模板根目录：环境变量优先（容器里模板随镜像分发到别处），默认仓库根 `miniprogram-onsite/`。 */
export function templateDirFrom(envName: string, fallbackDir: string) {
  const backendRoot = resolve(__dirname, '..', '..');
  const repoRoot = resolve(backendRoot, '..');
  return resolve(process.env[envName] || join(repoRoot, fallbackDir));
}

export async function collectTemplate(
  dir: string,
  prefix = '',
  out: PackageEntry[] = [],
): Promise<PackageEntry[]> {
  const items: Dirent[] = await readdir(dir, { withFileTypes: true }).catch(
    () => [] as Dirent[],
  );
  for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
    if (item.name === '__MACOSX' || item.name.startsWith('.')) continue;
    const abs = join(dir, item.name);
    const name = posix.join(prefix, item.name);
    if (item.isDirectory()) {
      await collectTemplate(abs, name, out);
      continue;
    }
    const info = await stat(abs).catch(() => null);
    if (!info?.isFile()) continue;
    out.push({ name, content: await readFile(abs), mtime: info.mtime });
  }
  return out.filter((entry) => !EXCLUDE.some((rule) => rule.test(entry.name)));
}

/** 出包前置校验：少了这三样就不是能导入微信开发者工具的工程。 */
function assertProject(entries: PackageEntry[], dir: string) {
  const missing = ['app.json', 'config.js', 'project.config.json'].filter(
    (name) => !entries.some((entry) => entry.name === name),
  );
  if (missing.length) {
    throw new BusinessException(
      ErrorCode.SERVICE_UNAVAILABLE,
      `小程序模板缺少 ${missing.join(' / ')}（模板目录 ${dir}），请确认仓库模板完整后重新出包`,
    );
  }
}

/**
 * 注入 config.js 的字符串配置项（apiBase / shopCode 等）。
 * 返回真正改写成功的键名，台账与页面据此说明「这次包里带了什么」。
 *
 * 调用范围（2026-11 口径变更）：各建站小程序的 release 服务**不再调用**这里两个注入函数，
 * 出包统一分发模板原样源码包，账号参数由用户在微信开发者工具里自填（见「发布说明」）。
 * 函数保留给平台自用的用户版小程序底座，勿删。
 */
export function injectConfig(
  entries: PackageEntry[],
  values: Record<string, string>,
  dir: string,
): string[] {
  assertProject(entries, dir);
  const target = entries.find((entry) => entry.name === 'config.js')!;
  const injected: string[] = [];
  let source = target.content.toString('utf8');
  for (const [key, value] of Object.entries(values)) {
    // 只替换「键 + 空串」，不碰行首行尾：注入错行会让整包语法失效
    const slot = new RegExp(`(${key}:\\s*)""`);
    if (!slot.test(source)) {
      if (new RegExp(`${key}:\\s*"[^"]+"`).test(source)) {
        throw new BusinessException(
          ErrorCode.INTERNAL_ERROR,
          `模板 config.js 的 ${key} 不是空串占位，无法注入店铺配置，请修正模板`,
        );
      }
      continue;
    }
    source = source.replace(slot, `$1${JSON.stringify(String(value ?? ''))}`);
    injected.push(key);
  }
  target.content = Buffer.from(source, 'utf8');
  return injected;
}

/** 出包时就把 AppID 写进 project.config.json：用户下载到的 zip 直接可导入、可自测。 */
export function injectAppId(entries: PackageEntry[], appId: string): boolean {
  if (!appId) return false;
  const target = entries.find((entry) => entry.name === 'project.config.json');
  if (!target) return false;
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(target.content.toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw new BusinessException(
      ErrorCode.INTERNAL_ERROR,
      '模板 project.config.json 无法解析，请修正模板',
    );
  }
  if (config.appid === appId) return false;
  config.appid = appId;
  target.content = Buffer.from(JSON.stringify(config, null, 2), 'utf8');
  return true;
}

export function zipStats(bytes: Buffer) {
  return {
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

/**
 * 模板元信息：版本号取自模板 `config.js` 里的 `templateVersion` 字面量，
 * 条目数与体积按源文件统计（不含注入项，注入只改几个字符串值，体积变化可忽略）。
 */
export async function readTemplateMeta(dir: string) {
  const entries = await collectTemplate(dir);
  const config = entries.find((entry) => entry.name === 'config.js');
  const matched = config
    ? /templateVersion:\s*"([^"]+)"/.exec(config.content.toString('utf8'))
    : null;
  return {
    available: entries.some((entry) => entry.name === 'app.json'),
    version: matched?.[1] || '0.0.0',
    entryCount: entries.length,
    sizeBytes: entries.reduce((sum, entry) => sum + entry.content.length, 0),
  };
}

/** 主包体积闸门：微信主包 2MB 硬限，逼近就先拒绝，别让用户传到微信才失败。 */
export const MAIN_PACKAGE_LIMIT = 1_900_000;

export function assertPackageSize(sizeBytes: number, entryCount: number) {
  if (sizeBytes <= MAIN_PACKAGE_LIMIT) return;
  throw new BusinessException(
    ErrorCode.PAYLOAD_TOO_LARGE,
    `代码包 ${(sizeBytes / 1024 / 1024).toFixed(2)}MB 超过微信主包 2MB 上限（共 ${entryCount} 个条目），请把图片素材改放对象存储外链后重新出包`,
  );
}

/**
 * 平台代传微信（服务端跑 `miniprogram-ci`）已从 8 个建站工具的发布页下线。
 *
 * 产品口径：出包是**统一模板源码包**，包内不含账号参数，代传既没有意义，
 * 又要求平台集中保管每个商户的代码上传密钥与 IP 白名单——这条边界交回用户。
 * 各工具 `uploadToWechat` / `upload` 的方法与路由都保留（端点契约不牵动前端与路由基线），
 * 但执行前门一律走这里拒绝，且必须早于任何读库、写发布台账、起子进程的动作。
 */
export const PLATFORM_UPLOAD_RETIRED_MESSAGE =
  '平台已不再代为上传小程序：请下载源码分发包，在微信开发者工具里自行编译与上传；步骤见「发布说明」。';

export function refusePlatformUpload(): never {
  throw new BusinessException(
    ErrorCode.FORBIDDEN,
    PLATFORM_UPLOAD_RETIRED_MESSAGE,
  );
}
