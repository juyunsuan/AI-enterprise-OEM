'use strict';

/**
 * Agent 浏览器工具：默认驱动「指纹窗口」里的 Agent 绑定窗口（CDP）。
 *
 * chrome_tabs 列出所有已开指纹窗口的页面；chrome_open/read/click/fill 作用于
 * Agent 默认窗口（浏览器页可设置，未设置取最近使用档案，没有任何档案时自动建「默认窗口」）。
 */

function launch() {
  return require('./launch');
}

function toolDefs() {
  return [
    {
      name: 'chrome_tabs',
      description: '列出所有指纹窗口里已打开的页面（标题、地址、窗口归属）。Agent 的浏览器就是这些指纹窗口。',
      parameters: { type: 'object', properties: {} },
      call: async () => ({ tabs: await launch().pages() })
    },
    {
      name: 'chrome_open',
      description: '在 Agent 默认指纹窗口里打开一个网址。需要多账号隔离时，先在客户端「浏览器」页创建并打开对应指纹窗口。',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'http(s) 完整地址' } },
        required: ['url']
      },
      call: (args, ctx) => launch().navigateAgent(args && args.url, ctx && ctx.sessionId)
    },
    {
      name: 'chrome_read',
      description: '读取 Agent 默认指纹窗口当前页面的正文文本。',
      parameters: { type: 'object', properties: {} },
      call: async (args, ctx) => {
        const text = await launch().evaluateAgent(
          'document.body ? document.body.innerText : ""',
          undefined,
          ctx && ctx.sessionId
        );
        return { text: String(text || '').slice(0, 20000) };
      }
    },
    {
      name: 'chrome_click',
      description: '在 Agent 默认指纹窗口的当前页面里按 CSS 选择器点击一个元素。',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string', description: 'CSS 选择器' } },
        required: ['selector']
      },
      call: (args, ctx) => {
        const selector = JSON.stringify(String((args && args.selector) || ''));
        return launch()
          .evaluateAgent(
            `(() => { const el = document.querySelector(${selector}); if (!el) return false; el.click(); return true; })()`,
            undefined,
            ctx && ctx.sessionId
          )
          .then((clicked) => ({ clicked: !!clicked }));
      }
    },
    {
      name: 'chrome_fill',
      description: '在 Agent 默认指纹窗口的当前页面里往一个输入框填值（触发 input/change）。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          value: { type: 'string', description: '要填的内容' }
        },
        required: ['selector', 'value']
      },
      call: (args, ctx) => {
        const selector = JSON.stringify(String((args && args.selector) || ''));
        const value = JSON.stringify(String(args && args.value != null ? args.value : ''));
        return launch()
          .evaluateAgent(
            `(() => {
              const el = document.querySelector(${selector});
              if (!el) return false;
              el.focus();
              el.value = ${value};
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            })()`,
            undefined,
            ctx && ctx.sessionId
          )
          .then((filled) => ({ filled: !!filled }));
      }
    }
  ];
}

module.exports = { toolDefs };