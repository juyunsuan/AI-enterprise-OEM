'use strict';

/**
 * _agent-unit.js — 客户端本地 Agent 的静态回归：不联网、不拉进程、不碰用户目录。
 *
 * 钉住四条会直接影响线上行为的边界：
 *   1. 工作区沙箱：相对路径出不去，绝对路径越界一律拒；
 *   2. 权限档：deny 拒写、allow-edits 只放行工作区内写、命令仅 allow-all；
 *   3. 指令队列：同工作区串行、不同工作区并行、commandCode 去重；
 *   4. 配置迁移：老版本 { workbuddy:[], codex:[] } 白名单并成一份。
 *
 * 用法：node tools/_agent-unit.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const references = require('../src/main/references');
const tools = require('../src/main/agent/tools');
const TaskRunner = require('../src/main/task-runner');
const workspaces = require('../src/main/workspaces');

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log('  ok   ' + name);
  } catch (err) {
    failed += 1;
    console.log('  FAIL ' + name + ' — ' + err.message);
  }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-agent-test-'));

function toolCtx(policy) {
  return {
    root: ROOT,
    policy,
    memory: { append: () => true },
    skills: { readSkill: () => null }
  };
}

async function runTool(name, args, policy) {
  return tools.run(name, JSON.stringify(args), toolCtx(policy));
}

(async function main() {
  console.log('工作区沙箱');

  await check('相对路径解析到工作区内', () => {
    assert.strictEqual(tools.resolveInWorkspace(ROOT, 'a/b.txt'), path.join(ROOT, 'a', 'b.txt'));
  });

  await check('相对路径越界被拒', () => {
    assert.throws(() => tools.resolveInWorkspace(ROOT, '../../etc/passwd'), /超出当前工作区/);
  });

  await check('绝对路径越界被拒', () => {
    const outside = path.join(path.dirname(ROOT), 'nope.txt');
    assert.throws(() => tools.resolveInWorkspace(ROOT, outside), /超出当前工作区/);
  });

  console.log('权限档');

  await check('deny 档拒绝写文件', async () => {
    const res = await runTool('write_file', { path: 'x.txt', content: 'a' }, 'deny');
    assert.strictEqual(res.ok, false);
    assert.ok(res.content.includes('不允许写文件'));
  });

  await check('allow-edits 档放行工作区内写', async () => {
    const res = await runTool('write_file', { path: 'ok.txt', content: 'hello' }, 'allow-edits');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(fs.readFileSync(path.join(ROOT, 'ok.txt'), 'utf8'), 'hello');
  });

  await check('allow-edits 档仍拒绝执行命令', async () => {
    const res = await runTool('run_command', { command: 'echo hi' }, 'allow-edits');
    assert.strictEqual(res.ok, false);
    assert.ok(res.content.includes('不允许执行命令'));
  });

  await check('deny 档读文件照常放行', async () => {
    const res = await runTool('read_file', { path: 'ok.txt' }, 'deny');
    assert.strictEqual(res.ok, true);
    assert.ok(res.content.includes('hello'));
  });

  console.log('指令队列');

  await check('同一工作区串行执行', async () => {
    const order = [];
    let inflight = 0;
    let overlapped = false;
    const runner = new TaskRunner({
      runAgent: async (input) => {
        inflight += 1;
        if (inflight > 1) overlapped = true;
        await new Promise((r) => setTimeout(r, 10));
        order.push(input.instruction);
        inflight -= 1;
        return { status: 'ok', text: input.instruction };
      },
      onAck: async () => {}
    });
    runner.enqueue({ commandCode: 'a1', instruction: 'one', cwd: ROOT });
    runner.enqueue({ commandCode: 'a2', instruction: 'two', cwd: ROOT });
    await new Promise((r) => setTimeout(r, 120));
    assert.deepStrictEqual(order, ['one', 'two']);
    assert.strictEqual(overlapped, false);
  });

  await check('不同工作区并行执行', async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-agent-test2-'));
    let inflight = 0;
    let peak = 0;
    const runner = new TaskRunner({
      runAgent: async () => {
        inflight += 1;
        peak = Math.max(peak, inflight);
        await new Promise((r) => setTimeout(r, 30));
        inflight -= 1;
        return { status: 'ok', text: '' };
      },
      onAck: async () => {}
    });
    runner.enqueue({ commandCode: 'b1', instruction: 'x', cwd: ROOT });
    runner.enqueue({ commandCode: 'b2', instruction: 'y', cwd: other });
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(peak >= 2, '两个工作区应当同时跑');
  });

  await check('重复 commandCode 只入队一次', async () => {
    let runs = 0;
    const runner = new TaskRunner({
      runAgent: async () => {
        runs += 1;
        return { status: 'ok', text: '' };
      },
      onAck: async () => {}
    });
    assert.strictEqual(runner.enqueue({ commandCode: 'c1', instruction: 'x', cwd: ROOT }), true);
    assert.strictEqual(runner.enqueue({ commandCode: 'c1', instruction: 'x', cwd: ROOT }), false);
    await new Promise((r) => setTimeout(r, 60));
    assert.strictEqual(runs, 1);
  });

  await check('取消会清空排队中的指令', async () => {
    const runner = new TaskRunner({
      runAgent: async () => {
        await new Promise((r) => setTimeout(r, 40));
        return { status: 'ok', text: '' };
      },
      onAck: async () => {}
    });
    runner.enqueue({ commandCode: 'd1', instruction: 'x', cwd: ROOT });
    runner.enqueue({ commandCode: 'd2', instruction: 'y', cwd: ROOT });
    runner.applyStop(['d2']);
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(runner.getRecent().some((r) => r.commandCode === 'd2' && r.status === '已取消'));
  });

  console.log('工作区清单');

  await check('默认工作区取自配置且去重', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-agent-test3-'));
    const list = workspaces.listWorkspaces({
      workingDir: dir,
      workspaces: [dir, dir.toUpperCase() === dir ? dir + path.sep : dir],
      recentWorkspaces: [{ path: dir, lastUsedAt: new Date().toISOString() }]
    });
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].trust, 'trusted');
  });

  await check('不存在的目录不进清单', () => {
    const list = workspaces.listWorkspaces({
      workingDir: path.join(ROOT, 'does-not-exist'),
      workspaces: [],
      recentWorkspaces: []
    });
    assert.strictEqual(list.length, 0);
  });

  await check('白名单命中才返回真实路径', () => {
    const cfg = { workingDir: ROOT, workspaces: [], recentWorkspaces: [] };
    assert.strictEqual(workspaces.resolveWorkspace(cfg, ROOT.toLowerCase()), ROOT);
    assert.strictEqual(workspaces.resolveWorkspace(cfg, path.join(ROOT, 'sub')), null);
  });

  console.log('参考文件闸门');

  const refDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-ref-test-'));
  const write = (name, data) => {
    const file = path.join(refDir, name);
    fs.writeFileSync(file, data);
    return file;
  };

  await check('UTF-8 文本按名字带上正文', () => {
    const file = write('spec.md', '# 规格\n第一行');
    const res = references.readReferences([{ name: 'spec.md', path: file }]);
    assert.strictEqual(res.skipped.length, 0);
    assert.strictEqual(res.references.length, 1);
    assert.strictEqual(res.references[0].name, 'spec.md');
    assert.ok(res.references[0].content.startsWith('# 规格'));
    assert.strictEqual(res.references[0].size, Buffer.byteLength('# 规格\n第一行'));
  });

  await check('二进制、目录、越界与读不到的都跳过并说明', () => {
    const bin = write('logo.png', Buffer.concat([Buffer.from('PNG'), Buffer.from([0, 1, 2, 0])]));
    const missing = path.join(refDir, 'gone.txt');
    const res = references.readReferences([bin, refDir, missing]);
    assert.strictEqual(res.references.length, 0);
    assert.ok(res.skipped.some((row) => row.includes('logo.png') && row.includes('不是文本文件')));
    assert.ok(res.skipped.some((row) => row.includes('不是文件')));
    assert.ok(res.skipped.some((row) => row.includes('gone.txt') && row.includes('读不到')));
  });

  await check('单个文件 2MB 上限', () => {
    const big = write('big.txt', Buffer.alloc(2 * 1024 * 1024 + 1, 0x61));
    const res = references.readReferences([big]);
    assert.strictEqual(res.references.length, 0);
    assert.ok(res.skipped[0].includes('超过 2MB'));
  });

  await check('单文件截到 6 万字，本轮合计截到 12 万字', () => {
    const long = write('long.txt', 'x'.repeat(70_000));
    const a = write('a.txt', 'a'.repeat(60_000));
    const b = write('b.txt', 'b'.repeat(60_000));
    const c = write('c.txt', 'c'.repeat(10));
    const one = references.readReferences([long]);
    assert.strictEqual(one.references[0].content.length, 60_000);
    const many = references.readReferences([a, b, c]);
    assert.strictEqual(many.references.length, 2);
    assert.ok(many.skipped.some((row) => row.includes('c.txt') && row.includes('总量已满')));
  });

  await check('一轮最多 8 个文件', () => {
    const nine = [];
    for (let i = 0; i < 9; i += 1) nine.push(write('n' + i + '.txt', 'n' + i));
    const res = references.readReferences(nine);
    assert.strictEqual(res.references.length, 8);
    assert.ok(res.skipped.some((row) => row.includes('单轮最多 8 个文件')));
  });

  await check('文件对话框选完先过一遍：只留能用的并给出原因', () => {
    const ok = write('ok.txt', 'hello');
    const big = write('huge.txt', Buffer.alloc(3 * 1024 * 1024, 0x62));
    const res = references.describePicked([ok, big, refDir]);
    assert.deepStrictEqual(res.files.map((row) => row.name), ['ok.txt']);
    assert.strictEqual(res.files[0].path, ok);
    assert.ok(res.skipped.some((row) => row.includes('huge.txt')));
    assert.ok(res.skipped.some((row) => row.includes('不是文件')));
  });

  fs.rmSync(refDir, { recursive: true, force: true });
  fs.rmSync(ROOT, { recursive: true, force: true });

  if (failed) {
    console.log('\n' + failed + ' 项未通过');
    process.exit(1);
  }
  console.log('\n全部通过');
})();
