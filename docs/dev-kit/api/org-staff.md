<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：组织与职员（`org-staff`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OrgStaff_remove` | DELETE | `/enterprise/org-staff/:id` | 移除组织成员 | 写 | session(会话) | id |  |  | data |
| `OrgStaff_update` | PATCH | `/enterprise/org-staff/:id` | 修改成员资料 | 写 | session(会话) | id |  | memberKind, roles, scope, department, positions, capabilities, status | data |
| `OrgStaff_decide` | POST | `/enterprise/org-staff/applications/:id/decide` | 确认或拒绝加入申请 | 写 | session(会话) | id |  | action | data |
| `OrgStaff_search` | GET | `/enterprise/org-staff/candidates` | 搜索可添加成员 | 读 | session(会话) |  | q |  | data |
| `OrgStaff_functions` | GET | `/enterprise/org-staff/functions` | 查看部门与岗位 | 读 | session(会话) |  | orgType |  | data |
| `OrgStaff_saveDepartment` | POST | `/enterprise/org-staff/functions/departments` | 新建或修改部门 | 写 | session(会话) |  |  | orgType, id, name, description, sortOrder | data |
| `OrgStaff_removeDepartment` | DELETE | `/enterprise/org-staff/functions/departments/:id` | 删除部门 | 写 | session(会话) | id | orgType |  | data |
| `OrgStaff_assignFunctions` | PUT | `/enterprise/org-staff/functions/members/:id` | 给成员赋职能 | 写 | session(会话) | id |  | orgType, department, positions | data |
| `OrgStaff_savePosition` | POST | `/enterprise/org-staff/functions/positions` | 新建或修改岗位 | 写 | session(会话) |  |  | orgType, id, name, description, sortOrder | data |
| `OrgStaff_removePosition` | DELETE | `/enterprise/org-staff/functions/positions/:id` | 删除岗位 | 写 | session(会话) | id | orgType |  | data |
| `OrgStaff_invite` | POST | `/enterprise/org-staff/invite` | 邀请职员或代理人 | 写 | session(会话) |  |  | orgType, memberUserId, memberKind, roles, scope, department, positions, capabilities | data |
| `OrgStaff_workspace` | GET | `/enterprise/org-staff/workspace` | 查看职员与代理人 | 读 | session(会话) |  | orgType |  | data |

返回 `INDEX.md`。

