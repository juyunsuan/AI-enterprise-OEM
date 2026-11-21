import { createRemoteServer } from './server.js'

const port = Number(process.env.DSH_SERVER_PORT || 8081)
const platformUrl = process.env.AIPDD_PLATFORM_URL || 'http://127.0.0.1:1690'
const dataFile = process.env.DSH_SERVER_DATA_FILE || 'data/state.json'

async function resolvePublicUrl(): Promise<string> {
  const configured = String(process.env.DSH_SERVER_PUBLIC_URL || '').trim()
  if (configured) return configured
  // 管理员在后台设置站点域名后，Remote 直接跟随，不再维护第二份域名配置。
  try {
    const response = await fetch(`${platformUrl.replace(/\/+$/, '')}/api/site-config`, {
      signal: AbortSignal.timeout(5000),
    })
    const body: any = await response.json().catch(() => null)
    const siteUrl = String(body?.siteUrl || body?.data?.siteUrl || '').trim()
    if (siteUrl) return new URL(siteUrl).origin
  } catch {
    /* 平台未起时退回本机 origin，部署后重启即可跟随 */
  }
  return `http://127.0.0.1:${port}`
}

const publicUrl = await resolvePublicUrl()
const { server } = createRemoteServer({ dataFile, publicUrl, platformUrl })
server.listen(port, process.env.DSH_SERVER_HOST || '0.0.0.0', () => {
  console.log(`awbot-remote listening on ${port}, public ${publicUrl}, platform ${platformUrl}`)
})
