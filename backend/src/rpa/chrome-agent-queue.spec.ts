import { RC_AGENT_QUEUE_MAX } from '@enterprise/contracts';
import { normalizeExpect, normalizePlanQueue } from './chrome-agent.service';

const noConfirm = () => false;
const allAvailable = ['act', 'read', 'snapshot', 'wait', 'navigate', 'harvest'];

describe('意图队列（N14=A）整形与截断', () => {
  it('合法多步整形成队列，plan 原样带回', () => {
    const { steps, plan } = normalizePlanQueue(
      {
        plan: '先搜索再抓取',
        queue: [
          {
            action: { action: 'act', act: 'click', selector: '#q' },
            thought: '点搜索框',
          },
          { action: { action: 'read', selector: 'body' }, thought: '读结果' },
        ],
      },
      allAvailable,
      noConfirm,
    );
    expect(plan).toBe('先搜索再抓取');
    expect(steps).toHaveLength(2);
    expect(steps[0].action).toEqual({
      action: 'act',
      act: 'click',
      selector: '#q',
    });
    expect(steps[1].thought).toBe('读结果');
  });

  it('不足两步视为没给队列，交回单步路径', () => {
    const { steps } = normalizePlanQueue(
      { queue: [{ action: { action: 'read', selector: 'body' } }] },
      allAvailable,
      noConfirm,
    );
    expect(steps).toEqual([]);
  });

  it('某一步不合法就截断在它之前（后续步骤不再盲跑）', () => {
    const { steps } = normalizePlanQueue(
      {
        queue: [
          { action: { action: 'read', selector: 'body' } },
          { action: { action: '不存在的动作' } },
          { action: { action: 'snapshot' } },
        ],
      },
      allAvailable,
      noConfirm,
    );
    // 截断后只剩 1 步，不足两步 → 整串作废。
    expect(steps).toEqual([]);
  });

  it('这台插件跑不动的原语也截断', () => {
    const { steps } = normalizePlanQueue(
      {
        queue: [
          { action: { action: 'read', selector: 'body' } },
          { action: { action: 'harvest', selector: '.item' } },
          { action: { action: 'snapshot' } },
        ],
      },
      ['read', 'snapshot'],
      noConfirm,
    );
    // harvest 不在本机能力集里 → 截断在它之前，只剩 1 步 → 作废。
    expect(steps).toEqual([]);
  });

  it('队列长度按上限裁剪', () => {
    const queue = Array.from({ length: RC_AGENT_QUEUE_MAX + 4 }, () => ({
      action: { action: 'snapshot' },
    }));
    const { steps } = normalizePlanQueue({ queue }, allAvailable, noConfirm);
    expect(steps).toHaveLength(RC_AGENT_QUEUE_MAX);
  });

  it('敏感步由同一套敏感闸单独判定', () => {
    const { steps } = normalizePlanQueue(
      {
        queue: [
          { action: { action: 'read', selector: 'body' } },
          { action: { action: 'act', act: 'click', selector: '#pay' } },
        ],
      },
      allAvailable,
      (action) => action.selector === '#pay',
    );
    expect(steps[0].needsConfirm).toBe(false);
    expect(steps[1].needsConfirm).toBe(true);
  });
});

describe('连跑预期（expect）归一化', () => {
  it('四个断言都空视为没给预期', () => {
    expect(normalizeExpect({})).toBeNull();
    expect(
      normalizeExpect({ urlIncludes: '', text: '', selector: '', gone: '' }),
    ).toBeNull();
  });

  it('只收四种已知断言，其余字段忽略', () => {
    expect(
      normalizeExpect({ urlIncludes: '/done', extra: '不该进来' }),
    ).toEqual({ urlIncludes: '/done', text: '', selector: '', gone: '' });
  });
});
