import { moduleOfPath } from './rbac.middleware';

describe('moduleOfPath', () => {
  it('按模块前缀匹配', () => {
    expect(moduleOfPath('/enterprise/crm/workbench')?.key).toBe('crm');
    expect(moduleOfPath('/enterprise/bi/datasources')?.key).toBe('bi');
    expect(moduleOfPath('/enterprise/my-tasks/12/close')?.key).toBe('tasks');
  });

  it('未登记路径不做模块限制', () => {
    expect(moduleOfPath('/enterprise/account/profile')).toBeNull();
    expect(moduleOfPath('/enterprise/rbac/members')).toBeNull();
  });

  it('前缀必须到路径段边界', () => {
    expect(moduleOfPath('/enterprise/crmx')).toBeNull();
    expect(moduleOfPath('/enterprise/agent/overview')?.key).toBe('agent');
  });
});
