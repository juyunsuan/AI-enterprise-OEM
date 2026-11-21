import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/** 答题小程序：站点、题库、题目（多维表格行）、交卷记录与排行。 */
export const quizApi = {
  site: endpoint(endpoints.Quiz_site),
  saveSite: endpoint(endpoints.Quiz_saveSite),
  banks: endpoint(endpoints.Quiz_banks),
  createBank: endpoint(endpoints.Quiz_createBank),
  updateBank: endpoint(endpoints.Quiz_updateBank),
  publishBank: endpoint(endpoints.Quiz_publishBank),
  closeBank: endpoint(endpoints.Quiz_closeBank),
  reopenBank: endpoint(endpoints.Quiz_reopenBank),
  removeBank: endpoint(endpoints.Quiz_removeBank),
  questions: endpoint(endpoints.Quiz_questions),
  createQuestion: endpoint(endpoints.Quiz_createQuestion),
  updateQuestion: endpoint(endpoints.Quiz_updateQuestion),
  removeQuestion: endpoint(endpoints.Quiz_removeQuestion),
  aiGenerate: endpoint(endpoints.Quiz_aiGenerate),
  results: endpoint(endpoints.Quiz_results),
  rank: endpoint(endpoints.Quiz_rank),
  participants: endpoint(endpoints.Quiz_participants),
  reviewParticipant: endpoint(endpoints.Quiz_reviewParticipant),
  downloadPackage: endpoint(endpoints.Quiz_package),
};