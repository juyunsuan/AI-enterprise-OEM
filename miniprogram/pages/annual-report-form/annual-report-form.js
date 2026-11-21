const api = require("../../utils/api");
const auth = require("../../utils/auth");
const session = require("../../utils/session");

const DRAFT_PREFIX = "aiworkin:annual-report:draft";
const ENTERPRISE_TYPES = ["个体工商户", "企业公司", "合作社"];
const BUSINESS_STATUSES = ["存续（在营）", "筹建", "歇业", "清算"];
const LABEL_KEYS = {
  "报告年度": "report_year",
  "经营状态": "business_status",
  "企业类型": "enterprise_type",
  "企业名称": "enterprise_name",
  "统一社会信用代码": "uscc",
  "企业通信地址": "address",
  "邮政编码": "zip_code",
  "联系电话": "phone",
  "法定代表人": "legal_person",
  "从业人数": "staff_count",
  "资产总额（元）": "total_assets",
  "负债总额（元）": "total_liabilities",
  "营业总收入（元）": "total_revenue",
  "纳税总额（元）": "total_tax",
  "社保参保人数": "social_insured",
  "备注": "remark",
};

/** 草稿按账号隔离，避免同一台手机切换账号后看到上一个账号的企业资料。 */
function draftKey() {
  const profile = session.getProfile();
  return DRAFT_PREFIX + ":" + String((profile && profile.userId) || "anonymous");
}

function defaultForm() {
  return {
    report_year: String(new Date().getFullYear() - 1),
    business_status: BUSINESS_STATUSES[0],
    enterprise_type: "",
    enterprise_name: "",
    uscc: "",
    legal_person: "",
    phone: "",
    address: "",
    zip_code: "",
    staff_count: "",
    total_assets: "",
    total_liabilities: "",
    total_revenue: "",
    total_tax: "",
    social_insured: "",
    remark: "",
  };
}

function typeFromSubject(subjectType) {
  const value = String(subjectType || "").toUpperCase();
  if (value === "COMPANY") return "企业公司";
  if (value === "INDIVIDUAL") return "个体工商户";
  return "";
}

/** 网页端旧记录只有 fields 文本，这里按标签反解成表单值，实现两端互相带入。 */
function fieldsToValues(fields) {
  const values = {};
  (Array.isArray(fields) ? fields : []).forEach((field) => {
    const key = LABEL_KEYS[String((field && field.label) || "").trim()];
    if (key && field.value !== undefined && field.value !== null) {
      values[key] = String(field.value);
    }
  });
  return values;
}

function compact(source) {
  const result = {};
  Object.keys(source || {}).forEach((key) => {
    const value = source[key];
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text || text === "—") return;
    result[key] = text;
  });
  return result;
}

function indexOfOrZero(list, value) {
  const index = list.indexOf(String(value || ""));
  return index >= 0 ? index : 0;
}

Page({
  data: {
    loading: true,
    saving: false,
    years: [],
    yearTexts: [],
    yearIndex: 0,
    statuses: BUSINESS_STATUSES,
    statusIndex: 0,
    types: ENTERPRISE_TYPES,
    typeIndex: 0,
    form: defaultForm(),
    prefillHint: "",
    hasEnterprise: false,
  },

  onLoad() {
    if (!auth.ensureLogin()) {
      this.pendingLogin = true;
      this.setData({ loading: false });
      return;
    }
    this.init();
  },

  onShow() {
    if (!this.pendingLogin || !session.getToken()) return;
    this.pendingLogin = false;
    this.setData({ loading: true });
    this.init();
  },

  init() {
    const current = new Date().getFullYear();
    const years = [current - 1, current - 2];
    this.setData({
      years: years,
      yearTexts: years.map((item) => item + " 年度"),
    });
    this.prefill();
  },

  prefill() {
    const draft = wx.getStorageSync(draftKey());
    Promise.all([
      api.me().catch(() => null),
      api.annualReportRecords().catch(() => []),
    ])
      .then((results) => {
        const me = results[0] || {};
        const records = Array.isArray(results[1]) ? results[1] : [];
        const enterprise = me.enterprise || null;
        const base = defaultForm();
        if (enterprise) {
          base.enterprise_name = String(enterprise.name || "");
          base.uscc = String(enterprise.uscc || "");
          base.address = String(enterprise.address || "");
          base.phone = String(enterprise.phone || "");
          base.legal_person = String(enterprise.legalPerson || "");
          base.enterprise_type = typeFromSubject(enterprise.subjectType);
        }

        let form = base;
        let hint = enterprise ? "已带入企业认证资料，可直接修改。" : "";
        const latest = records[0];
        if (latest && latest.snapshot) {
          const snapshot = latest.snapshot;
          const values = Object.assign(
            {},
            fieldsToValues(snapshot.fields),
            snapshot.form && typeof snapshot.form === "object"
              ? snapshot.form
              : {},
          );
          const filled = compact(values);
          if (Object.keys(filled).length) {
            form = Object.assign({}, base, filled);
            hint = "已带入最近一次填报记录，可在其基础上修改。";
          }
        }

        if (draft && typeof draft === "object" && Object.keys(draft).length) {
          form = Object.assign({}, form, compact(draft));
          hint = "已恢复上次未提交的草稿。";
        }

        if (this.data.years.indexOf(Number(form.report_year)) < 0) {
          form.report_year = String(this.data.years[0]);
        }
        this.setData({
          form: form,
          loading: false,
          hasEnterprise: !!enterprise,
          prefillHint: hint,
          yearIndex: indexOfOrZero(
            this.data.years.map(String),
            form.report_year,
          ),
          statusIndex: indexOfOrZero(BUSINESS_STATUSES, form.business_status),
          typeIndex: indexOfOrZero(ENTERPRISE_TYPES, form.enterprise_type),
        });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    const form = Object.assign({}, this.data.form);
    form[key] = event.detail.value;
    this.setData({ form: form });
    this.saveDraft(form);
  },

  onYearChange(event) {
    const index = Number(event.detail.value) || 0;
    const form = Object.assign({}, this.data.form, {
      report_year: String(this.data.years[index]),
    });
    this.setData({ form: form, yearIndex: index });
    this.saveDraft(form);
  },

  onStatusChange(event) {
    const index = Number(event.detail.value) || 0;
    const form = Object.assign({}, this.data.form, {
      business_status: BUSINESS_STATUSES[index],
    });
    this.setData({ form: form, statusIndex: index });
    this.saveDraft(form);
  },

  onTypeChange(event) {
    const index = Number(event.detail.value) || 0;
    const form = Object.assign({}, this.data.form, {
      enterprise_type: ENTERPRISE_TYPES[index],
    });
    this.setData({ form: form, typeIndex: index });
    this.saveDraft(form);
  },

  saveDraft(form) {
    try {
      wx.setStorageSync(draftKey(), form);
    } catch (error) {
      // 草稿只用于提升移动端体验，存储失败不影响正常提交。
    }
  },

  validate(form) {
    const required = [
      ["enterprise_type", "请选择企业类型"],
      ["enterprise_name", "请填写企业名称"],
      ["legal_person", "请填写法定代表人"],
      ["phone", "请填写联系电话"],
      ["address", "请填写企业通信地址"],
    ];
    for (let i = 0; i < required.length; i += 1) {
      if (!String(form[required[i][0]] || "").trim()) return required[i][1];
    }
    const phone = String(form.phone || "").replace(/[\s-]/g, "");
    if (!/^(1[3-9]\d{9}|0\d{9,11})$/.test(phone)) {
      return "请填写正确的手机或座机号码";
    }
    const numeric = [
      ["staff_count", "从业人数", true],
      ["total_assets", "资产总额", false],
      ["total_liabilities", "负债总额", false],
      ["total_revenue", "营业总收入", false],
      ["total_tax", "纳税总额", false],
      ["social_insured", "社保参保人数", true],
      ["zip_code", "邮政编码", true],
    ];
    for (let i = 0; i < numeric.length; i += 1) {
      const key = numeric[i][0];
      const label = numeric[i][1];
      const onlyInteger = numeric[i][2];
      const raw = String(form[key] || "").trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) return label + "需为非负数字";
      if (onlyInteger && !Number.isInteger(value)) {
        return label + "需为整数";
      }
    }
    return "";
  },

  buildFields(form) {
    const value = (key) => String(form[key] === undefined ? "" : form[key]);
    return [
      { label: "报告年度", value: value("report_year") },
      { label: "经营状态", value: value("business_status") },
      { label: "企业类型", value: value("enterprise_type") },
      { label: "企业名称", value: value("enterprise_name") },
      { label: "统一社会信用代码", value: value("uscc") },
      { label: "企业通信地址", value: value("address") },
      { label: "邮政编码", value: value("zip_code") },
      { label: "联系电话", value: value("phone") },
      { label: "法定代表人", value: value("legal_person") },
      { label: "从业人数", value: value("staff_count") },
      { label: "资产总额（元）", value: value("total_assets") },
      { label: "负债总额（元）", value: value("total_liabilities") },
      { label: "营业总收入（元）", value: value("total_revenue") },
      { label: "纳税总额（元）", value: value("total_tax") },
      { label: "社保参保人数", value: value("social_insured") },
      { label: "备注", value: value("remark") },
      { label: "填报渠道", value: "小程序" },
    ];
  },

  onSubmit() {
    if (this.data.saving) return;
    const form = compact(this.data.form);
    const error = this.validate(form);
    if (error) {
      wx.showToast({ title: error, icon: "none" });
      return;
    }
    const year = String(form.report_year);
    wx.showModal({
      title: "确认提交",
      content:
        year +
        " 年度工商年报，经营状态：" +
        form.business_status +
        "。提交后可在填报记录中回看。",
      confirmText: "确认提交",
      success: (result) => {
        if (!result.confirm) return;
        this.submit(form);
      },
    });
  },

  submit(form) {
    const year = String(form.report_year);
    const title = year + " 年度工商年报（小程序填报）";
    const snapshot = {
      source: "MINIPROGRAM",
      summary: year + " 年度 · 经营状态：" + form.business_status,
      form: form,
      fields: this.buildFields(form),
    };
    this.setData({ saving: true });
    wx.showLoading({ title: "提交中", mask: true });
    api
      .saveAnnualReport(title, snapshot)
      .then(() => {
        wx.hideLoading();
        try {
          wx.removeStorageSync(draftKey());
        } catch (error) {
          // 草稿清理失败不影响已保存的台账记录。
        }
        wx.showToast({ title: "年报记录已保存", icon: "success" });
        setTimeout(() => {
          wx.redirectTo({
            url: "/pages/annual-report-records/annual-report-records",
          });
        }, 700);
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ saving: false });
        auth.showError(error);
      });
  },
});
