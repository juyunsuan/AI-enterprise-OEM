/**
 * 全部原生微信小程序模板共用的骨架真源：请求出口、会话槽位、wx.login 状态机、错误文案。
 *
 * 为什么要有这个文件：各模板此前各写一份 request/session/auth，同一个 401 有 6 种处理，
 * 修一处忘八处。这里把公共部分收成一份，差异（接口前缀、租户码键名、令牌槽位、提示文案）
 * 全部由各端 utils/*.js 用参数注入——core 里不允许按租户 if-else。
 *
 * 落地方式（构建期注入 + 哈希校验，不引 npm 包、不引打包步骤）：
 *   - 真源只有这一份；`shared/mini-core/sync.mjs` 把它原样复制成各模板的 utils/core.js。
 *   - 改完真源必须跑 `pnpm sync:mini-core`；`pnpm check:mini-core`（以及 check:architecture）
 *     比对哈希，模板里的手改core.js 一律算架构违规。
 *   - 语法必须停在 ES5：微信基础库直接执行这份文件，card-shop 这类回调风格的老端也吃得下。
 *     具体禁什么由 `sync.mjs` 的 assertEs5 判定（箭头函数 / let·const / 模板串 / 展开运算符 /
 *     调用参数尾逗号 / Object.assign），跑 sync 与 --check 都会拦，不靠人记住。
 *
 * 各端注入参数（createRequest）：
 *   getSessionKey   字符串或函数 → 会话对象所在的 storage key；给了它，token 读取与清会话走默认实现
 *   slots / slotOf(options) → 多令牌端的槽位表（如 {customer: 键, staff: 键}）与「本次请求算哪一格」
 *   getApiBase      字符串或函数 → 站点基址（无尾斜杠）
 *   apiPrefix       接口前缀，如 '/api/public/knowledge-pay'；没有前缀的端传空串
 *   getToken(options)   / clearSession(options) / clearKeys：多身份槽位（顾客/技师/代理）的端覆盖默认
 *   authHeader(token)   令牌怎么放进头里，默认 Authorization: Bearer；mp 端用的是自定义头
 *   extraHeaders        对象或函数 → 追加/覆盖任意请求头
 *   onUnauthorized(options, body) → 401 清完会话后的补充动作
 *   autoReloginOnce + relogin(options) → 401 静默重登后原样重发一次（只一次，防打转）
 *   missingBaseMessage / unauthorizedMessage / domainMessage → 保留各端原有文案，可给函数按 options 变
 *   rawWhenNoCode   公开通道偶尔直接回业务 JSON（不带 code），true 时原样交给页面
 */

var CONTENT_TYPE = 'application/json';
var DEFAULT_TIMEOUT = 20000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object';
}

function readState(storageKey) {
  if (!storageKey) return {};
  try {
    var raw = wx.getStorageSync(storageKey);
    return isPlainObject(raw) ? raw : {};
  } catch (e) {
    return {};
  }
}

function writeState(storageKey, value) {
  // 写失败只影响下次冷启动的缓存：本次内存态照常可用，不打断用户操作。
  try {
    wx.setStorageSync(storageKey, value);
  } catch (e) {
    /* 忽略 */
  }
}

function pickStorageKey(value) {
  return String(typeof value === 'function' ? value() || '' : value || '');
}

function assignHeaders(target, source) {
  if (!isPlainObject(source)) return target;
  for (var key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key];
  }
  return target;
}

function bizError(message, code) {
  var error = new Error(message);
  error.code = code;
  return error;
}

/** 查询串组装：空值不进 URL，后端按「没传这个参数」处理。 */
function toQuery(query) {
  if (!isPlainObject(query)) return '';
  var parts = [];
  Object.keys(query).forEach(function (key) {
    var value = query[key];
    if (value === undefined || value === null || value === '') return;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

/**
 * 统一错误文案：有 message 用 message；微信原始错误串（request:fail / domain / ssl）
 * 对运营方没有可操作性，补一句「合法域名/服务器证书」的排查提示。
 */
function errorText(err, fallback) {
  var message = typeof err === 'string' ? err : (err && err.message) || '';
  if (!message) return fallback || '操作失败，请稍后重试';
  if (/domain|request:fail|ERR_|\bssl\b/i.test(message)) {
    return message + '，请检查小程序合法域名/服务器证书';
  }
  return message;
}

/** ES5 版浅拷贝合并：这份骨架会被老基础库直接执行，Object.assign 是 ES6 内建，用不起。 */
function assign(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];
    if (!source) continue;
    for (var name in source) {
      if (Object.prototype.hasOwnProperty.call(source, name)) {
        target[name] = source[name];
      }
    }
  }
  return target;
}

/** 会话槽位：一个 storage key 存一个对象，get/set/clear 之外不发明概念。 */
function createSession(storageKey) {
  var key = pickStorageKey(storageKey);
  return {
    all: function () {
      return readState(key);
    },
    get: function (name) {
      return readState(key)[name];
    },
    set: function (patch) {
      var next = assign({}, readState(key), patch || {});
      writeState(key, next);
      return next;
    },
    clear: function (names) {
      var next = assign({}, readState(key));
      var list = names && names.length ? names : ['token'];
      for (var i = 0; i < list.length; i++) delete next[list[i]];
      writeState(key, next);
      return next;
    },
  };
}

/** 文案允许给函数：多身份端的 401 提示要跟着本次请求用的令牌槽位变。 */
function textOf(value, options) {
  return typeof value === 'function' ? value(options) : value;
}

/**
 * 统一请求出口工厂。返回 request({path, query, method, data, timeout})。
 *
 * 401 只有一个策略：清会话（默认删 token 槽位，多身份端可覆盖）→ 抛 Error(message)（code=401）；
 * 打开 autoReloginOnce 的端在抛之前先静默重登一次、原样重发一次，重登仍失败才把 401 交给页面。
 */
function createRequest(config) {
  var cfg = config || {};
  var sessionKey = cfg.getSessionKey;
  // 多令牌端（顾客 + 技师 / 医护）每个身份一个 storage key：slots 给槽位表，slotOf 决定本次请求落在哪格。
  var slots = cfg.slots || null;

  function apiBase() {
    var value = typeof cfg.getApiBase === 'function' ? cfg.getApiBase() : cfg.getApiBase;
    return String(value || '')
      .trim()
      .replace(/\/+$/, '');
  }

  function slotName(options) {
    if (!slots) return 'default';
    return (typeof cfg.slotOf === 'function' ? cfg.slotOf(options) : cfg.slot) || 'default';
  }

  function storageKeyFor(options) {
    if (slots) return String(slots[slotName(options)] || slots['default'] || '');
    return pickStorageKey(sessionKey);
  }

  function tokenFor(options) {
    if (typeof cfg.getToken === 'function') return String(cfg.getToken(options) || '');
    return String(readState(storageKeyFor(options)).token || '');
  }

  function buildHeaders(options, token) {
    var header = {};
    header['content-type'] = cfg.contentType || CONTENT_TYPE;
    if (typeof cfg.authHeader === 'function') {
      assignHeaders(header, cfg.authHeader(token, options));
    } else if (token) {
      header.Authorization = 'Bearer ' + token;
    }
    var extra = typeof cfg.extraHeaders === 'function' ? cfg.extraHeaders(options) : cfg.extraHeaders;
    return assignHeaders(header, extra);
  }

  function clearAuth(options) {
    if (typeof cfg.clearSession === 'function') {
      cfg.clearSession(options);
      return;
    }
    var keys = typeof cfg.clearKeys === 'function' ? cfg.clearKeys(options) : cfg.clearKeys;
    createSession(storageKeyFor(options)).clear(keys);
  }

  function failText(err, options) {
    var raw = (err && err.errMsg) || '';
    if (!raw) return '网络异常，请稍后重试';
    if (/domain/i.test(raw)) {
      return (
        textOf(cfg.domainMessage, options) ||
        '服务器地址未配置为小程序的合法域名，请检查小程序合法域名/服务器证书'
      );
    }
    return errorText(bizError(raw), '网络异常，请稍后重试');
  }

  function pickData(body) {
    if (typeof body.code === 'number') {
      return Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : (cfg.rawWhenNoCode ? body : undefined);
    }
    // 没有信封的应答只可能出现在 rawWhenNoCode 的公开通道里，原样给页面。
    return cfg.rawWhenNoCode ? body : body.data;
  }

  function sendOnce(options, retried) {
    var base = apiBase();
    if (!base) {
      return Promise.reject(bizError(textOf(cfg.missingBaseMessage, options) || '未配置服务器地址'));
    }
    var token = tokenFor(options);
    return new Promise(function (resolve, reject) {
      wx.request({
        url: base + (cfg.apiPrefix || '') + options.path + toQuery(options.query),
        method: String(options.method || 'GET').toUpperCase(),
        data: options.data,
        header: buildHeaders(options, token),
        timeout: options.timeout || cfg.timeout || DEFAULT_TIMEOUT,
        success: function (res) {
          var body = isPlainObject(res.data) ? res.data : {};
          var code = typeof body.code === 'number' ? body.code : 0;
          if (res.statusCode === 401 || code === 401) {
            clearAuth(options);
            if (typeof cfg.onUnauthorized === 'function') cfg.onUnauthorized(options, body);
            var error = bizError(
              body.message || textOf(cfg.unauthorizedMessage, options) || '登录已过期，请重新登录',
              401
            );
            if (cfg.autoReloginOnce && !retried && typeof cfg.relogin === 'function') {
              Promise.resolve(cfg.relogin(options)).then(
                function () {
                  sendOnce(options, true).then(resolve, reject);
                },
                function () {
                  reject(error);
                }
              );
              return;
            }
            reject(error);
            return;
          }
          if (res.statusCode >= 400) {
            reject(
              bizError(
                body.message || '请求失败（' + res.statusCode + '）',
                code || res.statusCode
              )
            );
            return;
          }
          // code != 0 即业务失败：后端 message 已是中文，页面直接 toast。
          if (code !== 0) {
            reject(bizError(body.message || '请求失败', code));
            return;
          }
          resolve(pickData(body));
        },
        fail: function (err) {
          reject(bizError(failText(err, options)));
        },
      });
    });
  }

  return function request(options) {
    return sendOnce(options || {}, false);
  };
}

/**
 * wx.login → 换令牌 → 落会话 的统一状态机。
 *
 * 各端换令牌的接口形状差得很远（有的收对象、有的收位置参数），所以只约定
 * api(code, extra)：extra 里按 tenantKey/tenantValue 放好本端的寻址码，
 * 怎么交给自己的 api.js 由端上决定，core 不猜键名。
 * 并发的调用共用同一个 promise，避免首屏多个请求各换一次 code。
 */
function loginWithCode(config) {
  var cfg = config || {};
  var pending = null;

  function takeCode() {
    return new Promise(function (resolve, reject) {
      wx.login({
        success: function (res) {
          if (res && res.code) resolve(res.code);
          else reject(bizError(cfg.codeMissingMessage || '微信登录失败，请重试'));
        },
        fail: function () {
          reject(bizError(cfg.loginFailMessage || '微信登录失败，请检查网络后重试'));
        },
      });
    });
  }

  return function login() {
    if (pending) return pending;
    pending = takeCode()
      .then(function (code) {
        var extra = {};
        if (cfg.tenantKey) {
          extra[cfg.tenantKey] =
            typeof cfg.tenantValue === 'function' ? cfg.tenantValue() : cfg.tenantValue || '';
        }
        return cfg.api(code, extra);
      })
      .then(function (data) {
        var payload = data || {};
        if (cfg.requireToken && !payload.token) {
          throw bizError(cfg.tokenMissingMessage || '登录返回异常，请重试');
        }
        var key = pickStorageKey(cfg.storageKey);
        if (key) createSession(key).set({ token: payload.token || '' });
        return typeof cfg.onState === 'function' ? cfg.onState(payload) : payload;
      });
    // 用 then(ok, fail) 而不是 finally：低版本基础库没有 Promise.prototype.finally。
    pending = pending.then(
      function (result) {
        pending = null;
        return result;
      },
      function (error) {
        pending = null;
        throw error;
      }
    );
    return pending;
  };
}

module.exports = {
  createRequest: createRequest,
  createSession: createSession,
  loginWithCode: loginWithCode,
  errorText: errorText,
  bizError: bizError,
  toQuery: toQuery,
};
