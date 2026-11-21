/**
 * 素材上传：wx.uploadFile → `/api/public/digital-human/upload` → 公网 URL。
 *
 * 微信上传接口不能走 wx.request，这里单独封装一次，页面只关心「选完文件拿到 URL」。
 * 限制与后端一致（100MB、扩展名白名单），提前拦下能省一次流量。
 */
const config = require("../config");
const request = require("./request");
const session = require("./session");

const LIMIT_BYTES = 100 * 1024 * 1024;
const EXT = /\.(mp4|mov|m4a|mp3|wav|aac|png|jpe?g|webp)$/i;

function extOf(path) {
  const match = EXT.exec(String(path || ""));
  return match ? match[0].toLowerCase() : "";
}

function upload(tempFilePath, onProgress) {
  const base = request.baseUrl();
  if (!base) {
    return Promise.reject(new Error("未配置站点接口地址，请用后端打包生成小程序包"));
  }
  const ext = extOf(tempFilePath);
  if (!ext) {
    return Promise.reject(
      new Error("只支持 mp4/mov/m4a/mp3/wav/aac/png/jpg/webp 文件"),
    );
  }
  const token = session.getToken();
  const url =
    base +
    request.API_PREFIX +
    "/upload" +
    request.toQuery({ site: config.siteCode });

  return new Promise((resolve, reject) => {
    const task = wx.uploadFile({
      url: url,
      filePath: tempFilePath,
      name: "file",
      header: token ? { Authorization: "Bearer " + token } : {},
      success(res) {
        let body = {};
        try {
          body = JSON.parse(res.data || "{}");
        } catch (e) {
          body = {};
        }
        if (res.statusCode === 401 || body.code === 401) {
          session.clearToken();
          reject(new Error(body.message || "登录已过期，请重新进入小程序"));
          return;
        }
        if (res.statusCode >= 400 || body.code !== 0) {
          reject(new Error(body.message || "上传失败，请重试"));
          return;
        }
        resolve(body.data || {});
      },
      fail() {
        reject(new Error("上传失败，请检查网络后重试"));
      },
    });
    if (onProgress && task && task.onProgressUpdate) {
      task.onProgressUpdate((event) => onProgress(event.progress || 0));
    }
  });
}

/** 选视频：返回 { path, duration }；时长用于形象克隆区间校验。 */
function chooseVideo(maxDuration) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ["video"],
      sourceType: ["album", "camera"],
      maxDuration: Math.max(10, Math.min(60, maxDuration || 60)),
      camera: "front",
      success(res) {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) {
          reject(new Error("未选择视频"));
          return;
        }
        resolve({ path: file.tempFilePath, duration: Math.round(file.duration || 0) });
      },
      fail() {
        reject(new Error("已取消选择"));
      },
    });
  });
}

/** 选音频：聊天文件（mp3/wav/m4a/aac），返回 { path, duration }。 */
function chooseAudio() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["mp3", "wav", "m4a", "aac"],
      success(res) {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) {
          reject(new Error("未选择音频"));
          return;
        }
        if (file.size > LIMIT_BYTES) {
          reject(new Error("文件超过 100MB，请压缩后再传"));
          return;
        }
        resolve({ path: file.path || file.tempFilePath, duration: 0 });
      },
      fail() {
        reject(new Error("已取消选择"));
      },
    });
  });
}

function chooseImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success(res) {
        const file = res.tempFiles && res.tempFiles[0];
        if (file) resolve(file.tempFilePath);
        else reject(new Error("未选择图片"));
      },
      fail() {
        reject(new Error("已取消选择"));
      },
    });
  });
}

/** 本地视频时长：chooseMedia 偶发拿不到 duration，用 getVideoInfo 补一次。 */
function videoDuration(path) {
  return new Promise((resolve) => {
    wx.getVideoInfo({
      src: path,
      success(res) {
        resolve(Math.round((res && res.duration) || 0));
      },
      fail() {
        resolve(0);
      },
    });
  });
}

/** 本地音频时长：innerAudioContext 读到 canplay 即可拿 duration。 */
function audioDuration(path) {
  return new Promise((resolve) => {
    const audio = wx.createInnerAudioContext();
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      audio.destroy();
      resolve(Math.round(value || 0));
    };
    audio.src = path;
    audio.onCanplay(() => {
      // 部分机型 onCanplay 时 duration 仍为 0，稍等一拍再读。
      setTimeout(() => done(audio.duration), 200);
    });
    audio.onError(() => done(0));
    setTimeout(() => done(audio.duration || 0), 4000);
  });
}

module.exports = {
  upload: upload,
  chooseVideo: chooseVideo,
  chooseAudio: chooseAudio,
  chooseImage: chooseImage,
  videoDuration: videoDuration,
  audioDuration: audioDuration,
};
