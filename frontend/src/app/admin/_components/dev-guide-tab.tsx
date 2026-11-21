"use client";

import {
  CopyOutlined,
  DownloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { App, Button, Input, Space, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { DevGuideView } from "@enterprise/contracts";
import { devGuideAdminApi } from "@/api/dev-guide";
import { EmptyState, Notice, Panel, TabStrip } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { markdownToHtml } from "@/lib/markdown-html";

/**
 * 平台后台「二次开发指引」。
 *
 * 四个页签全部渲染仓库真源 docs/dev-kit/：架构 / 接口 / 外部代码 / 开发原则。
 * 本组件不写死接口清单或规则正文，只额外提供下载、复制命令与「本站补充说明」编辑。
 */
export function DevGuideTab() {
  const { message } = App.useApp();
  const [view, setView] = useState<DevGuideView | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<string>("architecture");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await devGuideAdminApi.detail();
      if (data) {
        setView(data);
        setNotice(data.notice);
        setFailed(false);
      }
    } catch (cause) {
      setFailed(true);
      message.error(cause instanceof Error ? cause.message : "开发指引加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(`${label}已复制`);
    } catch {
      message.error("复制失败，请手动选择文本复制");
    }
  };

  const saveNotice = async () => {
    setSaving(true);
    try {
      const data = await devGuideAdminApi.save({ body: { notice } });
      if (data) {
        setView(data);
        setNotice(data.notice);
      }
      message.success("本站补充说明已保存");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Panel title="二次开发指引">正在读取仓库真源…</Panel>;

  if (failed || !view) {
    return (
      <Panel title="二次开发指引">
        <Notice variant="error">
          开发套件读取失败。请确认部署包含 <code>docs/dev-kit/</code> 且后端可读仓库目录，稍后重新进入本页。
        </Notice>
      </Panel>
    );
  }

  const docs = view.docs;
  const active = docs.find((item) => item.key === tab) ?? docs[0];

  return (
    <>
      <TabStrip
        items={docs.map((item) => ({ key: item.key, label: item.title }))}
        value={active?.key ?? tab}
        onChange={setTab}
        style={{ marginBottom: 14 }}
      />

      {active ? (
        <Panel
          title={active.title}
          titleExtra={
            <Space size={6} wrap>
              <Tag>套件 v{view.kitVersion}</Tag>
              <span className="text-12 muted">真源：{active.source}</span>
            </Space>
          }
        >
          <div
            className="ai-code-md"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(active.markdown) }}
          />
        </Panel>
      ) : (
        <Panel title="二次开发指引">
          <EmptyState text="仓库真源为空，请检查 docs/dev-kit/guides/。" />
        </Panel>
      )}

      {active?.key === "principles" ? (
        <>
          <Panel
            title="开发套件下载"
            titleExtra={
              <span className="text-12 muted">
                下载后解压到仓库根或技能目录即可使用
              </span>
            }
          >
            <Space orientation="vertical" size={10} style={{ width: "100%" }}>
              <div>
                <Button
                  type="primary"
                  icon={<DownloadOutlined aria-hidden />}
                  href={view.kit.available ? view.kit.downloadUrl : undefined}
                  disabled={!view.kit.available}
                  target="_blank"
                >
                  下载 {view.kit.fileName}
                </Button>
                <div className="text-12 muted" style={{ marginTop: 6 }}>
                  {view.kit.description}
                  {view.kit.available ? "" : "（文件未生成，请先运行 pnpm pack:dev-kit）"}
                </div>
              </div>
              <div className="text-12 muted">单个技能包：</div>
              <Space size={8} wrap>
                {view.skills.map((item) => (
                  <Button
                    key={item.key}
                    icon={<DownloadOutlined aria-hidden />}
                    href={item.available ? item.downloadUrl : undefined}
                    disabled={!item.available}
                    target="_blank"
                    title={item.description}
                  >
                    {item.title} · v{item.fileName.match(/-v([\d.]+)\.zip$/)?.[1] ?? ""}
                  </Button>
                ))}
              </Space>
            </Space>
          </Panel>

          <Panel
            title="一键命令"
            titleExtra={
              <span className="text-12 muted">
                在仓库根执行；已提交入口的仓库 clone 后即可用
              </span>
            }
          >
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              {view.commands.map((item) => (
                <Space key={item.command} size={8} wrap>
                  <code>{item.command}</code>
                  <Button
                    size="small"
                    icon={<CopyOutlined aria-hidden />}
                    onClick={() => void copy(item.command, item.label)}
                  >
                    复制
                  </Button>
                  <span className="text-12 muted">{item.label}</span>
                </Space>
              ))}
            </Space>
          </Panel>

          <Panel
            title="AI 提示词"
            titleExtra={
              <span className="text-12 muted">
                粘给 Codex / Cursor / Claude，可在未 setup 的仓库自愈生成入口
              </span>
            }
          >
            <Input.TextArea value={view.aiPrompt} rows={5} readOnly />
            <Button
              style={{ marginTop: 8 }}
              size="small"
              icon={<CopyOutlined aria-hidden />}
              onClick={() => void copy(view.aiPrompt, "AI 提示词")}
            >
              复制提示词
            </Button>
          </Panel>

          <Panel
            title="本站补充说明"
            titleExtra={
              <span className="text-12 muted">
                {view.noticeUpdatedAt
                  ? `最近保存 ${fmtTime(view.noticeUpdatedAt)}`
                  : "尚未填写"}
              </span>
            }
          >
            <Notice variant="warn">
              这里只放本站部署差异、内部联系方式与额外约定；主体四类内容仍由
              <code>docs/dev-kit/</code> 渲染，不要在这里复制规则正文。
            </Notice>
            <Input.TextArea
              value={notice}
              onChange={(event) => setNotice(event.target.value)}
              rows={6}
              maxLength={20_000}
              showCount
              placeholder="例如：本站内网地址、二次开发联系人、额外分支约定…"
              style={{ marginTop: 10 }}
            />
            <Button
              type="primary"
              icon={<SaveOutlined aria-hidden />}
              loading={saving}
              onClick={() => void saveNotice()}
              style={{ marginTop: 10 }}
            >
              保存补充说明
            </Button>
          </Panel>
        </>
      ) : null}
    </>
  );
}
