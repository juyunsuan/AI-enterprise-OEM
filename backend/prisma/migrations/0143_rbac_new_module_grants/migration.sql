-- 0143 子账号授权口径对齐（RBAC 本轮补了 13 个模块：AI客服、健康管理、知识付费、数字人、
-- 卡密商城、快递寄件、多店铺商城、AI邮箱、多维表格、RPA、专题大厅、应用中心、数字资产）。
--
-- 补模块后，既有子账号在新模块上会被后端守卫拦下。这里只升级「从来没被手工定制过」的成员：
-- 存的 scopes 与该角色的旧默认集完全相同（或为空）时才跟着新默认走；
-- 主账号手工勾选过的一律原样保留——既不擅自收窄，也不擅自扩大任何人的权限。
-- 财务（FINANCE）与只读（VIEWER）的默认集没有新模块，保持不变，需要时由主账号自行勾选。

-- ADMIN：旧默认＝当时全量 16 个模块；新默认＝全量 29 个模块
UPDATE `sub_accounts`
SET `scopes_json` = CAST(
  '["tasks","agent","onsite","crm","bi","insight","oa","okr","hrm","project","erp","brand-mall","community","content","kb","mkt","service-desk","health","knowledge-pay","digital-human","card-shop","kuaidi","marketplace","mail","data-table","rpa","question-hall","app-center","assets"]' AS JSON
)
WHERE `role_code` = 'ADMIN'
  AND (
    `scopes_json` IS NULL
    OR JSON_LENGTH(`scopes_json`) = 0
    OR (
      JSON_CONTAINS(`scopes_json`, CAST('["tasks","agent","onsite","crm","bi","insight","oa","okr","hrm","project","erp","brand-mall","community","content","kb","mkt"]' AS JSON))
      AND JSON_CONTAINS(CAST('["tasks","agent","onsite","crm","bi","insight","oa","okr","hrm","project","erp","brand-mall","community","content","kb","mkt"]' AS JSON), `scopes_json`)
    )
  );

-- OPERATOR：旧默认＝7 个执行面模块；新默认再加客服与各建站工具（运营日常要接待与建站）
UPDATE `sub_accounts`
SET `scopes_json` = CAST(
  '["tasks","agent","crm","onsite","content","mkt","community","service-desk","health","knowledge-pay","digital-human","card-shop","kuaidi","marketplace","mail","data-table","rpa","question-hall","app-center","assets"]' AS JSON
)
WHERE `role_code` = 'OPERATOR'
  AND (
    `scopes_json` IS NULL
    OR JSON_LENGTH(`scopes_json`) = 0
    OR (
      JSON_CONTAINS(`scopes_json`, CAST('["tasks","agent","crm","onsite","content","mkt","community"]' AS JSON))
      AND JSON_CONTAINS(CAST('["tasks","agent","crm","onsite","content","mkt","community"]' AS JSON), `scopes_json`)
    )
  );
