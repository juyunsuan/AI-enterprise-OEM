"use client";

// 平台后台「小程序管理 → 发布说明」编辑页签。
// 这里维护的是**一处真源**的正文：建站管理·小程序板块的抽屉、各工具发布页、帮助中心章节
// 三处入口都读同一份后端数据（`system_settings` 键 mini_program_publish_guide），
// 所以本文件只编辑文字，绝不写死一份说明文案；服务器域名清单与本账号要填的参数
// 由后端按站点配置与账号自动渲染，管理员在预览里看到的就是用户实际看到的。
import { SaveOutlined } from "@ant-design/icons";
import { App, Button, Collapse, Drawer, Input, Select, Skeleton, Space } from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  TOOL_LAUNCH_CODES,
  type MiniGuideAdminView,
  type ToolLaunchCode,
} from "@enterprise/contracts";
import { miniGuideAdminApi } from "@/api/mini-guide";
import { MiniProgramPublishGuide } from "@/components/mini-program/publish-guide";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";

/** 契约里的字数上限，编辑器与保存都用同一口径，免得超了才被后端打回。 */
const BODY_MAX = 20_000;
const OVERRIDE_MAX = 6_000;

/**
 * 工具码 → 列表标签：与后端 tool-launch catalog 同名，只用作编辑区的行标题
 * （接口首次落地、overrides 为空时也要能列出全部工具）。
 * 说明正文本身一律来自接口，不在这张表里。
 */
const TOOL_LABELS: Record<ToolLaunchCode, string> = {
  "knowledge-pay": "知识付费云课堂",
  onsite: "上门服务小程序",
  "brand-mall": "品牌商城",
  health: "健康管理小程序",
  marketplace: "多店铺商城平台",
  "digital-human": "数字人小程序",
  "card-shop": "卡密商城小程序",
  kuaidi: "快递寄件小程序",
  errand: "跑腿小程序",
  takeout: "外卖小程序",
  circle: "创意社区",
  "global-site": "国际独立站",
  park: "园区管理",
};

/** 没有补充正文的工具，折叠标题上给一句继承提示，管理员知道留空＝用公共正文。 */
const OVERRIDE_PLACEHOLDER =
  "留空＝这个工具的发布页直接用上面的公共正文；要区别说明时只写这几段就行，支持 **加粗**、`代码`、- 项目符号、1. 序号。";

export function MiniGuideTab() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [body, setBody] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  /** 预览抽屉：默认「通用版」（建站管理板块右侧那颗按钮看到的那份）。 */
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTool, setPreviewTool] = useState<ToolLaunchCode | "">("");

  const applyView = useCallback((view: MiniGuideAdminView) => {
    setBody(view.body);
    setOverrides(
      Object.fromEntries(view.overrides.map((item) => [item.toolCode, item.body])),
    );
    setUpdatedAt(view.updatedAt);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const view = await miniGuideAdminApi.detail();
      if (view) {
        applyView(view);
        setFailed(false);
      }
    } catch (cause) {
      setFailed(true);
      message.error(cause instanceof Error ? cause.message : "发布说明加载失败");
    } finally {
      setLoading(false);
    }
  }, [applyView, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await miniGuideAdminApi.save({
        body: {
          body,
          overrides: TOOL_LAUNCH_CODES.filter(
            (code) => (overrides[code] || "").trim(),
          ).map((code) => ({ toolCode: code, body: (overrides[code] || "").trim() })),
        },
      });
      message.success("发布说明已保存，三处入口同步生效");
      // 保存后自动重拉：以库里的最新值回填（含 updatedAt），不给「手动刷新」按钮留位置。
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const filledCount = TOOL_LAUNCH_CODES.filter(
    (code) => (overrides[code] || "").trim(),
  ).length;

  return (
    <>
      <Panel
        title="小程序开发与发布"
        titleExtra={
          <span className="text-12 muted">
            公共正文 {body.trim().length}/{BODY_MAX} 字 · 已写工具补充 {filledCount}/
            {TOOL_LAUNCH_CODES.length}
            {updatedAt ? ` · 最近保存 ${fmtTime(updatedAt)}` : ""}
          </span>
        }
        extra={
          <Space wrap>
            <Button
              onClick={() => setPreviewOpen(true)}
              disabled={failed}
            >
              预览用户看到的说明
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined aria-hidden />}
              loading={saving}
              disabled={failed}
              onClick={() => void save()}
            >
              保存说明
            </Button>
          </Space>
        }
      >
        {loading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
        {!loading && failed ? (
          <EmptyState text="发布说明接口暂未就绪，稍后重进本页即可（正文与工具补充都不落本地）。" />
        ) : null}
        {!loading && !failed ? (
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Notice variant="info">
              这份正文同时供三处入口使用：「建站管理 → 小程序开发与发布」独立页、
              每个工具的发布页、帮助中心的同名章节。平台不代编译、不代传微信：
              用户下载统一源码分发包后，可导入 Codex / Qoder / TREA / AWBotDSH 等客户端改代码，
              再回微信开发者工具里填参数、编译、上传、提审。
              服务器域名清单与「这个账号要填的值」由后端按站点设置与账号自动渲染，
              所以正文里只写怎么做，不要把域名或参数写死在文字里。
            </Notice>

            <div>
              <div className="text-12 muted" style={{ marginBottom: 6 }}>
                公共正文（所有工具默认用这一份）
              </div>
              <Input.TextArea
                rows={16}
                maxLength={BODY_MAX}
                showCount
                value={body}
                placeholder="按「下载源码包 → 填参数 → 编译预览 → 上传提审」的顺序讲清用户要做什么。支持 **加粗**、`代码`、- 项目符号、1. 序号。"
                onChange={(event) => setBody(event.target.value)}
              />
            </div>

            <div>
              <div className="text-12 muted" style={{ marginBottom: 6 }}>
                各工具的补充正文（留空＝沿用公共正文）
              </div>
              <Collapse
                defaultActiveKey={TOOL_LAUNCH_CODES.filter((code) =>
                  Boolean((overrides[code] || "").trim()),
                )}
                items={TOOL_LAUNCH_CODES.map((code) => ({
                  key: code,
                  label: (
                    <Space size={8}>
                      <span>{TOOL_LABELS[code] || code}</span>
                      <span className="text-12 muted mono">{code}</span>
                      {(overrides[code] || "").trim() ? (
                        <span className="text-12 muted">
                          已写 {(overrides[code] || "").trim().length} 字
                        </span>
                      ) : (
                        <span className="text-12 muted">用公共正文</span>
                      )}
                    </Space>
                  ),
                  children: (
                    <Input.TextArea
                      rows={8}
                      maxLength={OVERRIDE_MAX}
                      showCount
                      value={overrides[code] || ""}
                      placeholder={OVERRIDE_PLACEHOLDER}
                      onChange={(event) =>
                        setOverrides({ ...overrides, [code]: event.target.value })
                      }
                    />
                  ),
                }))}
              />
            </div>
          </Space>
        ) : null}
      </Panel>

      <Drawer
        title="用户实际看到的发布说明"
        size={820}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        destroyOnHidden
        styles={{ body: { background: "var(--ant-color-bg-layout, #f5f5f5)" } }}
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <Space wrap size={8}>
            <span className="text-12 muted">预览视角</span>
            <Select
              size="small"
              style={{ width: 240 }}
              value={previewTool}
              onChange={(value: ToolLaunchCode | "") => setPreviewTool(value)}
              options={[
                { value: "", label: "通用版（建站管理板块抽屉）" },
                ...TOOL_LAUNCH_CODES.map((code) => ({
                  value: code,
                  label: `${TOOL_LABELS[code] || code}（该账号参数）`,
                })),
              ]}
            />
            <span className="text-12 muted">
              切换后即时重新取后端视图，含域名清单与本账号要填的值
            </span>
          </Space>
          <MiniProgramPublishGuide
            key={previewTool || "shared"}
            tool={previewTool || undefined}
          />
        </Space>
      </Drawer>
    </>
  );
}
