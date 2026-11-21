import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  DEV_KIT_SKILLS,
  type DevGuideDoc,
  type DevGuideDownload,
  type DevGuideSaveBody,
  type DevGuideView,
  type DevKitSkillKey,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * 「二次开发指引」服务。
 *
 * 正文真源在仓库 docs/dev-kit/，后台只读渲染：任何接口清单、规则表都由真源或生成物提供，
 * 不在数据库里另存一份。数据库只放「本站补充说明」，避免形成第二份规范。
 */

const SETTINGS_KEY = 'dev_guide_notice';

/** 从 backend/src/dev-guide 与 backend/dist/dev-guide 上溯三层都落在仓库根。 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const KIT_ROOT = join(REPO_ROOT, 'docs', 'dev-kit');
const DOWNLOADS_ROOT = join(REPO_ROOT, 'frontend', 'public', 'downloads');

const DOCS: {
  key: DevGuideDoc['key'];
  title: string;
  file: string;
  extra?: string;
}[] = [
  { key: 'architecture', title: '架构说明', file: 'guides/01-architecture.md' },
  {
    key: 'api',
    title: '接口说明',
    file: 'guides/02-api.md',
    extra: 'api/INDEX.md',
  },
  {
    key: 'third-party',
    title: '外部引入代码包',
    file: 'guides/03-third-party.md',
  },
  {
    key: 'principles',
    title: '开发原则与一键接入',
    file: 'guides/04-principles.md',
  },
];

const COMMANDS = [
  { label: '生成本地入口、技能副本与接口索引', command: 'pnpm setup:dev-kit' },
  {
    label: '校验开发套件（生成物 / 入口 / 技能）',
    command: 'pnpm devkit:check',
  },
  { label: '重生成接口索引', command: 'pnpm api:index' },
  { label: '重新打包下载套件', command: 'pnpm pack:dev-kit' },
  {
    label: '提交前自检',
    command: 'pnpm typecheck && pnpm lint && pnpm check:architecture',
  },
];

const AI_PROMPT = [
  '读取 docs/dev-kit/AGENTS.md，按规则索引只加载与本任务相关的 rules/*.md。',
  '项目事实以代码、可执行配置与生成物为准；README 与设计文档中的统计数字不当作事实源。',
  '若根目录缺少 AGENTS.md / CLAUDE.md / GEMINI.md / .cursor/rules / .github/copilot-instructions.md，',
  '参照 docs/dev-kit/templates/ 生成薄入口；不要复制规则正文，不要覆盖已有自定义内容。',
  '完成后执行 docs/dev-kit/project.json 声明的最小验证命令，并如实报告未验证项。',
].join('\n');

type NoticeStore = { body: string; updatedAt: string | null };

const fallbackNotice = (): NoticeStore => ({ body: '', updatedAt: null });

export class DevGuideService {
  constructor(private readonly prisma: PrismaService) {}

  private async readKitFile(relative: string): Promise<string | null> {
    try {
      return await readFile(join(KIT_ROOT, relative), 'utf8');
    } catch {
      return null;
    }
  }

  private async kitVersion(): Promise<string> {
    const version = await this.readKitFile('VERSION');
    return version?.trim() || '0.0.0';
  }

  private async loadNotice(): Promise<NoticeStore> {
    const row = await this.prisma.systemSetting
      .findUnique({ where: { key: SETTINGS_KEY } })
      .catch(() => null);
    if (!row?.value) return fallbackNotice();
    try {
      const parsed = JSON.parse(row.value) as {
        body?: unknown;
        updatedAt?: unknown;
      };
      return {
        body:
          typeof parsed.body === 'string' ? parsed.body.slice(0, 20_000) : '',
        updatedAt:
          typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : row.updatedAt.toISOString(),
      };
    } catch {
      return fallbackNotice();
    }
  }

  private async saveNotice(
    user: CurrentUser,
    body: DevGuideSaveBody,
  ): Promise<void> {
    const store: NoticeStore = {
      body: body.notice.slice(0, 20_000),
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: JSON.stringify(store) },
      create: { key: SETTINGS_KEY, value: JSON.stringify(store) },
    });
    void user;
  }

  private async docs(): Promise<DevGuideDoc[]> {
    return Promise.all(
      DOCS.map(async (item) => {
        const main = await this.readKitFile(item.file);
        const extra = item.extra ? await this.readKitFile(item.extra) : null;
        const sections = [
          main ??
            `> 未找到真源 \`docs/dev-kit/${item.file}\`，请确认部署包含 docs/dev-kit。`,
          extra ? `\n\n---\n\n${extra}` : '',
        ];
        return {
          key: item.key,
          title: item.title,
          source: [
            'docs/dev-kit/' + item.file,
            item.extra ? 'docs/dev-kit/' + item.extra : '',
          ]
            .filter(Boolean)
            .join(' + '),
          markdown: sections.join(''),
        };
      }),
    );
  }

  private download(
    key: string,
    title: string,
    description: string,
    fileName: string,
  ): DevGuideDownload {
    return {
      key,
      title,
      description,
      fileName,
      downloadUrl: `/downloads/${fileName}`,
      available: existsSync(join(DOWNLOADS_ROOT, fileName)),
    };
  }

  private skills(): DevGuideDownload[] {
    return (Object.keys(DEV_KIT_SKILLS) as DevKitSkillKey[]).map((key) => {
      const skill = DEV_KIT_SKILLS[key];
      return this.download(key, skill.title, skill.description, skill.zipFile);
    });
  }

  async adminView(): Promise<DevGuideView> {
    const [docs, version, notice] = await Promise.all([
      this.docs(),
      this.kitVersion(),
      this.loadNotice(),
    ]);
    return {
      kitVersion: version,
      docs,
      skills: this.skills(),
      kit: this.download(
        'dev-kit',
        '完整开发套件',
        '根目录摊平：六工具入口 + docs/dev-kit/ + 两套技能副本，解压到任意仓库根即可用。',
        `enterprise-dev-kit-v${version}.zip`,
      ),
      commands: COMMANDS,
      aiPrompt: AI_PROMPT,
      notice: notice.body,
      noticeUpdatedAt: notice.updatedAt,
    };
  }

  async save(user: CurrentUser, body: DevGuideSaveBody): Promise<DevGuideView> {
    await this.saveNotice(user, body);
    return this.adminView();
  }
}
