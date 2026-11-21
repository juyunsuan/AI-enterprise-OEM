import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
} from 'node:crypto';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 建站管理（用户自营主体）凭据加解密。
 *
 * 与平台版小程序的 `MiniProgramCrypto` 分开一个上下文（`oem-mini-app`），
 * 并且**每个主体每个字段派生独立子密钥**：scope 形如 `ONSITE:12:appSecret`。
 * 这样 A 店的密文拿到 B 店解不开，同一店内改 AppID 也不会把已存的商户号密钥一起作废。
 */
export class MiniAppCrypto {
  private readonly root: Buffer;

  constructor() {
    const secret = String(process.env.EXTERNAL_CRED_KEY ?? '').trim();
    if (!secret) {
      throw new Error(
        'EXTERNAL_CRED_KEY 未配置：自营小程序凭据加密需要独立的 AES-256-GCM 密钥来源',
      );
    }
    this.root = createHash('sha256').update(`oem-mini-app|${secret}`).digest();
  }

  private keyFor(scope: string): Buffer {
    return createHmac('sha256', this.root).update(scope).digest();
  }

  encrypt(scope: string, plain: string): string {
    if (!plain) return '';
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keyFor(scope), iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), body]
      .map((part) => part.toString('base64'))
      .join(':');
  }

  /**
   * 解密失败（换过 EXTERNAL_CRED_KEY 或密文被截断）时返回空串而不是抛错：
   * 凭据读不出应当走「请重新填写」的可执行提示，而不是让整页 500。
   */
  decrypt(scope: string, sealed: string): string {
    if (!sealed) return '';
    const [ivB64, tagB64, bodyB64] = String(sealed).split(':');
    if (!ivB64 || !tagB64 || !bodyB64) {
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        '自营小程序凭据密文格式非法',
      );
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.keyFor(scope),
        Buffer.from(ivB64, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(bodyB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return '';
    }
  }
}
