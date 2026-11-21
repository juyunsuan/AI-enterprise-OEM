const api = require("../../utils/api");
const format = require("../../utils/format");
const staff = require("../../utils/staff");

/** 只把最近 10 轮问答带给 AI 客服，太长的问题描述对回答没帮助，还更容易踩到超时。 */
const MAX_ROUNDS = 10;

Page({
  data: {
    loading: true,
    enabled: false,
    agentId: 0,
    agentName: "",
    modeLabel: "",
    canManage: false,
    /** 开启且已绑定，才允许提问；否则页面上只讲清楚还差什么。 */
    canAsk: false,
    notice: "",
    practitioners: [],
    messages: [],
    input: "",
    sending: false,
    saving: false,
    maxRounds: MAX_ROUNDS,
  },

  onShow() {
    this.load();
  },

  onLoad() {
    /** 多轮上下文只留在本次进入页面里，退出即清，不带历史包袱。 */
    this.history = [];
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await staff.requireStaff();
      const data = (await api.staffAiStatus()) || {};
      const enabled = data.enabled === true;
      const agentId = Number(data.agentId) || 0;
      this.setData({
        loading: false,
        enabled,
        agentId,
        agentName: data.agentName || "",
        modeLabel: agentId ? staff.pick(staff.AI_AGENT_MODE_LABELS, data.mode) : "",
        // 开关与绑定权限由服务端按登录身份判定，端上不另算一套。
        canManage: data.canManage === true,
        canAsk: enabled && agentId > 0,
        notice: this.buildNotice(enabled, agentId, data.agentName || ""),
        practitioners: ((data.practitioners || []).map((row) => ({
          id: row.id,
          name: row.name || "未填写姓名",
          roleLabel: staff.pick(staff.ROLE_LABELS, row.role),
          bindText: row.agentName ? "已绑定 " + row.agentName : "未绑定",
        }))),
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "AI 医护加载失败");
    }
  },

  buildNotice(enabled, agentId, agentName) {
    if (enabled && agentId > 0) return "";
    if (enabled) return "AI 医护还没有绑定 AI 客服，请联系管理员完成绑定后再提问。";
    if (agentId > 0) {
      return "AI 医护当前未开启" + (agentName ? "（" + agentName + "）" : "") + "，开启后即可提问。";
    }
    return "AI 医护当前未开启，且店铺还没有绑定 AI 客服，请联系管理员先完成绑定。";
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  async onSend() {
    if (this.data.sending) return;
    const question = String(this.data.input || "").trim();
    if (!question) {
      wx.showToast({ title: "请先填写要问的问题", icon: "none" });
      return;
    }
    // 上下文取发送之前的历史，本轮问题单独走 question。
    const history = (this.history || []).slice(-MAX_ROUNDS * 2);
    this.setData({ sending: true, input: "" });
    try {
      const data = (await api.staffAiAsk({ question, history })) || {};
      const answer = String(data.answer || "").trim();
      const refs = (data.references || [])
        .map((row) => (typeof row === "string" ? row : (row && (row.title || row.ref)) || ""))
        .filter(Boolean);
      // 空回答不写进上下文，否则下一轮会把这句占位话当成 AI 的正式结论。
      const turns = [{ role: "user", content: question }];
      if (answer) turns.push({ role: "assistant", content: answer });
      this.history = (this.history || []).concat(turns);
      if (this.history.length > MAX_ROUNDS * 2) {
        this.history = this.history.slice(-MAX_ROUNDS * 2);
      }
      this.setData({
        sending: false,
        messages: this.data.messages.concat({
          id: this.data.messages.length + 1,
          question,
          agentName: data.agentName || "AI 客服",
          answer: answer || "AI 这次没有给出内容，换个说法再问一次试试。",
          timeText: format.shortTime(new Date()),
          refText: refs.join("、"),
          handoff: data.handoff === true,
        }),
      });
    } catch (error) {
      // 失败了不编答案，把问题还给输入框，让医护决定重发还是自己查。
      this.setData({ sending: false, input: question });
      staff.handleError(error, "提问失败，请稍后重试");
    }
  },

  onToggle(e) {
    if (this.data.saving) return;
    const enabled = e.detail.value === true;
    this.setData({ saving: true });
    api
      .staffAiEnabled({ enabled })
      .then(() => {
        wx.showToast({ title: enabled ? "已开启 AI 医护" : "已关闭 AI 医护" });
        return this.load();
      })
      .catch((error) => {
        staff.handleError(error, "设置失败");
        return this.load();
      })
      .then(() => this.setData({ saving: false }));
  },

  onBind(e) {
    const practitionerId = Number(e.currentTarget.dataset.id) || 0;
    if (!practitionerId || this.data.saving) return;
    api
      .staffAiAgents()
      .then((agents) => {
        const list = agents || [];
        if (!list.length) {
          wx.showToast({ title: "店铺里还没有可用的 AI 客服员工", icon: "none" });
          return;
        }
        wx.showActionSheet({
          itemList: list.map((agent) => agent.name + (agent.statusLabel ? " · " + agent.statusLabel : "")),
          success: (res) => {
            const agent = list[res.tapIndex];
            if (!agent) return;
            this.saveBinding(practitionerId, agent);
          },
          fail: () => {
            /* 收起选择菜单不算失败 */
          },
        });
      })
      .catch((error) => staff.handleError(error, "可选的 AI 客服读取失败"));
  },

  saveBinding(practitionerId, agent) {
    this.setData({ saving: true });
    api
      .staffAiBinding({ practitionerId, agentId: agent.id })
      .then(() => {
        wx.showToast({ title: "已绑定 " + agent.name });
        return this.load();
      })
      .catch((error) => {
        staff.handleError(error, "绑定失败");
        return this.load();
      })
      .then(() => this.setData({ saving: false }));
  },
});
