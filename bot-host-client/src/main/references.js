'use strict';

/**
 * references.js — 对话「本地上传参考文件」的读取闸门。
 *
 * 只把 UTF-8 文本喂给模型，并且逐条给出「为什么没带上」：
 *   · 一轮最多 8 个文件、单个 2MB、单个 6 万字、本轮合计 12 万字；
 *   · 目录、读不到、含 NUL（当成二进制）一律跳过并说明原因。
 * 正文只在发送那一轮进模型上下文，不落库（库里只留名字 / 路径 / 大小）。
 */

const fs = require('fs');
const path = require('path');

const MAX_FILES = 8;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CHARS = 60_000;
const TOTAL_CHARS = 120_000;

const FILTERS = [
  {
    name: '文本与代码',
    extensions: [
      'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'yaml', 'yml', 'ini', 'toml',
      'js', 'ts', 'tsx', 'jsx', 'py', 'go', 'java', 'rs', 'css', 'html', 'xml', 'sql', 'sh', 'log'
    ]
  },
  { name: '所有文件', extensions: ['*'] }
];

function nameOf(filePath) {
  return path.basename(String(filePath || ''));
}

/** 系统文件对话框选完之后：只留真实存在、是文件、没超单文件上限的项。 */
function describePicked(filePaths) {
  const files = [];
  const skipped = [];
  for (const filePath of Array.isArray(filePaths) ? filePaths : []) {
    const name = nameOf(filePath);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        skipped.push(name + '（不是文件）');
        continue;
      }
      if (stat.size > MAX_BYTES) {
        skipped.push(name + '（超过 2MB）');
        continue;
      }
      if (files.length >= MAX_FILES) {
        skipped.push(name + '（单轮最多 ' + MAX_FILES + ' 个文件）');
        continue;
      }
      files.push({ name, path: filePath, size: stat.size });
    } catch (err) {
      skipped.push(name + '（读不到）');
    }
  }
  return { files, skipped };
}

/** 发送本轮时读正文：返回给模型的列表 + 没带上的原因列表。 */
function readReferences(items) {
  const references = [];
  const skipped = [];
  let total = 0;
  const list = Array.isArray(items) ? items : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const filePath = typeof item === 'string' ? item : String((item && item.path) || '');
    const name = (item && item.name) || nameOf(filePath);
    if (!filePath) continue;
    if (references.length >= MAX_FILES) {
      skipped.push(name + '（单轮最多 ' + MAX_FILES + ' 个文件）');
      continue;
    }
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        skipped.push(name + '（不是文件）');
        continue;
      }
      if (stat.size > MAX_BYTES) {
        skipped.push(name + '（超过 2MB）');
        continue;
      }
      const buffer = fs.readFileSync(filePath);
      if (buffer.includes(0)) {
        skipped.push(name + '（不是文本文件）');
        continue;
      }
      const room = TOTAL_CHARS - total;
      if (room <= 0) {
        skipped.push(name + '（本轮参考文件总量已满）');
        continue;
      }
      const content = buffer.toString('utf8').slice(0, Math.min(MAX_CHARS, room));
      total += content.length;
      references.push({ name, path: filePath, size: stat.size, content });
    } catch (err) {
      skipped.push(name + '（读不到）');
    }
  }
  return { references, skipped };
}

module.exports = { MAX_FILES, MAX_BYTES, MAX_CHARS, TOTAL_CHARS, FILTERS, describePicked, readReferences };
