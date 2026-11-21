"use client";

// 站点设置页签：品牌/开关/计价/新人礼/克隆参数/分销参数整份读写。
import { ReloadOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Checkbox,
  ColorPicker,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Space,
  Switch,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  DH_JOIN_TYPES,
  DH_JOIN_TYPE_LABELS,
  DH_TOGGLE_KEYS,
  DH_TOGGLE_LABELS,
  type DhSettingsInput,
  type DhSettingsView,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { Notice, Panel } from "@/components/ui/panel";
import { DiyEditor } from "./diy-editor";
import { ImageUploadField } from "./shared";

const THEME_PATTERN = /^#[0-9a-fA-F]{6}$/;

function toDraft(view: DhSettingsView): DhSettingsInput {
  return {
    siteName: view.siteName,
    slogan: view.slogan,
    logo: view.logo,
    themeColor: view.themeColor,
    servicePhone: view.servicePhone,
    brand: { ...view.brand },
    toggles: { ...view.toggles },
    pricing: { ...view.pricing },
    gift: { ...view.gift },
    login: { ...view.login },
    clone: { ...view.clone },
    commission: { ...view.commission },
    serviceDeskSiteKey: view.serviceDeskSiteKey,
    diyPage: view.diyPage,
    enabled: view.status === "ONLINE",
  };
}

export function SettingsTab() {
  const { message } = App.useApp();
  const [draft, setDraft] = useState<DhSettingsInput | null>(null);
  const [siteCode, setSiteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const view = await digitalHumanApi.settings();
      if (view) {
        setDraft(toDraft(view));
        setSiteCode(view.siteCode);
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "站点设置加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (next: Partial<DhSettingsInput>) =>
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));

  const save = async () => {
    if (!draft) return;
    if (!THEME_PATTERN.test(draft.themeColor)) {
      message.error("主题色需为 #RRGGBB");
      return;
    }
    setSaving(true);
    try {
      const view = await digitalHumanApi.saveSettings({ body: draft });
      if (view) setDraft(toDraft(view));
      message.success("站点设置已保存");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !draft) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (!draft) return null;

  const pricing = draft.pricing ?? {};
  const gift = draft.gift ?? {};
  const clone = draft.clone ?? {};
  const commission = draft.commission ?? {};
  const brand = draft.brand ?? {};
  const login = draft.login ?? {};

  return (
    <Space orientation="vertical" size={14} style={{ width: "100%" }}>
      <Notice variant="info">
        站点编码 <span className="mono">{siteCode}</span>
        ：出包时写进小程序，改名称/主题色后重新出包即可，不用改代码。
      </Notice>

      <Panel
        title="基础信息"
        extra={
          <Space>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              重新读取
            </Button>
            <Button size="small" type="primary" onClick={() => void save()} loading={saving}>
              保存设置
            </Button>
          </Space>
        }
      >
        <div className="form-grid">
          <label>
            站点名称
            <Input
              value={draft.siteName}
              maxLength={60}
              onChange={(event) => patch({ siteName: event.target.value })}
            />
          </label>
          <label>
            标语
            <Input
              value={draft.slogan}
              maxLength={120}
              onChange={(event) => patch({ slogan: event.target.value })}
            />
          </label>
          <label>
            客服电话
            <Input
              value={draft.servicePhone}
              maxLength={32}
              onChange={(event) => patch({ servicePhone: event.target.value })}
            />
          </label>
          <label>
            主题色
            <Space>
              <ColorPicker
                value={draft.themeColor}
                onChange={(color) => patch({ themeColor: color.toHexString() })}
              />
              <Input
                value={draft.themeColor}
                style={{ width: 120 }}
                onChange={(event) => patch({ themeColor: event.target.value })}
              />
            </Space>
          </label>
          <label>
            站点 Logo
            <ImageUploadField value={draft.logo} onChange={(logo) => patch({ logo })} />
          </label>
          <label>
            上线营业
            <Space>
              <Switch
                checked={draft.enabled}
                onChange={(enabled) => patch({ enabled })}
              />
              <span className="muted text-12">关闭后小程序端提示站点未营业</span>
            </Space>
          </label>
        </div>
      </Panel>

      <Panel title="分享与导航">
        <div className="form-grid">
          <label>
            分享标题
            <Input
              value={brand.shareTitle ?? ""}
              maxLength={120}
              onChange={(event) =>
                patch({ brand: { ...brand, shareTitle: event.target.value } })
              }
            />
          </label>
          <label>
            导航栏标题
            <Input
              value={brand.navigationTitle ?? ""}
              maxLength={60}
              onChange={(event) =>
                patch({ brand: { ...brand, navigationTitle: event.target.value } })
              }
            />
          </label>
          <label>
            分享图
            <ImageUploadField
              value={brand.shareImage ?? ""}
              onChange={(shareImage) => patch({ brand: { ...brand, shareImage } })}
            />
          </label>
        </div>
      </Panel>

      <Panel
        title="首页装修"
        titleExtra={
          <span className="muted text-12">
            小程序首页按顺序渲染，功能入口宫格始终保留在下方
          </span>
        }
      >
        <DiyEditor
          value={draft.diyPage}
          onChange={(diyPage) => patch({ diyPage })}
        />
        <div style={{ marginTop: 14 }}>
          <Button type="primary" onClick={() => void save()} loading={saving}>
            保存设置
          </Button>
        </div>
      </Panel>

      <Panel title="模块开关" titleExtra={<span className="muted text-12">关掉的模块小程序端整块不渲染</span>}>
        <Checkbox.Group
          value={DH_TOGGLE_KEYS.filter((key) => draft.toggles?.[key] !== false)}
          onChange={(checked) => {
            const on = new Set(checked.map(String));
            patch({
              toggles: Object.fromEntries(
                DH_TOGGLE_KEYS.map((key) => [key, on.has(key)]),
              ),
            });
          }}
        >
          <Space size={[16, 8]} wrap>
            {DH_TOGGLE_KEYS.map((key) => (
              <Checkbox key={key} value={key}>
                {DH_TOGGLE_LABELS[key]}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </Panel>

      <Panel title="计价与新人礼" titleExtra={<span className="muted text-12">单位：点数；合成失败自动退回</span>}>
        <div className="form-grid">
          <label>
            算力显示名
            <Input
              value={pricing.pointTitle ?? ""}
              maxLength={20}
              onChange={(event) =>
                patch({ pricing: { ...pricing, pointTitle: event.target.value } })
              }
            />
          </label>
          <label>
            视频合成消耗
            <InputNumber
              min={0}
              max={9999}
              value={pricing.priceVideo}
              onChange={(value) =>
                patch({ pricing: { ...pricing, priceVideo: Number(value ?? 0) } })
              }
            />
          </label>
          <label>
            纯语音合成消耗
            <InputNumber
              min={0}
              max={9999}
              value={pricing.priceTts}
              onChange={(value) =>
                patch({ pricing: { ...pricing, priceTts: Number(value ?? 0) } })
              }
            />
          </label>
          <label>
            形象克隆消耗（形象点）
            <InputNumber
              min={0}
              max={9999}
              value={pricing.priceBody}
              onChange={(value) =>
                patch({ pricing: { ...pricing, priceBody: Number(value ?? 0) } })
              }
            />
          </label>
          <label>
            声音克隆消耗（声音点）
            <InputNumber
              min={0}
              max={9999}
              value={pricing.priceVoice}
              onChange={(value) =>
                patch({ pricing: { ...pricing, priceVoice: Number(value ?? 0) } })
              }
            />
          </label>
          <label>
            新人礼会员天数
            <InputNumber
              min={0}
              max={3650}
              value={gift.vipDays}
              onChange={(value) =>
                patch({ gift: { ...gift, vipDays: Number(value ?? 0) } })
              }
            />
          </label>
          <label>
            新人礼算力
            <InputNumber
              min={0}
              max={99999}
              value={gift.point}
              onChange={(value) =>
                patch({ gift: { ...gift, point: Number(value ?? 0) } })
              }
            />
          </label>
          <label>
            新人礼形象点
            <InputNumber
              min={0}
              max={9999}
              value={gift.body}
              onChange={(value) =>
                patch({ gift: { ...gift, body: Number(value ?? 0) } })
              }
            />
          </label>
          <label>
            新人礼声音点
            <InputNumber
              min={0}
              max={9999}
              value={gift.voice}
              onChange={(value) =>
                patch({ gift: { ...gift, voice: Number(value ?? 0) } })
              }
            />
          </label>
          <label>
            合成需会员
            <Space>
              <Switch
                checked={login.mustVip ?? false}
                onChange={(mustVip) => patch({ login: { mustVip } })}
              />
              <span className="muted text-12">开启后非会员只能浏览</span>
            </Space>
          </label>
        </div>
      </Panel>

      <Panel title="克隆与文案参数">
        <div className="form-grid">
          <label>
            形象视频最短（秒）
            <InputNumber
              min={1}
              max={120}
              value={clone.bodyMinSec}
              onChange={(value) =>
                patch({ clone: { ...clone, bodyMinSec: Number(value ?? 1) } })
              }
            />
          </label>
          <label>
            形象视频最长（秒）
            <InputNumber
              min={1}
              max={180}
              value={clone.bodyMaxSec}
              onChange={(value) =>
                patch({ clone: { ...clone, bodyMaxSec: Number(value ?? 1) } })
              }
            />
          </label>
          <label>
            声音样本最短（秒）
            <InputNumber
              min={1}
              max={120}
              value={clone.voiceMinSec}
              onChange={(value) =>
                patch({ clone: { ...clone, voiceMinSec: Number(value ?? 1) } })
              }
            />
          </label>
          <label>
            声音样本最长（秒）
            <InputNumber
              min={1}
              max={180}
              value={clone.voiceMaxSec}
              onChange={(value) =>
                patch({ clone: { ...clone, voiceMaxSec: Number(value ?? 1) } })
              }
            />
          </label>
          <label>
            文案字数上限
            <InputNumber
              min={10}
              max={5000}
              value={clone.scriptMaxLen}
              onChange={(value) =>
                patch({ clone: { ...clone, scriptMaxLen: Number(value ?? 10) } })
              }
            />
          </label>
        </div>
      </Panel>

      <Panel title="两级分销" titleExtra={<span className="muted text-12">关闭后小程序端隐藏分销中心</span>}>
        <div className="form-grid">
          <label>
            开启分销
            <Switch
              checked={commission.enabled ?? false}
              onChange={(enabled) =>
                patch({ commission: { ...commission, enabled } })
              }
            />
          </label>
          <label>
            一级比例（%）
            <InputNumber
              min={0}
              max={100}
              value={commission.level1Rate}
              onChange={(value) =>
                patch({
                  commission: { ...commission, level1Rate: Number(value ?? 0) },
                })
              }
            />
          </label>
          <label>
            二级比例（%）
            <InputNumber
              min={0}
              max={100}
              value={commission.level2Rate}
              onChange={(value) =>
                patch({
                  commission: { ...commission, level2Rate: Number(value ?? 0) },
                })
              }
            />
          </label>
          <label>
            开通方式
            <Select
              value={commission.joinType ?? "auto"}
              options={DH_JOIN_TYPES.map((value) => ({
                value,
                label: DH_JOIN_TYPE_LABELS[value],
              }))}
              onChange={(joinType) =>
                patch({ commission: { ...commission, joinType } })
              }
            />
          </label>
          <label>
            付费开通套餐 ID
            <InputNumber
              min={0}
              value={commission.payPackageId}
              onChange={(value) =>
                patch({
                  commission: { ...commission, payPackageId: Number(value ?? 0) },
                })
              }
            />
          </label>
          <label>
            提现门槛（分）
            <InputNumber
              min={0}
              max={100000000}
              value={commission.minWithdrawCents}
              onChange={(value) =>
                patch({
                  commission: {
                    ...commission,
                    minWithdrawCents: Number(value ?? 0),
                  },
                })
              }
            />
          </label>
        </div>
        <div style={{ marginTop: 14 }}>
          <Button type="primary" onClick={() => void save()} loading={saving}>
            保存设置
          </Button>
        </div>
      </Panel>

      <Panel title="在线客服">
        <label>
          service-desk 站点 Key
          <Input
            value={draft.serviceDeskSiteKey}
            maxLength={64}
            placeholder="留空表示不接在线客服"
            onChange={(event) => patch({ serviceDeskSiteKey: event.target.value })}
          />
        </label>
      </Panel>
    </Space>
  );
}
