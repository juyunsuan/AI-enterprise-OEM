#!/usr/bin/env node
/**
 * mini-core 分发器：把 shared/mini-core/core.js 复制进各小程序模板的 utils/core.js。
 *
 * 模板是「源码即产物」的原生小程序包（没有 npm、没有构建步骤），所以共用代码只能
 * 靠构建期注入落地；`--check` 模式给 CI 与 check:architecture 用，只比哈希、绝不写文件。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const source = path.join(root, 'shared', 'mini-core', 'core.js');

/** 原生小程序模板目录（仓库根，按新增工具持续登记）。 */
export const TEMPLATES = [
  'miniprogram',
  'miniprogram-kp',
  'miniprogram-onsite',
  'brand-mall-miniprogram',
  'takeout-miniprogram',
  'miniprogram-health',
  'mp-miniprogram',
  'miniprogram-dh',
  'card-shop-miniprogram',
  'kuaidi-miniprogram',
  'errand-miniprogram',
  'circle-miniprogram',
  'miniprogram-rental',
  'quiz-miniprogram',
  'park-miniprogram',
];

export function targetOf(template) {
  return path.join(root, template, 'utils', 'core.js');
}

/**
 * ES5 语法底线：这份真源会被微信基础库**直接执行**，card-shop 等老端解析器碰到 ES6
 * 语法是整份文件报语法错（打开就白屏），不是少一个功能。口头约定守不住，所以这里拦死。
 * 判定前先剥掉块注释与行注释，免得注释里提到某个词就误报。
 */
export function es5Violations(text) {
  const code = String(text)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  const bans = [
    [/=>/, '箭头函数（ES6）'],
    [/\b(?:const|let)\s/, 'const / let（ES6）'],
    [/`/, '模板字符串（ES6）'],
    [/\.\.\./, '展开或剩余运算符（ES6）'],
    [/,\s*\)/, '调用参数尾逗号（ES2017，老解析器直接语法错）'],
    [/\bclass\s+\w/, 'class 声明（ES6）'],
    [/\bObject\.assign\b/, 'Object.assign（ES6 内建，老端不保证有）'],
    [/\bfunction\s*\([^)]*=[^)]*\)/, '函数参数默认值（ES6）'],
  ];
  return bans.filter((ban) => ban[0].test(code)).map((ban) => ban[1]);
}

/** 真源越界的报告文本；null 表示合格。sync 与架构检查共用同一份判定。 */
export function sourceViolationReport() {
  const bad = es5Violations(readFileSync(source, 'utf8'));
  if (!bad.length) return null;
  const lines = ['core.js 越出 ES5 底线，老基础库会整份文件语法错：'];
  bad.forEach((item) => lines.push(`- ${item}`));
  return lines.join('\n');
}

function hash(content) {
  return createHash('sha256').update(content).digest('hex');
}

/** 返回不一致（或缺失）的模板相对路径清单，供 sync / check 与架构检查复用。 */
export function diff() {
  const wanted = readFileSync(source);
  const bad = [];
  for (const template of TEMPLATES) {
    const file = targetOf(template);
    let current = null;
    try {
      current = readFileSync(file);
    } catch {
      current = null;
    }
    if (current === null || hash(current) !== hash(wanted)) {
      bad.push(path.relative(root, file).split(path.sep).join('/'));
    }
  }
  return bad;
}

function main() {
  const check = process.argv.includes('--check');
  const report = sourceViolationReport();
  if (report) {
    console.error(report);
    process.exitCode = 1;
    return;
  }
  if (!check) {
    const wanted = readFileSync(source);
    for (const template of TEMPLATES) {
      const file = targetOf(template);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, wanted);
    }
    console.log(
      `mini-core 已注入 ${TEMPLATES.length} 个模板（sha256 ${hash(wanted).slice(0, 12)}）`,
    );
    return;
  }
  const drifted = diff();
  if (drifted.length) {
    console.error(
      `mini-core 与模板内的副本不一致（${drifted.length} 个），请跑 node shared/mini-core/sync.mjs：\n${drifted.join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `mini-core 校验通过（${TEMPLATES.length} 个模板，sha256 ${hash(readFileSync(source)).slice(0, 12)}）`,
  );
}

// 作为脚本直接执行时才跑 main，被 check-architecture import 时只导出纯函数。
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
