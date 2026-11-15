"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Input,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import type { GeoSiteScriptEntry } from "@enterprise/contracts";
import {
  useGeoSiteActions,
  useGeoSiteCmsActions,
  type GeoSitePageData,
} from "@/query/geo-site";
import type { geoSiteApi } from "@/api/geo-site";
import { Notice } from "@/components/ui/panel";

/**
 * 页面第三方脚本（统计 / 客服 / 广告）。
 * 三道闸门逐层说明，任何一道没过都当场告知原因与下一步：
 * 平台总开关 → 本站开关 → 只有独立域名 / 平台子域访问才注入（站内路径预览不加载）。
 * 内联脚本没有入口：这里只能填 https 外链，且主机必须命中平台白名单，后端逐条复核。
 */

type Meta = Awaited<ReturnType<typeof geoSiteApi.meta>>;
type Row = GeoSiteScriptEntry;

const POSITIONS = [
  { value: "head", label: "页头（统计类）" },
  { value: "body", label: "页体（客服悬浮窗）" },
];

export function ScriptPanel({
  siteId,
  page,
  meta,
  scriptsEnabled,
  adminSettingsUrl = "/admin/geo-site",
}: {
  siteId: number;
  page: GeoSitePageData;
  meta: Meta | undefined;
  /** 站点级注入开关，来自站点详情：脚本按页配置，但这个闸是整站共用的。 */
  scriptsEnabled: boolean;
  adminSettingsUrl?: string;
}) {
  const { message } = App.useApp();
  const actions = useGeoSiteCmsActions();
  const siteActions = useGeoSiteActions();
  const [rows, setRows] = useState<Row[]>(page.scripts ?? []);
  const [rejected, setRejected] = useState<{ src: string; reason: string }[]>([]);

  // 切换页面必须丢掉上一页的编辑态，否则会把 A 页的脚本存到 B 页
  useEffect(() => {
    setRows(page.scripts ?? []);
    setRejected([]);
  }, [page.id, page.scripts]);

  const max = meta?.maxScriptsPerPage ?? 5;
  const whitelist = meta?.scriptHostWhitelist ?? [];
  const platformEnabled = meta?.customScriptEnabled ?? false;

  const patch = (index: number, next: Partial<Row>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...next } : row)),
    );

  const save = async () => {
    const cleaned = rows
      .map((row) => ({
        src: String(row.src || "").trim(),
        position: row.position === "head" ? ("head" as const) : ("body" as const),
        label: String(row.label || "").trim(),
      }))
      .filter((row) => row.src);
    const result = await actions.pageSaveScripts.mutateAsync({
      body: { id: page.id, scripts: cleaned },
    });
    setRows(result?.scripts ?? cleaned);
    setRejected(result?.rejected ?? []);
    if (result?.rejected?.length) {
      message.warning(`${result.rejected.length} 条脚本被拒绝，其余已保存`);
    } else {
      message.success(result?.message || "脚本已保存，发布后生效");
    }
  };

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      {!platformEnabled ? (
        <Notice variant="warn">
          平台已关闭第三方脚本注入，当前配置只保留不生效。需要放开请管理员到
          <a href={adminSettingsUrl} target="_blank" rel="noopener noreferrer">
            「平台管理 · GEO 建站设置」
          </a>
          开启。
        </Notice>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Typography.Text>本站允许注入脚本</Typography.Text>
        <Switch
          checked={scriptsEnabled}
          loading={siteActions.update.isPending}
          onChange={async (checked) => {
            await siteActions.update.mutateAsync({
              body: { id: siteId, scriptsEnabled: checked },
            });
            message.success(checked ? "本站脚本已开启" : "本站脚本已关闭");
          }}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          关闭后本站所有页面都不再加载第三方脚本，配置本身保留。
        </Typography.Text>
      </div>
      <Notice variant="info">
        脚本只在<strong>独立域名或平台子域</strong>访问时注入；
        主站路径（/geo-site/…）预览与编辑器内不加载，这是为了把第三方代码隔离在独立 Cookie 域之外。
      </Notice>
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          平台已放行的域名（新增厂商域名需管理员在上面同一页维护）：
        </Typography.Text>
        <div style={{ marginTop: 6 }}>
          {whitelist.length ? (
            whitelist.map((host) => (
              <Tag key={host} style={{ marginBottom: 4 }}>
                {host}
              </Tag>
            ))
          ) : (
            <Tag color="red">白名单为空，任何脚本都会被拒绝</Tag>
          )}
        </div>
      </div>
      {rows.map((row, index) => (
        <Space key={index} align="baseline" style={{ display: "flex" }} wrap>
          <Input
            style={{ width: 380 }}
            value={row.src}
            maxLength={500}
            placeholder="https://hm.baidu.com/hm.js?xxxx"
            onChange={(event) => patch(index, { src: event.target.value })}
          />
          <Select
            style={{ width: 170 }}
            value={row.position}
            options={POSITIONS}
            onChange={(value) => patch(index, { position: value as Row["position"] })}
          />
          <Input
            style={{ width: 150 }}
            value={row.label}
            maxLength={60}
            placeholder="备注（可选）"
            onChange={(event) => patch(index, { label: event.target.value })}
          />
          <Tooltip title="删除">
            <Button
              icon={<DeleteOutlined aria-hidden />}
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            />
          </Tooltip>
        </Space>
      ))}
      <Space>
        <Button
          icon={<PlusOutlined aria-hidden />}
          disabled={rows.length >= max}
          onClick={() => setRows((current) => [...current, { src: "", position: "body", label: "" }])}
        >
          添加脚本
        </Button>
        <Tooltip title={platformEnabled ? "" : "平台总开关关闭时保存的配置不会生效"}>
          <Button
            type="primary"
            icon={<SaveOutlined aria-hidden />}
            loading={actions.pageSaveScripts.isPending}
            onClick={save}
          >
            保存脚本
          </Button>
        </Tooltip>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          单页最多 {max} 条，已用 {rows.length}
        </Typography.Text>
      </Space>
      {rejected.length ? (
        <Alert
          type="error"
          showIcon
          message="以下脚本被拒绝"
          description={
            <Space orientation="vertical" size={2}>
              {rejected.map((item) => (
                <Typography.Text key={item.src} style={{ fontSize: 12 }}>
                  {item.src} — {item.reason}
                </Typography.Text>
              ))}
            </Space>
          }
        />
      ) : null}
      {meta?.scriptPresets?.length ? (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#64748b" }}>
            平台预置厂商（点击展开：这些厂商的域名已在白名单里）
          </summary>
          <Space orientation="vertical" size={4} style={{ marginTop: 8 }}>
            {meta.scriptPresets.map((item) => (
              <div key={item.key}>
                <Typography.Text strong style={{ fontSize: 12 }}>
                  {item.label}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                  {item.desc} · {item.hosts.join("、")}
                </Typography.Text>
              </div>
            ))}
          </Space>
        </details>
      ) : null}
    </Space>
  );
}
