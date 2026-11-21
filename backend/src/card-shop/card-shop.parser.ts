import {
  CARD_SHOP_IMPORT_SPLITTER_LABELS,
  type CardShopCardFormat,
  type CardShopImportSplitter,
} from '@enterprise/contracts';

const BOM = /^\uFEFF/;
const CRLF = /\r\n?/g;

/** AUTO 的分隔符优先级：越不像卡号卡密自带字符的分隔符越先试。 */
const SPLIT_CANDIDATES: Array<{
  splitter: CardShopImportSplitter;
  tokens: string[];
}> = [
  { splitter: 'DASH', tokens: ['----'] },
  { splitter: 'TAB', tokens: ['\t'] },
  { splitter: 'PIPE', tokens: ['|', '｜'] },
  { splitter: 'COMMA', tokens: [',', '，'] },
  { splitter: 'SPACE', tokens: [' ', '　'] },
  { splitter: 'DASH', tokens: ['-'] },
];

/** 卡号与卡密的入库上限（对齐 card_shop_cards 的 VarChar(191)）。 */
export const CARD_FIELD_MAX = 191;

export type ParsedCardLine = { line: number; number: string; secret: string };

export type ParsedCards = {
  /** 参与解析的非空行数 */
  totalLines: number;
  items: ParsedCardLine[];
  invalid: Array<{ line: number; reason: string }>;
  /** 与本次导入内已出现过的卡重复的行数 */
  duplicateLines: number;
  splitterUsed: CardShopImportSplitter;
};

export function splitterLabel(value: string): string {
  return CARD_SHOP_IMPORT_SPLITTER_LABELS[value] ?? String(value ?? '');
}

/** 去重键：用 JSON 数组序列化，避免卡号里出现分隔符时把两行并成一行。 */
export function cardDedupKey(number: string, secret: string): string {
  return JSON.stringify([number, secret]);
}

/**
 * 纯解析：粘贴文本 → 卡号 / 卡密行。
 *
 * 短横线本身就是卡号的常见字符（ABCD-1234 这种），所以 AUTO 只有在抽样里每一行都能用
 * 同一分隔符切出两侧非空内容时才认它，且四个横杠优先级高于单横杠；SINGLE（只发卡密）
 * 不做切分，整行即卡密，否则会把一行卡密拆成半张卡。
 */
export function parseCardLines(
  raw: string,
  splitter: CardShopImportSplitter,
  format: CardShopCardFormat,
): ParsedCards {
  const text = String(raw ?? '')
    .replace(BOM, '')
    .replace(CRLF, '\n');
  const nonEmpty = text
    .split('\n')
    .map((value, index) => ({ value: value.trim(), line: index + 1 }))
    .filter((row) => row.value.length > 0);

  const needsSplit = format === 'PAIR' && splitter !== 'NONE';
  const candidate = needsSplit
    ? resolveSplitter(
        nonEmpty.slice(0, 20).map((row) => row.value),
        splitter,
      )
    : null;

  const items: ParsedCardLine[] = [];
  const invalid: ParsedCards['invalid'] = [];
  const seen = new Set<string>();
  let duplicateLines = 0;

  for (const row of nonEmpty) {
    let number = '';
    let secret = row.value;
    if (needsSplit) {
      if (!candidate) {
        invalid.push({
          line: row.line,
          reason: '卡号+卡密商品没识别出分隔符，可用空格、逗号、竖线或四个横杠',
        });
        continue;
      }
      const split = splitCardLine(row.value, candidate.token);
      if (!split) {
        invalid.push({
          line: row.line,
          reason: `该行没切出卡号与卡密（分隔符「${candidate.token.trim() || '空格'}」两侧都要有内容）`,
        });
        continue;
      }
      number = split.number;
      secret = split.secret;
    }
    if (secret.length > CARD_FIELD_MAX) {
      invalid.push({
        line: row.line,
        reason: `卡密超过 ${CARD_FIELD_MAX} 个字符，已跳过`,
      });
      continue;
    }
    if (number.length > CARD_FIELD_MAX) {
      invalid.push({
        line: row.line,
        reason: `卡号超过 ${CARD_FIELD_MAX} 个字符，已跳过`,
      });
      continue;
    }
    const key = cardDedupKey(number, secret);
    if (seen.has(key)) {
      duplicateLines += 1;
      continue;
    }
    seen.add(key);
    items.push({ line: row.line, number, secret });
  }

  return {
    totalLines: nonEmpty.length,
    items,
    invalid,
    duplicateLines,
    splitterUsed: candidate ? candidate.splitter : needsSplit ? 'AUTO' : 'NONE',
  };
}

/**
 * 识别分隔符：显式指定时只认它；AUTO 时按优先级取第一个「能切开绝大多数样例」的候选。
 *
 * 用多数而不是「每行都必须」：真实文件里夹一两行漏写卡号很常见，严格要求会让整批导入
 * 报「没识别出分隔符」，反而把那几百行本来正常的卡也判成无效。
 */
function resolveSplitter(
  samples: string[],
  splitter: CardShopImportSplitter,
): { splitter: CardShopImportSplitter; token: string } | null {
  if (!samples.length) return null;
  const needed = Math.max(1, Math.ceil(samples.length * 0.6));
  for (const candidate of SPLIT_CANDIDATES) {
    if (splitter !== 'AUTO' && candidate.splitter !== splitter) continue;
    for (const token of candidate.tokens) {
      const hit = samples.filter(
        (value) => splitCardLine(value, token) !== null,
      ).length;
      if (hit >= needed) return { splitter: candidate.splitter, token };
    }
  }
  return null;
}

/**
 * 在分隔符第一次出现处切一刀：前段是卡号，其余全部算卡密。
 * 只切第一处，所以卡密里带空格或逗号不会被拆散。
 */
export function splitCardLine(
  value: string,
  token: string,
): { number: string; secret: string } | null {
  const index = value.indexOf(token);
  if (index <= 0) return null;
  const number = value.slice(0, index).trim();
  const secret = value.slice(index + token.length).trim();
  if (!number || !secret) return null;
  return { number, secret };
}
