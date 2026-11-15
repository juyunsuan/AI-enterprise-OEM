'use strict';

/** 内置浏览器窗口顶栏的 preload：只暴露导航动作与页面状态。 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browserChrome', {
  action: (payload) => ipcRenderer.send('browserChrome:action', payload),
  onState: (callback) => {
    ipcRenderer.on('browserChrome:state', (_event, state) => {
      try {
        callback(state);
      } catch {
        /* 顶栏渲染异常不影响页面 */
      }
    });
  },
});