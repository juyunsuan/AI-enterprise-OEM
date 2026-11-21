import type {
  MiniAppInput,
  RentalCustomerInput,
  RentalInspectionInput,
  RentalItemInput,
  RentalOrderActionInput,
  RentalOrderCreateInput,
  RentalOrderUpdateInput,
  RentalShopInput,
  RentalStaffInput,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { RentalService } from './rental.service';

/**
 * 租赁管理后台控制器。方法名与契约 `Rental_` 后缀一一对应，
 * `moduleHandlers` 按「会话 → 路径参数 → 查询 → 请求体」反射调用。
 * 门店归属由 RentalService 统一按 ownerUserId 收口。
 */
export class RentalController {
  constructor(private readonly rental: RentalService) {}

  overview(user: CurrentUser) {
    return this.rental.overview(user);
  }

  shops(user: CurrentUser, query: Record<string, unknown>) {
    return this.rental.shops(user, query);
  }

  createShop(user: CurrentUser, body: RentalShopInput) {
    return this.rental.createShop(user, body);
  }

  shopDetail(user: CurrentUser, id: string) {
    return this.rental.shopDetail(user, id);
  }

  updateShop(user: CurrentUser, id: string, body: RentalShopInput) {
    return this.rental.updateShop(user, id, body);
  }

  saveTrade(user: CurrentUser, id: string, body: unknown) {
    return this.rental.saveTrade(user, id, body);
  }

  setStatus(user: CurrentUser, id: string, body: { status: string }) {
    return this.rental.setStatus(user, id, body);
  }

  wechat(user: CurrentUser, id: string) {
    return this.rental.wechatView(user, id);
  }

  saveWechat(user: CurrentUser, id: string, body: MiniAppInput) {
    return this.rental.saveWechat(user, id, body);
  }

  testWechat(user: CurrentUser, id: string) {
    return this.rental.testWechat(user, id);
  }

  package(user: CurrentUser, id: string) {
    return this.rental.package(user, id);
  }

  items(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.rental.items(user, id, query);
  }

  saveItem(user: CurrentUser, id: string, body: RentalItemInput) {
    return this.rental.saveItem(user, id, body);
  }

  removeItem(user: CurrentUser, id: string, body: { id: number }) {
    return this.rental.removeItem(user, id, body);
  }

  orders(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.rental.orders(user, id, query);
  }

  createOrder(user: CurrentUser, id: string, body: RentalOrderCreateInput) {
    return this.rental.createOrder(user, id, body);
  }

  updateOrder(
    user: CurrentUser,
    id: string,
    orderId: string,
    body: RentalOrderUpdateInput,
  ) {
    return this.rental.updateOrder(user, id, orderId, body);
  }

  orderDetail(user: CurrentUser, id: string, orderId: string) {
    return this.rental.orderDetail(user, id, orderId);
  }

  orderAction(
    user: CurrentUser,
    id: string,
    orderId: string,
    body: RentalOrderActionInput,
  ) {
    return this.rental.orderAction(user, Number(id), Number(orderId), body);
  }

  saveInspection(
    user: CurrentUser,
    id: string,
    orderId: string,
    body: RentalInspectionInput,
  ) {
    return this.rental.saveInspection(
      Number(id),
      Number(orderId),
      body,
      undefined,
      user,
    );
  }

  inspections(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.rental.inspections(user, id, query);
  }

  customers(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.rental.customers(user, id, query);
  }

  saveCustomer(user: CurrentUser, id: string, body: RentalCustomerInput) {
    return this.rental.saveCustomer(user, id, body);
  }

  removeCustomer(user: CurrentUser, id: string, body: { id: number }) {
    return this.rental.removeCustomer(user, id, body);
  }

  customerStatus(
    user: CurrentUser,
    id: string,
    customerId: string,
    body: { status: 'ACTIVE' | 'BLOCKED' },
  ) {
    return this.rental.customerStatus(user, id, customerId, body);
  }

  staffs(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.rental.staffs(user, id, query);
  }

  saveStaff(user: CurrentUser, id: string, body: RentalStaffInput) {
    return this.rental.saveStaff(user, id, body);
  }

  removeStaff(user: CurrentUser, id: string, body: { id: number }) {
    return this.rental.removeStaff(user, id, body);
  }

  stats(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.rental.stats(user, id, query);
  }
}
