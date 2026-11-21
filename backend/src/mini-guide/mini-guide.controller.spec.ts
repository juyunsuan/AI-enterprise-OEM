import { endpoints } from '@enterprise/contracts';
import { MiniGuideController } from './mini-guide.controller';
import { MiniGuideAdminController } from './mini-guide.controller';
import { stub } from '../../test/doubles';

/**
 * 端点 id 与控制器方法名必须一一对得上：`moduleHandlers(prefix)` 是按
 * `operationId 去掉前缀 → 首字母小写` 找方法的，名字错一个字母就是线上 400
 * 「接口处理器缺失」，而 tsc 与契约检查都发现不了（两边都是合法字符串）。
 */
const METHOD_BY_OPERATION: Record<string, string> = Object.keys(endpoints)
  .filter(
    (id) => id.startsWith('MiniGuide_') || id.startsWith('MiniGuideAdmin_'),
  )
  .reduce<Record<string, string>>((acc, id) => {
    const suffix = id.startsWith('MiniGuideAdmin_')
      ? id.slice('MiniGuideAdmin_'.length)
      : id.slice('MiniGuide_'.length);
    acc[id] = suffix.charAt(0).toLowerCase() + suffix.slice(1);
    return acc;
  }, {});

describe('mini-guide 端点与方法名对齐', () => {
  it('新增端点也能解析到控制器方法', () => {
    const user = stub<MiniGuideController>({
      view: () => undefined,
      shared: () => undefined,
      downloadPackage: () => undefined,
    });
    const admin = stub<MiniGuideAdminController>({
      view: () => undefined,
      save: () => undefined,
    });
    const target: Record<string, object> = {
      MiniGuide_view: user,
      MiniGuide_shared: user,
      MiniGuide_downloadPackage: user,
      MiniGuideAdmin_view: admin,
      MiniGuideAdmin_save: admin,
    };
    expect(Object.keys(METHOD_BY_OPERATION)).toHaveLength(5);
    for (const [operationId, methodName] of Object.entries(
      METHOD_BY_OPERATION,
    )) {
      const controller = target[operationId] as Record<string, unknown>;
      expect(typeof controller[methodName]).toBe('function');
    }
  });
});
