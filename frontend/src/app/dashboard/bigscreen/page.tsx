"use client";

import { FundProjectionScreenOutlined, SaveOutlined } from "@ant-design/icons";
import { dashboardBigscreenSchema } from "@enterprise/contracts";
import { App, Button, Checkbox, Input, Space, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";
import { uiPreferencesApi } from "@/api/ui-preferences";
import { PageHero, Panel } from "@/components/ui/panel";
import {
  BIGSCREEN_GROUPS,
  BIGSCREEN_WIDGETS,
  DEFAULT_BIGSCREEN_CONFIG,
  bigscreenWidgetAvailable,
} from "@/config/bigscreen-widgets";
import { dashboardScope } from "@/lib/dashboard-scope";
import { useSession } from "@/lib/session";
import "./bigscreen.css";

const PREFERENCE_KEY = "dashboard.bigscreen";

/** 经营看板设置：勾选要在大屏上展示的核心指标、业务类型图表与增长/风险面板。 */
export default function BigscreenSettingsPage() {
  const { message } = App.useApp();
  const { me } = useSession();
  const scope = useMemo(() => dashboardScope(me), [me]);
  const identity = me?.currentIdentity || "ENTERPRISE_USER";

  const [config, setConfig] = useState(DEFAULT_BIGSCREEN_CONFIG);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(DEFAULT_BIGSCREEN_CONFIG));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const row = await uiPreferencesApi.get({ params: { key: PREFERENCE_KEY } });
        const parsed = dashboardBigscreenSchema.safeParse(row?.value);
        if (alive && parsed.success) {
          const next = { ...DEFAULT_BIGSCREEN_CONFIG, ...parsed.data };
          setConfig(next);
          setSavedSnapshot(JSON.stringify(next));
        }
      } catch {
        // 读取失败按「没设置过」处理，功能照常可用
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me?.userId]);

  const availableWidgets = useMemo(
    () =>
      BIGSCREEN_WIDGETS.filter((widget) =>
        bigscreenWidgetAvailable(widget, identity, scope.domains),
      ),
    [identity, scope.domains],
  );
  const selected = useMemo(() => new Set(config.widgets), [config.widgets]);
  const dirty = JSON.stringify(config) !== savedSnapshot;

  const toggle = (key: string, checked: boolean) => {
    setConfig((prev) => ({
      ...prev,
      widgets: checked
        ? Array.from(new Set([...prev.widgets, key]))
        : prev.widgets.filter((item) => item !== key),
    }));
  };

  const setGroup = (keys: string[], checked: boolean) => {
    setConfig((prev) => ({
      ...prev,
      widgets: checked
        ? Array.from(new Set([...prev.widgets, ...keys]))
        : prev.widgets.filter((item) => !keys.includes(item)),
    }));
  };

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const value = {
        ...config,
        title: config.title.trim(),
        subtitle: config.subtitle.trim(),
      };
      await uiPreferencesApi.save({ params: { key: PREFERENCE_KEY }, body: { value } });
      setConfig(value);
      setSavedSnapshot(JSON.stringify(value));
      message.success("经营看板设置已保存");
      return true;
    } catch (error) {
      message.error((error as Error).message || "保存失败，请重试");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openScreen = async () => {
    if (dirty) {
      const ok = await save();
      if (!ok) message.warning("大屏将展示上次保存的配置");
    }
    window.open("/dashboard/bigscreen/view", "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <PageHero
        title="经营看板设置"
        desc="勾选数据大屏要展示的核心指标与各类业务图表；设置按账号保存，跨设备生效。查看时以深色全屏页打开，数据每 60 秒自动刷新，适合放在公司前台大屏循环播放。"
        extra={
          <Space>
            <Button icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
              保存设置
            </Button>
            <Button
              type="primary"
              icon={<FundProjectionScreenOutlined />}
              onClick={() => void openScreen()}
            >
              查看数据大屏
            </Button>
          </Space>
        }
      />

      {loading ? (
        <Panel title="经营看板内容">
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <Spin />
          </div>
        </Panel>
      ) : (
        <>
          <Panel
            title="大屏标题"
            titleExtra={<span className="muted text-12">留空则使用默认标题「企业经营数据大屏」</span>}
          >
            <div className="bs-form">
              <label className="bs-form-row">
                <span className="bs-form-label">标题</span>
                <Input
                  maxLength={40}
                  showCount
                  value={config.title}
                  placeholder="企业经营数据大屏"
                  onChange={(event) =>
                    setConfig((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </label>
              <label className="bs-form-row">
                <span className="bs-form-label">副标题</span>
                <Input
                  maxLength={80}
                  showCount
                  value={config.subtitle}
                  placeholder="实时经营概览 · 数据每 60 秒自动刷新"
                  onChange={(event) =>
                    setConfig((prev) => ({ ...prev, subtitle: event.target.value }))
                  }
                />
              </label>
            </div>
          </Panel>

          {BIGSCREEN_GROUPS.map((group) => {
            const items = availableWidgets.filter((widget) => widget.group === group.key);
            if (!items.length) return null;
            const keys = items.map((item) => item.key);
            const selectedCount = keys.filter((key) => selected.has(key)).length;
            const allSelected = selectedCount === keys.length;
            return (
              <Panel
                key={group.key}
                title={group.label}
                titleExtra={
                  <span className="muted text-12">
                    {group.hint}
                    {` · 已选 ${selectedCount}/${keys.length}`}
                  </span>
                }
                extra={
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setGroup(keys, !allSelected)}
                  >
                    {allSelected ? "清空" : "全选"}
                  </Button>
                }
              >
                <div className="bs-config-grid">
                  {items.map((item) => (
                    <Checkbox
                      key={item.key}
                      className="bs-config-item"
                      checked={selected.has(item.key)}
                      onChange={(event) => toggle(item.key, event.target.checked)}
                    >
                      <span className="bs-config-text">
                        <b>{item.label}</b>
                        <span>{item.hint}</span>
                      </span>
                    </Checkbox>
                  ))}
                </div>
              </Panel>
            );
          })}

          <p className="muted text-12" style={{ marginTop: 4 }}>
            只列出当前身份可用的内容：未开通的业务类目、非企业身份的增长数据不会出现在这里。
          </p>
        </>
      )}
    </>
  );
}
