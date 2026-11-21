/**
 * 合成工作台：选形象 → 选音色/音频 → 填文案 → 提交合成。
 *
 * 定价口径与后端一致：纯语音（tts 且不选形象）按 priceTts，其余按 priceVideo；
 * 开关关闭的模块这里整块不渲染，避免用户点进去才被后端拒绝。
 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const upload = require("../../utils/upload");

const DRAFT_KEY = "digital-human:draft-script";

Page({
  data: {
    themeStyle: "",
    toggles: {},
    pricing: {},
    scriptMaxLen: 800,
    member: null,
    bodies: [],
    mineVoices: [],
    presetGroups: [],
    bgms: [],
    audioType: "tts",
    bodyId: 0,
    bodyName: "纯音频",
    voiceSource: "clone",
    voiceId: 0,
    voiceLabel: "",
    script: "",
    sourceAudioUrl: "",
    sourceAudioName: "",
    bgmId: 0,
    bgmLabel: "无",
    bgmVolume: 30,
    speed: 100,
    subtitleOn: true,
    pointCost: 0,
    picker: "",
    pickerTab: "mine",
    busy: false,
    progress: 0,
    loading: true,
  },

  onHide() {
    if (this.audio) {
      this.audio.destroy();
      this.audio = null;
    }
  },

  onUnload() {
    if (this.audio) {
      this.audio.destroy();
      this.audio = null;
    }
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      toggles: app.globalData.toggles || {},
      pricing: app.globalData.pricing || {},
      scriptMaxLen: (app.globalData.clone && app.globalData.clone.scriptMaxLen) || 800,
    });
    this.applyDraft();
    app.ensureReady().then(() => this.load());
  },

  applyDraft() {
    let draft = "";
    try {
      draft = wx.getStorageSync(DRAFT_KEY) || "";
      if (draft) wx.removeStorageSync(DRAFT_KEY);
    } catch (e) {
      draft = "";
    }
    if (draft) this.setData({ script: String(draft).slice(0, this.data.scriptMaxLen) });
  },

  load() {
    const app = getApp();
    this.setData({
      toggles: app.globalData.toggles || {},
      pricing: app.globalData.pricing || {},
      scriptMaxLen: (app.globalData.clone && app.globalData.clone.scriptMaxLen) || 800,
    });
    return auth
      .ensureMember()
      .then((member) => {
        this.setData({ member: member });
        return Promise.all([
          api.bodies(),
          api.myVoices(),
          api.presetVoices(),
          api.bgms(),
        ]);
      })
      .then(([bodies, voices, groups, bgms]) => {
        const readyBodies = (bodies || []).filter((row) => row.status === 1);
        const mineVoices = (voices || [])
          .filter((row) => row.status === 1)
          .map((row) => ({
            id: row.id,
            name: row.name,
            demoUrl: row.demoAudioUrl,
          }));
        const presetGroups = (groups || []).map((group) => ({
          id: group.id,
          name: group.name,
          voices: (group.voices || []).map((voice) => ({
            id: voice.id,
            name: voice.name,
            demoUrl: voice.demoUrl,
            gender: voice.gender,
            language: voice.language,
          })),
        }));
        this.setData({
          bodies: readyBodies.map((row) => ({ id: row.id, name: row.name, coverUrl: row.coverUrl })),
          mineVoices: mineVoices,
          presetGroups: presetGroups,
          bgms: (bgms || []).map((row) => ({ id: row.id, name: row.name, url: row.url })),
          loading: false,
        });
        this.pickDefaultVoice(mineVoices, presetGroups);
        this.recalc();
      })
      .catch((error) => {
        this.setData({ loading: false });
        auth.showError(error);
      });
  },

  pickDefaultVoice(mineVoices, presetGroups) {
    if (this.data.voiceId) return;
    // 默认选中第一个可用音色，但不自动试听，避免一进页面就出声。
    if (mineVoices.length) {
      this.setData({
        voiceSource: "clone",
        voiceId: mineVoices[0].id,
        voiceLabel: mineVoices[0].name,
      });
      return;
    }
    for (let i = 0; i < presetGroups.length; i += 1) {
      if (presetGroups[i].voices.length) {
        this.setData({
          voiceSource: "preset",
          voiceId: presetGroups[i].voices[0].id,
          voiceLabel: presetGroups[i].voices[0].name,
        });
        return;
      }
    }
  },

  selectVoice(source, voice) {
    this.setData({
      voiceSource: source,
      voiceId: voice.id,
      voiceLabel: voice.name,
      picker: "",
    });
    this.tryDemo(voice.demoUrl);
  },

  tryDemo(url) {
    if (this.audio) {
      this.audio.destroy();
      this.audio = null;
    }
    if (!url) return;
    this.audio = wx.createInnerAudioContext();
    this.audio.src = url;
    this.audio.play();
  },

  selectBody(event) {
    const id = Number(event.currentTarget.dataset.id || 0);
    const name = id ? event.currentTarget.dataset.name : "纯音频";
    this.setData({ bodyId: id, bodyName: name });
    this.recalc();
  },

  switchAudio(event) {
    this.setData({ audioType: event.currentTarget.dataset.type });
    this.recalc();
  },

  recalc() {
    const pricing = this.data.pricing || {};
    const cost =
      this.data.audioType === "tts" && !this.data.bodyId
        ? Number(pricing.priceTts || 0)
        : Number(pricing.priceVideo || 0);
    this.setData({ pointCost: cost });
  },

  onScript(event) {
    const value = String(event.detail.value || "");
    this.setData({ script: value.slice(0, this.data.scriptMaxLen) });
  },

  goWrite() {
    wx.navigateTo({ url: "/pages/write/write" });
  },

  openVoicePicker() {
    this.setData({ picker: "voice" });
  },

  openBgmPicker() {
    this.setData({ picker: "bgm" });
  },

  setPickerTab(event) {
    this.setData({ pickerTab: event.currentTarget.dataset.tab });
  },

  pickVoice(event) {
    const source = event.currentTarget.dataset.source;
    const id = Number(event.currentTarget.dataset.id);
    const name = event.currentTarget.dataset.name;
    this.selectVoice(source, { id: id, name: name, demoUrl: event.currentTarget.dataset.demo || "" });
  },

  pickBgm(event) {
    const id = Number(event.currentTarget.dataset.id || 0);
    const name = id ? event.currentTarget.dataset.name : "无";
    this.setData({ bgmId: id, bgmLabel: name, picker: "" });
  },

  closePicker() {
    this.setData({ picker: "" });
  },

  noop() {},

  onBgmVolume(event) {
    this.setData({ bgmVolume: Number(event.detail.value) });
  },

  onSpeed(event) {
    this.setData({ speed: Number(event.detail.value) });
  },

  onSubtitle(event) {
    this.setData({ subtitleOn: !!event.detail.value });
  },

  chooseAudio() {
    upload
      .chooseAudio()
      .then((picked) => {
        this.setData({ busy: true, progress: 0 });
        return upload
          .upload(picked.path, (progress) => this.setData({ progress: progress }))
          .then((result) => {
            const parts = String(picked.path || "").split("/");
            this.setData({
              sourceAudioUrl: result.url,
              sourceAudioName: parts[parts.length - 1] || "已上传音频",
              busy: false,
              progress: 0,
            });
          });
      })
      .catch((error) => {
        this.setData({ busy: false, progress: 0 });
        if (error && error.message !== "已取消选择") auth.showError(error);
      });
  },

  submit() {
    if (this.data.busy) return;
    const audioType = this.data.audioType;
    const script = String(this.data.script || "").trim();
    if (audioType === "tts" && !script) {
      wx.showToast({ title: "请填写要合成的文案", icon: "none" });
      return;
    }
    if (audioType === "tts" && !this.data.voiceId) {
      wx.showToast({ title: "请先选择音色，或去克隆一个声音", icon: "none" });
      return;
    }
    if (audioType === "audio" && !this.data.sourceAudioUrl) {
      wx.showToast({ title: "请先上传要合成的音频", icon: "none" });
      return;
    }
    const payload = {
      bodyId: this.data.bodyId,
      audioType: audioType,
      bgmId: this.data.bgmId,
      bgmVolume: this.data.bgmVolume,
      speed: this.data.speed,
      subtitleOn: this.data.subtitleOn,
    };
    if (audioType === "tts") {
      payload.voiceSource = this.data.voiceSource;
      payload.voiceId = this.data.voiceId;
      payload.script = script;
    } else {
      payload.sourceAudioUrl = this.data.sourceAudioUrl;
    }
    this.setData({ busy: true });
    api
      .createWork(payload)
      .then(() => {
        this.setData({ busy: false, script: "", sourceAudioUrl: "", sourceAudioName: "" });
        wx.showToast({ title: "已提交合成" });
        wx.navigateTo({ url: "/pages/works/works" });
      })
      .catch((error) => {
        this.setData({ busy: false });
        auth.showError(error);
      });
  },

  goBodies() {
    wx.navigateTo({ url: "/pages/body/body" });
  },

  goVoices() {
    wx.navigateTo({ url: "/pages/voice/voice" });
  },
});
