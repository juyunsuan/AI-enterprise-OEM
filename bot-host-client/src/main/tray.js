'use strict';

/**
 * tray.js
 *
 * System tray: persistent icon, tooltip, and a menu with
 *   - 显示主窗口 (left click also shows the status window)
 *   - 退出
 *
 * The icon ships as src/assets/tray.png; the embedded base64 PNG is only a
 * fallback for the case where the asset is missing.
 */

const path = require('path');
const { Tray, Menu, nativeImage, app } = require('electron');

const PRODUCT_NAME = 'BotBuddy';
const TRAY_ICON = path.join(__dirname, '..', 'assets', 'tray.png');

// 16x16 solid-ish PNG (base64) — a simple filled rounded square so the tray
// has a visible icon without shipping any asset file.
const ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAhUlEQVR42mNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMAgAAJ+AAAcH8j2sAAAAASUVORK5CYII=';

function buildImage() {
  try {
    const img = nativeImage.createFromPath(TRAY_ICON);
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
  } catch (err) {
    // fall through
  }
  try {
    const img = nativeImage.createFromDataURL('data:image/png;base64,' + ICON_BASE64);
    if (!img.isEmpty()) return img;
  } catch (err) {
    // fall through
  }
  return nativeImage.createEmpty();
}

class TrayController {
  /**
   * @param {object} deps
   * @param {function} deps.onShow   show the status window
   * @param {function} deps.onAgent  open the agent config window
   * @param {function} deps.onQuit   quit the app
   */
  constructor(deps) {
    this.deps = deps || {};
    this.tray = null;
  }

  create() {
    this.tray = new Tray(buildImage());
    this.tray.setToolTip(PRODUCT_NAME);
    this.updateMenu();

    // Left click shows the status window.
    this.tray.on('click', () => {
      if (this.deps.onShow) this.deps.onShow();
    });
    this.tray.on('double-click', () => {
      if (this.deps.onShow) this.deps.onShow();
    });

    return this.tray;
  }

  updateMenu() {
    if (!this.tray) return;
    const menu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          if (this.deps.onShow) this.deps.onShow();
        }
      },
      {
        label: 'Agent 配置',
        click: () => {
          if (this.deps.onAgent) this.deps.onAgent();
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          if (this.deps.onQuit) this.deps.onQuit();
          else app.quit();
        }
      }
    ]);
    this.tray.setContextMenu(menu);
  }

  setTooltip(text) {
    if (this.tray) this.tray.setToolTip(text || PRODUCT_NAME);
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayController;
module.exports.PRODUCT_NAME = PRODUCT_NAME;
