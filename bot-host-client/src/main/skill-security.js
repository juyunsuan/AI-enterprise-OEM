'use strict';

/**
 * skill-security.js — 本机技能包的确定性安全门禁。
 *
 * 与平台侧 backend/src/feature/skill-review.rules.ts 同一口径（六道行为红线 +
 * 硬编码密钥 + 内网地址），不依赖任何服务端模块。命中即拒装，不落盘。
 */

const MAX_HITS = 30;
const EXCERPT_MAX = 160;

const R1_SCAN_ABUSE =
  /\b(nmap|masscan|zmap|hydra\b|medusa\b|bruteforce|brute[-\s]force|port[-\s]scan)\b|端口扫描|扫描端口|撞库|暴力破解|批量注册|接码|短信轰炸|轰炸.{0,6}(短信|验证码)/i;
const R1_AUTO_SUBMIT =
  /自动(提交|发送|下单|发布|报名|投递)|直接提交表单|无需(用户)?确认.{0,12}(提交|发送|下单|投递)|跳过(二次)?确认.{0,8}(提交|发送)|form\.submit\s*\(|\.submit\s*\(\s*\)/i;
const R2_FAST_INTERVAL =
  /(?:sleep|delay|wait|interval|throttle|间隔|延迟)[^\d\n]{0,12}(\d{1,3})\s*(?:ms|毫秒)?(?![\d.]|\s*(?:s|sec|秒)\b)/i;
const R3_DEAD_LOOP = /\bwhile\s*\(\s*(?:true|1)\s*\)|\bfor\s*\(\s*;\s*;\s*\)/i;
const R3_BIG_CONCURRENCY =
  /(?:concurrency|并发(?:数|量)?|threads?|线程数?|workers?)[^\d\n]{0,10}(\d{3,})/i;

const SECRET_PATTERNS = [
  { name: '私钥块', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS AccessKeyId', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub Token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: 'Slack Token', re: /xox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: 'Google API Key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    name: '连接串内嵌口令',
    re: /\b(?:mysql|postgresql|postgres|redis|mongodb)(?:\+\w+)?:\/\/[^\s'"]*:[^\s'"]+@[^\s'"]+/i
  },
  {
    name: '明文密钥赋值',
    re: /\b(?:password|passwd|secret|access_key|accesskey|api_key|apikey|token)\s*[:=]\s*["'`][^"'`]{8,}["'`]/i
  },
  {
    name: '硬编码 Cookie/Authorization',
    re: /\b(?:cookie|authorization)\s*[:=]\s*["'`]?\s*(?:Bearer\s+)?[A-Za-z0-9_\-.=]{16,}/i
  }
];
const SECRET_PLACEHOLDER =
  /REPLACE_|CHANGE[-_]|change-me|change-this|your-|placeholder|example\.com|\.example|xxxxxxxx|<[^>]+>|\$\{|process\.env|\bTODO\b|not-real|fake|sk-xxx/i;

/** 高危命令：与平台 r1.4 同表，覆盖 rm -rf、下载即执行、反弹 shell、磁盘破坏等。 */
const DANGEROUS_COMMANDS = [
  {
    rule: 'r1.4-rm-rf',
    re: /\brm\s+(?:-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|--recursive\s+--force|--force\s+--recursive)\b/i
  },
  {
    rule: 'r1.4-curl-pipe-shell',
    re: /\b(?:curl|wget)\b[^\n]{0,160}\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/i
  },
  {
    rule: 'r1.4-reverse-shell',
    re: /\b(?:nc|ncat|netcat|socat)\b[^\n]{0,80}\s(?:-e|exec[:=])/i
  },
  { rule: 'r1.4-dev-tcp', re: /\/dev\/tcp\//i },
  { rule: 'r1.4-disk', re: /\b(?:dd\s+if=|mkfs(?:\.|\s)|wipefs|fdisk|parted)\b/i },
  {
    rule: 'r1.4-shutdown',
    re: /\b(?:shutdown|reboot|poweroff|halt)\b|systemctl\s+(?:stop|disable|mask)/i
  },
  { rule: 'r1.4-fork-bomb', re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/ },
  {
    rule: 'r1.4-base64-shell',
    re: /\bbase64\s+(?:-d|--decode)\b[^\n]{0,60}\|\s*(?:ba|z|da)?sh\b/i
  },
  {
    rule: 'r1.4-chmod-root',
    re: /\bchmod\s+(?:-R\s+)?777\s+\/(?!\S)|chown\s+(?:-R\s+)?root\b/i
  },
  {
    rule: 'r1.4-kernel',
    re: /\b(?:insmod|modprobe|ptrace)\b|\bmount\s+(?:-o\s+)?\//i
  },
  {
    rule: 'r1.4-powershell-enc',
    re: /\bpowershell(?:\.exe)?\s+(?:-enc|-encodedcommand)\b/i
  },
  {
    rule: 'r1.4-miner',
    re: /\b(?:xmrig|minerd|cpuminer|ethminer|nbminer|lolminer|phoenixminer)\b|stratum\+(?:tcp|tls):\/\//i
  }
];

const MONERO_WALLET = /\b[48][0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b/;
const OBFUSCATION_PATTERNS = [
  /(?:\\x[0-9a-f]{2}){16,}/i,
  /\b(?:eval|exec)\s*\(\s*(?:atob|base64_decode|Buffer\.from)\s*\(/i,
  /\b(?:base64\s+-d|--decode)\b[^\n]{0,40}\|\s*(?:ba|z|da)?sh\b/i,
  /String\.fromCharCode\s*\([^)]{40,}\)/
];

const R6_INTERNAL_ADDRESS = [
  /\b127\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  /\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/,
  /\b192\.168\.\d{1,3}\.\d{1,3}\b/,
  /\b169\.254\.\d{1,3}\.\d{1,3}\b/,
  /\b100\.64\.\d{1,3}\.\d{1,3}\b/,
  /\blocalhost\b/i,
  /\.internal\b/i,
  /\bmetadata\.google\b/i
];

const URL_HOST_RE = /https?:\/\/([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])/g;

const RESERVED_SECRETS = new Set([
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'JWT_SECRET',
  'AUTH_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'CONTENT_ENCRYPTION_KEY',
  'SMTP_PASSWORD',
  'REDIS_URL',
  'AWS_SECRET_ACCESS_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY'
]);

function hit(rule, file, text) {
  return {
    rule,
    file: String(file || ''),
    excerpt: String(text || '').replace(/\s+/g, ' ').trim().slice(0, EXCERPT_MAX)
  };
}

function scanText(file) {
  const hits = [];
  const content = String(file.content || '');
  for (const line of content.split(/\r?\n/)) {
    if (R1_SCAN_ABUSE.test(line) || R1_AUTO_SUBMIT.test(line)) {
      hits.push(hit('r1-scan-abuse', file.path, line));
    }
    const fast = R2_FAST_INTERVAL.exec(line);
    if (fast && Number(fast[1]) > 0) hits.push(hit('r2-fast-interval', file.path, line));
    if (R3_DEAD_LOOP.test(line)) hits.push(hit('r3-dead-loop', file.path, line));
    const big = R3_BIG_CONCURRENCY.exec(line);
    if (big && Number(big[1]) >= 100) hits.push(hit('r3-big-concurrency', file.path, line));
    for (const re of R6_INTERNAL_ADDRESS) {
      if (re.test(line)) {
        hits.push(hit('r6-internal-address', file.path, line));
        break;
      }
    }
    for (const rule of DANGEROUS_COMMANDS) {
      if (rule.re.test(line)) hits.push(hit(rule.rule, file.path, line));
    }
    if (MONERO_WALLET.test(line)) hits.push(hit('r1.1-miner-wallet', file.path, line));
    for (const re of OBFUSCATION_PATTERNS) {
      if (re.test(line)) {
        hits.push(hit('r1.1-obfuscation', file.path, line));
        break;
      }
    }
    for (const pattern of SECRET_PATTERNS) {
      const found = pattern.re.exec(line);
      if (!found) continue;
      if (SECRET_PLACEHOLDER.test(found[0]) || SECRET_PLACEHOLDER.test(line)) continue;
      hits.push(hit('r5-hardcoded-secret(' + pattern.name + ')', file.path, line));
    }
  }
  URL_HOST_RE.lastIndex = 0;
  const checked = new Set();
  let match;
  while ((match = URL_HOST_RE.exec(content))) {
    const host = match[1];
    if (checked.has(host)) continue;
    checked.add(host);
    if (isBlacklistedHost(host)) {
      hits.push(hit('r4-blacklisted-domain', file.path, 'http://' + host));
    }
  }
  return hits;
}

/**
 * 域名黑名单：默认空表（平台未下发时只跑本地确定性规则）。
 * 传入条目格式 { type:'domain'|'ip'|'cidr', value }。
 */
function isBlacklistedHost(host, blacklist) {
  const value = String(host || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!value) return false;
  return (Array.isArray(blacklist) ? blacklist : []).some((entry) => {
    if (!entry || !entry.value) return false;
    const target = String(entry.value).toLowerCase();
    if (entry.type === 'domain') return value === target || value.endsWith('.' + target);
    if (entry.type === 'ip') return value === target;
    const parts = target.split('/');
    const prefix = parts[0]
      .split('.')
      .slice(0, Number(parts[1]) > 8 ? 3 : 2)
      .join('.');
    return value.startsWith(prefix + '.');
  });
}

/**
 * 扫描技能包正文。files: [{ path, content }]。
 * 返回 { ok, hits, failure }，failure 是可直接展示的中文原因。
 */
function scanSkillPackage(files, options) {
  const opts = options || {};
  const list = Array.isArray(files) ? files : [];
  const hits = [];
  for (const file of list) {
    if (!file || typeof file.content !== 'string') continue;
    hits.push(...scanText({ path: file.path, content: file.content }));
    if (hits.length >= MAX_HITS) break;
  }
  const unique = [];
  const seen = new Set();
  for (const item of hits) {
    const key = item.rule + '|' + item.file + '|' + item.excerpt;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  const failure = unique.length
    ? '技能包未通过本机安全检查：' +
      unique
        .slice(0, 3)
        .map((item) => (item.file ? item.file + '：' : '') + item.excerpt)
        .join('；') +
      (unique.length > 3 ? '；另有 ' + (unique.length - 3) + ' 项命中' : '') +
      '。未安装。'
    : '';
  return { ok: !unique.length, hits: unique, failure };
}

/** 运行时复扫：load_skill 读取正文前调用，命中即拒绝本轮读取。 */
function scanRuntimeContent(content) {
  return scanSkillPackage([{ path: 'SKILL.md', content }]);
}

/* ------------------------------------------------------------- 权限声明解析 */

const TOP_LEVEL_RE = /^([A-Za-z_][\w.-]*)\s*:\s*(.*)$/;
const LIST_ITEM_RE = /^-\s+(.*)$/;

function stripQuotes(value) {
  const text = String(value || '').trim();
  if (/^(['"]).*\1$/.test(text)) return text.slice(1, -1);
  return text;
}

function listOf(raw) {
  if (Array.isArray(raw)) return raw.map((item) => stripQuotes(item)).filter(Boolean);
  const text = stripQuotes(raw);
  if (!text) return [];
  return text
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((item) => stripQuotes(item))
    .filter(Boolean);
}

function emptyPermissions() {
  return { network: [], fs: [], exec: [], secrets: [] };
}

function parsePermissionsBlock(lines, start) {
  const permissions = emptyPermissions();
  let current = '';
  let index = start;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) break;
    const trimmed = line.trim();
    const item = LIST_ITEM_RE.exec(trimmed);
    if (item && current) {
      permissions[current] = [...(permissions[current] || []), stripQuotes(item[1])];
      continue;
    }
    const pair = TOP_LEVEL_RE.exec(trimmed);
    if (pair) {
      current = pair[1].toLowerCase();
      permissions[current] = pair[2] ? listOf(pair[2]) : [];
    }
  }
  return { permissions, end: index };
}

/**
 * 解析 SKILL.md 的 frontmatter：名称、说明、触发时机、声明权限与托管标记。
 * 权限只认 network / fs / exec / secrets 四组；未知组忽略。
 */
function parseSkillMeta(markdown) {
  const text = String(markdown || '').replace(/^\uFEFF/, '');
  const meta = {
    name: '',
    description: '',
    whenToUse: '',
    permissions: emptyPermissions(),
    managed: /#\s*(?:dsh-go|awbotdsh):managed/.test(text)
  };
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) return meta;
  const lines = frontmatter[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line)) continue;
    const pair = TOP_LEVEL_RE.exec(line.trim());
    if (!pair) continue;
    const key = pair[1].toLowerCase();
    const value = stripQuotes(pair[2]);
    if (key === 'name') meta.name = value;
    if (key === 'description') meta.description = value;
    if (key === 'whentouse') meta.whenToUse = value;
    if (key === 'permissions') {
      if (value && value.startsWith('{')) {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            for (const [name, raw] of Object.entries(parsed)) {
              if (name in meta.permissions) meta.permissions[name] = listOf(raw);
            }
          }
        } catch (err) {
          /* 内联对象写坏按空权限处理 */
        }
      } else if (!value) {
        const block = parsePermissionsBlock(lines, index + 1);
        meta.permissions = Object.assign(meta.permissions, block.permissions);
        index = block.end - 1;
      }
    }
    if (key.startsWith('permissions.')) {
      const name = key.slice('permissions.'.length);
      if (name in meta.permissions) meta.permissions[name] = listOf(value);
    }
  }
  return meta;
}

function hasDeclaredPermissions(permissions) {
  const bag = permissions || emptyPermissions();
  return ['network', 'fs', 'exec', 'secrets'].some(
    (key) => Array.isArray(bag[key]) && bag[key].length > 0
  );
}

function describePermissions(permissions) {
  const bag = permissions || emptyPermissions();
  const labels = { network: '访问网络域名', fs: '读写文件', exec: '执行命令', secrets: '使用密钥' };
  const lines = [];
  for (const key of ['network', 'fs', 'exec', 'secrets']) {
    for (const entry of bag[key] || []) lines.push(labels[key] + ' ' + entry);
  }
  return lines;
}

function reservedSecrets(permissions) {
  const bag = permissions || emptyPermissions();
  return (bag.secrets || []).filter((name) => RESERVED_SECRETS.has(String(name).toUpperCase()));
}

module.exports = {
  scanSkillPackage,
  scanRuntimeContent,
  parseSkillMeta,
  hasDeclaredPermissions,
  describePermissions,
  reservedSecrets,
  isBlacklistedHost
};
