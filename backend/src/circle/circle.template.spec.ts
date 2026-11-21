import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..', '..');
const dir = resolve(root, 'circle-miniprogram');

function text(relative: string) {
  return readFileSync(resolve(dir, relative), 'utf8');
}

describe('圈子社区小程序模板完整性', () => {
  it('页面三件套与公共骨架齐全', () => {
    for (const file of [
      'app.json',
      'app.js',
      'app.wxss',
      'config.js',
      'project.config.json',
      'utils/core.js',
      'utils/request.js',
      'utils/session.js',
      'utils/auth.js',
      'utils/api.js',
      'pages/index/index.js',
      'pages/index/index.wxml',
      'pages/groups/groups.js',
      'pages/group-detail/group-detail.js',
      'pages/post-detail/post-detail.js',
      'pages/post-create/post-create.js',
      'pages/mine/mine.js',
      'pages/messages/messages.js',
      'pages/service/service.js',
      'pages/my-groups/my-groups.js',
      'pages/group-manage/group-manage.js',
      'pages/activity-detail/activity-detail.js',
    ]) {
      expect(existsSync(resolve(dir, file))).toBe(true);
    }
  });

  it('配置占位保持空串，账号参数由用户自填', () => {
    const config = text('config.js');
    expect(config).toMatch(/templateVersion:\s*"[^"]+"/);
    expect(config).toMatch(/apiBase:\s*""/);
    expect(config).toMatch(/communityCode:\s*""/);
    const project = JSON.parse(text('project.config.json'));
    expect(project.appid).toBe('');
  });

  it('tabBar 与页面声明一致', () => {
    const app = JSON.parse(text('app.json')) as {
      pages?: string[];
      tabBar?: { list?: { pagePath: string }[] };
    };
    const pages: string[] = app.pages || [];
    expect(pages).toContain('pages/index/index');
    expect(pages).toContain('pages/post-detail/post-detail');
    expect(pages).toContain('pages/service/service');
    expect(pages).toContain('pages/activity-detail/activity-detail');
    const tabs = (app.tabBar?.list || []).map(
      (item: { pagePath: string }) => item.pagePath,
    );
    expect(tabs).toEqual([
      'pages/index/index',
      'pages/groups/groups',
      'pages/messages/messages',
      'pages/mine/mine',
    ]);
  });
});
