import { effectiveAiMode } from './service-desk.service';

/**
 * 会话应答模式（纯函数）：AI 员工接待时以员工口径为准，转人工与显式关停是会话级例外。
 * 这条口径容易写反——`row.aiMode` 在建会话时就落成了账号设置的快照、永远非空，
 * 简单 `row.aiMode || agent.mode` 会让员工配置永远不生效，所以单独钉住。
 */
describe('effectiveAiMode', () => {
  it('在岗 AI 员工接待时忽略账号快照，按员工自己的口径走', () => {
    // 账号当年是 CANNED（默认值），员工设成 AUTO/BOT 都要生效
    expect(effectiveAiMode('CANNED', 'AUTO', true)).toBe('AUTO');
    expect(effectiveAiMode('CANNED', 'BOT', true)).toBe('BOT');
    expect(effectiveAiMode('AUTO', 'BOT', true)).toBe('BOT');
  });

  it('转人工与显式关停这两个会话级例外压过员工配置', () => {
    expect(effectiveAiMode('SUGGEST', 'AUTO', true)).toBe('SUGGEST');
    expect(effectiveAiMode('OFF', 'BOT', true)).toBe('OFF');
  });

  it('没有员工在岗时保持原口径：会话快照优先，缺省回落账号设置', () => {
    expect(effectiveAiMode('AUTO', 'CANNED', false)).toBe('AUTO');
    expect(effectiveAiMode('', 'CANNED', false)).toBe('CANNED');
  });
});
