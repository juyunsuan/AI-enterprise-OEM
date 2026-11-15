"use client";

import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  MINIPROGRAM_FEATURE_LABELS,
  MINIPROGRAM_FEATURES,
  MINIPROGRAM_RELEASE_CHANNELS,
  MINIPROGRAM_RELEASE_CHANNEL_LABELS,
  type MiniprogramBuiltin,
  type MiniprogramReleaseChannel,
  type MiniprogramReleaseRow,
  type MiniprogramSettingsView,
} from "@enterprise/contracts";
import {
  builtinDownloadUrl,
  miniProgramAdminApi,
  uploadMiniProgramQrcode,
  uploadMiniProgramRelease,
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

type Tab = "settings" | "releases" | "builtin";

type SettingsDraft = {
  enabled: boolean;
  appName: string;
  appId: string;
  appSecret: string;
  uploadKey: string;
  robot: number;
  siteDomain: string;
  themeColor: string;
  features: Record<string, boolean>;
};

type ReleaseDraft = {
  id: number;
  version: string;
  channel: MiniprogramReleaseChannel;
  changelog: string;
  minBaseLib: string;
  enabled: boolean;
  fileName: string;
  fileSize: number;
};

const EMPTY_RELEASE: ReleaseDraft = {
  id: 0,
  version: "",
  channel: "STABLE",
  changelog: "",
  minBaseLib: "",
  enabled: true,
  fileName: "",
  fileSize: 0,
};

function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function channelTag(channel: string) {
  return channel === "BETA" ? (
    <Tag color="orange">预览</Tag>
  ) : (
    <Tag color="green">稳定</Tag>
  );
}

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
  const [uploadKeyTouched, setUploadKeyTouched] = useState(false);
  /** 正在直传微信的行键（`release-<id>` / `builtin-<文件名>`），空串=空闲。 */
  const [codeUploading, setCodeUploading] = useState("");

  const [releases, setReleases] = useState<MiniprogramReleaseRow[]>([]);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseModal, setReleaseModal] = useState(false);
  const [releaseDraft, setReleaseDraft] = useState<ReleaseDraft>(EMPTY_RELEASE);
  const [releaseFile, setReleaseFile] = useState<{
    fileName: string;
    fileSize: number;
    ossKey: string;
    sha256: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [releaseSaving, setReleaseSaving] = useState(false);

  const [builtin, setBuiltin] = useState<MiniprogramBuiltin[]>([]);
  const [builtinLoading, setBuiltinLoading] = useState(false);

  const applySettings = useCallback((view: MiniprogramSettingsView) => {
    setSettings(view);
    setDraft({
      enabled: view.enabled,
      appName: view.appName,
      appId: view.appId,
      appSecret: "",
      uploadKey: "",
      robot: view.robot,
      siteDomain: view.siteDomain,
      themeColor: view.themeColor,
      features: Object.fromEntries(
        view.features.map((item) => [item.key, item.enabled]),
      ),
    });
    setSecretsTouched(false);
    setUploadKeyTouched(false);
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

  const loadReleases = useCallback(async () => {
    setReleaseLoading(true);
    try {
      const data = await miniProgramAdminApi.releases({
        query: { page: "1", pageSize: "100", channel: "all", keyword: "" },
      });
      setReleases(data?.list ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "代码包加载失败");
    } finally {
      setReleaseLoading(false);
    }
  }, [message]);

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
    if (tab === "releases") void loadReleases();
    if (tab === "builtin") void loadBuiltin();
  }, [tab, loadReleases, loadBuiltin]);

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
          ...(draft.uploadKey.trim() ? { uploadKey: draft.uploadKey.trim() } : {}),
          robot: draft.robot,
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

  const uploadCodeToWechat = async (
    key: string,
    body: { source: "RELEASE" | "BUILTIN"; releaseId?: number; fileName?: string },
  ) => {
    setCodeUploading(key);
    try {
      const result = await miniProgramAdminApi.uploadCode(
        { body },
        { timeoutMs: 300000 },
      );
      message.success(
        result?.message ||
          `已上传为微信开发版${result?.version ? `（${result.version}）` : ""}`,
      );
      await loadSettings();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "上传到微信失败");
    } finally {
      setCodeUploading("");
    }
  };

  const doUploadRelease = async (file: File) => {
    setUploading(true);
    try {
      const meta = await uploadMiniProgramRelease(file);
      setReleaseFile(meta);
      setReleaseDraft((prev) => ({
        ...prev,
        fileName: meta.fileName,
        fileSize: meta.fileSize,
      }));
      message.success("文件已上传到对象存储，保存后入库");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const saveRelease = async () => {
    if (!releaseDraft.version.trim()) {
      message.warning("请填写版本号");
      return;
    }
    if (!releaseDraft.id && !releaseFile) {
      message.warning("请先上传代码包文件");
      return;
    }
    setReleaseSaving(true);
    try {
      if (releaseDraft.id) {
        await miniProgramAdminApi.updateRelease({
          params: { id: String(releaseDraft.id) },
          body: {
            version: releaseDraft.version.trim(),
            channel: releaseDraft.channel,
            changelog: releaseDraft.changelog.trim(),
            minBaseLib: releaseDraft.minBaseLib.trim(),
            enabled: releaseDraft.enabled,
            ...(releaseFile
              ? {
                  fileName: releaseFile.fileName,
                  fileSize: releaseFile.fileSize,
                  ossKey: releaseFile.ossKey,
                  sha256: releaseFile.sha256,
                }
              : {}),
          },
        });
      } else {
        if (!releaseFile) return;
        await miniProgramAdminApi.saveRelease({
          body: {
            version: releaseDraft.version.trim(),
            channel: releaseDraft.channel,
            changelog: releaseDraft.changelog.trim(),
            minBaseLib: releaseDraft.minBaseLib.trim(),
            enabled: releaseDraft.enabled,
            fileName: releaseFile.fileName,
            fileSize: releaseFile.fileSize,
            ossKey: releaseFile.ossKey,
            sha256: releaseFile.sha256,
          },
        });
      }
      message.success("代码包已保存");
      setReleaseModal(false);
      await Promise.all([loadReleases(), loadSettings()]);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setReleaseSaving(false);
    }
  };

  const toggleRelease = async (row: MiniprogramReleaseRow, enabled: boolean) => {
    try {
      await miniProgramAdminApi.updateRelease({
        params: { id: String(row.id) },
        body: { enabled },
      });
      setReleases((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, enabled } : item)),
      );
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const downloadRelease = async (row: MiniprogramReleaseRow) => {
    try {
      const data = await miniProgramAdminApi.downloadRelease({
        params: { id: String(row.id) },
      });
      if (data?.url) window.open(data.url, "_blank");
      await loadReleases();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "下载失败");
    }
  };

  const removeRelease = async (row: MiniprogramReleaseRow) => {
    try {
      await miniProgramAdminApi.removeRelease({ params: { id: String(row.id) } });
      message.success("代码包已删除");
      await Promise.all([loadReleases(), loadSettings()]);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const releaseColumns: ColumnsType<MiniprogramReleaseRow> = [
    {
      title: "版本",
      dataIndex: "version",
      render: (value: string) => <span className="mono">{value}</span>,
    },
    {
      title: "通道",
      dataIndex: "channel",
      render: (value: string) => channelTag(value),
    },
    {
      title: "文件",
      dataIndex: "fileName",
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <span className="mono">{value}</span>
          <span className="text-12 muted">
            {formatSize(row.fileSize)}
            {row.sha256 ? ` · SHA-256 ${row.sha256.slice(0, 12)}…` : ""}
          </span>
        </Space>
      ),
    },
    {
      title: "下载次数",
      dataIndex: "downloadCount",
      width: 90,
    },
    {
      title: "上架",
      dataIndex: "enabled",
      width: 80,
      render: (value: boolean, row) => (
        <Switch
          size="small"
          checked={value}
          onChange={(next) => void toggleRelease(row, next)}
        />
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 250,
      render: (_value, row) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<CloudUploadOutlined aria-hidden />}
            loading={codeUploading === `release-${row.id}`}
            disabled={Boolean(codeUploading) && codeUploading !== `release-${row.id}`}
            onClick={() =>
              void uploadCodeToWechat(`release-${row.id}`, {
                source: "RELEASE",
                releaseId: row.id,
              })
            }
          >
            上传到微信
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CloudDownloadOutlined aria-hidden />}
            onClick={() => void downloadRelease(row)}
          >
            下载
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined aria-hidden />}
            onClick={() => {
              setReleaseDraft({
                id: row.id,
                version: row.version,
                channel: row.channel,
                changelog: row.changelog,
                minBaseLib: row.minBaseLib,
                enabled: row.enabled,
                fileName: row.fileName,
                fileSize: row.fileSize,
              });
              setReleaseFile(null);
              setReleaseModal(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="删除这个代码包？"
            onConfirm={() => void removeRelease(row)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined aria-hidden />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const builtinColumns: ColumnsType<MiniprogramBuiltin> = [
    {
      title: "文件",
      dataIndex: "fileName",
      render: (value: string) => <span className="mono">{value}</span>,
    },
    {
      title: "版本文本",
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
      width: 220,
      render: (_value, row) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<CloudUploadOutlined aria-hidden />}
            loading={codeUploading === `builtin-${row.fileName}`}
            disabled={
              Boolean(codeUploading) && codeUploading !== `builtin-${row.fileName}`
            }
            onClick={() =>
              void uploadCodeToWechat(`builtin-${row.fileName}`, {
                source: "BUILTIN",
                fileName: row.fileName,
              })
            }
          >
            上传到微信
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CloudDownloadOutlined aria-hidden />}
            href={builtinDownloadUrl(row.fileName)}
            target="_blank"
          >
            下载
          </Button>
        </Space>
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
          label="代码包版本"
          value={settings?.releaseCount ?? 0}
          hint="台账内上传过的版本数（含已下架）"
        />
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
          label="最近直传微信"
          value={settings?.lastUploadVersion || "—"}
          hint={
            settings?.lastUploadAt
              ? fmtTime(settings.lastUploadAt)
              : "尚未从后台直传过代码"
          }
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
                        <div>
                          <div className="text-12 muted" style={{ marginBottom: 4 }}>机器人编号</div>
                          <InputNumber
                            min={1}
                            max={30}
                            value={draft.robot}
                            onChange={(value) => setDraft({ ...draft, robot: Number(value) || 1 })}
                          />
                          <div className="text-12 muted" style={{ marginTop: 4 }}>
                            微信侧 1–30，用于区分上传来源
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-12 muted" style={{ marginBottom: 4 }}>
                          代码上传密钥
                          {settings?.uploadKeyConfigured && !uploadKeyTouched ? "（留空＝沿用已保存的）" : ""}
                        </div>
                        <Input.TextArea
                          className="mono"
                          rows={3}
                          maxLength={4096}
                          value={draft.uploadKey}
                          placeholder={
                            settings?.uploadKeyConfigured
                              ? "已配置，留空不修改"
                              : "粘贴微信公众平台「开发管理 → 开发设置 → 小程序代码上传」下载的密钥文件内容（private.<appid>.key）"
                          }
                          onChange={(event) => {
                            setUploadKeyTouched(true);
                            setDraft({ ...draft, uploadKey: event.target.value });
                          }}
                        />
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
                        小程序端业务数据（我的任务 / OA 审批 / 客服会话 / 系统消息）复用本系统既有接口；
                        关闭的模块在小程序端整块不渲染。AppSecret 加密保存，只用于登录换 openId 与生成小程序码。
                        代码上传密钥同样加密保存，仅用于「代码包」页签把代码直传微信（生成开发版）；
                        上传前请把本服务器公网 IP 加入微信侧「小程序代码上传」白名单，提交审核与发布仍需在微信公众平台完成。
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
                key: "releases",
                label: "代码包",
                children: (
                  <Panel
                    title="代码包台账"
                    titleExtra={<span className="text-12 muted">上传的 zip 存本站对象存储；可「上传到微信」生成开发版，或下载后在微信开发者工具提审发布</span>}
                    extra={
                      <Button
                        type="primary"
                        icon={<PlusOutlined aria-hidden />}
                        onClick={() => {
                          setReleaseDraft({ ...EMPTY_RELEASE });
                          setReleaseFile(null);
                          setReleaseModal(true);
                        }}
                      >
                        上传代码包
                      </Button>
                    }
                  >
                    {releaseLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : null}
                    {!releaseLoading && !releases.length ? (
                      <EmptyState text="还没有上传代码包；点「上传代码包」选择 zip 并填版本号。" />
                    ) : null}
                    {!releaseLoading && releases.length ? (
                      <Table
                        style={{ marginTop: 12 }}
                        size="small"
                        rowKey="id"
                        pagination={false}
                        dataSource={releases}
                        columns={releaseColumns}
                        scroll={{ x: 1160 }}
                      />
                    ) : null}
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
                      内置包随本系统代码版本携带，可直接下载后上传到微信开发者工具，或直接「上传到微信」生成开发版。
                      上传后如需下发到用户，请在微信侧完成提审与发布，或在「代码包」页签上传同一版本登记台账。
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
            ]}
          />
        ) : null}
      </Panel>

      <Modal
        open={releaseModal}
        title={releaseDraft.id ? "编辑代码包" : "上传代码包"}
        onCancel={() => setReleaseModal(false)}
        onOk={() => void saveRelease()}
        confirmLoading={releaseSaving}
        okText="保存"
        width={640}
        destroyOnHidden
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div className="form-2col">
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>版本号</div>
              <Input
                className="mono"
                value={releaseDraft.version}
                maxLength={40}
                placeholder="1.0.0"
                onChange={(event) => setReleaseDraft({ ...releaseDraft, version: event.target.value })}
              />
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>通道</div>
              <Space>
                {MINIPROGRAM_RELEASE_CHANNELS.map((channel) => (
                  <Button
                    key={channel}
                    type={releaseDraft.channel === channel ? "primary" : "default"}
                    size="small"
                    onClick={() => setReleaseDraft({ ...releaseDraft, channel })}
                  >
                    {MINIPROGRAM_RELEASE_CHANNEL_LABELS[channel]}
                  </Button>
                ))}
              </Space>
            </div>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>最低基础库版本</div>
              <Input
                className="mono"
                value={releaseDraft.minBaseLib}
                maxLength={40}
                placeholder="可选，如 3.0.0"
                onChange={(event) => setReleaseDraft({ ...releaseDraft, minBaseLib: event.target.value })}
              />
            </div>
          </div>

          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>
              代码包文件{releaseDraft.id ? "（不选＝沿用已上传的文件）" : "（zip，≤200MB）"}
            </div>
            <Upload
              showUploadList={false}
              disabled={uploading}
              beforeUpload={(file) => {
                void doUploadRelease(file as File);
                return false;
              }}
            >
              <Button icon={<UploadOutlined aria-hidden />} loading={uploading}>
                {releaseFile || releaseDraft.fileName ? "重新选择文件" : "选择文件"}
              </Button>
            </Upload>
            {releaseFile || releaseDraft.fileName ? (
              <div className="text-12 muted" style={{ marginTop: 6 }}>
                <span className="mono">{releaseFile ? releaseFile.fileName : releaseDraft.fileName}</span>
                {" · "}
                {formatSize(releaseFile ? releaseFile.fileSize : releaseDraft.fileSize)}
                {releaseFile ? ` · SHA-256 ${releaseFile.sha256.slice(0, 16)}…` : ""}
              </div>
            ) : null}
          </div>

          <div>
            <div className="text-12 muted" style={{ marginBottom: 4 }}>更新说明</div>
            <Input.TextArea
              rows={3}
              maxLength={1000}
              value={releaseDraft.changelog}
              onChange={(event) => setReleaseDraft({ ...releaseDraft, changelog: event.target.value })}
            />
          </div>
          <Space>
            <Switch
              checked={releaseDraft.enabled}
              onChange={(value) => setReleaseDraft({ ...releaseDraft, enabled: value })}
            />
            <span>上架（台账内标记为可用版本）</span>
          </Space>
          <Notice variant="info">
            文件先直传对象存储并计算 SHA-256，点「保存」后才带版本号入库；同一通道下版本号不可重复。
            微信侧的上传与发布仍需在开发者工具 / 公众平台完成，本页只做托管与下载。
          </Notice>
        </Space>
      </Modal>
    </>
  );
}
