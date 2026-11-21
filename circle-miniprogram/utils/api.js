var request = require("./request");
var session = require("./session");

function ownAppId() {
  try {
    var info = typeof wx.getAccountInfoSync === "function" ? wx.getAccountInfoSync() : null;
    return String((info && info.miniProgram && info.miniProgram.appId) || "");
  } catch (error) {
    return "";
  }
}

/** 所有公开接口都带社区寻址键：正式环境用 AppID，本地调试可用社区码。 */
function communityQuery(query) {
  return Object.assign(
    { appId: ownAppId(), code: session.getCommunityCode() },
    query || {}
  );
}

function upload(filePath) {
  return new Promise(function (resolve, reject) {
    var base = session.getApiBase();
    if (!base) {
      reject(new Error("未配置服务器地址"));
      return;
    }
    var query = "appId=" + encodeURIComponent(ownAppId()) + "&code=" + encodeURIComponent(session.getCommunityCode());
    wx.uploadFile({
      url: base + "/api/public/circle/upload?" + query,
      filePath: filePath,
      name: "file",
      header: { Authorization: "Bearer " + session.getToken() },
      success: function (res) {
        var data = {};
        try {
          data = JSON.parse(res.data || "{}");
        } catch (error) {
          data = {};
        }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error((data && data.message) || "上传失败"));
      },
      fail: function () {
        reject(new Error("上传失败，请检查网络或域名配置"));
      }
    });
  });
}

module.exports = {
  ownAppId: ownAppId,
  communityQuery: communityQuery,

  bootstrap: function () {
    return request({ path: "/api/public/circle/bootstrap", query: communityQuery() });
  },
  login: function (code) {
    return request({
      path: "/api/public/circle/login",
      method: "POST",
      query: communityQuery(),
      data: { code: code, nickname: "", avatar: "" }
    });
  },
  categories: function () {
    return request({ path: "/api/public/circle/categories", query: communityQuery() });
  },
  groups: function (query) {
    return request({ path: "/api/public/circle/groups", query: communityQuery(query) });
  },
  groupDetail: function (id) {
    return request({ path: "/api/public/circle/group/detail", query: communityQuery({ id: id }) });
  },
  groupApply: function (body) {
    return request({ path: "/api/public/circle/group/apply", method: "POST", query: communityQuery(), data: body });
  },
  groupJoin: function (groupId) {
    return request({ path: "/api/public/circle/group/join", method: "POST", query: communityQuery(), data: { groupId: groupId } });
  },
  groupLeave: function (groupId) {
    return request({ path: "/api/public/circle/group/leave", method: "POST", query: communityQuery(), data: { groupId: groupId } });
  },
  groupFollow: function (groupId, follow) {
    return request({ path: "/api/public/circle/group/follow", method: "POST", query: communityQuery(), data: { groupId: groupId, follow: follow } });
  },
  groupMembers: function (groupId, status) {
    return request({ path: "/api/public/circle/group/members", query: communityQuery({ groupId: groupId, status: status || "ACTIVE" }) });
  },
  groupUpdate: function (body) {
    return request({ path: "/api/public/circle/group/update", method: "POST", query: communityQuery(), data: body });
  },
  groupMemberAction: function (groupId, userId, action) {
    return request({ path: "/api/public/circle/group/member/action", method: "POST", query: communityQuery(), data: { groupId: groupId, userId: userId, action: action } });
  },
  posts: function (query) {
    return request({ path: "/api/public/circle/posts", query: communityQuery(query) });
  },
  postDetail: function (id) {
    return request({ path: "/api/public/circle/post/detail", query: communityQuery({ id: id }) });
  },
  postCreate: function (body) {
    return request({ path: "/api/public/circle/post/create", method: "POST", query: communityQuery(), data: body });
  },
  postRemove: function (id) {
    return request({ path: "/api/public/circle/post/remove", method: "POST", query: communityQuery(), data: { id: id } });
  },
  postLike: function (postId, like) {
    return request({ path: "/api/public/circle/post/like", method: "POST", query: communityQuery(), data: { postId: postId, like: like } });
  },
  postFavorite: function (postId, favorite) {
    return request({ path: "/api/public/circle/post/favorite", method: "POST", query: communityQuery(), data: { postId: postId, favorite: favorite } });
  },
  comments: function (postId) {
    return request({ path: "/api/public/circle/comments", query: communityQuery({ postId: postId }) });
  },
  commentCreate: function (body) {
    return request({ path: "/api/public/circle/comment/create", method: "POST", query: communityQuery(), data: body });
  },
  commentRemove: function (id) {
    return request({ path: "/api/public/circle/comment/remove", method: "POST", query: communityQuery(), data: { id: id } });
  },
  commentLike: function (commentId, like) {
    return request({ path: "/api/public/circle/comment/like", method: "POST", query: communityQuery(), data: { commentId: commentId, like: like } });
  },
  userMe: function () {
    return request({ path: "/api/public/circle/user/me", query: communityQuery() });
  },
  userDetail: function (id) {
    return request({ path: "/api/public/circle/user/detail", query: communityQuery({ id: id }) });
  },
  userFollow: function (userId, follow) {
    return request({ path: "/api/public/circle/user/follow", method: "POST", query: communityQuery(), data: { userId: userId, follow: follow } });
  },
  userPosts: function (id, query) {
    return request({ path: "/api/public/circle/user/posts", query: communityQuery(Object.assign({ id: id }, query || {})) });
  },
  userFavorites: function (query) {
    return request({ path: "/api/public/circle/user/favorites", query: communityQuery(query) });
  },
  profileSave: function (body) {
    return request({ path: "/api/public/circle/user/profile", method: "POST", query: communityQuery(), data: body });
  },
  messages: function () {
    return request({ path: "/api/public/circle/messages", query: communityQuery() });
  },
  messagesRead: function () {
    return request({ path: "/api/public/circle/messages/read", method: "POST", query: communityQuery(), data: {} });
  },
  reportCreate: function (body) {
    return request({ path: "/api/public/circle/report/create", method: "POST", query: communityQuery(), data: body });
  },
  activities: function (query) {
    return request({ path: "/api/public/circle/activities", query: communityQuery(query) });
  },
  activityDetail: function (id) {
    return request({ path: "/api/public/circle/activity/detail", query: communityQuery({ id: id }) });
  },
  activityJoin: function (id) {
    return request({ path: "/api/public/circle/activity/join", method: "POST", query: communityQuery(), data: { id: id } });
  },
  activityCancel: function (id) {
    return request({ path: "/api/public/circle/activity/cancel", method: "POST", query: communityQuery(), data: { id: id } });
  },
  userMedals: function (id) {
    return request({ path: "/api/public/circle/user/medals", query: communityQuery({ id: id }) });
  },
  topics: function () {
    return request({ path: "/api/public/circle/topics", query: communityQuery() });
  },
  search: function (keyword) {
    return request({ path: "/api/public/circle/search", query: communityQuery({ keyword: keyword }) });
  },
  upload: upload
};