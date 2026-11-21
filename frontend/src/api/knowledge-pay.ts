import { apiEnvelope, endpoints, z } from "@enterprise/contracts";
import { endpoint } from "./endpoint";
import { http } from "./http";

/**
 * 知识付费云课堂工具（工作台 → 建站管理）管理端调用。
 * 小程序终端会员接口在 `/api/public/knowledge-pay/*`，由生成的代码包直连，不走这里。
 */
export const knowledgePayApi = {
  overview: endpoint(endpoints.Kp_overview),
  settings: endpoint(endpoints.Kp_settings),
  saveSettings: endpoint(endpoints.Kp_saveSettings),
  test: endpoint(endpoints.Kp_test),
  testPay: endpoint(endpoints.Kp_testPay),

  categories: endpoint(endpoints.Kp_categories),
  createCategory: endpoint(endpoints.Kp_createCategory),
  updateCategory: endpoint(endpoints.Kp_updateCategory),
  removeCategory: endpoint(endpoints.Kp_removeCategory),

  resources: endpoint(endpoints.Kp_resources),
  createResource: endpoint(endpoints.Kp_createResource),
  updateResource: endpoint(endpoints.Kp_updateResource),
  removeResource: endpoint(endpoints.Kp_removeResource),
  auditResource: endpoint(endpoints.Kp_auditResource),

  lessons: endpoint(endpoints.Kp_lessons),
  saveLesson: endpoint(endpoints.Kp_saveLesson),
  updateLesson: endpoint(endpoints.Kp_updateLesson),
  removeLesson: endpoint(endpoints.Kp_removeLesson),

  chapters: endpoint(endpoints.Kp_chapters),
  saveChapter: endpoint(endpoints.Kp_saveChapter),
  updateChapter: endpoint(endpoints.Kp_updateChapter),
  removeChapter: endpoint(endpoints.Kp_removeChapter),

  teachers: endpoint(endpoints.Kp_teachers),
  saveTeacher: endpoint(endpoints.Kp_saveTeacher),
  updateTeacher: endpoint(endpoints.Kp_updateTeacher),
  removeTeacher: endpoint(endpoints.Kp_removeTeacher),

  banners: endpoint(endpoints.Kp_banners),
  saveBanner: endpoint(endpoints.Kp_saveBanner),
  updateBanner: endpoint(endpoints.Kp_updateBanner),
  removeBanner: endpoint(endpoints.Kp_removeBanner),

  notices: endpoint(endpoints.Kp_notices),
  saveNotice: endpoint(endpoints.Kp_saveNotice),
  updateNotice: endpoint(endpoints.Kp_updateNotice),
  removeNotice: endpoint(endpoints.Kp_removeNotice),

  links: endpoint(endpoints.Kp_links),
  saveLink: endpoint(endpoints.Kp_saveLink),
  updateLink: endpoint(endpoints.Kp_updateLink),
  removeLink: endpoint(endpoints.Kp_removeLink),

  navs: endpoint(endpoints.Kp_navs),
  saveNav: endpoint(endpoints.Kp_saveNav),
  updateNav: endpoint(endpoints.Kp_updateNav),
  removeNav: endpoint(endpoints.Kp_removeNav),

  pages: endpoint(endpoints.Kp_pages),
  savePage: endpoint(endpoints.Kp_savePage),
  updatePage: endpoint(endpoints.Kp_updatePage),
  removePage: endpoint(endpoints.Kp_removePage),

  cards: endpoint(endpoints.Kp_cards),
  generateCards: endpoint(endpoints.Kp_generateCards),
  disableCard: endpoint(endpoints.Kp_disableCard),
  removeCard: endpoint(endpoints.Kp_removeCard),

  members: endpoint(endpoints.Kp_members),
  adjustMember: endpoint(endpoints.Kp_adjustMember),
  orders: endpoint(endpoints.Kp_orders),

  learnings: endpoint(endpoints.Kp_learnings),
  reviews: endpoint(endpoints.Kp_reviews),
  replyReview: endpoint(endpoints.Kp_replyReview),
  setReviewStatus: endpoint(endpoints.Kp_setReviewStatus),
  removeReview: endpoint(endpoints.Kp_removeReview),

  cashOrders: endpoint(endpoints.Kp_cashOrders),
  closeCashOrder: endpoint(endpoints.Kp_closeCashOrder),
  refundCashOrder: endpoint(endpoints.Kp_refundCashOrder),
};

/** 图片素材上传（封面/轮播图）：multipart 中转本站 OSS，不进 JSON 契约。 */
export async function uploadKnowledgePayMedia(
  file: File,
): Promise<{ key: string; url: string; fileName: string }> {
  const form = new FormData();
  form.append("file", file);
  const result = await http(
    "/api/backend/enterprise/knowledge-pay/media/upload",
    apiEnvelope(
      z.object({ key: z.string(), url: z.string(), fileName: z.string() }),
    ),
    { method: "POST", body: form, timeoutMs: 120000 },
  );
  if (!result.data.data) throw new Error("图片上传没有返回结果");
  return result.data.data;
}
