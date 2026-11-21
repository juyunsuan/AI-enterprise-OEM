function duration(seconds) {
  var value = Math.max(0, Number(seconds) || 0);
  var minute = Math.floor(value / 60);
  var second = value % 60;
  return minute + "分" + second + "秒";
}

function clock(seconds) {
  var value = Math.max(0, Number(seconds) || 0);
  var minute = Math.floor(value / 60);
  var second = value % 60;
  return (minute < 10 ? "0" : "") + minute + ":" + (second < 10 ? "0" : "") + second;
}

function shortTime(value) {
  if (!value) return "";
  var date = new Date(value);
  if (isNaN(date.getTime())) return String(value).slice(0, 16);
  var pad = function (num) {
    return num < 10 ? "0" + num : String(num);
  };
  return (
    date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
    " " + pad(date.getHours()) + ":" + pad(date.getMinutes())
  );
}

function answerText(answer) {
  return String(answer || "").split("").join("、");
}

module.exports = {
  duration: duration,
  clock: clock,
  shortTime: shortTime,
  answerText: answerText,
};