import { spawn } from 'node:child_process';
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { extractZipBufferToDir } from './zip-extract';

export type MiniProgramCiUploadInput = {
  bytes: Buffer;
  appId: string;
  privateKey: string;
  robot: number;
  version: string;
  desc: string;
};

const PROJECT_CONFIG = 'project.config.json';
const BACKEND_ROOT = resolve(__dirname, '..', '..');
const UPLOAD_TIMEOUT_MS = 240_000;
const UPLOAD_IGNORES = ['node_modules/**', '.git/**', '*.key'];

type CiJob = {
  projectPath: string;
  appId: string;
  privateKey: string;
  robot: number;
  version: string;
  desc: string;
  ignores: string[];
  ciModule: string;
  resultPath: string;
};

type CiOutcome = { ok: true } | { ok: false; message: string; wechat: boolean };

/**
 * `miniprogram-ci` 的类型图有 300 个声明文件，静态引用会把 `tsc` 内存顶到 4GB 以上，
 * 放到子进程里跑就完全绕开：主进程只说一句「用这个模块路径」，类型系统根本不碰这个包。
 *
 * 另一层原因是它上传失败时会抛出**未处理的 Promise 拒绝**——在主进程里跑会把整个
 * 后端进程带走，所以必须在子进程内捕获并只回传一条消息。
 */
const RUNNER_SOURCE = `
const fs = require('node:fs');
const write = (payload) => {
  try {
    fs.writeFileSync(process.env.CI_RESULT_PATH || '', JSON.stringify(payload));
  } catch (error) {}
  process.exit(payload.ok ? 0 : 1);
};
const fail = (error) =>
  write({
    ok: false,
    message: error && error.message ? String(error.message) : String(error),
  });
process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', async () => {
  try {
    const job = JSON.parse(raw || '{}');
    let ci;
    try {
      ci = require(String(job.ciModule));
    } catch (error) {
      ci = require('miniprogram-ci');
    }
    const project = new ci.Project({
      projectPath: job.projectPath,
      type: 'miniProgram',
      appid: job.appId,
      privateKey: job.privateKey,
      ignores: job.ignores,
    });
    await ci.upload({
      project: project,
      version: job.version,
      desc: job.desc,
      robot: job.robot,
    });
    write({ ok: true });
  } catch (error) {
    fail(error);
  }
});
`;

let ciModulePath: string | null = null;

/** 让子进程按后端自己的依赖树解析 `miniprogram-ci`（pnpm 下 cwd 解析不一定命中）。 */
function resolveCiModulePath(): string {
  if (ciModulePath) return ciModulePath;
  try {
    ciModulePath = createRequire(join(BACKEND_ROOT, 'package.json')).resolve(
      'miniprogram-ci',
    );
  } catch {
    ciModulePath = 'miniprogram-ci';
  }
  return ciModulePath;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** 把 `miniprogram-ci` 抛出的错误收敛成一条可执行的中文提示。 */
function describeWechatUploadError(error: unknown, withHint = true): string {
  const raw = error instanceof Error ? error.message : String(error);
  const detail = raw.replace(/\s+/g, ' ').trim().slice(0, 300) || '未知错误';
  if (!withHint) return `微信代码上传失败：${detail}`;
  const hint = /ip|白名单|whitelist/i.test(raw)
    ? '（请在微信公众平台「开发管理 → 开发设置 → 小程序代码上传」把本服务器公网 IP 加入白名单）'
    : '（请核对代码上传密钥与 AppID 是否属于同一个小程序）';
  return `微信代码上传失败：${detail}${hint}`;
}

/**
 * 后台直传微信：把代码包落到临时项目目录，交给微信官方 `miniprogram-ci` 上传（生成开发版）。
 * 只做到「上传」这一步——提交审核与发布仍需在微信公众平台完成。
 *
 * 三点必须处理（都只改临时副本，不动源包、不落私钥）：
 * - 随包携带的 `project.config.json` 是 `touristappid` 占位，上传前换成后台配置的 AppID；
 * - 上传密钥只经子进程标准输入传递，不写进工程目录，避免被一起打包上传；
 * - 上传在子进程内完成，失败不会连带后端进程退出。
 */
export class MiniProgramCiService {
  async upload(input: MiniProgramCiUploadInput): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'miniprogram-ci-'));
    try {
      const count = await extractZipBufferToDir(input.bytes, dir);
      if (!count) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '代码包内没有可用文件，请确认压缩包内容',
        );
      }
      const projectPath = await this.prepareProject(dir, input.appId);
      const result = await this.runIsolated({
        projectPath,
        appId: input.appId,
        privateKey: input.privateKey,
        robot: input.robot,
        version: input.version,
        desc: input.desc,
        ignores: UPLOAD_IGNORES,
        ciModule: resolveCiModulePath(),
        resultPath: join(dir, 'ci-result.json'),
      });
      if (!result.ok) {
        throw new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          describeWechatUploadError(result.message, result.wechat),
        );
      }
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        describeWechatUploadError(error),
      );
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** 在隔离子进程里跑一次上传，把 `miniprogram-ci` 的崩溃与未处理拒绝关在子进程内。 */
  private runIsolated(job: CiJob): Promise<CiOutcome> {
    return new Promise<CiOutcome>((resolve) => {
      const { resultPath, ...payload } = job;
      const child = spawn(process.execPath, ['-e', RUNNER_SOURCE], {
        cwd: BACKEND_ROOT,
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'ignore'],
        env: { ...process.env, CI_RESULT_PATH: resultPath },
      });
      let settled = false;
      const state: { timer?: NodeJS.Timeout } = {};
      const done = (value: CiOutcome) => {
        if (settled) return;
        settled = true;
        if (state.timer) clearTimeout(state.timer);
        resolve(value);
      };
      state.timer = setTimeout(() => {
        child.kill('SIGKILL');
        done({
          ok: false,
          message: `上传超时（超过 ${UPLOAD_TIMEOUT_MS / 1000} 秒），请稍后重试`,
          wechat: false,
        });
      }, UPLOAD_TIMEOUT_MS);
      child.on('error', (error) =>
        done({ ok: false, message: error.message, wechat: false }),
      );
      child.on('close', () => {
        void (async () => {
          const raw = await readFile(resultPath, 'utf8').catch(() => '');
          if (!raw) {
            return done({
              ok: false,
              message: '上传进程异常退出，未返回结果，请重试',
              wechat: false,
            });
          }
          try {
            const parsed = JSON.parse(raw) as {
              ok?: boolean;
              message?: string;
            };
            if (parsed.ok === true) return done({ ok: true });
            done({
              ok: false,
              message: String(parsed.message || '未知错误'),
              wechat: true,
            });
          } catch {
            done({
              ok: false,
              message: '上传进程返回结果无法解析，请重试',
              wechat: false,
            });
          }
        })();
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(JSON.stringify(payload));
    });
  }

  /** 定位工程根（兼容「zip 里套一层目录」），并把占位 AppID 换成配置值。 */
  private async prepareProject(dir: string, appId: string): Promise<string> {
    const root = await this.resolveProjectRoot(dir);
    const configPath = join(root, PROJECT_CONFIG);
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(await readFile(configPath, 'utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '代码包不是合法的小程序工程：project.config.json 无法解析',
      );
    }
    if (config.appid !== appId) {
      config.appid = appId;
      await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    }
    return root;
  }

  private async resolveProjectRoot(dir: string): Promise<string> {
    if (await isFile(join(dir, PROJECT_CONFIG))) return dir;
    const entries = await readdir(dir, { withFileTypes: true });
    const folders = entries.filter((entry) => entry.isDirectory());
    if (folders.length === 1) {
      const nested = join(dir, folders[0].name);
      if (await isFile(join(nested, PROJECT_CONFIG))) return nested;
    }
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '代码包根目录缺少 project.config.json，请上传以 app.json / project.config.json 为根的工程压缩包',
    );
  }
}
