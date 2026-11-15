import path from "node:path";
import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:1690";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // 关闭开发环境的 Next.js 指示器（左下角那个 N 浮层）
  devIndicators: false,
  experimental: {
    // dev 的 Turbopack 落盘缓存会持续膨胀（本机曾涨到 87GB），且 SST 文件被回收/占用后
    // 启动会直接 panic（Unable to open static sorted file ... os error 2），
    // 表现为编译 worker 反复重启，最终抛出「Jest worker encountered N child process exceptions」。
    // 改走内存缓存：重启慢一些，但不会再有脏缓存引发的崩溃。
    turbopackFileSystemCacheForDev: false,
  },
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  // 本机开发没有 Nginx 时，让 Next 自己把同源 /api/* 透传给 Hono 后端。
  // 生产由 Nginx 先把 /api/* 交给 Hono，Next 收不到这些请求，故此处仅在非生产生效。
  async rewrites() {
    // 活码落地页 `/s/:code` 始终转发给后端（客户 CDN 只改回源 Host，不需要配 URL 改写）
    // GEO 独立站的本站路径 `/geo-site/:slug/*` 同理：主站域名下也能看整个站点，
    // 生产环境泛子域/自定义域名由 Nginx 直接交给后端按 Host 反查，不经过 Next。
    const publicPaths = [
      { source: "/s/:code", destination: `${backendUrl}/api/public/lk/s/:code` },
      { source: "/geo-site/:slug", destination: `${backendUrl}/geo-site/:slug` },
      // 子页面与爬虫三件套（robots/sitemap/llms）都走同一条：整站是多页结构
      {
        source: "/geo-site/:slug/:path*",
        destination: `${backendUrl}/geo-site/:slug/:path*`,
      },
    ];
    if (process.env.NODE_ENV === "production") return publicPaths;
    return [
      ...publicPaths,
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      // 模型广场的 OpenAI 兼容网关挂在后端根路径 /v1，本机没有 Nginx 时也透传，
      // 这样页面里给出的调用示例可以直接跑通。
      { source: "/v1/:path*", destination: `${backendUrl}/v1/:path*` },
    ];
  },
  // 平台管理后台入口落到侧栏菜单的第一个板块（板块清单见 src/config/routes.ts 的 ADMIN_SECTIONS）
  async redirects() {
    return [
      { source: "/admin", destination: "/admin/users", permanent: false },
      // 平台数据总览已并入驾驶舱，旧地址重定向避免站内收藏/历史链接失效
      { source: "/admin/overview", destination: "/dashboard", permanent: false },
      // AIPDD Key 绑定已并入「模型服务 → API Key 管理」，旧地址重定向避免站内收藏/历史链接失效
      {
        source: "/developer/aipdd",
        destination: "/developer/keys",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
