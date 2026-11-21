import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 健康域敏感字段（就诊人证件号）落库加解密。
 *
 * 独立上下文 `oem-health`，与自营小程序凭据（`oem-mini-app`）互不可解；
 * scope 按店铺派生，A 店的密文拿到 B 店解不开。
 * 解密失败返回空串：证件号读不出时页面显示「已脱敏保存，请重新填写」，不让整页 500。
 */
export class HealthCrypto {
  private readonly root: Buffer;

  constructor() {
    const secret = String(process.env.EXTERNAL_CRED_KEY ?? '').trim();
    if (!secret) {
      throw new Error(
        'EXTERNAL_CRED_KEY 未配置：健康档案敏感字段加密需要独立的 AES-256-GCM 密钥来源',
      );
    }
    this.root = createHash('sha256').update(`oem-health|${secret}`).digest();
  }

  private keyFor(scope: string): Buffer {
    return createHash('sha256').update(this.root).update(scope).digest();
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

  decrypt(scope: string, sealed: string): string {
    if (!sealed) return '';
    const [ivB64, tagB64, bodyB64] = String(sealed).split(':');
    if (!ivB64 || !tagB64 || !bodyB64) {
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        '健康档案敏感字段密文格式非法',
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
