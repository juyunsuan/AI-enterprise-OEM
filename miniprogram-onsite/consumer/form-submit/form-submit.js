const api = require("../../utils/api");
const auth = require("../../utils/auth");

/**
 * 后端自定义字段只有这 8 种类型（onsite.content.service.ts FIELD_TYPES）：
 * text / textarea / number / select / phone / idcard / date / region。
 * 没有 radio / checkbox / image 类型，因此不渲染这三类控件。
 */
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const PHONE_RE = /^1[3-9]\d{9}$/;
const IDCARD_RE = /^[0-9Xx]{15,19}$/;

const STATUS_TEXT = {
  PENDING: "待店主处理",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};

function toField(field, index) {
  const options = Array.isArray(field.options) ? field.options : [];
  return {
    id: field.id,
    key: String(field.id),
    name: field.name || "字段" + (index + 1),
    fieldType: field.fieldType || "text",
    options: options,
    placeholder: field.placeholder || "",
    required: field.required === true,
    value: "",
    optionIndex: 0,
  };
}

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    articleId: 0,
    articleTitle: "",
    fields: [],
    errorField: "",
    errorMessage: "",
    submitting: false,
    submitted: false,
    resultId: 0,
    resultStatus: "",
  },

  onLoad(options) {
    const articleId = Number((options && options.articleId) || 0);
    this.setData({ articleId: articleId });
    if (!articleId) {
      this.setData({ loading: false, error: "缺少文章标识，无法填写表单" });
      return;
    }
    this.start();
  },

  start() {
    const app = getApp();
    app
      .ensureReady()
      .then((shop) => {
        if (!shop || !shop.shopCode) {
          this.setData({
            loading: false,
            notReady: true,
            readyReason: app.globalData.bootstrapError || "店铺尚未开通，请联系店铺方",
          });
          return null;
        }
        return auth.ensureLogin().then(() => this.load());
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  load() {
    this.setData({ loading: true, error: "" });
    const self = this;
    return api
      .articleDetail(this.data.articleId)
      .then((data) => {
        if (!data || !data.formEnabled) {
          self.setData({ loading: false, error: "这篇文章没有挂表单" });
          return;
        }
        const fields = (data.fields || []).map(toField);
        if (!fields.length) {
          self.setData({ loading: false, error: "表单暂无可填字段，请联系店主" });
          return;
        }
        self.setData({
          loading: false,
          articleTitle: data.title || "填写表单",
          fields: fields,
        });
        wx.setNavigationBarTitle({ title: data.title || "填写表单" });
      })
      .catch((error) => {
        self.setData({
          loading: false,
          error: (error && error.message) || "表单加载失败",
        });
      });
  },

  onInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const patch = {};
    patch["fields[" + index + "].value"] = event.detail.value;
    patch.errorField = "";
    patch.errorMessage = "";
    this.setData(patch);
  },

  onSelect(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = this.data.fields[index];
    if (!field) return;
    const optionIndex = Number(event.detail.value) || 0;
    const patch = {};
    patch["fields[" + index + "].optionIndex"] = optionIndex;
    patch["fields[" + index + "].value"] = field.options[optionIndex] || "";
    patch.errorField = "";
    patch.errorMessage = "";
    this.setData(patch);
  },

  onDate(event) {
    const index = Number(event.currentTarget.dataset.index);
    const patch = {};
    patch["fields[" + index + "].value"] = event.detail.value;
    patch.errorField = "";
    patch.errorMessage = "";
    this.setData(patch);
  },

  /** 微信原生省市区选择器：选完拼成一段文本，后端只当字符串存。 */
  onRegion(event) {
    const index = Number(event.currentTarget.dataset.index);
    const picked = event.detail.value || [];
    const patch = {};
    patch["fields[" + index + "].value"] = picked.filter(Boolean).join(" ");
    patch.errorField = "";
    patch.errorMessage = "";
    this.setData(patch);
  },

  /** 逐字段校验，返回第一个不合法的字段，错误定位到具体项。 */
  validate() {
    const fields = this.data.fields;
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i];
      const value = String(field.value || "").trim();
      if (!value) {
        if (field.required) {
          return { key: field.key, message: "请填写「" + field.name + "」" };
        }
        continue;
      }
      if (field.fieldType === "phone" && !PHONE_RE.test(value)) {
        return { key: field.key, message: "「" + field.name + "」请填写 11 位手机号" };
      }
      if (field.fieldType === "number" && !NUMBER_RE.test(value)) {
        return { key: field.key, message: "「" + field.name + "」请填写数字" };
      }
      if (field.fieldType === "idcard" && !IDCARD_RE.test(value)) {
        return { key: field.key, message: "「" + field.name + "」身份证号格式不对" };
      }
    }
    return null;
  },

  submit() {
    if (this.data.submitting) return;
    const invalid = this.validate();
    if (invalid) {
      this.setData({ errorField: invalid.key, errorMessage: invalid.message });
      wx.showToast({ title: invalid.message, icon: "none" });
      return;
    }
    // answers 是 { 字段id: 值 } 的字符串字典，与 articles/submit 的 body 逐字对齐
    const answers = {};
    this.data.fields.forEach((field) => {
      const value = String(field.value || "").trim();
      if (value) answers[field.key] = value;
    });
    const self = this;
    this.setData({ submitting: true, errorField: "", errorMessage: "" });
    api
      .submitArticle({ articleId: this.data.articleId, answers: answers })
      .then((data) => {
        self.setData({
          submitting: false,
          submitted: true,
          resultId: (data && data.id) || 0,
          resultStatus: STATUS_TEXT[data && data.status] || (data && data.status) || "",
        });
      })
      .catch((error) => {
        self.setData({ submitting: false });
        wx.showModal({
          title: "提交失败",
          content: (error && error.message) || "请稍后重试",
          showCancel: false,
        });
      });
  },

  back() {
    wx.navigateBack({
      delta: 1,
      fail() {
        wx.switchTab({ url: "/pages/index/index" });
      },
    });
  },
});
