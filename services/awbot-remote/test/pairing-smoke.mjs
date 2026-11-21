import { createHash, createHmac, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from 'node:crypto'

const base = process.env.REMOTE_BASE || 'http://127.0.0.1:18081'
const raw = (pub) => pub.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64url')
const keypair = () => {
  const pair = generateKeyPairSync('x25519')
  return { privateKey: pair.privateKey, publicKey: raw(pair.publicKey) }
}
const pubKey = (value) => createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), Buffer.from(value, 'base64url')]), format: 'der', type: 'spki' })
const proof = (privateKey, serverPublicKey, sessionId, side, path, body) => {
  const shared = diffieHellman({ privateKey, publicKey: pubKey(serverPublicKey) })
  const key = Buffer.from(hkdfSync('sha256', shared, Buffer.from(sessionId), Buffer.from(`dsh-pairing-v1/${side}`), 32))
  const digest = createHash('sha256').update(body).digest('hex')
  return createHmac('sha256', key).update(`POST\n${path}\n${digest}`).digest('base64url')
}
const post = async (path, body, headers = {}) => {
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${text}`)
  return JSON.parse(text)
}

const host = keypair(), mobile = keypair()
const device = (id, name, role, key) => ({ deviceId: id, name, role, platform: role === 'host' ? 'desktop' : 'android', identityKey: key })
const createBody = JSON.stringify({ v: 1, device: device('019a0000-0000-7000-8000-000000000011', 'smoke-host', 'host', host.publicKey) })
const created = await post('/api/v1/device-pairing/sessions', createBody)
console.log('created', created.sessionId)

const claimBody = JSON.stringify({ scanSecret: created.scanSecret, device: device('019a0000-0000-7000-8000-000000000012', 'smoke-phone', 'client', mobile.publicKey) })
const claimPath = `/api/v1/device-pairing/sessions/${created.sessionId}/claim`
const claimed = await post(claimPath, claimBody, { 'x-dsh-pairing-proof': proof(mobile.privateKey, created.serverPublicKey, created.sessionId, 'mobile', claimPath, claimBody) })
console.log('claimed', claimed.state, claimed.verificationCode)

const confirmBody = JSON.stringify({ submissionId: 'smoke-submission-0001', verificationCode: claimed.verificationCode })
const confirmPath = `/api/v1/device-pairing/sessions/${created.sessionId}/host/confirm`
const confirmed = await post(confirmPath, confirmBody, { 'x-dsh-pairing-proof': proof(host.privateKey, created.serverPublicKey, created.sessionId, 'host', confirmPath, confirmBody) })
console.log('confirmed', confirmed.state, Boolean(confirmed.credentials?.tokens?.accessToken))

const statusBody = '{}'
const statusPath = `/api/v1/device-pairing/sessions/${created.sessionId}/mobile/status`
const status = await post(statusPath, statusBody, { 'x-dsh-pairing-proof': proof(mobile.privateKey, created.serverPublicKey, created.sessionId, 'mobile', statusPath, statusBody) })
console.log('mobile status', status.state, Boolean(status.credentials?.tokens?.refreshToken))
if (confirmed.state !== 'completed' || status.state !== 'completed') process.exitCode = 1
console.log('mobile-token', status.credentials?.tokens?.accessToken)
