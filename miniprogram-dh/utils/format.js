/** 展示层格式化：金额/时间/时长/状态标签，统一在这里，页面不再各写一份。 */

const WORK_STATUS = { 0: "合成中", 1: "已完成", 2: "合成失败" };
const WORK_STAGE = { tts: "语音合成中", lipsync: "画面合成中", done: "已完成" };
const ASSET_STATUS = { 0: "训练中", 1: "可用", 2: "失败" };
const ORDER_STATUS = { 0: "未支付", 1: "已支付", 2: "已退款", 3: "已关闭" };
const WITHDRAW_STATUS = { 0: "待处理", 1: "已打款", 2: "已驳回" };
const PACKAGE_TYPE = {
  vip: "会员套餐",
  point: "算力套餐",
  body: "形象点套餐",
  voice: "声音点套餐",
};

function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

function money(cents) {
  const value = Math.max(0, Math.round(Number(cents) || 0));
  return "¥" + (value / 100).toFixed(2);
}

function dateTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
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

function day(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function duration(sec) {
  const value = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(value / 60);
  const s = value % 60;
  return m + ":" + pad(s);
}

function workStatus(status) {
  return WORK_STATUS[status] || "";
}

function stageText(row) {
  if (!row) return "";
  if (row.status === 2) return row.failReason || "合成失败";
  return WORK_STAGE[row.stage] || WORK_STATUS[row.status] || "";
}

module.exports = {
  money: money,
  dateTime: dateTime,
  day: day,
  duration: duration,
  workStatus: workStatus,
  stageText: stageText,
  assetStatus: function (status) {
    return ASSET_STATUS[status] || "";
  },
  orderStatus: function (status) {
    return ORDER_STATUS[status] || "";
  },
  withdrawStatus: function (status) {
    return WITHDRAW_STATUS[status] || "";
  },
  packageType: function (type) {
    return PACKAGE_TYPE[type] || "";
  },
};
