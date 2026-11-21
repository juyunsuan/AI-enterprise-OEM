/**
 * 商城中台对外出口：业务模块只从 `../commerce-core` 引用，不逐个文件深引。
 *
 * 引擎内部约定：这里导出的每个文件都不得 import 任何业务 service / model，
 * 也不得出现具体业务的表名；反向的依赖由 check:architecture 扫描拦截。
 */
export * from './types';
export * from './money';
export * from './ident';
export * from './product';
export * from './cart';
export * from './pricing';
export * from './split';
export * from './order-machine';
export * from './aftersale';
export * from './diy';
export * from './support';
export * from './publish';
export * from './scrm-port';
export * from './modules';
