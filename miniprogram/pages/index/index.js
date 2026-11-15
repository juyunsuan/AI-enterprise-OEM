const api = require("../../utils/api");
const session = require("../../utils/session");
const format = require("../../utils/format");

const ENTRY_DEFS = [
  {
    key: "tasks",
    name: "我的任务",
    desc: "按来源与分组处理待办",
    url: "/pages/tasks/tasks",
  },
  { key: "oa", name: "OA 审批", desc: "待我审批的单据", url: "/pages/oa/oa" },
  {
    key: "service",
    name: "客服会话",
    desc: "待接入与进行中的会话",
    url: "/pages/service/service",
  },
  {
    key: "notifications",
    name: "系统消息",
    desc: "六类事件通知",
    url: "/pages/notifications/notifications",
  },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

Page({
  data: {
    loggedIn: false,
    enabled: false,
    bootstrapError: "",
    appName: "AIworkin",
    themeColor: "#3370ff",
    greeting: greeting(),
    profile: null,
    unread: 0,
    showNotifications: false,
    stats: [],
    entries: [],
  },

  onShow() {
    const app = getApp();
    app.ensureReady();
    const bootstrap = app.bootstrap();
    const loggedIn = app.hasToken();
    this.setData({
      loggedIn: loggedIn,
      enabled: !!bootstrap.enabled,
      bootstrapError: app.globalData.bootstrapError || "",
      appName: bootstrap.appName || "AIworkin",
      themeColor: bootstrap.themeColor || "#3370ff",
      profile: session.getProfile(),
      showNotifications: app.featureEnabled("notifications"),
    });
    if (!loggedIn) {
      this.setData({ stats: [], entries: [], unread: 0 });
      return;
    }
    this.load();
    app.ensureReady().then(() => {
      const latest = app.bootstrap();
      this.setData({
        enabled: !!latest.enabled,
        bootstrapError: app.globalData.bootstrapError || "",
      });
    });
  },

  onPullDownRefresh() {
    if (!this.data.loggedIn) {
      wx.stopPullDownRefresh();
      return;
    }
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    const app = getApp();
    const feature = (key) => app.featureEnabled(key);
    const jobs = [];

    jobs.push(
      feature("tasks")
        ? api
            .myTasks({ page: 1, pageSize: 1 })
            .then((data) => ({ tasks: (data && data.summary) || {} }))
            .catch(() => ({ tasks: {} }))
        : Promise.resolve({ tasks: {} }),
    );
    jobs.push(
      feature("oa")
        ? api
            .oaInbox()
            .then((data) => ({ oaTotal: (data && data.total) || 0 }))
            .catch(() => ({ oaTotal: 0 }))
        : Promise.resolve({ oaTotal: 0 }),
    );
    jobs.push(
      feature("service")
        ? api
            .conversations({ page: 1, pageSize: 1, status: "waiting" })
            .then((data) => ({ serviceTotal: (data && data.total) || 0 }))
            .catch(() => ({ serviceTotal: 0 }))
        : Promise.resolve({ serviceTotal: 0 }),
    );
    jobs.push(
      feature("notifications")
        ? api
            .unreadNotifications()
            .then((data) => ({ unread: (data && data.count) || 0 }))
            .catch(() => ({ unread: 0 }))
        : Promise.resolve({ unread: 0 }),
    );

    return Promise.all(jobs).then((results) => {
      const merged = Object.assign.apply(null, [{}].concat(results));
      const tasks = merged.tasks || {};
      const stats = feature("tasks")
        ? [
            { key: "pending", label: "待办", value: tasks.pending || 0 },
            { key: "doing", label: "处理中", value: tasks.doing || 0 },
            { key: "dueToday", label: "今日到期", value: tasks.dueToday || 0 },
            {
              key: "overdue",
              label: "已逾期",
              value: tasks.overdue || 0,
              danger: (tasks.overdue || 0) > 0,
            },
          ]
        : [];
      const entries = ENTRY_DEFS.filter((item) => feature(item.key)).map(
        (item) => {
          let badge = 0;
          if (item.key === "tasks") badge = tasks.pending || 0;
          if (item.key === "oa") badge = merged.oaTotal || 0;
          if (item.key === "service") badge = merged.serviceTotal || 0;
          if (item.key === "notifications") badge = merged.unread || 0;
          return Object.assign({}, item, { badge: badge });
        },
      );
      this.setData({
        stats: stats,
        entries: entries,
        unread: merged.unread || 0,
      });
    });
  },

  openEntry(event) {
    wx.navigateTo({ url: event.currentTarget.dataset.url });
  },

  goNotifications() {
    wx.navigateTo({ url: "/pages/notifications/notifications" });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },
});
