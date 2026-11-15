'use strict';

/**
 * agent/model-client.js
 *
 * 本地 Agent 的模型调用层：只用 Node 内置 http/https，不引第三方 SDK。
 * 两种协议：
 *   openai     POST {baseUrl}/chat/completions      （OpenAI 兼容：DeepSeek、通义、vLLM、Ollama…）
 *   anthropic  POST {baseUrl}/messages              （Claude 原生）
 *
 * SSE 解析对齐平台 backend/src/http/transport.ts 的 readSse：
 *   · 只认 `data:` 行，跳过空行与注释行（`:` 开头）；
 *   · `[DONE]` 立即收尾；单块坏 JSON 只跳过，不打断整轮；
 *   · 按行切片，跨 chunk 的半行留在缓冲里等下一块。
 * 与平台的区别只有一处：响应结束时把残留缓冲再冲一次（平台不留尾行，这里补上更稳）。
 *
 * 正文增量通过 onDelta 回调出去（用于回传进度）；工具调用按 index 拼装参数。
 *
 * 失败一律抛 AgentError，带 failReason（NO_MODEL / MODEL_UNREACHABLE / MODEL_AUTH），
 * 客户端心跳与指令回执都用同一套机器码，平台侧才能翻成一句人话。
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const CONNECT_TIMEOUT_MS = 20_000;
const IDLE_TIMEOUT_MS = 180_000;

class AgentError extends Error {
  constructor(failReason, message) {
    super(message || failReason);
    this.failReason = failReason;
  }
}

function joinUrl(baseUrl, suffix) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  return base + suffix;
}

/** 一行 SSE → payload；不是 data 行或解析失败都返回 null。 */
function parseSseLine(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line || line.startsWith(':')) return null;
  if (!line.startsWith('data:')) return null;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    const value = JSON.parse(payload);
    return value && typeof value === 'object' ? value : null;
  } catch (err) {
    return null;
  }
}

/**
 * 逐行消费 SSE 流（Node readable 版）。
 * onData 抛错不打断整轮：单块事件处理失败只丢这一条。
 */
function readSse(stream, onData) {
  let buffer = '';
  const drain = (flush) => {
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf('\n');
      if (line.trim() === 'data: [DONE]' || line.trim() === 'data:[DONE]') {
        buffer = '';
        return true;
      }
      const payload = parseSseLine(line);
      if (payload) {
        try {
          onData(payload);
        } catch (err) {
          /* 单块坏数据不打断整轮 */
        }
      }
    }
    if (flush) {
      const rest = buffer.trim();
      buffer = '';
      const payload = parseSseLine(rest);
      if (payload) {
        try {
          onData(payload);
        } catch (err) {
          /* 同上 */
        }
      }
    }
    return false;
  };

  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    drain(false);
  });
  stream.on('end', () => drain(true));
}

function post(url, headers, body, handlers) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch (err) {
      reject(new AgentError('MODEL_UNREACHABLE', '渠道地址不合法：' + err.message));
      return;
    }
    const lib = target.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname + target.search,
        method: 'POST',
        headers: Object.assign(
          {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            Accept: 'text/event-stream',
            'User-Agent': 'botbuddy-agent/1.0'
          },
          headers
        ),
        timeout: CONNECT_TIMEOUT_MS
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status < 200 || status >= 300) {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8').slice(0, 800);
            const reason = status === 401 || status === 403 ? 'MODEL_AUTH' : 'MODEL_UNREACHABLE';
            reject(new AgentError(reason, `渠道返回 HTTP ${status}：${text}`));
          });
          return;
        }
        req.setTimeout(IDLE_TIMEOUT_MS);
        readSse(res, handlers.onEvent);
        res.on('end', () => resolve());
        res.on('error', (err) =>
          reject(new AgentError('MODEL_UNREACHABLE', '读取渠道响应中断：' + err.message))
        );
      }
    );
    req.on('timeout', () => req.destroy(new Error('channel timeout')));
    req.on('error', (err) =>
      reject(new AgentError('MODEL_UNREACHABLE', '连不上模型渠道：' + err.message))
    );
    req.write(payload);
    req.end();
  });
}

/** 统一消息形状：{ role: 'user'|'assistant'|'tool', content, toolCalls?, toolCallId? } */
function toOpenAiMessages(messages, system) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const msg of messages) {
    if (msg.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: msg.toolCallId, content: msg.content });
      continue;
    }
    if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length) {
      out.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments || '{}' }
        }))
      });
      continue;
    }
    out.push({ role: msg.role, content: msg.content });
  }
  return out;
}

function toAnthropicMessages(messages) {
  const out = [];
  for (const msg of messages) {
    if (msg.role === 'tool') {
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.toolCallId,
            content: msg.content
          }
        ]
      });
      continue;
    }
    if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length) {
      const blocks = [];
      if (msg.content) blocks.push({ type: 'text', text: msg.content });
      for (const call of msg.toolCalls) {
        blocks.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: safeParse(call.arguments)
        });
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }
    if (!String(msg.content || '').trim()) continue;
    out.push({ role: msg.role, content: msg.content });
  }
  return out;
}

function safeParse(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (err) {
    return {};
  }
}

/**
 * 一次模型调用。
 * @returns {Promise<{text:string, toolCalls:Array<{id,name,arguments}>, finishReason:string}>}
 */
async function complete({ channel, system, messages, tools, temperature, maxTokens, onDelta }) {
  if (!channel || !channel.baseUrl || !channel.model) {
    throw new AgentError('NO_MODEL', '还没配置文本模型（渠道 + 模型）');
  }
  const delta = typeof onDelta === 'function' ? onDelta : () => {};

  if (channel.protocol === 'anthropic') {
    return completeAnthropic({ channel, system, messages, tools, temperature, maxTokens, delta });
  }
  return completeOpenAi({ channel, system, messages, tools, temperature, maxTokens, delta });
}

async function completeOpenAi({ channel, system, messages, tools, temperature, maxTokens, delta }) {
  const body = {
    model: channel.model,
    messages: toOpenAiMessages(messages, system),
    stream: true,
    max_tokens: maxTokens,
    temperature
  };
  if (tools && tools.length) {
    body.tools = tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  let text = '';
  let finishReason = '';
  const calls = new Map(); // index -> { id, name, arguments }

  await post(
    joinUrl(channel.baseUrl, '/chat/completions'),
    { Authorization: 'Bearer ' + channel.apiKey },
    body,
    {
      onEvent: (event) => {
        const choice = (event.choices && event.choices[0]) || null;
        if (!choice) return;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const piece = choice.delta || {};
        if (typeof piece.content === 'string' && piece.content) {
          text += piece.content;
          delta(piece.content);
        }
        for (const part of piece.tool_calls || []) {
          const index = Number.isFinite(part.index) ? part.index : 0;
          const slot = calls.get(index) || { id: '', name: '', arguments: '' };
          if (part.id) slot.id = part.id;
          if (part.function && part.function.name) slot.name += part.function.name;
          if (part.function && part.function.arguments) slot.arguments += part.function.arguments;
          calls.set(index, slot);
        }
      }
    }
  );

  const toolCalls = Array.from(calls.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, slot]) => ({
      id: slot.id || 'call_' + index + '_' + Math.random().toString(36).slice(2, 8),
      name: slot.name,
      arguments: slot.arguments || '{}'
    }))
    .filter((call) => call.name);

  return { text, toolCalls, finishReason };
}

async function completeAnthropic({ channel, system, messages, tools, temperature, maxTokens, delta }) {
  const body = {
    model: channel.model,
    max_tokens: maxTokens,
    temperature,
    messages: toAnthropicMessages(messages),
    stream: true
  };
  if (system) body.system = system;
  if (tools && tools.length) {
    body.tools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }));
  }

  let text = '';
  let finishReason = '';
  const calls = new Map(); // index -> { id, name, json }

  await post(
    joinUrl(channel.baseUrl, '/messages'),
    {
      'x-api-key': channel.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body,
    {
      onEvent: (event) => {
        if (event.type === 'content_block_start' && event.content_block) {
          if (event.content_block.type === 'tool_use') {
            calls.set(event.index, {
              id: event.content_block.id || '',
              name: event.content_block.name || '',
              json: ''
            });
          }
          return;
        }
        if (event.type === 'content_block_delta' && event.delta) {
          if (event.delta.type === 'text_delta' && event.delta.text) {
            text += event.delta.text;
            delta(event.delta.text);
          } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
            const slot = calls.get(event.index) || { id: '', name: '', json: '' };
            slot.json += event.delta.partial_json;
            calls.set(event.index, slot);
          }
          return;
        }
        if (event.type === 'message_delta' && event.delta && event.delta.stop_reason) {
          finishReason = event.delta.stop_reason;
        }
      }
    }
  );

  const toolCalls = Array.from(calls.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, slot]) => ({
      id: slot.id || 'call_' + index + '_' + Math.random().toString(36).slice(2, 8),
      name: slot.name,
      arguments: slot.json || '{}'
    }))
    .filter((call) => call.name);

  return { text, toolCalls, finishReason };
}

module.exports = { AgentError, complete, readSse, parseSseLine };
