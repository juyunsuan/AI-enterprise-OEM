var POST_STATUS = {
  PENDING: "待审核",
  PUBLISHED: "已发布",
  REJECTED: "未通过",
  HIDDEN: "已隐藏",
  DELETED: "已删除"
};

var NOTICE_TYPE = {
  LIKE: "赞",
  COMMENT: "评论",
  REPLY: "回复",
  FOLLOW: "关注",
  JOIN: "加入",
  AUDIT: "审核",
  SYSTEM: "公告"
};

function time(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

function excerpt(value, max) {
  var text = String(value || "").replace(/\s+/g, " ").trim();
  var limit = max || 80;
  return text.length > limit ? text.slice(0, limit) + "…" : text;
}

function postStatus(value) {
  return POST_STATUS[value] || value;
}

function noticeType(value) {
  return NOTICE_TYPE[value] || "消息";
}

module.exports = {
  POST_STATUS: POST_STATUS,
  NOTICE_TYPE: NOTICE_TYPE,
  time: time,
  excerpt: excerpt,
  postStatus: postStatus,
  noticeType: noticeType
};