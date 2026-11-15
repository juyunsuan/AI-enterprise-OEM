'use strict';

/**
 * prepare-native.js — 把 better-sqlite3 的原生二进制换成 Electron ABI 版本。
 *
 * 为什么需要：better-sqlite3 是原生模块，npm install 默认按本机 Node 的 ABI 编译；
 * Electron 31 内置的是 Node 20（ABI 125），与开发机 Node 24 不同，直接 require 会报
 * NODE_MODULE_VERSION 不匹配。这里用官方预编译包（不编译、不需要 VS），一次到位。
 *
 * 用法：
 *   npm run prepare:native        # 已是对应 Electron 版本则跳过
 *   npm run prepare:native -- --force
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MODULE_DIR = path.join(ROOT, 'node_modules', 'better-sqlite3');
const BINARY = path.join(MODULE_DIR, 'build', 'Release', 'better_sqlite3.node');
const ELECTRON_VERSION = String(require(path.join(ROOT, 'node_modules', 'electron', 'package.json')).version);

function log(msg) {
  process.stdout.write('[prepare-native] ' + msg + '\n');
}

function main() {
  const force = process.argv.includes('--force');
  if (!fs.existsSync(MODULE_DIR)) {
    log('better-sqlite3 未安装，先跑 npm install');
    process.exit(0);
  }
  if (!force && fs.existsSync(BINARY)) {
    log('已存在：' + BINARY + '（要重装加 --force）');
    return;
  }
  const cli = path.join(ROOT, 'node_modules', 'prebuild-install', 'bin.js');
  log('拉取 better-sqlite3 的 electron 预编译包（electron ' + ELECTRON_VERSION + '）');
  execFileSync(
    process.execPath,
    [cli, '--runtime=electron', '--target=' + ELECTRON_VERSION, '--arch=' + process.arch],
    { cwd: MODULE_DIR, stdio: 'inherit' }
  );
  log('完成：' + BINARY);
}

main();