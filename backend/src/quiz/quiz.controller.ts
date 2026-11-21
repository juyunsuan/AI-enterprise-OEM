import { CurrentUser } from '../auth/current-user';
import { QuizService } from './quiz.service';

/**
 * 答题小程序控制器：方法名与契约 operationId 去 `Quiz_` 前缀一致（首字母小写），
 * 由 automation-routes 的 moduleHandlers 自动映射并统一包 envelope。
 */
export class QuizController {
  constructor(readonly service: QuizService) {}

  site(user: CurrentUser) {
    return this.service.site(user);
  }

  package(user: CurrentUser) {
    return this.service.downloadPackage(user);
  }

  saveSite(user: CurrentUser, body: Record<string, unknown>) {
    return this.service.saveSite(user, body);
  }

  banks(user: CurrentUser) {
    return this.service.banks(user);
  }

  createBank(user: CurrentUser, body: Record<string, unknown>) {
    return this.service.createBank(user, body);
  }

  updateBank(user: CurrentUser, id: string, body: Record<string, unknown>) {
    return this.service.updateBank(user, Number(id), body);
  }

  publishBank(user: CurrentUser, id: string) {
    return this.service.publishBank(user, Number(id));
  }

  closeBank(user: CurrentUser, id: string) {
    return this.service.closeBank(user, Number(id));
  }

  reopenBank(user: CurrentUser, id: string) {
    return this.service.reopenBank(user, Number(id));
  }

  removeBank(user: CurrentUser, id: string) {
    return this.service.removeBank(user, Number(id));
  }

  questions(user: CurrentUser, id: string) {
    return this.service.questions(user, Number(id));
  }

  createQuestion(user: CurrentUser, id: string, body: Record<string, unknown>) {
    return this.service.createQuestion(user, Number(id), body);
  }

  updateQuestion(
    user: CurrentUser,
    id: string,
    rowId: string,
    body: Record<string, unknown>,
  ) {
    return this.service.updateQuestion(user, Number(id), Number(rowId), body);
  }

  removeQuestion(user: CurrentUser, id: string, rowId: string) {
    return this.service.removeQuestion(user, Number(id), Number(rowId));
  }

  aiGenerate(user: CurrentUser, id: string, body: Record<string, unknown>) {
    return this.service.aiGenerate(user, Number(id), body);
  }

  results(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.service.results(user, Number(id), query);
  }

  rank(user: CurrentUser, id: string, query: Record<string, unknown>) {
    return this.service.rank(user, Number(id), query);
  }

  participants(user: CurrentUser, query: Record<string, unknown>) {
    return this.service.participants(user, query);
  }

  reviewParticipant(
    user: CurrentUser,
    rowId: string,
    body: Record<string, unknown>,
  ) {
    return this.service.reviewParticipant(user, Number(rowId), body);
  }
}
