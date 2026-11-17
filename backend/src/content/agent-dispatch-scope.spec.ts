import { dispatchScopeBlock, parseDispatchScope } from './agent.service';

/**
 * 群控范围的两处口径（docs/Agent群控（替换插件页签）产品设计方案.md §4.1.2 / §4.2）：
 * 请求体里的 dispatchScope 只认合法设备类型（脏值一律丢掉，模型不能自己扩范围）；
 * 提示词协作段只在真的勾了范围时追加，并把「先查设备、等确认、逐台拆单」写死。
 */
describe('parseDispatchScope', () => {
  it('只保留合法设备类型并去重', () => {
    expect(
      parseDispatchScope(['desktop', 'MOBOT', 'bogus', 'DESKTOP', 0, null]),
    ).toEqual(['DESKTOP', 'MOBOT']);
  });

  it('非数组或缺省都算没开群控', () => {
    expect(parseDispatchScope('DESKTOP')).toEqual([]);
    expect(parseDispatchScope(undefined)).toEqual([]);
    expect(parseDispatchScope([1, 'yes'])).toEqual([]);
  });
});

describe('dispatchScopeBlock', () => {
  it('按勾选范围写清设备类型，并把确认与拆单规则钉进提示词', () => {
    const block = dispatchScopeBlock(['DESKTOP', 'MOBOT']);
    expect(block).toContain('【本轮开启 Agent 群控】');
    expect(block).toContain('Bot 主机 + Mobot 手机');
    expect(block).toContain('list_dispatch_devices');
    expect(block).toContain('等用户确认');
    expect(block).toContain('拆成多条任务分别派发');
    expect(block).toContain('4000 字');
    expect(block).toContain('站内通知');
  });

  it('只勾手机时不承诺主机能力', () => {
    const block = dispatchScopeBlock(['MOBOT']);
    expect(block).toContain('Mobot 手机');
    expect(block).not.toContain('Bot 主机 +');
  });
});
