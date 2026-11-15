'use strict';

/**
 * 指纹档案 → 内核启动参数。
 *
 * 参数以 fingerprint-chromium（Chrome 139+）的协议为准：
 *   --fingerprint=<32 位整数种子>
 *   --fingerprint-platform=windows|macos|linux
 *   --fingerprint-brand=Chrome
 *   --fingerprint-hardware-concurrency=<n>
 *   --timezone= / --lang= / --accept-lang=
 *   --disable-non-proxied-udp            （WebRTC 只走代理）
 *   --disable-spoofing=canvas,audio      （关闭对应噪声）
 *   --proxy-server=http://127.0.0.1:<port>（本地认证转发，内核不支持带密码的代理）
 *   --load-extension=<dir1,dir2>
 *   --remote-debugging-address/port       （仅回环，供管理器与 Agent 用）
 */

const PLATFORM_MAP = { win: 'windows', mac: 'macos', linux: 'linux' };

function normalizeLanguages(list) {
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const value = String(item || '').trim().slice(0, 20);
    if (value && !out.includes(value)) out.push(value);
    if (out.length >= 8) break;
  }
  return out;
}

function buildArgs(profile, options) {
  const opts = options || {};
  if (!profile || !profile.seed) throw new Error('指纹档案缺少种子');
  const seed = Number(profile.seed);
  if (!Number.isInteger(seed) || seed <= 0) throw new Error('指纹种子不合法');
  const platform = PLATFORM_MAP[profile.platform] || 'windows';
  const args = [
    '--user-data-dir=' + opts.profileDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    '--fingerprint=' + seed,
    '--fingerprint-platform=' + platform,
    '--fingerprint-brand=Chrome'
  ];
  const cores = Number(profile.hardwareConcurrency) || 0;
  if (cores >= 2 && cores <= 64) {
    args.push('--fingerprint-hardware-concurrency=' + Math.round(cores));
  }
  const timezone = String(profile.timezone || '').trim();
  if (timezone) args.push('--timezone=' + timezone.slice(0, 64));
  const languages = normalizeLanguages(profile.languages);
  if (languages.length) {
    args.push('--lang=' + languages[0]);
    args.push('--accept-lang=' + languages.join(','));
  }
  const webrtc = profile.webrtcMode === 'disable' ? 'disable' : profile.webrtcMode === 'real' ? 'real' : 'proxy';
  if (webrtc !== 'real') args.push('--disable-non-proxied-udp');
  const disabled = [];
  if (profile.canvasNoise === 'off') disabled.push('canvas');
  if (profile.audioNoise === 'off') disabled.push('audio');
  if (disabled.length) args.push('--disable-spoofing=' + disabled.join(','));
  if (opts.relayPort) {
    args.push('--proxy-server=http://127.0.0.1:' + Number(opts.relayPort));
  }
  if (Array.isArray(opts.extensionDirs) && opts.extensionDirs.length) {
    args.push('--load-extension=' + opts.extensionDirs.join(','));
  }
  args.push('--remote-debugging-address=127.0.0.1');
  args.push('--remote-debugging-port=' + Number(opts.cdpPort));
  // Chrome 111+ 默认拒绝带 Origin 的 DevTools WebSocket；管理器只在本机连，放开来源。
  args.push('--remote-allow-origins=*');
  args.push('--window-size=' + (Number(opts.width) || 1280) + ',' + (Number(opts.height) || 800));
  if (opts.startUrl) args.push(String(opts.startUrl));
  return args;
}

/** 保存/打开前的一致性提示（阻断项由 profiles 校验负责，这里只给建议）。 */
function consistency(profile) {
  const hints = [];
  if (!profile) return hints;
  if (profile.canvasNoise !== 'off') {
    hints.push('当前内核的 Canvas 噪声在部分页面（toDataURL）会卡死渲染进程，建议关闭');
  }
  if (profile.audioNoise === 'strict') {
    hints.push('严格噪声可能更容易被识别为“过度伪装”，一般用默认轻噪即可');
  }
  if (profile.webrtcMode === 'real') {
    hints.push('WebRTC 真实模式可能暴露本机 IP，建议代理模式下保持默认（只走代理）');
  }
  if (profile.platform === 'win' && profile.timezone && /^America\//.test(profile.timezone)) {
    hints.push('Windows 指纹 + 美洲时区组合较少见，建议用时区与代理出口地区对齐');
  }
  if (profile.proxy && profile.proxy.mode === 'proxy' && profile.proxy.authMode === 'password' && !profile.proxy.user) {
    hints.push('代理认证方式为账号密码，但账号为空；如为 IP 白名单模式请切换认证方式');
  }
  return hints;
}

module.exports = { buildArgs, consistency, normalizeLanguages, PLATFORM_MAP };