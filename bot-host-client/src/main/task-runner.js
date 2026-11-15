'use strict';

/**
 * task-runner.js
 *
 * 平台下发指令的本机执行器。队列按「工作区」分桶：
 *   · 同一个工作区同一时刻只跑一条（同一个目录里两个进程并行改文件只会互相踩）；
 *   · 不同工作区可并行。
 *
 * 指令形状（见 backend bot-host.service dispatchOf）：
 *   { commandCode, kind, title, instruction, cwd, mode, timeoutSec }
 *
 * 指令一律交给客户端自带的本地 Agent（agent/index.js）执行，
 * 平台不再指定执行体、也不再走任何外部软件的连通握手。
 */

const MAX_TASKS = 200;

function bucketKeyOf(cmd) {
  return 'ws|' + String(cmd.cwd || '').toLowerCase();
}

class TaskRunner {
  /**
   * @param {object} deps
   * @param {function} deps.runAgent  ({instruction,cwd,mode,timeoutSec,onChunk,shouldCancel}) => Promise<result>
   * @param {function} deps.onProgress (commandCode, text, seq) => Promise<{cancelRequested:boolean}>
   * @param {function} deps.onAck      (commandCode, payload) => Promise<void>
   * @param {function} deps.onLog      (level, msg)
   */
  constructor(deps) {
    this.deps = deps || {};
    this.buckets = new Map();
    this.recent = [];
    this.cancelCodes = new Set();
    /** 正在跑的 commandCode：心跳重投同一条时靠它拦下（队列里已经没有这条了）。 */
    this.activeCodes = new Set();
  }

  getRecent() {
    return this.recent.slice(0, 50);
  }

  isRunning() {
    for (const bucket of this.buckets.values()) {
      if (bucket.running) return true;
    }
    return false;
  }

  /** 队列深度：状态窗口用它显示「还有几条在等」。 */
  pendingCount() {
    let total = 0;
    for (const bucket of this.buckets.values()) total += bucket.queue.length;
    return total;
  }

  _bucket(key) {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { queue: [], running: false };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  /**
   * Add a command to the queue. Deduplicates by commandCode so a re-delivered
   * heartbeat command isn't executed twice.
   */
  enqueue(cmd) {
    if (!cmd || !cmd.commandCode) return false;
    if (this.activeCodes.has(cmd.commandCode)) return false;
    for (const bucket of this.buckets.values()) {
      if (bucket.queue.some((c) => c.commandCode === cmd.commandCode)) return false;
    }
    if (this.recent.some((r) => r.commandCode === cmd.commandCode)) return false;

    const key = bucketKeyOf(cmd);
    const bucket = this._bucket(key);
    bucket.queue.push(cmd);
    if (bucket.queue.length > MAX_TASKS) bucket.queue.shift();
    this._log(
      'info',
      'queued command ' + cmd.commandCode + ' (' + (cmd.title || cmd.kind) + ') → ' + key
    );
    void this._pump(key);
    return true;
  }

  /** Register cancels from heartbeat.stop (an array of commandCodes). */
  applyStop(commandCodes) {
    if (!Array.isArray(commandCodes)) return;
    commandCodes.forEach((code) => {
      if (!code) return;
      this.cancelCodes.add(code);
      for (const bucket of this.buckets.values()) {
        const before = bucket.queue.length;
        bucket.queue = bucket.queue.filter((c) => c.commandCode !== code);
        if (bucket.queue.length !== before) {
          this._log('info', 'dropped queued command ' + code + ' (cancel requested)');
          this._record(code, '已取消', '已取消', '');
        }
      }
    });
  }

  isCanceled(commandCode) {
    return this.cancelCodes.has(commandCode);
  }

  async _pump(key) {
    const bucket = this._bucket(key);
    if (bucket.running) return;
    bucket.running = true;
    while (bucket.queue.length > 0) {
      const cmd = bucket.queue.shift();
      this.activeCodes.add(cmd.commandCode);
      try {
        await this._run(cmd);
      } catch (err) {
        this._log('error', 'task threw: ' + err.message);
      } finally {
        this.activeCodes.delete(cmd.commandCode);
      }
    }
    bucket.running = false;
  }

  async _run(cmd) {
    const startedAt = Date.now();
    const promptText = cmd.instruction || '';
    this._log(
      'info',
      'start ' + cmd.commandCode + ' cwd=' + (cmd.cwd || '(默认)') + ' mode=' + (cmd.mode || 'deny')
    );

    if (this.isCanceled(cmd.commandCode)) {
      await this._ack(cmd, { ok: false, canceled: true, text: '', elapsedMs: 0 });
      this._record(cmd.commandCode, cmd.title || promptText, '已取消', '');
      return;
    }

    if (!promptText.trim()) {
      await this._ack(cmd, {
        ok: false,
        text: '',
        errorMessage: '本机收到的指令内容为空，未执行',
        elapsedMs: Date.now() - startedAt
      });
      this._record(cmd.commandCode, cmd.title || promptText, '失败：指令为空', '');
      return;
    }

    this._record(cmd.commandCode, cmd.title || promptText, '执行中', '');

    let seq = 0;
    let result;
    try {
      result = await this.deps.runAgent({
        instruction: promptText,
        cwd: cmd.cwd,
        mode: cmd.mode,
        timeoutSec: Number(cmd.timeoutSec) || 300,
        onChunk: async (text) => {
          seq += 1;
          if (!this.deps.onProgress) return;
          try {
            const r = await this.deps.onProgress(cmd.commandCode, text, seq);
            if (r && r.cancelRequested) this.cancelCodes.add(cmd.commandCode);
          } catch (err) {
            this._log('warn', 'progress post failed: ' + err.message);
          }
        },
        shouldCancel: () => this.cancelCodes.has(cmd.commandCode)
      });
    } catch (error) {
      result = { status: 'error', errorMessage: error.message || '本机执行失败' };
    }

    // 通道没有 "timeout" 状态：超时是一句说明白的失败，取消走 canceled 标记。
    const canceled = result.status === 'canceled' || this.isCanceled(cmd.commandCode);
    const errorMessage = canceled
      ? ''
      : result.status === 'timeout'
        ? '本机执行超时（' + (Number(cmd.timeoutSec) || 300) + ' 秒）'
        : result.status === 'error'
          ? result.errorMessage || '本机执行失败'
          : '';

    await this._ack(cmd, {
      ok: result.status === 'ok' && !canceled,
      canceled,
      text: result.text || '',
      errorMessage,
      elapsedMs: Date.now() - startedAt,
      effectiveWorkspace: result.effectiveWorkspace || '',
      failReason: result.failReason || ''
    });

    const label =
      result.status === 'ok' && !canceled
        ? '成功'
        : canceled
          ? '已取消'
          : result.status === 'timeout'
            ? '超时'
            : '失败';
    this._record(cmd.commandCode, cmd.title || promptText, label, errorMessage, result.text || '');
  }

  async _ack(cmd, payload) {
    if (!this.deps.onAck) return;
    try {
      await this.deps.onAck(cmd.commandCode, payload);
    } catch (err) {
      this._log('warn', 'result post failed: ' + err.message);
    }
  }

  _record(commandCode, title, status, errorMessage, reply) {
    const record = {
      commandCode,
      title: String(title || '').slice(0, 120),
      status,
      errorMessage: errorMessage || '',
      reply: String(reply || '').slice(0, 20_000),
      at: new Date().toISOString()
    };
    this.recent.unshift(record);
    if (this.recent.length > 100) this.recent.length = 100;
    this.cancelCodes.delete(commandCode);
    // 可选持久化钩子（main.js 写入本地 tasks 表）；失败只告警，不影响任务收尾。
    if (this.deps.onRecord) {
      try {
        this.deps.onRecord(record);
      } catch (err) {
        this._log('warn', 'record persist failed: ' + err.message);
      }
    }
  }

  _log(level, msg) {
    if (this.deps.onLog) this.deps.onLog(level, '[task-runner] ' + msg);
  }
}

module.exports = TaskRunner;
