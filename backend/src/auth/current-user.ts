export class CurrentUser {
  constructor(
    /** 数据归属账号：子账号登录时也为主账号 id（业务数据按此隔离）。 */
    readonly userId: string,
    readonly username: string,
    readonly role: string,
    /** 实际操作人：主账号本人＝userId；子账号＝子账号自己的 Account.id。 */
    readonly actorUserId: string = userId,
    /** 子账号 id（主账号为空）。 */
    readonly subAccountId?: number,
    /** 子账号可访问的业务模块 key；主账号为 undefined（不限制）。 */
    readonly scopes?: string[],
    readonly subAccountName?: string,
    /** 会话令牌里的 tokenVersion（子账号换发时沿用主账号的值）。 */
    readonly tokenVersion?: number,
  ) {}
  isAdmin(): boolean {
    return this.role === 'admin' || this.role === 'super';
  }
  isSubAccount(): boolean {
    return typeof this.subAccountId === 'number' && this.subAccountId > 0;
  }
  /** 自助操作（资料/密码/安全视图）作用在哪个登录账户上。 */
  selfId(): string {
    return this.actorUserId || this.userId;
  }
}
