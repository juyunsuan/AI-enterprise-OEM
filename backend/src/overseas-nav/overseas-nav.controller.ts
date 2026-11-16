import { ok } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import { OverseasNavService } from './overseas-nav.service';

/** 出海导航：用户端读可见树；管理端读写全部分类与站点。 */
export class OverseasNavController {
  constructor(private readonly service: OverseasNavService) {}

  async tree(user: CurrentUser) {
    return ok(await this.service.tree(false));
  }

  async adminTree(user: CurrentUser) {
    this.requireAdmin(user);
    return ok(await this.service.tree(true));
  }

  async saveCategory(user: CurrentUser, body: Record<string, unknown>) {
    this.requireAdmin(user);
    return ok(
      await this.service.saveCategory({
        id: body.id === undefined ? undefined : Number(body.id),
        name: String(body.name ?? ''),
        parentId:
          body.parentId === null || body.parentId === undefined
            ? null
            : Number(body.parentId),
        sortOrder:
          body.sortOrder === undefined ? undefined : Number(body.sortOrder),
        visible: body.visible === undefined ? undefined : body.visible === true,
      }),
    );
  }

  async removeCategory(user: CurrentUser, id: string) {
    this.requireAdmin(user);
    return ok(await this.service.removeCategory(Number(id)));
  }

  async saveItem(user: CurrentUser, body: Record<string, unknown>) {
    this.requireAdmin(user);
    return ok(
      await this.service.saveItem({
        id: body.id === undefined ? undefined : Number(body.id),
        categoryId: Number(body.categoryId),
        title: String(body.title ?? ''),
        description: String(body.description ?? ''),
        url: String(body.url ?? ''),
        logoUrl: String(body.logoUrl ?? ''),
        sortOrder:
          body.sortOrder === undefined ? undefined : Number(body.sortOrder),
        visible: body.visible === undefined ? undefined : body.visible === true,
      }),
    );
  }

  async removeItem(user: CurrentUser, id: string) {
    this.requireAdmin(user);
    return ok(await this.service.removeItem(Number(id)));
  }

  private requireAdmin(user: CurrentUser) {
    if (!user.isAdmin()) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '需要平台管理员');
    }
  }
}