import { apiEnvelope, endpoints, z } from "@enterprise/contracts";
import { endpoint } from "./endpoint";
import { http } from "./http";

/**
 * 数字人小程序工具（工作台 → 建站管理）管理端调用。
 * 终端会员接口在 `/api/public/digital-human/*`，由出包的小程序直连，不走这里。
 */
export const digitalHumanApi = {
  overview: endpoint(endpoints.Dh_overview),

  settings: endpoint(endpoints.Dh_settings),
  saveSettings: endpoint(endpoints.Dh_settingsSave),
  miniApp: endpoint(endpoints.Dh_miniApp),
  saveMiniApp: endpoint(endpoints.Dh_miniAppSave),
  testMiniApp: endpoint(endpoints.Dh_miniAppTest),

  channels: endpoint(endpoints.Dh_channelsList),
  saveChannel: endpoint(endpoints.Dh_channelSave),
  removeChannel: endpoint(endpoints.Dh_channelRemove),
  testChannel: endpoint(endpoints.Dh_channelTest),

  members: endpoint(endpoints.Dh_membersList),
  updateMember: endpoint(endpoints.Dh_memberUpdate),
  balanceLogs: endpoint(endpoints.Dh_balanceLogs),
  bodies: endpoint(endpoints.Dh_bodiesList),
  removeBody: endpoint(endpoints.Dh_bodyRemove),
  voices: endpoint(endpoints.Dh_voicesList),
  removeVoice: endpoint(endpoints.Dh_voiceRemove),

  voiceGroups: endpoint(endpoints.Dh_voiceGroupsList),
  saveVoiceGroup: endpoint(endpoints.Dh_voiceGroupSave),
  removeVoiceGroup: endpoint(endpoints.Dh_voiceGroupRemove),
  presetVoices: endpoint(endpoints.Dh_presetVoicesList),
  savePresetVoice: endpoint(endpoints.Dh_presetVoiceSave),
  removePresetVoice: endpoint(endpoints.Dh_presetVoiceRemove),
  bgmGroups: endpoint(endpoints.Dh_bgmGroupsList),
  saveBgmGroup: endpoint(endpoints.Dh_bgmGroupSave),
  removeBgmGroup: endpoint(endpoints.Dh_bgmGroupRemove),
  bgms: endpoint(endpoints.Dh_bgmsList),
  saveBgm: endpoint(endpoints.Dh_bgmSave),
  removeBgm: endpoint(endpoints.Dh_bgmRemove),

  works: endpoint(endpoints.Dh_worksList),
  removeWork: endpoint(endpoints.Dh_workRemove),
  tasks: endpoint(endpoints.Dh_tasksList),
  retryTask: endpoint(endpoints.Dh_taskRetry),

  writeTopics: endpoint(endpoints.Dh_writeTopicsList),
  saveWriteTopic: endpoint(endpoints.Dh_writeTopicSave),
  removeWriteTopic: endpoint(endpoints.Dh_writeTopicRemove),
  aiRecords: endpoint(endpoints.Dh_aiRecordsList),

  packages: endpoint(endpoints.Dh_packagesList),
  savePackage: endpoint(endpoints.Dh_packageSave),
  removePackage: endpoint(endpoints.Dh_packageRemove),
  orders: endpoint(endpoints.Dh_ordersList),
  refundOrder: endpoint(endpoints.Dh_orderRefund),

  cardBatches: endpoint(endpoints.Dh_cardBatchesList),
  createCardBatch: endpoint(endpoints.Dh_cardBatchCreate),
  cards: endpoint(endpoints.Dh_cardsList),
  disableCard: endpoint(endpoints.Dh_cardDisable),
  exportCards: endpoint(endpoints.Dh_cardsExport),

  articles: endpoint(endpoints.Dh_articlesList),
  saveArticle: endpoint(endpoints.Dh_articleSave),
  removeArticle: endpoint(endpoints.Dh_articleRemove),
  swipers: endpoint(endpoints.Dh_swipersList),
  saveSwiper: endpoint(endpoints.Dh_swiperSave),
  removeSwiper: endpoint(endpoints.Dh_swiperRemove),
  posters: endpoint(endpoints.Dh_postersList),
  savePoster: endpoint(endpoints.Dh_posterSave),
  removePoster: endpoint(endpoints.Dh_posterRemove),

  promoterApplies: endpoint(endpoints.Dh_promoterAppliesList),
  auditPromoter: endpoint(endpoints.Dh_promoterApplyAudit),
  commissions: endpoint(endpoints.Dh_commissionsList),
  withdraws: endpoint(endpoints.Dh_withdrawsList),
  auditWithdraw: endpoint(endpoints.Dh_withdrawAudit),
  feedbacks: endpoint(endpoints.Dh_feedbacksList),
  replyFeedback: endpoint(endpoints.Dh_feedbackReply),

  releaseQrcode: endpoint(endpoints.Dh_releaseQrcode),
};

/** 后台素材上传（轮播/海报/封面/套餐图）：multipart 不进 JSON 契约，落本站 OSS。 */
export async function uploadDigitalHumanMedia(
  file: File,
): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  const result = await http(
    "/api/backend/enterprise/digital-human/media/upload",
    apiEnvelope(z.object({ url: z.string() })),
    { method: "POST", body: form, timeoutMs: 120000 },
  );
  if (!result.data.data) throw new Error("图片上传没有返回结果");
  return result.data.data;
}
