/**
 * 可再生字节的对象名：同一业务对象的重复生成必须落到同一个键上。
 *
 * 原来这些路径里都带 `randomUUID()` 与 `Date.now()`：店主每点一次「生成小程序码」
 * 就多一个对象、多一条台账行，而 GB·天存储费是按台账行求和算的——字节只增不减，
 * 用户为同一个店铺的同一张码付了 N 份钱。微信码的内容只由（场景, 店铺, 页面）决定，
 * 所以文件名按这三者取哈希，重复生成就覆盖写，台账行也按对象键复用。
 */
import { createHash } from 'node:crypto';

/** 把任意可打印的标识（页面路径、寄件点码等）收敛成一个稳定、可放入对象键的短哈希。 */
export function stableAssetName(...parts: unknown[]): string {
  const joined = parts
    .map((part) =>
      typeof part === 'string'
        ? part.trim()
        : part === null || part === undefined
          ? ''
          : typeof part === 'number' || typeof part === 'boolean'
            ? String(part)
            : JSON.stringify(part),
    )
    .filter(Boolean)
    .join('|');
  return createHash('sha256')
    .update(joined || 'default')
    .digest('hex')
    .slice(0, 16);
}
