'use strict';

/**
 * pairing.js
 *
 * Drives the device pairing flow against /api/public/bot-host:
 *   open  -> POST .../pair        returns { code, expiresAt }
 *   poll  -> POST .../pair/poll   every POLL_INTERVAL_MS
 *   done  -> { paired:true, token, hostId, hostName }
 *
 * The 6-digit code is claimed by a signed-in user on the platform's
 * 「Bot 主机」 page; until then poll keeps returning { paired:false }.
 * A rejected code (expired or already claimed) comes back as a non-ok
 * response, and the platform's own message is what we surface.
 */

const os = require('os');
const platform = require('./platform-client');

const POLL_INTERVAL_MS = 2000;

class Pairing {
  /**
   * @param {object} deps
   * @param {function} deps.getConfig
   * @param {function} deps.onUpdate  (state) => void
   * @param {function} deps.onPaired  ({ token, hostId, hostName }) => void
   * @param {function} deps.onLog     (level, msg) => void
   */
  constructor(deps) {
    this.deps = deps || {};
    this.pairCode = '';
    this.expiresAt = 0;
    this.pollIntervalSec = Math.round(POLL_INTERVAL_MS / 1000);
    this.status = 'idle'; // idle | waiting | expired | ok | error
    this.message = '';
    this.timer = null;
    this.polling = false;
    this.stopped = false;
    this.countdownTimer = null;
  }

  _log(level, msg) {
    if (this.deps.onLog) this.deps.onLog(level, '[pairing] ' + msg);
  }

  snapshot() {
    const now = Date.now();
    return {
      pairCode: this.pairCode,
      status: this.status,
      message: this.message,
      expiresInSec: this.expiresAt ? Math.max(0, Math.round((this.expiresAt - now) / 1000)) : 0,
      pollIntervalSec: this.pollIntervalSec
    };
  }

  _emit() {
    if (this.deps.onUpdate) this.deps.onUpdate(this.snapshot());
  }

  async start() {
    await this.refresh();
  }

  /** Request a fresh pair code and begin polling. */
  async refresh() {
    this.stopTimers();
    this.stopped = false;
    const cfg = this.deps.getConfig();
    // 连接码按「账号 + 码」双重绑定：没登录平台账号就不发码，界面停在引导登录。
    if (!cfg.userToken) {
      this.pairCode = '';
      this.expiresAt = 0;
      this.status = 'locked';
      this.message = '请先登录平台账号，登录后会生成连接码';
      this._emit();
      return this.snapshot();
    }
    const deviceInfo = {
      os: platform.currentPlatform(),
      hostname: os.hostname(),
      clientVersion: platform.CLIENT_VERSION
    };

    this._log('info', 'opening pair on ' + cfg.baseUrl);
    const res = await platform.pairOpen(cfg.baseUrl, deviceInfo, cfg.userToken);

    if (res.transportError) {
      this.status = 'error';
      this.message = '平台不可达：' + res.error;
      this._emit();
      return this.snapshot();
    }
    if (res.httpStatus === 401) {
      this.pairCode = '';
      this.expiresAt = 0;
      this.status = 'locked';
      this.message = '平台登录已失效，请重新登录账号';
      this._emit();
      return this.snapshot();
    }
    if (!res.ok || !res.data || !res.data.code) {
      this.status = 'error';
      this.message = (res.data && res.data.message) || '获取配对码失败';
      this._emit();
      return this.snapshot();
    }

    this.pairCode = res.data.code;
    this.expiresAt = Date.parse(res.data.expiresAt) || Date.now() + 600000;
    this.status = 'waiting';
    this.message = '';
    this._emit();

    this._startCountdown();
    this._startPolling();
    return this.snapshot();
  }

  _startCountdown() {
    this.countdownTimer = setInterval(() => {
      if (Date.now() >= this.expiresAt && this.status === 'waiting') {
        this.status = 'expired';
        this.message = '配对码已过期，请点击刷新';
        this.stopPolling();
        this._emit();
      } else {
        this._emit();
      }
    }, 1000);
  }

  _startPolling() {
    this.polling = true;
    const tick = async () => {
      if (!this.polling || this.stopped) return;
      const cfg = this.deps.getConfig();
      const res = await platform.pairPoll(cfg.baseUrl, this.pairCode, cfg.userToken);

      if (res.transportError) {
        this.message = '轮询失败：' + res.error;
        this._emit();
      } else if (res.ok && res.data && res.data.paired === true) {
        this.polling = false;
        this.status = 'ok';
        this.message = '配对成功';
        this.stopTimers();
        this._emit();
        if (this.deps.onPaired) {
          this.deps.onPaired({
            token: res.data.token,
            hostId: res.data.hostId,
            hostName: res.data.hostName
          });
        }
        return;
      } else if (res.ok && res.data && res.data.paired === false) {
        // 还没人认领：清除上一轮的临时提示，继续等。
        this.message = '';
        this._emit();
      } else if (res.httpStatus === 401) {
        this.polling = false;
        this.status = 'locked';
        this.message = '平台登录已失效，请重新登录账号';
        this.stopTimers();
        this._emit();
        return;
      } else if (res.httpStatus === 400) {
        // 码已过期或已被认领作废：停手，让用户刷新拿新码。
        this.polling = false;
        this.status = 'expired';
        this.message = (res.data && res.data.message) || '配对码已过期，请刷新';
        this.stopTimers();
        this._emit();
        return;
      } else {
        this.message = '轮询失败：' + ((res.data && res.data.message) || '平台返回异常');
        this._emit();
      }

      if (this.polling && !this.stopped) {
        this.timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    this.timer = setTimeout(tick, POLL_INTERVAL_MS);
  }

  stopPolling() {
    this.polling = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  stopTimers() {
    this.stopPolling();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }

  stop() {
    this.stopped = true;
    this.stopTimers();
  }
}

module.exports = Pairing;
