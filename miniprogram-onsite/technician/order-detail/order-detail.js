const api = require("../../utils/api");
const staff = require("../../utils/staff");
const format = require("../../utils/format");

const STATUS_LABELS = {
  PENDING_PAYMENT: "待付款",
  PAID: "待接单",
  ACCEPTED: "已接单",
  EN_ROUTE: "服务出发",
  ON_SITE: "已到达",
  SERVING: "服务中",
  COMPLETED: "已完成",
  SIGNED: "已签收",
  REVIEWED: "已评价",
  CANCELLED: "已取消",
  EXPIRED: "超时关闭",
  REJECTED: "技师拒单",
  REFUND_PENDING: "退款中",
  REFUNDED: "已退款",
};

Page({
  data: {
    loading: true,
    errorText: "",
    order: null,
    items: [],
    stages: [],
    addressText: "",
    addressContact: "",
    canNavigate: false,
    phoneText: "",
    phoneCallable: false,
    signatureImage: "",
    amountText: "",
    feeRows: [],
    remarkText: "",
    leaveImage: "",
    canAccept: false,
    canReject: false,
    canDepart: false,
    canArrive: false,
    canStart: false,
    canComplete: false,
    hasAction: false,
    busy: false,
  },

  onLoad(query) {
    this.orderId = Number((query && query.orderId) || 0);
    this.gate = staff.ensureStaff();
  },

  async onShow() {
    const gate = this.gate || staff.ensureStaff();
    this.gate = null;
    let profile = null;
    try {
      profile = await gate;
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "登录失败，请稍后重试", icon: "none" });
      return;
    }
    if (!profile) return;
    if (!this.orderId) {
      this.setData({ loading: false, errorText: "缺少订单号，请从订单列表进入" });
      return;
    }
    await this.load();
  },

  async load() {
    this.setData({ loading: true, errorText: "" });
    try {
      const detail = await api.staffOrderDetail(this.orderId);
      this.apply(detail);
    } catch (error) {
      this.setData({
        loading: false,
        errorText: (error && error.message) || "订单加载失败",
      });
    }
  },

  apply(detail) {
    const status = detail.status;
    const items = (detail.items || []).map((item) => ({
      id: item.id,
      title: item.title,
      quantityText: "x" + item.quantity,
      durationText: item.durationMinutes ? format.duration(item.durationMinutes) : "",
      priceText: format.yuan(item.unitPriceCents),
    }));

    // 金额口径与顾客侧一致（服务费/车费/材料费/优惠/实付），端上不做任何加减
    const feeRows = [
      { key: "service", label: "服务费", value: format.yuan(detail.serviceFeeCents) },
    ];
    if (Number(detail.travelFeeCents) > 0) {
      feeRows.push({ key: "travel", label: "上门车费", value: format.yuan(detail.travelFeeCents) });
    }
    if (Number(detail.materialFeeCents) > 0) {
      feeRows.push({ key: "material", label: "材料费", value: format.yuan(detail.materialFeeCents) });
    }
    if (Number(detail.discountCents) > 0) {
      feeRows.push({ key: "discount", label: "优惠", value: "-" + format.yuan(detail.discountCents) });
    }

    const address = detail.address || null;
    const addressText = address
      ? [address.province, address.city, address.district, address.detail]
          .filter((part) => !!part)
          .join("")
      : "";
    const lng = address ? Number(address.lng) : 0;
    const lat = address ? Number(address.lat) : 0;

    const phone = detail.customerPhone || "";
    const stages = [
      { key: "accepted", label: "接单", time: detail.acceptedAt },
      { key: "departed", label: "出发", time: detail.departedAt },
      { key: "arrived", label: "到达", time: detail.arrivedAt },
      { key: "started", label: "开始服务", time: detail.serviceStartedAt },
      { key: "completed", label: "服务完成", time: detail.completedAt },
      { key: "signed", label: "顾客签收", time: detail.signedAt },
    ]
      .filter((stage) => !!stage.time)
      .map((stage) => ({
        key: stage.key,
        label: stage.label,
        timeText: format.dateTime(stage.time),
      }));

    const canAccept = status === "PAID";
    const canReject = status === "PAID";
    const canDepart = status === "ACCEPTED";
    const canArrive = status === "EN_ROUTE";
    const canStart = status === "ON_SITE";
    const canComplete = status === "SERVING";

    this.setData({
      loading: false,
      order: {
        id: detail.id,
        orderNo: detail.orderNo,
        statusLabel: STATUS_LABELS[status] || status,
        timeText: format.dateTime(detail.startAt),
        endText: format.dateTime(detail.endAt),
        durationText: detail.durationMinutes ? format.duration(detail.durationMinutes) : "",
        customerName: detail.customerName || "",
        payStatus: detail.payStatus,
        refundStatus: detail.refundStatus,
      },
      items: items,
      stages: stages,
      feeRows: feeRows,
      amountText: format.yuan(detail.payAmountCents),
      addressText: addressText,
      addressContact: address ? (address.contactName || "") + (address.phone ? " " + address.phone : "") : "",
      canNavigate: !!addressText && lng !== 0 && lat !== 0,
      phoneText: phone,
      phoneCallable: !!phone && phone.indexOf("*") < 0,
      signatureImage: detail.signature ? detail.signature.image : "",
      remarkText: detail.customerRemark || "",
      canAccept: canAccept,
      canReject: canReject,
      canDepart: canDepart,
      canArrive: canArrive,
      canStart: canStart,
      canComplete: canComplete,
      hasAction: canAccept || canReject || canDepart || canArrive || canStart || canComplete,
    });
    this.addressPoint = { lng: lng, lat: lat, text: addressText };
  },

  /** 统一包一层：防连点、遮罩、失败弹后端原文、成功后回读详情。 */
  async withBusy(loadingText, task) {
    if (this.data.busy) return false;
    this.setData({ busy: true });
    wx.showLoading({ title: loadingText || "处理中", mask: true });
    try {
      await task();
    } catch (error) {
      wx.hideLoading();
      this.setData({ busy: false });
      wx.showModal({
        title: "未完成",
        content: (error && error.message) || "请稍后重试",
        showCancel: false,
      });
      return false;
    }
    wx.hideLoading();
    this.setData({ busy: false });
    return true;
  },

  confirm(title, content) {
    return new Promise((resolve) => {
      wx.showModal({
        title: title,
        content: content,
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
  },

  /** 定位只用来补进场记录，取不到就不带坐标（advance 的 lng/lat 有默认值）。 */
  currentPoint() {
    return new Promise((resolve) => {
      wx.getLocation({
        type: "gcj02",
        success: (res) => resolve({ lng: res.longitude, lat: res.latitude }),
        fail: () => resolve({}),
      });
    });
  },

  chooseImage() {
    return new Promise((resolve) => {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sizeType: ["compressed"],
        success: (res) => {
          const files = res.tempFiles || [];
          resolve(files.length ? files[0].tempFilePath : "");
        },
        fail: () => resolve(""),
      });
    });
  },

  async accept() {
    const ok = await this.confirm("接单确认", "确认接下这一单？接单后请按预约时间上门，临时不能去请用「拒单」。");
    if (!ok) return;
    const done = await this.withBusy("接单中", () =>
      api.staffOrderAdvance({ orderId: this.orderId, action: "accept" }),
    );
    if (done) {
      wx.showToast({ title: "已接单", icon: "success" });
      await this.load();
    }
  },

  reject() {
    wx.showModal({
      title: "拒单原因",
      editable: true,
      placeholderText: "请填写拒单原因（必填，顾客与店主可见）",
      success: async (res) => {
        if (!res.confirm) return;
        const reason = String(res.content || "").trim();
        if (!reason) {
          wx.showToast({ title: "请填写拒单原因", icon: "none" });
          return;
        }
        const done = await this.withBusy("提交中", () =>
          api.staffOrderAdvance({
            orderId: this.orderId,
            action: "reject",
            content: reason.slice(0, 500),
          }),
        );
        if (done) {
          wx.showToast({ title: "已拒单", icon: "success" });
          await this.load();
        }
      },
    });
  },

  async depart() {
    const ok = await this.confirm("出发确认", "确认现在出发？出发后顾客可以看到行程已开始。");
    if (!ok) return;
    const point = await this.currentPoint();
    const done = await this.withBusy("提交中", () =>
      api.staffOrderAdvance({ orderId: this.orderId, action: "depart", lng: point.lng || 0, lat: point.lat || 0 }),
    );
    if (done) {
      wx.showToast({ title: "已出发", icon: "success" });
      await this.load();
    }
  },

  async arrive() {
    const ok = await this.confirm(
      "到达确认",
      "到场后请拍摄现场照片，照片会作为到场时间与现场情况的凭证。继续将打开相机。",
    );
    if (!ok) return;
    const filePath = await this.chooseImage();
    if (!filePath) return;
    const done = await this.withBusy("上传照片", async () => {
      const uploaded = await api.upload(filePath, "checkin");
      const point = await this.currentPoint();
      await api.staffOrderAdvance({
        orderId: this.orderId,
        action: "arrive",
        image: uploaded.url,
        lng: point.lng || 0,
        lat: point.lat || 0,
      });
    });
    if (done) {
      wx.showToast({ title: "已到达", icon: "success" });
      await this.load();
    }
  },

  async start() {
    const ok = await this.confirm("开始服务", "确认顾客已在场、现在开始服务？");
    if (!ok) return;
    const done = await this.withBusy("提交中", () =>
      api.staffOrderAdvance({ orderId: this.orderId, action: "start" }),
    );
    if (done) {
      wx.showToast({ title: "服务已开始", icon: "success" });
      await this.load();
    }
  },

  /** 完工照片是选填：schema 里 image 有默认值，不上传也能完成。 */
  async chooseLeavePhoto() {
    const filePath = await this.chooseImage();
    if (!filePath) return;
    const done = await this.withBusy("上传照片", async () => {
      const uploaded = await api.upload(filePath, "checkin");
      this.setData({ leaveImage: uploaded.url });
    });
    if (done) wx.showToast({ title: "已添加完工照片", icon: "none" });
  },

  async complete() {
    const tip = this.data.leaveImage
      ? "确认服务已完成？完成后由顾客签收确认，本单不能再推进。"
      : "确认服务已完成？尚未添加工完照片，完成后由顾客签收确认，本单不能再推进。";
    const ok = await this.confirm("完成服务", tip);
    if (!ok) return;
    const point = await this.currentPoint();
    const payload = {
      orderId: this.orderId,
      action: "complete",
      lng: point.lng || 0,
      lat: point.lat || 0,
    };
    if (this.data.leaveImage) payload.image = this.data.leaveImage;
    const done = await this.withBusy("提交中", () => api.staffOrderAdvance(payload));
    if (done) {
      wx.showToast({ title: "已完成", icon: "success" });
      await this.load();
    }
  },

  callCustomer() {
    if (!this.data.phoneCallable) return;
    wx.makePhoneCall({ phoneNumber: this.data.phoneText });
  },

  copyAddress() {
    if (!this.data.addressText) return;
    wx.setClipboardData({ data: this.data.addressText });
  },

  copyOrderNo() {
    if (!this.data.order || !this.data.order.orderNo) return;
    wx.setClipboardData({ data: this.data.order.orderNo });
  },

  openMap() {
    if (!this.data.canNavigate || !this.addressPoint) return;
    wx.openLocation({
      latitude: this.addressPoint.lat,
      longitude: this.addressPoint.lng,
      name: this.data.addressContact || "顾客地址",
      address: this.data.addressText,
      scale: 16,
    });
  },

  previewSignature() {
    if (!this.data.signatureImage) return;
    wx.previewImage({ urls: [this.data.signatureImage], current: this.data.signatureImage });
  },

  previewLeavePhoto() {
    if (!this.data.leaveImage) return;
    wx.previewImage({ urls: [this.data.leaveImage], current: this.data.leaveImage });
  },
});
