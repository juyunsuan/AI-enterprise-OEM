const GUIDE_TITLES = {
  annual: "年报政策说明",
  abnormal: "异常经营移出指引",
  flow: "年报办理流程",
};

const GUIDE_SECTIONS = {
  annual: [
    {
      title: "谁需要报送",
      paragraphs: [
        "企业、个体工商户、农民专业合作社应当于每年 1 月 1 日至 6 月 30 日，报送上一年度年度报告并向社会公示。",
        "当年设立登记的主体，自下一年起报送并公示。",
      ],
    },
    {
      title: "需要准备什么",
      paragraphs: [
        "营业执照上的企业名称与统一社会信用代码、法定代表人及联系电话、企业通信地址与邮编、从业人数、社保参保人数。",
        "资产总额、负债总额、营业总收入、纳税总额等经营数据（按实际情况填写）。",
      ],
    },
    {
      title: "未按时报送的影响",
      paragraphs: [
        "可能被列入经营异常名录，并通过国家企业信用信息公示系统、信用中国及相关征信机构向社会公示，影响企业信用与正常经营。",
      ],
    },
    {
      title: "本平台能做什么",
      paragraphs: [
        "提供移动端填报、企业资料自动带入、历史记录回看与台账留存，方便平时整理和核对。",
        "平台不是国家企业信用信息公示系统的官方代理，正式年报公示仍需到官方系统完成。",
      ],
    },
  ],
  abnormal: [
    {
      title: "常见的列入原因",
      paragraphs: [
        "未在规定期限内报送并公示年度报告；通过登记的住所或经营场所无法取得联系；公示信息隐瞒真实情况、弄虚作假等。",
      ],
    },
    {
      title: "可能带来的影响",
      paragraphs: [
        "经营异常状态会向社会公示，可能影响招投标、融资、合作与平台资质审核，也会影响法定代表人的信用形象。",
      ],
    },
    {
      title: "移出的通用思路",
      paragraphs: [
        "先确认列入原因并补齐相应义务，例如补报未报年度年报并公示、办理住所变更或重新取得联系。",
        "向登记机关提交移出经营异常名录申请，配合实地核查或材料核验，并关注办理结果。",
      ],
    },
    {
      title: "平台如何协助",
      paragraphs: [
        "可先在小程序整理年报与主体资料，再到网页端「财税服务 → 财税服务商」查看服务商资质并申请签约代办。",
        "具体移出条件、材料与时限以当地市场监督管理部门口径为准。",
      ],
    },
  ],
  flow: [
    {
      title: "办理步骤",
      paragraphs: [
        "1. 准备营业执照、法定代表人联系方式、通信地址与经营数据。",
        "2. 在小程序填写并提交年报，内容自动保存到平台台账。",
        "3. 到国家企业信用信息公示系统完成正式年报公示。",
        "4. 保存公示回执或截图，便于后续核对。",
        "5. 如被列入经营异常名录，按当地流程及时申请移出。",
      ],
    },
  ],
};

Page({
  data: {
    type: "annual",
    title: GUIDE_TITLES.annual,
    sections: GUIDE_SECTIONS.annual,
  },

  onLoad(query) {
    const type = GUIDE_TITLES[query && query.type] ? query.type : "annual";
    this.setData({
      type: type,
      title: GUIDE_TITLES[type],
      sections: GUIDE_SECTIONS[type],
    });
    wx.setNavigationBarTitle({ title: GUIDE_TITLES[type] });
  },

  copyOfficial() {
    wx.setClipboardData({
      data: "https://www.gsxt.gov.cn",
      success: () => wx.showToast({ title: "官方网址已复制", icon: "success" }),
    });
  },

  goForm() {
    wx.navigateTo({ url: "/pages/annual-report-form/annual-report-form" });
  },
});
