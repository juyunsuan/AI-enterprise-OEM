import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { accountDeviceDescriptorSchema, type AccountDeviceDescriptor } from '@dsh-remote/protocol'
import { z } from 'zod'

export class ApiError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code) }
}
export const hash = (value: string): string => createHash('sha256').update(value).digest('hex')
export const secret = (): string => randomBytes(32).toString('base64url')

const savedDeviceSchema = z.object({
  descriptor: accountDeviceDescriptorSchema,
  revoked: z.boolean(),
  lastSeenAt: z.number(),
  account: z.string(),
})
const tokenSchema = z.object({
  kind: z.enum(['access', 'refresh']),
  deviceId: z.string(),
  account: z.string(),
  expires: z.number(),
})
const stateSchema = z.object({
  version: z.literal(2),
  devices: z.record(z.string(), savedDeviceSchema),
  tokens: z.record(z.string(), tokenSchema),
})
type SavedDevice = z.infer<typeof savedDeviceSchema>
type SavedToken = z.infer<typeof tokenSchema>

/** Platform-account keyed device/token store. Devices are globally unique and carry their owner. */
export class Store {
  private state: z.infer<typeof stateSchema>
  onInvalidate: (id: string) => void = () => {}

  constructor(private readonly file: string) {
    const previous = existsSync(file)
      ? stateSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
      : undefined
    if (previous && !previous.success) {
      console.error('[awbot-remote] state parse failed', previous.error.issues.map(issue => ({ path: issue.path, code: issue.code })))
    }
    this.state = previous?.success ? previous.data : { version: 2, devices: {}, tokens: {} }
    this.save()
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 })
    renameSync(tmp, this.file)
  }

  get(id: string): SavedDevice {
    const d = Object.hasOwn(this.state.devices, id) ? this.state.devices[id] : undefined
    if (!d) throw new ApiError('DEVICE_NOT_FOUND', 404)
    if (d.revoked) throw new ApiError('DEVICE_REVOKED', 403)
    return d
  }

  accountOf(id: string): string { return this.get(id).account }
  list(account: string): SavedDevice[] {
    return Object.values(this.state.devices).filter(d => !d.revoked && d.account === account)
  }

  register(account: string, descriptor: AccountDeviceDescriptor): ReturnType<Store['issue']> {
    const old = this.state.devices[descriptor.deviceId]
    if (old?.revoked) throw new ApiError('DEVICE_REVOKED', 403)
    if (old && old.account !== account) throw new ApiError('PAIRING_ACCOUNT_CONFLICT', 409)
    if (old && (old.descriptor.identityKey !== descriptor.identityKey || old.descriptor.role !== descriptor.role)) {
      throw new ApiError('PEER_IDENTITY_MISMATCH', 409)
    }
    if (!old && Object.keys(this.state.devices).length >= 4096) throw new ApiError('RATE_LIMITED', 429)
    this.state.devices[descriptor.deviceId] = { descriptor, revoked: false, lastSeenAt: old?.lastSeenAt ?? 0, account }
    this.invalidate(descriptor.deviceId)
    return this.issue(account, descriptor.deviceId)
  }

  issue(account: string, deviceId: string, refreshTokenExpiresAt = Date.now() + 30 * 86400_000) {
    const tokens = { ...this.state.tokens }
    for (const [key, value] of Object.entries(tokens)) if (value.expires <= Date.now()) delete tokens[key]
    if (Object.keys(tokens).length + 2 > 65536) throw new ApiError('RATE_LIMITED', 429)
    const accessTokenExpiresAt = Date.now() + 60 * 60_000
    const accessToken = secret(), refreshToken = secret()
    tokens[hash(accessToken)] = { kind: 'access', deviceId, account, expires: accessTokenExpiresAt }
    tokens[hash(refreshToken)] = { kind: 'refresh', deviceId, account, expires: refreshTokenExpiresAt }
    this.state.tokens = tokens
    this.save()
    return { accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt }
  }

  authenticate(token: string): SavedDevice {
    const record = this.state.tokens[hash(token)]
    if (!record || record.kind !== 'access') throw new ApiError('AUTH_INVALID', 401)
    if (record.expires <= Date.now()) throw new ApiError('TOKEN_EXPIRED', 401)
    const device = this.get(record.deviceId)
    if (device.account !== record.account) throw new ApiError('AUTH_INVALID', 401)
    return device
  }

  refresh(deviceId: string, token: string) {
    const device = this.get(deviceId)
    const record = this.state.tokens[hash(token)]
    if (!record || record.kind !== 'refresh' || record.deviceId !== deviceId) throw new ApiError('AUTH_INVALID', 401)
    if (record.expires <= Date.now()) throw new ApiError('TOKEN_EXPIRED', 401)
    delete this.state.tokens[hash(token)]
    return this.issue(device.account, deviceId, record.expires)
  }

  invalidate(deviceId: string): void {
    for (const [key, value] of Object.entries(this.state.tokens)) if (value.deviceId === deviceId) delete this.state.tokens[key]
    this.onInvalidate(deviceId)
    this.save()
  }
  revoke(id: string): void { this.get(id).revoked = true; this.invalidate(id) }
  rename(account: string, id: string, name: string): void {
    const d = this.get(id)
    if (d.account !== account) throw new ApiError('DEVICE_NOT_FOUND', 404)
    d.descriptor.name = name
    this.save()
  }
  touch(id: string, clientVersion?: string, harnessVersion?: string): void {
    const d = this.get(id)
    d.lastSeenAt = Date.now()
    if (clientVersion) d.descriptor.clientVersion = clientVersion.slice(0, 64)
    if (d.descriptor.role === 'host' && harnessVersion) d.descriptor.harnessVersion = harnessVersion.slice(0, 64)
    this.save()
  }
}
export type { SavedDevice, SavedToken }
