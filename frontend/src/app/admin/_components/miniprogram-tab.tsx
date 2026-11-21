"use client";

import {
  CloudDownloadOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Image,
  Input,
  Skeleton,
  Space,
  Switch,
  Table,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  MINIPROGRAM_FEATURE_LABELS,
  MINIPROGRAM_FEATURES,
  type MiniprogramBuiltin,
  type MiniprogramSettingsView,
} from "@enterprise/contracts";
import {
  builtinDownloadUrl,
  miniProgramAdminApi,
  uploadMiniProgramQrcode,
} from "@/api/miniprogram";
import {
  EmptyState,
  Notice,
  Panel,
  PanelTabs,
  StatCard,
  StatGrid,
} from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { MiniGuideTab } from "./mini-guide-tab";
import { formatBytes as formatSize } from "@/lib/format";

type Tab = "settings" | "builtin" | "guide";

type SettingsDraft = {
  enabled: boolean;
  appName: string;
  appId: string;
  appSecret: string;
  siteDomain: string;
  themeColor: string;
  features: Record<string, boolean>;
};

export function MiniProgramTab() {
  const { message } = App.useApp();
  const [tab, setTab] = useState<Tab>("settings");

  const [settings, setSettings] = useState<MiniprogramSettingsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [qrcodeBusy, setQrcodeBusy] = useState(false);
  const [secretsTouched, setSecretsTouched] = useState(false);

  const [builtin, setBuiltin] = useState<MiniprogramBuiltin[]>([]);
  const [builtinLoading, setBuiltinLoading] = useState(false);

  const applySettings = useCallback((view: MiniprogramSettingsView) => {
    setSettings(view);
    setDraft({
      enabled: view.enabled,
      appName: view.appName,
      appId: view.appId,
      appSecret: "",
      siteDomain: view.siteDomain,
      themeColor: view.themeColor,
      features: Object.fromEntries(
        view.features.map((item) => [item.key, item.enabled]),
      ),
    });
    setSecretsTouched(false);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const view = await miniProgramAdminApi.settings();
      if (view) applySettings(view);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "配置加载失败");
    } finally {
      setLoading(false);
    }
  }, [applySettings, message]);

  const loadBuiltin = useCallback(async () => {
    setBuiltinLoading(true);
    try {
      const data = await miniProgramAdminApi.builtin();
      setBuiltin(data?.items ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "内置包加载失败");
    } finally {
      setBuiltinLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (tab === "builtin") void loadBuiltin();
  }, [tab, loadBuiltin]);

  const saveSettings = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const view = await miniProgramAdminApi.saveSettings({
        body: {
          enabled: draft.enabled,
          appName: draft.appName.trim(),
          appId: draft.appId.trim(),
          ...(draft.appSecret.trim() ? { appSecret: draft.appSecret.trim() } : {}),
          siteDomain: draft.siteDomain.trim(),
          themeColor: draft.themeColor.trim(),
          features: MINIPROGRAM_FEATURES.map((key) => ({
            key,
            enabled: draft.features[key] !== false,
          })),
        },
      });
      if (view) applySettings(view);
      message.success("配置已保存");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const result = await miniProgramAdminApi.test({ body: {} });
      if (result?.ok) {
        message.success(result.message || "连接成功");
      } else {
        message.error(result?.message || "连接失败");
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "连接失败");
    } finally {
      setTesting(false);
    }
  };

  const generateQrcode = async () => {
    setQrcodeBusy(true);
    try {
      await miniProgramAdminApi.qrcode({ body: { mode: "GENERATE" } });
      message.success("小程序码已生成");
      await loadSettings();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "生成失败");
    } finally {
      setQrcodeBusy(false);
    }
  };

  const uploadQrcode = async (file: File) => {
    setQrcodeBusy(true);
    try {
      const meta = await uploadMiniProgramQrcode(file);
      await miniProgramAdminApi.qrcode({
        body: { mode: "UPLOAD", fileName: meta.fileName, ossKey: meta.ossKey },
      });
      message.success("小程序码已上传");
      await loadSettings();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "上传失败");
    } finally {
      setQrcodeBusy(false);
    }
  };

  const builtinColumns: ColumnsType<MiniprogramBuiltin> = [
    {
      title: "文件",
      dataIndex: "fileName",
      render: (value: string) => <span className="mono">{value}</span>,
    },
    {
      title: "版本",
      dataIndex: "version",
      render: (value: string) => <span className="mono">{value || "—"}</span>,
    },
    {
      title: "大小",
      dataIndex: "fileSize",
      width: 120,
      render: (value: number) => formatSize(value),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 170,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 140,
      render: (_value, row) => (
        <Button
          type="link"
          size="small"
          icon={<CloudDownloadOutlined aria-hidden />}
          href={builtinDownloadUrl(row.fileName)}
          target="_blank"
        >
          下载源码包
        </Button>
      ),
    },
  ];

  const enabledFeatures = draft
    ? MINIPROGRAM_FEATURES.filter((key) => draft.features[key] !== false).length
    : 0;

  return (
    <>
      <StatGrid>
        <StatCard
          label="已绑定用户"
          value={settings?.boundCount ?? 0}
          hint="已在小程序内绑定本系统账号的用户"
        />
        <StatCard
          label="开放模块"
          value={`${enabledFeatures}/${MINIPROGRAM_FEATURES.length}`}
          hint="小程序端当前渲染的业务模块"
        />
        <StatCard
          label="小程序码"
          value={settings?.qrcodeUrl ? "已配置" : "未配置"}
          hint="用户扫码进入小程序"
        />
      </StatGrid>

      <Panel title="用户版小程序">
        {loading || !draft ? <Skeleton active paragraph={{ rows: 6 }} /> : null}
        {!loading && draft ? (
          <PanelTabs
            value={tab}
            onChange={(key) => setTab(key as Tab)}
            items={[
              {
                key: "settings",
                label: "基础配置",
                children: (
                  <Panel
                    title="小程序配置"
                    titleExtra={
                      <span className="text-12 muted">
                        小程序启动时读取这里的开关与配置，业务数据仍走本系统账号体系
                      </span>
                    }
                    extra={
                      <Space wrap>
                        <Button icon={<ReloadOutlined aria-hidden />} onClick={() => void testConnection()} loading={testing}>
                          连接自检
                        </Button>
                        <Button type="primary" onClick={() => void saveSettings()} loading={saving}>
                          保存配置
                        </Button>
                      </Space>
                    }
                  >
                    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                      <Space>
                        <Switch
                          checked={draft.enabled}
                          onChange={(value) => setDraft({ ...draft, enabled: value })}
                        />
                        <span>启用小程序（关闭后 AppSecret 不参与登录，小程序端提示未启用）</span>
                      </Space>
                      <div className="form-2col">
                        <div>
                          <div className="text-12 muted" style={{ marginBottom: 4 }}>小程序名称</div>
                          <Input
                            value={draft.appName}
                            maxLength={60}
                            placeholder="AIworkin"
                            onChange={(event) => setDraft({ ...draft, appName: event.target.value })}
                          />
                        </div>
                        <div>
                          <div className="text-12 muted" style={{ marginBottom: 4 }}>AppID</div>
                          <Input
                            className="mono"
                            value={draft.appId}
                            maxLength={64}
                            placeholder="wx 开头的小程序 AppID"
                            onChange={(event) => setDraft({ ...draft, appId: event.target.value })}
                          />
                        </div>
                        <div>
                          <div className="text-12 muted" style={{ marginBottom: 4 }}>
                            AppSecret{draft.appId && settings?.appSecretConfigured && !secretsTouched ? "（留空＝沿用已保存的）" : ""}
                          </div>
                          <Input.Password
                            value={draft.appSecret}
                            maxLength={128}
                            placeholder={settings?.appSecretConfigured ? "已配置，留空不修改" : "小程序后台「开发管理」中的 AppSecret"}
                            onChange={(event) => {
                              setSecretsTouched(true);
                              setDraft({ ...draft, appSecret: event.target.value });
                            }}
                          />
                        </div>
                        <div>
                          <div className="text-12 muted" style={{ marginBottom: 4 }}>站点域名（可编辑）</div>
                          <Input
                            className="mono"
                            value={draft.siteDomain}
                            maxLength={200}
                            placeholder="https://demo.example.com"
                            onChange={(event) => setDraft({ ...draft, siteDomain: event.target.value })}
                          />
                        </div>
                        <div>
                          <div className="text-12 muted" style={{ marginBottom: 4 }}>主题色</div>
                          <Input
                            className="mono"
                            value={draft.themeColor}
                            maxLength={7}
                            placeholder="#3370ff"
                            onChange={(event) => setDraft({ ...draft, themeColor: event.target.value })}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="text-12 muted" style={{ marginBottom: 8 }}>小程序端开放的业务模块</div>
                        <Space wrap size={[24, 8]}>
                          {MINIPROGRAM_FEATURES.map((key) => (
                            <Space key={key}>
                              <Switch
                                size="small"
                                checked={draft.features[key] !== false}
                                onChange={(value) =>
                                  setDraft({
                                    ...draft,
                                    features: { ...draft.features, [key]: value },
                                  })
                                }
                              />
                              <span>{MINIPROGRAM_FEATURE_LABELS[key]}</span>
                            </Space>
                          ))}
                        </Space>
                      </div>

                      <Notice variant="info">
                        小程序端业务数据（我的任务 / OA 审批 / 客服会话 / 系统消息 / 工商年报）复用本系统既有接口；
                        关闭的模块在小程序端整块不渲染。工商年报与网页端「财税服务 → 财税工具 → 填报记录」共用同一台账。
                        AppSecret 加密保存，只用于登录换 openId 与生成小程序码。
                        平台不再代传微信：在「内置包」页签下载源码包，用微信开发者工具填参数、编译、上传与提审。
                      </Notice>

                      <div>
                        <div className="text-12 muted" style={{ marginBottom: 8 }}>
                          小程序码（用户扫码进入小程序，可自动生成或上传微信后台下载的图片）
                        </div>
                        <Space align="start" wrap size={12}>
                          {settings?.qrcodeUrl ? (
                            <Image
                              src={settings.qrcodeUrl}
                              alt="小程序码"
                              width={120}
                              height={120}
                              style={{ borderRadius: 8, border: "1px solid var(--border)" }}
                            />
                          ) : (
                            <div style={{ width: 120, height: 120, borderRadius: 8, border: "1px dashed var(--border)" }} />
                          )}
                          <Space orientation="vertical" size={8}>
                            <Button
                              icon={<QrcodeOutlined aria-hidden />}
                              loading={qrcodeBusy}
                              onClick={() => void generateQrcode()}
                            >
                              用配置凭据生成
                            </Button>
                            <Upload
                              showUploadList={false}
                              disabled={qrcodeBusy}
                              beforeUpload={(file) => {
                                void uploadQrcode(file as File);
                                return false;
                              }}
                            >
                              <Button icon={<UploadOutlined aria-hidden />} loading={qrcodeBusy}>
                                上传图片
                              </Button>
                            </Upload>
                          </Space>
                        </Space>
                      </div>
                    </Space>
                  </Panel>
                ),
              },
              {
                key: "builtin",
                label: "内置包",
                children: (
                  <Panel
                    title="平台内置包"
                    titleExtra={
                      <span className="text-12 muted">
                        由服务器 update/miniprogram 目录提供，仓库执行 pnpm pack:miniprogram 生成
                      </span>
                    }
                    extra={
                      <Button icon={<ReloadOutlined aria-hidden />} onClick={() => void loadBuiltin()} loading={builtinLoading}>
                        刷新
                      </Button>
                    }
                  >
                    <Notice variant="info">
                      内置包随本系统代码版本携带。下载 zip 后导入微信开发者工具，在 config.js 填写 apiBase，
                      在 project.config.json 换成你自己的小程序 AppID，本地编译预览无误后自行上传、提审与发布。
                      平台不代编译、不代传微信。
                    </Notice>
                    {builtinLoading ? <Skeleton active paragraph={{ rows: 3 }} /> : null}
                    {!builtinLoading && !builtin.length ? (
                      <EmptyState text="服务器还没有内置包；在仓库根目录执行 pnpm pack:miniprogram 生成后放入 update/miniprogram。" />
                    ) : null}
                    {!builtinLoading && builtin.length ? (
                      <Table
                        style={{ marginTop: 12 }}
                        size="small"
                        rowKey="fileName"
                        pagination={false}
                        dataSource={builtin}
                        columns={builtinColumns}
                        scroll={{ x: 860 }}
                      />
                    ) : null}
                  </Panel>
                ),
              },
              {
                key: "guide",
                label: "小程序开发与发布",
                children: <MiniGuideTab />,
              },
            ]}
          />
        ) : null}
      </Panel>
    </>
  );
}
