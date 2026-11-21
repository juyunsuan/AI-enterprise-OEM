import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..');const errors=[];
const require=createRequire(path.join(root,'backend/package.json'));
const ts=require('typescript');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
for(const base of ['frontend/src','backend/src'])for(const file of files(path.join(root,base)).filter(file=>/\.tsx?$/.test(file)&&!file.endsWith('.spec.ts'))){
 const source=readFileSync(file,'utf8'),relative=path.relative(root,file).split(path.sep).join('/');
 if(/(?<![\w.$])fetch\s*\(/.test(source)&&!['frontend/src/api/http.ts','backend/src/http/transport.ts','backend/src/http/app.ts'].includes(relative))errors.push(`${relative}: 网络请求必须经过统一传输层`);
 if(relative.startsWith('frontend/')&&/from\s*['"]@\/lib\/api['"]/.test(source))errors.push(`${relative}: 已移除旧请求入口，请使用具名业务 API`);
 if(source.includes('@nestjs/'))errors.push(`${relative}: 遗留 Nest 依赖`);
 if(relative.startsWith('frontend/')&&/\bfrom\s*['"][^'"]*(generated\/prisma|backend\/src)|process\.env\.(JWT_SECRET|EXTERNAL_CRED_KEY)/.test(source))errors.push(`${relative}: 浏览器模块不能依赖服务端配置或数据库`);
 if(relative.startsWith('frontend/')&&!relative.startsWith('frontend/src/api/')&&/import\s*\{[^}]*\bhttp\b[^}]*\}\s*from\s*['"]@\/api\/http['"]/.test(source))errors.push(`${relative}: 页面与 Hook 不能越过业务 API 直接调用 HTTP 客户端`);
}
for(const file of files(path.join(root,'packages/contracts/src')).filter(file=>file.endsWith('.ts'))){
 const source=readFileSync(file,'utf8'),relative=path.relative(root,file).split(path.sep).join('/');
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 function visit(node){
  if(ts.isAsExpression(node)&&node.type.getText(ast)!=='const')errors.push(`${relative}: 契约通过 Schema 推导类型，不允许类型断言`);
  if(ts.isImportDeclaration(node)){const target=node.moduleSpecifier.text;if(target!=='zod'&&!target.startsWith('.'))errors.push(`${relative}: 契约不能依赖服务端或应用运行时`);}
  ts.forEachChild(node,visit);
 }
 visit(ast);
}
// AI 出口收口：除网关自身与 GEO 自带 Key 链路，任何真正调用 geoChat* 的文件都要
// ① 先过闸门（拿到平台/用户解析出的通道），② 留用量事实（recordAiUsage/meterChatCall 或走 aiChat 家族）。
// 只看"提到了 geoChatMulti 字样"是假守护：直连不计量也能过，成本照样黑洞。
const AI_GATEWAY = ['backend/src/ai/ai-gateway.ts','backend/src/geo/geo-llm.client.ts','backend/src/geo/geo-collection.service.ts','backend/src/geo/geo-settings.service.ts'];
// 触发条件用「实际调用」而非 import：多个服务只借用 ChatMessage 类型与 messageText 助手。
const AI_CALL = /\bgeoChat(Multi|Stream)?\s*\(|\bgeoEmbed\s*\(/;
const AI_GUARD = /resolveTarget\s*\(|resolveModel\s*\(|requireModel\s*\(|assertAiAllowed\s*\(|aiGuardDeny\s*\(|accountSlot\s*\(/;
const AI_METER = /meterChatCall\s*\(|recordAiUsage\s*\(|aiChat\s*\(|aiJson\s*\(|aiStream\s*\(|aiEmbed\s*\(|chargeByUsage\s*\(|recordUsage\s*\(/;
for(const file of files(path.join(root,'backend/src')).filter(file=>file.endsWith('.ts')&&!file.endsWith('.spec.ts'))){
 const source=readFileSync(file,'utf8'),relative=path.relative(root,file).split(path.sep).join('/');
 if(AI_GATEWAY.includes(relative)||!AI_CALL.test(source))continue;
 if(!AI_GUARD.test(source))errors.push(`${relative}: 直连模型必须先过 AI 闸门（resolveTarget / resolveModel / assertAiAllowed / aiGuardDeny）`);
 if(!AI_METER.test(source))errors.push(`${relative}: 直连模型必须留用量事实（meterChatCall / recordAiUsage / aiChat 家族），否则成本不可见`);
}
// 字节出口唯一：业务模块不得绕过 StorageService/SystemAssetService 直连 OssService 写字节。
// 绕过一次的代价是这笔字节不进 digital_asset_entries —— 用量看不见、费用算不到、治理找不到。
const OSS_FACADE_ALLOWED = ['backend/src/oss/oss.service.ts','backend/src/oss/oss-settings.service.ts','backend/src/storage/storage.service.ts'];
const OSS_WRITE = /\boss\.upload\s*\(|\bOssService\b[\s\S]{0,40}?\.upload\s*\(/;
for(const file of files(path.join(root,'backend/src')).filter(file=>file.endsWith('.ts')&&!file.endsWith('.spec.ts'))){
 const source=readFileSync(file,'utf8'),relative=path.relative(root,file).split(path.sep).join('/');
 if(OSS_FACADE_ALLOWED.includes(relative)||!OSS_WRITE.test(source))continue;
 errors.push(`${relative}: 字节写入必须经 SystemAssetService.put（落台账）或 StorageService 门面，不许直连 OssService.upload`);
}
// 跨域直读 ERP：零容忍。
// 迁移期用的是「每文件配额、只减不增」的预算表（docs/migration/erp-direct-access-budget.json），
// 2026-11-19 读侧收口到 ErpPort、写侧收口到 ErpWritePort、主数据导入导出改由 ERP 域注册之后，
// 预算已全部归零，于是把规则升级成「任何 prisma.erp* 都不许出现在 erp/ 之外」——
// 预算表删掉比留着更危险：留着的下一步就是有人给自己加一格。
// ERP 数据只能通过 erp/erp-port.ts（读）与 erp/erp-write-port.ts（写）进出；
// 机制层的导入导出模块由各业务域自己注册（见 erp/erp-mechanism.module.ts）。
{
 const tally=new Map();
 for(const file of files(path.join(root,'backend/src')).filter(file=>file.endsWith('.ts')&&!file.endsWith('.spec.ts'))){
  const relative=path.relative(path.join(root,'backend/src'),file).split(path.sep).join('/');
  if(relative.startsWith('erp/'))continue;
  const hits=readFileSync(file,'utf8').match(/prisma\.erp[A-Za-z]*\./g);
  if(hits) tally.set(relative,(tally.get(relative)||0)+hits.length);
 }
 for(const [relative,count] of tally)errors.push(`src/${relative}: 跨域直读直写 ERP（${count} 处）。读数改 ErpPort，写单改 ErpWritePort，导入导出由本域注册模块`);
 if(!tally.size)console.log('ERP 跨域访问零直连检查通过（读写都只经 erp/ 端口）');
}
// 商城引擎保持纯函数：commerce-core 不得反向 import 业务模块/数据库/契约
for(const file of files(path.join(root,'backend/src/commerce-core')).filter(file=>file.endsWith('.ts'))){
 const source=readFileSync(file,'utf8'),relative=path.relative(root,file).split(path.sep).join('/');
 for(const match of source.matchAll(/from\s*['"]([^'"]+)['"]/g)){
  const target=match[1];
  if(target.startsWith('../'))errors.push(`${relative}: commerce-core 不能 import 业务模块（${target}）`);
  else if(!target.startsWith('./')&&!target.startsWith('node:'))errors.push(`${relative}: commerce-core 只能依赖自身与 node 内置模块（${target}）`);
 }
}
// 两个商城业务互不引用；SCRM / 客服底座只走端口或只读查询，禁止直接写共享表
const SHARED_DB_WRITE=/\$(?:execute|query)Raw(?:Unsafe)?\s*\([\s\S]{0,400}?\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[`"']?(scrm_|service_desk_)/i;
const PORTAL_WRITE=/\.(?:serviceDesk[A-Za-z]*|scrm[A-Za-z]*)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
for(const dir of ['backend/src/brand-mall','backend/src/marketplace']){
 for(const file of files(path.join(root,dir)).filter(file=>file.endsWith('.ts')&&!file.endsWith('.spec.ts'))){
  const source=readFileSync(file,'utf8'),relative=path.relative(root,file).split(path.sep).join('/');
  const other=dir.endsWith('brand-mall')?'marketplace':'brand-mall';
  if(new RegExp(`from\\s*['"][^'"]*\\b${other}/`).test(source))errors.push(`${relative}: brand-mall 与 marketplace 不得互相 import`);
  if(SHARED_DB_WRITE.test(source))errors.push(`${relative}: 不得直接写 scrm_*/service_desk_* 共享表，请走 ScrmBridge / 客服接口`);
  if(PORTAL_WRITE.test(source))errors.push(`${relative}: 不得直接写 scrm*/serviceDesk* 模型，请走 ScrmBridge / 客服接口`);
 }
}
const baseline=JSON.parse(readFileSync(path.join(root,'docs/migration/route-baseline.json'),'utf8'));
const routeDir=path.join(root,'backend/src/http/route-groups');
const routes=[readFileSync(path.join(root,'backend/src/http/routes.ts'),'utf8'),
  ...readdirSync(routeDir).filter(file=>file.endsWith('.ts')).map(file=>readFileSync(path.join(routeDir,file),'utf8'))].join('\n');
for(const route of baseline)if(!(routes.includes(`"${route.operationId}"`)||routes.includes(`'${route.operationId}'`)))errors.push(`遗漏迁移路由: ${route.operationId}`);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`架构边界检查通过（${baseline.length} 个业务路由）`);
// 全部原生小程序模板共用骨架（shared/mini-core/core.js）以「构建期注入 + 哈希校验」落地：
// 模板里的 utils/core.js 是 sync.mjs 复制出来的副本，手改副本 / 改了真源忘了跑 sync:mini-core，
// 都会让某个租户的小程序带着旧骨架出包——这类分叉编译不报错、线上才炸，所以按架构违规处理。
// 另一半是 ES5 底线：这份文件被老基础库直接执行，混进 ES6 语法不是降级而是整包白屏，
// 所以真源一越界就拦在提交前，而不是等某个租户的小程序打不开。
const {TEMPLATES,diff:miniCoreDiff,sourceViolationReport}=await import('../shared/mini-core/sync.mjs');
const miniCoreEs5=sourceViolationReport();
if(miniCoreEs5){console.error(miniCoreEs5);process.exitCode=1;}
const miniCoreBad=miniCoreDiff();
for(const file of miniCoreBad){console.error(`${file}: 与 shared/mini-core/core.js 不一致，请跑 node shared/mini-core/sync.mjs`);process.exitCode=1;}
if(!miniCoreBad.length&&!miniCoreEs5)console.log(`mini-core 单一真源校验通过（${TEMPLATES.length} 个模板 · ES5 底线合格）`);
