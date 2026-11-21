var request = require("./request");

function bankPath(code, suffix) {
  return "/api/public/quiz/" + encodeURIComponent(code) + suffix;
}

module.exports = {
  bootstrap: function (code, participantId) {
    return request({
      path: "/api/public/quiz/bootstrap",
      query: { code: code, participantId: participantId || "" },
    });
  },
  register: function (siteCode, payload) {
    return request({
      path: "/api/public/quiz/" + encodeURIComponent(siteCode) + "/register",
      method: "POST",
      data: payload,
    });
  },
  start: function (bankCode, mode, participantId) {
    return request({
      path: bankPath(bankCode, "/start"),
      method: "POST",
      data: { mode: mode, participantId: participantId || "" },
    });
  },
  check: function (bankCode, questionId, answer, participantId) {
    return request({
      path: bankPath(bankCode, "/check"),
      method: "POST",
      data: {
        questionId: questionId,
        answer: answer || "",
        participantId: participantId || "",
      },
    });
  },
  submit: function (bankCode, payload) {
    return request({
      path: bankPath(bankCode, "/submit"),
      method: "POST",
      data: payload,
    });
  },
  attempts: function (bankCode, participantId, limit) {
    return request({
      path: bankPath(bankCode, "/attempts"),
      query: { participantId: participantId, limit: limit || 20 },
    });
  },
  rank: function (bankCode, limit) {
    return request({
      path: bankPath(bankCode, "/rank"),
      query: { limit: limit || 20 },
    });
  },
  wrong: function (bankCode, participantId) {
    return request({
      path: bankPath(bankCode, "/wrong"),
      query: { participantId: participantId },
    });
  },
  explain: function (bankCode, questionId, selected, participantId) {
    return request({
      path: bankPath(bankCode, "/explain"),
      method: "POST",
      data: {
        questionId: questionId,
        selected: selected || "",
        participantId: participantId || "",
      },
    });
  },
  analyze: function (bankCode, attemptId, participantId) {
    return request({
      path: bankPath(bankCode, "/attempts/" + attemptId + "/analysis"),
      method: "POST",
      data: { participantId: participantId },
    });
  },
  serviceSession: function (payload) {
    return request({
      path: "/api/public/service-desk/open/session",
      method: "POST",
      data: payload,
    });
  },
  serviceMessages: function (conversationId, token, afterId) {
    return request({
      path: "/api/public/service-desk/open/messages/" + conversationId,
      query: { token: token, afterId: afterId || 0 },
    });
  },
  serviceSend: function (conversationId, payload) {
    return request({
      path: "/api/public/service-desk/open/messages/" + conversationId,
      method: "POST",
      data: payload,
    });
  },
};