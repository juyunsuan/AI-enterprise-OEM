const session = require("./session");

const BIND_PAGE = "/pages/staff/bind/bind";

function requireStaff() {
  if (session.getStaffToken()) return session.getStaff();
  wx.redirectTo({ url: BIND_PAGE });
  return null;
}

function openWorkbench() {
  if (!session.getStaffToken()) {
    wx.navigateTo({ url: BIND_PAGE });
    return;
  }
  wx.navigateTo({ url: "/pages/staff/workbench/workbench" });
}

module.exports = { requireStaff, openWorkbench, BIND_PAGE };