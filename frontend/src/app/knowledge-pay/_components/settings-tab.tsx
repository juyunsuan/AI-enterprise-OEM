"use client";

// 基础设置页签：站点概览 + 站点信息、模块开关、会员定价、FAQ/关于、微信凭据与广告位，一次保存整份站点配置。
import { CopyOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Skeleton,
  Space,
  Switch,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  KP_TOGGLE_KEYS,
  KP_TOGGLE_LABELS,
  KP_VIP_PLANS,
  type KpOverview,
  type KpSettingsView,
} from "@enterprise/contracts";
import { knowledgePayApi } from "@/api/knowledge-pay";
import { Notice, Panel, StatCard, StatGrid } from "@/components/ui/panel";

type SettingsDraft = {
  siteName: string;
  slogan: string;
  themeColor: string;
  hotWords: string;
  moreTitle: string;
  enabled: boolean;
  /** 键为 KP_TOGGLE_KEYS；缺省按开启处理（与后端默认全开一致）。 */
  toggles: Record<string, boolean>;
  /** 会员定价：plan（月）→ 积分价。 */
  vipPrices: Record<number, number>;
  /** 会员现金价（分）：plan（月）→ 微信支付价；0 不开放。 */
  vipCashPrices: Record<number, number>;
  /** 签到 7 天奖励，索引 0 = 第 1 天。 */
  signRewards: number[];
  faq: string;
  about: string;
  wxAppId: string;
  /** 留空表示沿用已保存的密文（契约里这两个字段是 optional）。 */
  wxAppSecret: string;
  wxMchId: string;
  wxPaySerial: string;
  wxPayApiV3Key: string;
  wxPayPrivateKey: string;
  adUnitTab: string;
  adUnitDetail: string;
};

const THEME_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function toDraft(view: KpSettingsView): SettingsDraft {
  return {
    siteName: view.siteName,
    slogan: view.slogan,
    themeColor: view.themeColor,
    hotWords: view.hotWords,
    moreTitle: view.moreTitle,
    enabled: view.enabled,
    toggles: { ...view.toggles },
    vipPrices: Object.fromEntries(
      KP_VIP_PLANS.map((plan) => [
        plan,
        view.vipPlans.find((item) => item.plan === plan)?.price ?? 0,
      ]),
    ),
    vipCashPrices: Object.fromEntries(
      KP_VIP_PLANS.map((plan) => [
        plan,
        view.vipPlans.find((item) => item.plan === plan)?.cashPrice ?? 0,
      ]),
    ),
    // 后端最多存 7 项，不足的天数按 0 补，界面固定渲染 7 格。
    signRewards: Array.from({ length: 7 }, (_, index) => view.signRewards[index] ?? 0),
    faq: view.faq,
    about: view.about,
    wxAppId: view.wxAppId,
    wxAppSecret: "",
    wxMchId: view.wxMchId,
    wxPaySerial: view.wxPaySerial,
    wxPayApiV3Key: "",
    wxPayPrivateKey: "",
    adUnitTab: view.adUnitTab,
    adUnitDetail: view.adUnitDetail,
  };
}

export function SettingsTab() {
  const { message } = App.useApp();
  const [overview, setOverview] = useState<KpOverview | null>(null);
  const [settings, setSettings] = useState<KpSettingsView | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingPay, setTestingPay] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await knowledgePayApi.overview());
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "概览加载失败");
    }
  }, [message]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const view = await knowledgePayApi.settings();
      if (view) {
        setSettings(view);
        setDraft(toDraft(view));
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "站点设置加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  // 进入即加载：概览与设置一起拉，保存/自检后由对应动作各自重拉。
  useEffect(() => {
    void loadOverview();
    void loadSettings();
  }, [loadOverview, loadSettings]);

  const copySiteCode = async () => {
    if (!overview?.siteCode) return;
    try {
      await navigator.clipboard.writeText(overview.siteCode);
      message.success("站点编码已复制");
    } catch {
      message.warning("浏览器不允许剪贴板，请手动复制");
    }
  };

  const save = async () => {
    if (!draft) return;
    const siteName = draft.siteName.trim();
    if (!siteName) {
      message.warning("请填写站点名称，代码包按它初始化站点");
      return;
    }
    if (!THEME_COLOR_PATTERN.test(draft.themeColor.trim())) {
      message.warning("主题色需为 #RRGGBB 格式，如 #3370ff");
      return;
    }
    setSaving(true);
    try {
      const view = await knowledgePayApi.saveSettings({
        body: {
          siteName,
          slogan: draft.slogan.trim(),
          themeColor: draft.themeColor.trim(),
          toggles: Object.fromEntries(
            KP_TOGGLE_KEYS.map((key) => [key, draft.toggles[key] !== false]),
          ),
          faq: draft.faq,
          about: draft.about,
          vipPlans: KP_VIP_PLANS.map((plan) => ({
            plan,
            price: Math.max(0, Math.round(draft.vipPrices[plan] ?? 0)),
            cashPrice: Math.max(
              0,
              Math.round(draft.vipCashPrices[plan] ?? 0),
            ),
          })),
          signRewards: draft.signRewards
            .slice(0, 7)
            .map((value) => Math.max(0, Math.min(9999, Math.round(value || 0)))),
          hotWords: draft.hotWords.trim(),
          moreTitle: draft.moreTitle.trim() || "精选推荐",
          wxAppId: draft.wxAppId.trim(),
          // 空串会被契约当“覆盖为空”，只有真正填了才带上（留空＝保留原值）。
          ...(draft.wxAppSecret.trim() ? { wxAppSecret: draft.wxAppSecret.trim() } : {}),
          wxMchId: draft.wxMchId.trim(),
          wxPaySerial: draft.wxPaySerial.trim(),
          ...(draft.wxPayApiV3Key.trim()
            ? { wxPayApiV3Key: draft.wxPayApiV3Key.trim() }
            : {}),
          ...(draft.wxPayPrivateKey.trim()
            ? { wxPayPrivateKey: draft.wxPayPrivateKey.trim() }
            : {}),
          adUnitTab: draft.adUnitTab.trim(),
          adUnitDetail: draft.adUnitDetail.trim(),
          enabled: draft.enabled,
        },
      });
      if (view) {
        setSettings(view);
        setDraft(toDraft(view));
      }
      message.success("站点设置已保存");
      void loadOverview();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const result = await knowledgePayApi.test({ body: {} });
      if (result?.ok) {
        message.success(result.message || "微信凭据可用");
      } else {
        message.error(result?.message || "连接失败：请检查 AppID / AppSecret 后重试，或先保存再自检");
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "连接失败");
    } finally {
      setTesting(false);
    }
  };

  /** 支付自检：下载平台证书验签，确认商户号/APIv3 密钥/私钥链路。 */
  const testPay = async () => {
    setTestingPay(true);
    try {
      const result = await knowledgePayApi.testPay({ body: {} });
      if (result?.ok) {
        message.success(result.message || "微信支付凭据可用");
      } else {
        message.error(result?.message || "支付自检失败：请先保存商户凭据");
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "支付自检失败");
    } finally {
      setTestingPay(false);
    }
  };

  const colorValid = THEME_COLOR_PATTERN.test(draft?.themeColor.trim() ?? "");

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <StatGrid>
        <StatCard
          label="站点编码"
          value={
            <Space size={4}>
              <span className="mono" style={{ fontSize: 14 }}>
                {overview?.siteCode || "—"}
              </span>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined aria-hidden />}
                onClick={() => void copySiteCode()}
              >
                复制
              </Button>
            </Space>
          }
          hint="代码包按此编码连本站；小程序端免登录接口用它定位站点"
        />
        <StatCard
          label="课程数"
          value={overview?.resourceCount ?? 0}
          hint={`在线 ${overview?.onlineCount ?? 0} · 分类 ${overview?.categoryCount ?? 0}`}
        />
        <StatCard
          label="会员数"
          value={overview?.memberCount ?? 0}
          hint={`会员生效中 ${overview?.vipCount ?? 0}`}
        />
        <StatCard
          label="订单数"
          value={overview?.orderCount ?? 0}
          hint={`今日新增 ${overview?.todayOrders ?? 0}`}
        />
        <StatCard
          label="积分消耗"
          value={overview?.pointsConsumed ?? 0}
          hint="会员解锁课程累计消耗的积分"
        />
        <StatCard
          label="学员"
          value={overview?.learnerCount ?? 0}
          hint={`完课课时 ${overview?.completedCount ?? 0} / 进度 ${overview?.progressCount ?? 0}`}
        />
        <StatCard
          label="评价"
          value={overview?.reviewCount ?? 0}
          hint={`均分 ${overview?.ratingAvg ?? 0} · 在「评价管理」回复`}
        />
        <StatCard
          label="卡密"
          value={`${overview?.cardUnused ?? 0} 未用`}
          hint={`已兑换 ${overview?.cardUsed ?? 0} · 在「卡密」页签生成`}
        />
      </StatGrid>

      {loading || !draft ? (
        <Panel title="站点设置">
          <Skeleton active paragraph={{ rows: 8 }} />
        </Panel>
      ) : (
        <>
          <Panel
            title="站点信息"
            titleExtra={
              <span className="text-12 muted">
                这些字段驱动小程序端展示；改完记得右上角「保存设置」
              </span>
            }
            extra={
              <Button type="primary" loading={saving} onClick={() => void save()}>
                保存设置
              </Button>
            }
          >
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              <div className="form-2col">
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>站点名称</div>
                  <Input
                    value={draft.siteName}
                    maxLength={60}
                    placeholder="我的知识付费云课堂"
                    onChange={(event) => setDraft({ ...draft, siteName: event.target.value })}
                  />
                </div>
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>站点标语</div>
                  <Input
                    value={draft.slogan}
                    maxLength={120}
                    placeholder="展示在小程序首页的一句话"
                    onChange={(event) => setDraft({ ...draft, slogan: event.target.value })}
                  />
                </div>
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>主题色</div>
                  <Space>
                    <Input
                      className="mono"
                      value={draft.themeColor}
                      maxLength={7}
                      placeholder="#3370ff"
                      onChange={(event) => setDraft({ ...draft, themeColor: event.target.value })}
                    />
                    <span
                      aria-hidden
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        border: "1px solid var(--border)",
                        background: colorValid ? draft.themeColor.trim() : "transparent",
                      }}
                    />
                  </Space>
                  {!colorValid ? (
                    <div className="text-12 muted" style={{ marginTop: 4 }}>需为 #RRGGBB，如 #3370ff</div>
                  ) : null}
                </div>
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>热门搜索词</div>
                  <Input
                    value={draft.hotWords}
                    maxLength={255}
                    placeholder="用逗号分隔，如：Excel,配音,剪辑"
                    onChange={(event) => setDraft({ ...draft, hotWords: event.target.value })}
                  />
                </div>
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>精选位标题</div>
                  <Input
                    value={draft.moreTitle}
                    maxLength={60}
                    placeholder="精选推荐"
                    onChange={(event) => setDraft({ ...draft, moreTitle: event.target.value })}
                  />
                </div>
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>站点启停</div>
                  <Space>
                    <Switch
                      checked={draft.enabled}
                      onChange={(value) => setDraft({ ...draft, enabled: value })}
                    />
                    <span>{draft.enabled ? "运行中：小程序可正常访问" : "已停用：终端会员无法进入小程序"}</span>
                  </Space>
                </div>
              </div>
              <Notice variant="info">
                站点停用只影响小程序终端访问，本站管理数据（会员/订单/台账）仍可在这里查看与导出。
              </Notice>
            </Space>
          </Panel>

          <Panel
            title="模块开关"
            titleExtra={
              <span className="text-12 muted">
                关掉的模块在小程序端整块不渲染，与页面显隐一起生效
              </span>
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "10px 12px",
              }}
            >
              {KP_TOGGLE_KEYS.map((key) => (
                <Checkbox
                  key={key}
                  checked={draft.toggles[key] !== false}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      toggles: { ...draft.toggles, [key]: event.target.checked },
                    })
                  }
                >
                  {KP_TOGGLE_LABELS[key]}
                </Checkbox>
              ))}
            </div>
            <Notice variant="info">
              广告位开关配合下方「流量主广告位 ID」使用：没有 ID 时即使开关打开，小程序端也不渲染广告。
            </Notice>
          </Panel>

          <Panel
            title="会员定价与签到奖励"
            titleExtra={
              <span className="text-12 muted">
                积分价单位与「积分购买」一致；签到奖励按连签天数逐日发放
              </span>
            }
          >
            <Space orientation="vertical" size={14} style={{ width: "100%" }}>
              <div>
                <div className="text-12 muted" style={{ marginBottom: 8 }}>购买会员（积分价）</div>
                <Space wrap size={16}>
                  {KP_VIP_PLANS.map((plan) => (
                    <Space key={plan} size={6}>
                      <span className="text-12 muted">{plan} 个月</span>
                      <InputNumber
                        min={0}
                        max={999999}
                        precision={0}
                        value={draft.vipPrices[plan] ?? 0}
                        suffix="积分"
                        style={{ width: 150 }}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            vipPrices: { ...draft.vipPrices, [plan]: Number(value) || 0 },
                          })
                        }
                      />
                      <InputNumber
                        min={0}
                        max={999999.99}
                        precision={2}
                        value={(draft.vipCashPrices[plan] ?? 0) / 100}
                        suffix="元"
                        style={{ width: 130 }}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            vipCashPrices: {
                              ...draft.vipCashPrices,
                              [plan]: Math.max(0, Math.round(Number(value || 0) * 100)),
                            },
                          })
                        }
                      />
                    </Space>
                  ))}
                </Space>
                <div className="text-12 muted" style={{ marginTop: 6 }}>
                  0 表示该档不开放购买；积分价与微信支付价（元）可同时配置，「积分购买会员」开关关闭时整页隐藏。
                </div>
              </div>
              <div>
                <div className="text-12 muted" style={{ marginBottom: 8 }}>每日签到奖励（第 1-7 天，之后按第 7 天循环）</div>
                <Space wrap size={8}>
                  {draft.signRewards.map((value, index) => (
                    <InputNumber
                      key={index}
                      min={0}
                      max={9999}
                      precision={0}
                      prefix={`第${index + 1}天`}
                      value={value}
                      style={{ width: 120 }}
                      onChange={(next) =>
                        setDraft({
                          ...draft,
                          signRewards: draft.signRewards.map(
                            (item, position) =>
                              position === index ? Math.round(Number(next) || 0) : item,
                          ),
                        })
                      }
                    />
                  ))}
                </Space>
              </div>
            </Space>
          </Panel>

          <Panel
            title="使用说明与关于我们"
            titleExtra={
              <span className="text-12 muted">
                富文本降级：纯文本原样展示在小程序「使用说明 / 关于我们」页
              </span>
            }
          >
            <div className="form-2col">
              <div>
                <div className="text-12 muted" style={{ marginBottom: 4 }}>FAQ / 使用说明</div>
                <Input.TextArea
                  rows={10}
                  maxLength={20000}
                  value={draft.faq}
                  placeholder="常见问题与购买指引，一行一条"
                  onChange={(event) => setDraft({ ...draft, faq: event.target.value })}
                />
              </div>
              <div>
                <div className="text-12 muted" style={{ marginBottom: 4 }}>关于我们</div>
                <Input.TextArea
                  rows={10}
                  maxLength={20000}
                  value={draft.about}
                  placeholder="团队介绍、联系方式等"
                  onChange={(event) => setDraft({ ...draft, about: event.target.value })}
                />
              </div>
            </div>
          </Panel>

          <Panel
            title="微信凭据"
            titleExtra={
              <span className="text-12 muted">
                AppSecret 加密保存，界面只回显是否已配置
              </span>
            }
            extra={
              <Space>
                <Button icon={<ReloadOutlined aria-hidden />} loading={testing} onClick={() => void testConnection()}>
                  连接自检
                </Button>
                <Button loading={testingPay} onClick={() => void testPay()}>
                  支付自检
                </Button>
              </Space>
            }
          >
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              <div className="form-2col">
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>小程序 AppID</div>
                  <Input
                    className="mono"
                    value={draft.wxAppId}
                    maxLength={64}
                    placeholder="wx 开头的小程序 AppID"
                    onChange={(event) => setDraft({ ...draft, wxAppId: event.target.value })}
                  />
                </div>
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>
                    AppSecret{settings?.wxAppSecretConfigured && !draft.wxAppSecret ? "（留空＝沿用已保存的）" : ""}
                  </div>
                  <Input.Password
                    maxLength={128}
                    value={draft.wxAppSecret}
                    placeholder={
                      settings?.wxAppSecretConfigured
                        ? "已配置，留空不修改"
                        : "微信公众平台「开发管理 → 开发设置」里的 AppSecret"
                    }
                    onChange={(event) => setDraft({ ...draft, wxAppSecret: event.target.value })}
                  />
                </div>
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>微信支付商户号（资金直达站点）</div>
                  <Input
                    className="mono"
                    value={draft.wxMchId}
                    maxLength={32}
                    placeholder="商户号，如 1900000001"
                    onChange={(event) => setDraft({ ...draft, wxMchId: event.target.value })}
                  />
                </div>
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>商户证书序列号</div>
                  <Input
                    className="mono"
                    value={draft.wxPaySerial}
                    maxLength={64}
                    placeholder="apiclient_cert.pem 对应的序列号"
                    onChange={(event) => setDraft({ ...draft, wxPaySerial: event.target.value })}
                  />
                </div>
              </div>
              <div className="text-12" style={{ color: settings?.wxPayReady ? "#0f9d58" : "var(--muted)" }}>
                微信支付：{settings?.wxPayReady ? "已就绪，小程序端展示微信支付入口" : "未就绪（补齐商户号、证书序列号、APIv3 密钥与私钥后生效）"}
              </div>
              <div>
                <div className="text-12 muted" style={{ marginBottom: 4 }}>
                  APIv3 密钥{settings?.wxPayApiV3KeyConfigured && !draft.wxPayApiV3Key ? "（留空＝沿用已保存的）" : ""}
                </div>
                <Input.Password
                  maxLength={128}
                  value={draft.wxPayApiV3Key}
                  placeholder={settings?.wxPayApiV3KeyConfigured ? "已配置，留空不修改" : "32 位 APIv3 密钥"}
                  onChange={(event) => setDraft({ ...draft, wxPayApiV3Key: event.target.value })}
                />
              </div>
              <div>
                <div className="text-12 muted" style={{ marginBottom: 4 }}>
                  商户私钥 apiclient_key.pem{settings?.wxPayPrivateKeyConfigured && !draft.wxPayPrivateKey ? "（留空＝沿用已保存的）" : ""}
                </div>
                <Input.TextArea
                  rows={3}
                  className="mono"
                  value={draft.wxPayPrivateKey}
                  placeholder={settings?.wxPayPrivateKeyConfigured ? "已配置，留空不修改" : "粘贴 -----BEGIN PRIVATE KEY----- 开头的私钥内容"}
                  onChange={(event) => setDraft({ ...draft, wxPayPrivateKey: event.target.value })}
                />
              </div>
              <div className="form-2col">
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>流量主广告位 ID（首页）</div>
                  <Input
                    className="mono"
                    value={draft.adUnitTab}
                    maxLength={64}
                    placeholder="adunit- 开头，可留空"
                    onChange={(event) => setDraft({ ...draft, adUnitTab: event.target.value })}
                  />
                </div>
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>流量主广告位 ID（详情页）</div>
                  <Input
                    className="mono"
                    value={draft.adUnitDetail}
                    maxLength={64}
                    placeholder="adunit- 开头，可留空"
                    onChange={(event) => setDraft({ ...draft, adUnitDetail: event.target.value })}
                  />
                </div>
              </div>
              <Notice variant="info">
                AppID/AppSecret 用于终端会员 wx.login 换 openId、「连接自检」与微信支付下单，这两项必须配。
                统一源码包由你在微信开发者工具里自编译、自上传，用的是你本机的密钥与出口 IP。
                提交审核与发布仍在微信公众平台完成。
              </Notice>
            </Space>
          </Panel>
        </>
      )}
    </Space>
  );
}
