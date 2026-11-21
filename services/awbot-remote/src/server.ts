import { createHash, createHmac, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { z } from 'zod'
import { deviceRefreshRequestSchema, deviceRegistrationRequestSchema, parseWireJson, type AccountDeviceDescriptor } from '@dsh-remote/protocol'
import { ApiError, Store, hash, secret } from './store.js'
import { Gateway } from './gateway.js'
import { buildIceServers, parseIceConfig, type IceConfig } from './ice.js'
import { Logger, type LogLevel } from './logger.js'
import { normalizeGatewayOptions, normalizeMaxFramesPerSec } from './config.js'

export interface Config {
  dataFile: string
  publicUrl: string
  platformUrl: string
  trustedProxyIps?: readonly string[]
  logLevel?: LogLevel
  ice?: IceConfig
}

const deviceSchema = z.object({
  deviceId: z.string().min(8).max(64),
  name: z.string().min(1).max(80),
  role: z.enum(['host', 'client']),
  platform: z.string().min(1).max(32),
  identityKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  // 平台协议要求设备描述里 clientVersion 是字符串；扫码客户端可能不带。
  clientVersion: z.string().max(64).nullish().transform(value => value && value.trim() ? value : '0.0.0'),
  harnessVersion: z.string().max(64).nullish(),
})
const pairingCreateSchema = z.object({
  v: z.literal(1),
  device: deviceSchema,
  deepseekUserId: z.string().min(1).max(256).optional(),
}).strict()
const pairingResolveSchema = z.object({ ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()
const pairingClaimSchema = z.object({
  scanSecret: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  device: deviceSchema,
  deepseekUserId: z.string().min(1).max(256).optional(),
}).strict()
const pairingConfirmSchema = z.object({
  submissionId: z.string().min(16).max(128),
  verificationCode: z.string().regex(/^\d{8}$/),
}).strict()
const loginSchema = z.object({ email: z.string().min(1).max(254), password: z.string().min(1).max(1024) }).strict()

const MAX_PAIRING_BODY = 8192
const SESSION_TTL = 180_000
const RECOVER_MS = 300_000
const CODE_TTL = 480_000

type PairingSide = 'host' | 'mobile'
type PairingDevice = z.infer<typeof deviceSchema>
type PairingState = 'created' | 'claimed' | 'approved' | 'completed' | 'failed' | 'cancelled' | 'expired'

interface PairingSession {
  id: string
  account: string
  createdAt: number
  expiresAt: number
  recoverUntil: number
  serverPrivate: ReturnType<typeof generateKeyPairSync>['privateKey']
  serverPublicKey: string
  scanHash: string
  scanSecret: string
  host: PairingDevice
  mobile?: PairingDevice
  state: PairingState
  code?: string
  failureReason?: string
  submissionId?: string
  submissionCode?: string
  submissionRaw?: string
  attemptUsed: boolean
  hostTokens?: ReturnType<Store['issue']>
  mobileTokens?: ReturnType<Store['issue']>
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
function b64url(buf: Buffer): string { return buf.toString('base64url') }
function sha256hex(value: string): string { return createHash('sha256').update(value).digest('hex') }
function publicKey(raw: string) {
  const bytes = Buffer.from(raw, 'base64url')
  if (bytes.length !== 32) throw new ApiError('PAIRING_PROOF_INVALID', 401)
  const der = Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), bytes])
  return createPublicKey({ key: der, format: 'der', type: 'spki' })
}
function serverPublicRaw(publicKeyDer: Buffer): string { return b64url(publicKeyDer.subarray(publicKeyDer.length - 32)) }
function proofKey(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], deviceRaw: string, sessionId: string, side: PairingSide): Buffer {
  const shared = diffieHellman({ privateKey, publicKey: publicKey(deviceRaw) })
  return Buffer.from(hkdfSync('sha256', shared, Buffer.from(sessionId), Buffer.from(`dsh-pairing-v1/${side}`), 32))
}
function verifyProof(session: PairingSession, side: PairingSide, device: PairingDevice, exactPath: string, rawBody: string, proof: string | undefined): void {
  if (!proof) throw new ApiError('PAIRING_PROOF_INVALID', 401)
  const key = proofKey(session.serverPrivate, device.identityKey, session.id, side)
  const message = `POST\n${exactPath}\n${sha256hex(rawBody)}`
  const expected = createHmac('sha256', key).update(message).digest()
  const given = Buffer.from(proof, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new ApiError('PAIRING_PROOF_INVALID', 401)
}
function code8(): string { return String(randomBytes(4).readUInt32BE(0) % 100_000_000).padStart(8, '0') }
function offer(session: PairingSession) {
  return {
    v: 1 as const,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    serverPublicKey: session.serverPublicKey,
    scanSecret: session.scanSecret,
    host: { ...session.host, clientVersion: session.host.clientVersion ?? null, harnessVersion: session.host.harnessVersion ?? null },
  }
}

export function createRemoteServer(config: Config) {
  const url = new URL(config.publicUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('DSH_SERVER_PUBLIC_URL must be an HTTP(S) origin.')
  }
  const store = new Store(config.dataFile)
  const sessions = new Map<string, { account: string; username: string; expires: number }>()
  const pairing = new Map<string, PairingSession>()
  const scanIndex = new Map<string, string>()
  const limits = new Map<string, { count: number; until: number }>()
  function rate(key: string, max: number) {
    for (const [k, v] of limits) if (v.until < Date.now()) limits.delete(k)
    let entry = limits.get(key)
    if (!entry) { if (limits.size >= 8192) throw new ApiError('RATE_LIMITED', 429); entry = { count: 0, until: Date.now() + 60_000 }; limits.set(key, entry) }
    if (++entry.count > max) throw new ApiError('RATE_LIMITED', 429)
  }
  function tokenOf(req: IncomingMessage): string {
    const auth = req.headers.authorization
    if (auth?.startsWith('Bearer ')) return auth.slice(7)
    return /(?:^|;\s*)dsh_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie ?? '')?.[1] ?? ''
  }
  function accountAuth(req: IncomingMessage): { account: string; username: string } {
    const s = sessions.get(hash(tokenOf(req)))
    if (!s || s.expires <= Date.now()) throw new ApiError('ACCOUNT_AUTH_REQUIRED', 401)
    return s
  }
  function deviceAuth(req: IncomingMessage) {
    if (!req.headers.authorization?.startsWith('Bearer ')) throw new ApiError('AUTH_REQUIRED', 401)
    return store.authenticate(req.headers.authorization.slice(7))
  }
  function descriptor(d: ReturnType<Store['get']>) {
    return { ...d.descriptor, harnessVersion: (d.descriptor as any).harnessVersion ?? null, membershipId: `account:${hash(d.account).slice(0, 16)}`, online: gateway.peers.has(d.descriptor.deviceId), lastSeenAt: d.lastSeenAt }
  }
  async function rawBody(req: IncomingMessage, max = MAX_PAIRING_BODY): Promise<{ raw: string; body: unknown }> {
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new ApiError('INVALID_MESSAGE', 415)
    let length = 0
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      length += chunk.length
      if (length > max) throw new ApiError('FRAME_TOO_LARGE', 413)
      chunks.push(chunk)
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    try { return { raw, body: parseWireJson(Buffer.from(raw)) } } catch { throw new ApiError('INVALID_MESSAGE', 422) }
  }
  function pairingOf(id: string): PairingSession {
    const s = pairing.get(id)
    if (!s || (s.recoverUntil <= Date.now() && s.state !== 'completed')) throw new ApiError('PAIRING_NOT_FOUND', 404)
    if (s.expiresAt <= Date.now() && s.state !== 'completed') { s.state = 'expired'; throw new ApiError('PAIRING_NOT_FOUND', 404) }
    return s
  }
  function pairingView(s: PairingSession, side: PairingSide) {
    return {
      v: 1,
      sessionId: s.id,
      state: s.state,
      expiresAt: s.expiresAt,
      recoverUntil: s.recoverUntil,
      failureReason: s.failureReason ?? null,
      attemptConsumed: s.attemptUsed,
      submissionId: side === 'host' ? s.submissionId ?? null : null,
      host: { ...s.host, clientVersion: s.host.clientVersion ?? null, harnessVersion: s.host.harnessVersion ?? null },
      mobile: s.mobile ? { ...s.mobile, clientVersion: s.mobile.clientVersion ?? null, harnessVersion: s.mobile.harnessVersion ?? null } : null,
      credentials: s.state === 'completed'
        ? credentialsOf(s, side)
        : null,
    }
  }
  function credentialsOf(s: PairingSession, side: PairingSide) {
    const tokens = side === 'host' ? s.hostTokens : s.mobileTokens
    if (!tokens) return null
    const device = side === 'host' ? s.host : s.mobile!
    return {
      account: s.account,
      accountKind: s.account.startsWith('device:') ? 'device_only' : 'standard',
      device: { ...device, clientVersion: device.clientVersion ?? null, harnessVersion: device.harnessVersion ?? null },
      inboundOnly: side === 'host',
      pairingRestricted: true,
      tokens: {
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        refreshToken: tokens.refreshToken,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      },
    }
  }
  const logger = new Logger('awbot-remote', config.logLevel ?? 'info')
  const ice = config.ice ?? parseIceConfig(process.env)
  let gateway: Gateway
  const server = createServer({ requestTimeout: 20000, headersTimeout: 10000 }, (req, res) => {
    void route(req, res).catch(error => {
      if (res.headersSent || res.destroyed) return
      const e = error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR', 500)
      logger.warn('http_error', {
        code: e.code,
        status: e.status,
        errorName: (error as any)?.name,
        ...((error as any)?.issues ? { issues: (error as any).issues.map((i: any) => ({ path: i.path, code: i.code })) } : {}),
      })
      json(res, e.status, { error: { code: e.code, message: e.code, requestId: randomUUID(), retryable: e.status === 429 || e.status >= 500 } })
    })
  })
  gateway = new Gateway(server, store, url.origin, {
    ...normalizeGatewayOptions({}),
    maxFramesPerSec: normalizeMaxFramesPerSec(undefined),
    logLevel: config.logLevel,
    logger: logger.child('gateway'),
    turnEnabled: ice.turnUrls.length > 0,
  })
  async function route(req: IncomingMessage, res: ServerResponse) {
    const requestUrl = new URL(req.url ?? '/', url)
    const path = requestUrl.pathname
    const method = req.method
    if (req.headers.origin && req.headers.origin !== url.origin) throw new ApiError('AUTH_INVALID', 403)
    if (method === 'GET' && (path === '/health' || path === '/healthz' || path === '/ready')) { json(res, 200, { status: 'ok' }); return }
    const ip = req.socket.remoteAddress ?? 'unknown'
    rate(`api:${ip}`, 240)

    if (method === 'GET' && path === '/api/v1/auth/oauth/providers') {
      json(res, 200, { items: [], capabilities: { devicePairing: 'dsh-pairing-v1', devicePairingQr: 'fragment-ticket-v1' } })
      return
    }
    if (method === 'POST' && path === '/api/v1/auth/login') {
      rate(`login:${ip}`, 20)
      const { raw } = await rawBody(req)
      const credentials = loginSchema.parse(JSON.parse(raw))
      const response = await fetch(`${config.platformUrl.replace(/\/+$/, '')}/api/public/awbotdsh/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: credentials.email.trim(), password: credentials.password }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => null)
      const payload: any = response ? await response.json().catch(() => null) : null
      if (!response?.ok || payload?.ok !== true || !payload.user?.userId) throw new ApiError('AUTH_INVALID', 401)
      const account = `platform:${payload.user.userId}`
      const username = String(payload.user.username || credentials.email)
      const value = secret(), expiresAt = Date.now() + 8 * 3600_000
      sessions.set(hash(value), { account, username, expires: expiresAt })
      res.setHeader('Set-Cookie', `dsh_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${8 * 3600}${url.protocol === 'https:' ? '; Secure' : ''}`)
      json(res, 200, { account, profile: { displayName: username }, isAdmin: false, token: value, expiresAt })
      return
    }
    if (method === 'GET' && path === '/api/v1/auth/me') {
      const s = accountAuth(req)
      json(res, 200, { account: s.account, profile: { displayName: s.username }, isAdmin: false })
      return
    }
    if (method === 'POST' && path === '/api/v1/auth/logout') {
      sessions.delete(hash(tokenOf(req)))
      res.setHeader('Set-Cookie', 'dsh_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0')
      json(res, 200, { status: 'ok' })
      return
    }
    if (method === 'GET' && path === '/api/v1/account/devices') {
      const s = accountAuth(req)
      json(res, 200, { items: store.list(s.account).map(descriptor), serverUrl: url.origin, transport: 'webrtc' })
      return
    }
    if (method === 'POST' && (path === '/api/v1/devices/register' || path === '/api/v1/devices/register-owned-role')) {
      const source = path.endsWith('register-owned-role') ? deviceAuth(req) : undefined
      const account = source ? source.account : accountAuth(req).account
      const { device } = deviceRegistrationRequestSchema.parse(await jsonBody(req))
      if (source && (source.descriptor.deviceId === device.deviceId || source.descriptor.role === device.role)) throw new ApiError('INVALID_MESSAGE', 409)
      json(res, 200, store.register(account, device))
      return
    }
    if (method === 'POST' && path === '/api/v1/auth/refresh') {
      const data = deviceRefreshRequestSchema.parse(await jsonBody(req))
      json(res, 200, store.refresh(data.deviceId, data.refreshToken))
      return
    }
    if (method === 'DELETE' && path === '/api/v1/devices/self') {
      store.revoke(deviceAuth(req).descriptor.deviceId)
      json(res, 200, { status: 'revoked' })
      return
    }
    if (method === 'GET' && path === '/api/v1/me') {
      json(res, 200, descriptor(deviceAuth(req)))
      return
    }
    if (method === 'GET' && path === '/api/v1/devices') {
      const source = deviceAuth(req)
      if (source.descriptor.role !== 'client') throw new ApiError('MEMBERSHIP_REQUIRED', 403)
      const items = store.list(source.account).filter(d => d.descriptor.role === 'host').map(d => {
        const { identityKey: _key, ...item } = descriptor(d)
        return item
      })
      json(res, 200, { items, nextCursor: null })
      return
    }
    const renameMatch = /^\/api\/v1\/devices\/([^/]+)\/name$/.exec(path)
    if (method === 'POST' && renameMatch) {
      const s = accountAuth(req)
      const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(await jsonBody(req))
      store.rename(s.account, renameMatch[1]!, name)
      json(res, 200, descriptor(store.get(renameMatch[1]!)))
      return
    }
    const deviceMatch = /^\/api\/v1\/devices\/([^/]+)(\/presence)?$/.exec(path)
    if (method === 'GET' && deviceMatch) {
      const source = deviceAuth(req), target = store.get(deviceMatch[1]!)
      if (source.account !== target.account || source.descriptor.role === target.descriptor.role) throw new ApiError('MEMBERSHIP_REQUIRED', 403)
      const d = descriptor(target)
      json(res, 200, deviceMatch[2] ? { deviceId: d.deviceId, online: d.online, lastSeenAt: d.lastSeenAt } : d)
      return
    }
    if (method === 'GET' && path === '/api/v1/turn/credentials') {
      const source = deviceAuth(req)
      const connectionId = requestUrl.searchParams.get('connection_id') ?? ''
      if (!connectionId || !gateway.authorizeIce(source.descriptor.deviceId, connectionId)) throw new ApiError('CONNECTION_NOT_FOUND', 404)
      json(res, 200, { iceServers: buildIceServers(ice, source.descriptor.deviceId) })
      return
    }
    if (method === 'GET' && path === '/api/v1/device-memberships') {
      const source = deviceAuth(req)
      const items = store.list(source.account).filter(d => d.descriptor.deviceId !== source.descriptor.deviceId).map(d => ({
        membershipId: `pair:${hash(`${source.descriptor.deviceId}:${d.descriptor.deviceId}`).slice(0, 24)}`,
        authorizedAt: d.lastSeenAt || Date.now(),
        peer: { ...d.descriptor, clientVersion: d.descriptor.clientVersion ?? null, harnessVersion: (d.descriptor as any).harnessVersion ?? null },
      }))
      json(res, 200, { items, nextCursor: null })
      return
    }

    // ---------------------------------------------------------------- 扫码配对
    if (method === 'POST' && path === '/api/v1/device-pairing/sessions') {
      rate(`pair:${ip}`, 30)
      const { body } = await rawBody(req)
      const parsed = pairingCreateSchema.parse(body)
      const existing = (() => { try { return store.get(parsed.device.deviceId) } catch { return undefined } })()
      const account = existing?.account ?? `device:${randomUUID()}`
      const pair = generateKeyPairSync('x25519')
      const publicDer = pair.publicKey.export({ type: 'spki', format: 'der' })
      const scanSecret = secret()
      const session: PairingSession = {
        id: randomUUID(),
        account,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL,
        recoverUntil: Date.now() + SESSION_TTL + RECOVER_MS,
        serverPrivate: pair.privateKey,
        serverPublicKey: serverPublicRaw(publicDer),
        scanHash: hash(scanSecret),
        scanSecret,
        host: parsed.device,
        state: 'created',
        attemptUsed: false,
      }
      ;(session as any).scanSecret = scanSecret
      pairing.set(session.id, session)
      scanIndex.set(session.scanHash, session.id)
      json(res, 200, offer(session))
      return
    }
    if (method === 'POST' && path === '/api/v1/device-pairing/resolve') {
      rate(`pair:${ip}`, 30)
      const { raw } = await rawBody(req)
      const { ticket } = pairingResolveSchema.parse(JSON.parse(raw))
      const id = scanIndex.get(hash(ticket))
      const s = id ? pairing.get(id) : undefined
      if (!s || s.state !== 'created' || s.expiresAt <= Date.now() || s.scanHash !== hash(ticket)) throw new ApiError('PAIRING_NOT_FOUND', 404)
      json(res, 200, offer(s))
      return
    }
    const claimMatch = /^\/api\/v1\/device-pairing\/sessions\/([0-9a-f-]{36})\/claim$/.exec(path)
    if (method === 'POST' && claimMatch) {
      const s = pairingOf(claimMatch[1]!)
      const { raw, body } = await rawBody(req)
      const parsed = pairingClaimSchema.parse(body)
      if (parsed.scanSecret !== (s as any).scanSecret) throw new ApiError('PAIRING_SCAN_INVALID', 401)
      if (s.state !== 'created' && s.state !== 'claimed') throw new ApiError('PAIRING_CLOSED', 409)
      if (s.mobile && (s.mobile.deviceId !== parsed.device.deviceId || s.mobile.identityKey !== parsed.device.identityKey)) throw new ApiError('PAIRING_DEVICE_CONFLICT', 409)
      verifyProof(s, 'mobile', parsed.device, path, raw, req.headers['x-dsh-pairing-proof'] as string | undefined)
      if (!s.mobile) { s.mobile = parsed.device; s.state = 'claimed'; s.code = code8() }
      json(res, 200, { state: s.state, verificationCode: s.code, expiresAt: s.expiresAt })
      return
    }
    const statusMatch = /^\/api\/v1\/device-pairing\/sessions\/([0-9a-f-]{36})\/(host|mobile)\/status$/.exec(path)
    if (method === 'POST' && statusMatch) {
      const s = pairingOf(statusMatch[1]!)
      const side = statusMatch[2] as PairingSide
      const { raw } = await rawBody(req)
      const device = side === 'host' ? s.host : s.mobile
      if (!device) throw new ApiError('PAIRING_NOT_CLAIMED', 409)
      verifyProof(s, side, device, path, raw, req.headers['x-dsh-pairing-proof'] as string | undefined)
      json(res, 200, pairingView(s, side))
      return
    }
    const cancelMatch = /^\/api\/v1\/device-pairing\/sessions\/([0-9a-f-]{36})\/(host|mobile)\/cancel$/.exec(path)
    if (method === 'POST' && cancelMatch) {
      const s = pairingOf(cancelMatch[1]!)
      const side = cancelMatch[2] as PairingSide
      const device = side === 'host' ? s.host : s.mobile
      if (!device) throw new ApiError('PAIRING_NOT_CLAIMED', 409)
      const { raw } = await rawBody(req)
      verifyProof(s, side, device, path, raw, req.headers['x-dsh-pairing-proof'] as string | undefined)
      if (!['completed', 'failed', 'cancelled', 'expired'].includes(s.state)) s.state = 'cancelled'
      json(res, 200, pairingView(s, side))
      return
    }
    const confirmMatch = /^\/api\/v1\/device-pairing\/sessions\/([0-9a-f-]{36})\/host\/confirm$/.exec(path)
    if (method === 'POST' && confirmMatch) {
      const s = pairingOf(confirmMatch[1]!)
      const { raw, body } = await rawBody(req)
      const parsed = pairingConfirmSchema.parse(body)
      verifyProof(s, 'host', s.host, path, raw, req.headers['x-dsh-pairing-proof'] as string | undefined)
      if (s.state === 'completed') { json(res, 200, pairingView(s, 'host')); return }
      if (s.state !== 'claimed') throw new ApiError('PAIRING_NOT_CLAIMED', 409)
      if (s.attemptUsed) {
        if (s.submissionId === parsed.submissionId && s.submissionRaw === raw) { json(res, 200, pairingView(s, 'host')); return }
        throw new ApiError('PAIRING_ATTEMPT_USED', 409)
      }
      s.attemptUsed = true
      s.submissionId = parsed.submissionId
      s.submissionCode = parsed.verificationCode
      s.submissionRaw = raw
      if (parsed.verificationCode !== s.code) {
        s.state = 'failed'; s.failureReason = 'verification_failed'; json(res, 200, pairingView(s, 'host')); return
      }
      s.state = 'approved'
      try {
        s.hostTokens = store.register(s.account, s.host as AccountDeviceDescriptor)
        s.mobileTokens = store.register(s.account, s.mobile! as AccountDeviceDescriptor)
        s.state = 'completed'
        ;(s as any).code = undefined
        json(res, 200, pairingView(s, 'host'))
      } catch (error) {
        s.state = 'failed'
        s.failureReason = error instanceof ApiError ? error.code : 'INTERNAL_ERROR'
        json(res, 200, pairingView(s, 'host'))
      }
      return
    }
    throw new ApiError('METHOD_NOT_FOUND', 404)
  }
  async function jsonBody(req: IncomingMessage): Promise<unknown> {
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new ApiError('INVALID_MESSAGE', 415)
    let length = 0
    const chunks: Buffer[] = []
    for await (const chunk of req) { length += chunk.length; if (length > 16384) throw new ApiError('FRAME_TOO_LARGE', 413); chunks.push(chunk) }
    try { return parseWireJson(Buffer.concat(chunks)) } catch { throw new ApiError('INVALID_MESSAGE') }
  }
  return { server, store, gateway, logger }
}

export const __test = { proofKey, verifyProof }
