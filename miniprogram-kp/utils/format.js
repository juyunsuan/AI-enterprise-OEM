/**
 * 展示层小工具：把后端字段翻译成卡片要用的文案，页面只负责排版。
 */

const MEDIA_LABELS = {
  video: "视频",
  audio: "音频",
  article: "图文",
  image: "图片",
  live: "直播",
};

const PLAN_LABELS = {
  1: "月度会员",
  6: "半年会员",
  12: "年度会员",
};

function mediaLabel(mediaType) {
  return MEDIA_LABELS[mediaType] || "内容";
}

function planLabel(plan) {
  return PLAN_LABELS[plan] || "会员 " + plan + " 个月";
}

/**
 * 权限标签：列表页与详情页共用同一套文案，避免「免费/积分/VIP」在各页写法不一致。
 * 同时把封面/浏览数兜底成可直接渲染的值，WXML 里就不必写表达式判空。
 */
function decorateResource(item) {
  const data = item || {};
  const access = data.accessMode || "free";
  let accessLabel = "免费";
  let accessClass = "tag";
  if (access === "vip") {
    accessLabel = "VIP专享";
    accessClass = "tag tag-vip";
  } else if (access === "points") {
    accessLabel = (data.price || 0) + "积分";
    accessClass = "tag tag-points";
  }
  return Object.assign({}, data, {
    cover: data.cover || "",
    accessLabel: accessLabel,
    accessClass: accessClass,
    mediaLabel: mediaLabel(data.mediaType),
    viewText: formatCount(data.viewCount),
  });
}

function decorateList(list) {
  return (list || []).map(decorateResource);
}

function formatCount(value) {
  const num = Number(value) || 0;
  if (num >= 10000) return (num / 10000).toFixed(1) + "w";
  return String(num);
}

/** 后端时间是 ISO 串，iOS 上 new Date("2024-01-01 10:00") 会 NaN，先归一化再解析。 */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).replace(/-/g, "/").replace("T", " ").replace(/\..*$/, "");
  const date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

function dateTime(value) {
  const date = toDate(value);
  if (!date) return String(value || "");
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

function dateText(value) {
  const date = toDate(value);
  if (!date) return String(value || "");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

module.exports = {
  mediaLabel: mediaLabel,
  planLabel: planLabel,
  decorateResource: decorateResource,
  decorateList: decorateList,
  formatCount: formatCount,
  dateTime: dateTime,
  dateText: dateText,
};
