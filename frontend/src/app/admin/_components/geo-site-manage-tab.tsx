"use client";

import { CopyOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Descriptions,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import { Notice, Panel, PanelTabs, StatCard, StatGrid } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import {
  useGeoSiteAdminAccessGuide,
  useGeoSiteAdminActions,
  useGeoSiteAdminDomains,
  useGeoSiteAdminResolveHost,
} from "@/query/geo-site";
import { GeoSiteLedgerView, GeoSiteSettingsView } from "./geo-site-admin";

/**
 * 独立站管理（平台管理后台）。
 * 域名访问这条链路跨 DNS、证书、反代、应用四层，后台把「生效值 + 客户该填什么 + 实际落到哪个站」
 * 放在同一页，避免排障时在几个系统之间来回猜。
 */

const DOMAIN_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "待校验", color: "gold" },
  VERIFYING: { label: "校验中", color: "blue" },
  ACTIVE: { label: "已生效", color: "green" },
  ERROR: { label: "校验失败", color: "red" },
  DISABLED: { label: "已停用", color: "default" },
};

const RESOLVE_REASON: Record<string, string> = {
  ok: "已匹配到站点",
  platform_disabled: "按域名访问总开关已关闭",
  missing_host: "请求没有携带 Host",
  subdomain_invalid: "平台子域格式不合法或站点不存在",
  site_not_found: "域名未绑定到任何站点",
  not_verified: "域名尚未通过校验",
  // 自检对「查无此绑定」统一回 unbound，不代表用户主动解绑过
  unbound: "域名未绑定",
};

export function GeoSiteManageTab() {
  const [tab, setTab] = useState("guide");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "guide", label: "域名接入", children: <AccessGuideView /> },
        { key: "domains", label: "域名台账", children: <AdminDomainLedger /> },
        { key: "resolve", label: "回源自检", children: <HostResolveView /> },
        { key: "sites", label: "站点台账", children: <GeoSiteLedgerView /> },
        { key: "policy", label: "计费与脚本策略", children: <GeoSiteSettingsView /> },
      ]}
    />
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  const { message } = App.useApp();
  return (
    <div style={{ marginBottom: 12 }}>
      <Space size={8} style={{ marginBottom: 6 }}>
        <Typography.Text strong>{title}</Typography.Text>
        <Button
          size="small"
          icon={<CopyOutlined aria-hidden />}
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            message.success("已复制");
          }}
        >
          复制
        </Button>
      </Space>
      <pre
        style={{
          margin: 0,
          padding: 12,
          fontSize: 12,
          lineHeight: 1.7,
          background: "#0f172a",
          color: "#e2e8f0",
          borderRadius: 8,
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {code}
      </pre>
    </div>
  );
}

function AccessGuideView() {
  const query = useGeoSiteAdminAccessGuide();
  const data = query.data;
  const root = data?.rootDomain || "";
  const target = data?.cnameTarget || "";
  const wildcard = data?.wildcardDomain || "";

  if (query.error) {
    return <Notice variant="error">{query.error.message}</Notice>;
  }

  if (!query.isPending && data && !root) {
    return (
      <Panel title="域名接入">
        <Notice variant="warn">
          还没有可用的平台根域：请先在
          <a href="/admin/settings" target="_blank" rel="noopener noreferrer">
            「系统与内容 · 系统设置」
          </a>
          填写站点域名（例如 https://www.example.com），或在「计费与脚本策略」页签里填写
          「平台子域根域覆盖」。本地 localhost 无法签发子域证书，可留空并以
          /geo-site/{"{标识}"} 路径访问。
        </Notice>
      </Panel>
    );
  }

  return (
    <Panel
      title="域名接入配置"
      titleExtra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          这里只展示当前生效值；修改后即刻对全部站点生效
        </Typography.Text>
      }
    >
      <StatGrid>
        <StatCard label="平台根域" value={root || "未配置"} hint="平台子域 = {标识}.根域" />
        <StatCard label="泛解析域名" value={wildcard || "—"} hint="DNS 里为它配置 CNAME / A" />
        <StatCard label="CNAME 目标" value={target || "—"} hint="客户自有域名指向这里" />
        <StatCard label="探针路径" value={data?.probePath || "/_geo-site/probe"} hint="校验时请求该地址回显令牌" />
        <StatCard
          label="按域名访问"
          value={data?.hostAccessEnabled ? "已开启" : "已关闭"}
          hint={data?.hostAccessEnabled ? "Host 命中站点即独立访问" : "全部回落 /geo-site/{标识}"}
        />
        <StatCard
          label="自定义域名"
          value={data?.customDomainEnabled ? "允许绑定" : "仅平台子域"}
          hint={`单站最多 ${data?.maxDomainsPerSite ?? 0} 个域名`}
        />
      </StatGrid>

      <Typography.Title level={5} style={{ marginTop: 18 }}>
        第一步：DNS 泛解析
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        让所有平台子域都打到同一个入口。国内节点用 A 记录指向网关公网 IP，或统一 CNAME
        到一个稳定入口；境外节点通常直接 CNAME 到 ESA 分配的接入点。
      </Typography.Paragraph>
      <Snippet
        title="平台子域泛解析"
        code={`; 例：根域 example.com
*.example.com.   600  IN  CNAME  ${target || "<入口域名>"}.
example.com.     600  IN  A      <网关公网 IP>

; 若根域本身也要访问（可选）
www.example.com. 600  IN  CNAME  ${target || "<入口域名>"}.`}
      />

      <Typography.Title level={5}>第二步：入口与反代（保留 Host）</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        应用按 Host 判定站点，因此反向代理必须原样透传 Host 与 X-Forwarded-Proto。
        下面是最小可用的 Nginx 配置；监听端口、证书路径与后端地址按实际替换。
      </Typography.Paragraph>
      <Snippet
        title="Nginx：泛域名入口"
        code={`server {
  listen 443 ssl http2;
  server_name *.${root || "example.com"};

  # 泛域名证书：覆盖 *.example.com
  ssl_certificate     /etc/ssl/${root || "example.com"}/fullchain.pem;
  ssl_certificate_key /etc/ssl/${root || "example.com"}/privkey.pem;

  location / {
    proxy_pass http://<后端服务地址>;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-Host  $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP         $remote_addr;
  }
}`}
      />
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        用阿里云 ALB 替代 Nginx 时：在监听 443 上配置基于 Host 的转发规则（或默认转发到本系统），
        健康检查放在 /_geo-site/probe；证书用泛域名证书，不要把 Host 改写成后端内网域名。
      </Typography.Paragraph>

      <Typography.Title level={5}>第三步：客户自定义域名</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        推荐用阿里云 ESA「SaaS 管理器」承接客户自有域名：客户把域名 CNAME 到 ESA
        分配的接入点，ESA 自动签发证书并回源到本系统；平台侧再把 CNAME 目标配置为 ESA
        回源域名即可。若不用 ESA，客户直接把域名 CNAME 到上面的
        「CNAME 目标」，由平台统一证书（或在反代上按域名加载证书）。
      </Typography.Paragraph>
      <Snippet
        title="客户侧 DNS（CNAME 方案）"
        code={`; 客户在自有域名服务商处添加
shop.customer.com. 600 IN CNAME ${target || "<平台 CNAME 目标>"}.

; 同时按绑定页提示添加校验 TXT（_geo-site-verify.<域名>）
_geo-site-verify.shop.customer.com. 600 IN TXT "<绑定后页面显示的令牌>"`}
      />
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        国内节点：域名必须已完成 ICP 备案；香港 / 海外节点免备案。绑定页面会要求勾选内容责任承诺，
        平台校验包含 TXT 令牌、公网解析与 HTTPS 探针三步。
      </Typography.Paragraph>

      <Typography.Title level={5}>第四步：数据与安全（按量选配）</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        单库多租户（按站点归属隔离）即可支撑中小体量；需要更强隔离时把内容库拆到独立 RDS
        实例。静态资源放 OSS + CDN，页面由应用渲染。前置 WAF 时注意保留原始 Host：
        Host 被改写会导致所有域名都落到同一个站点或 404。
      </Typography.Paragraph>

      <Notice variant="info">
        配置完成后用「回源自检」输入任意主机名，确认能落到目标站点；若返回
        「域名未绑定」而客户确认解析已完成，多半是域名还没通过校验或
        「按域名访问总开关」被关闭。
      </Notice>
    </Panel>
  );
}

type DomainRow = NonNullable<
  ReturnType<typeof useGeoSiteAdminDomains>["data"]
>["list"][number];

function AdminDomainLedger() {
  const { message } = App.useApp();
  const actions = useGeoSiteAdminActions();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const query = useGeoSiteAdminDomains(keyword, status, page);
  const rows = query.data?.list ?? [];
  const total = query.data?.total ?? 0;
  const active = rows.filter((row) => row.status === "ACTIVE").length;

  const check = async (row: DomainRow) => {
    const result = await actions.checkDomain.mutateAsync({
      body: { domainId: row.id },
    });
    if (result?.status === "ACTIVE") {
      message.success(`「${row.domain}」校验通过，已生效`);
    } else {
      message.warning(result?.lastError || "校验未通过，请检查 TXT 与 CNAME 解析");
    }
  };

  return (
    <Panel
      title="自定义域名台账"
      titleBadge={`${total} 个域名`}
      extra={
        <Space wrap>
          <Input
            value={keyword}
            allowClear
            maxLength={120}
            placeholder="域名 / 站点名称 / 标识 / 归属账号"
            style={{ width: 260 }}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
            onPressEnter={() => setPage(1)}
          />
          <Select
            allowClear
            placeholder="全部状态"
            style={{ width: 140 }}
            value={status || undefined}
            onChange={(value) => {
              setStatus(value ?? "");
              setPage(1);
            }}
            options={Object.entries(DOMAIN_STATUS).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
          />
          <Button icon={<SearchOutlined aria-hidden />} onClick={() => setPage(1)}>
            检索
          </Button>
        </Space>
      }
    >
      {query.error ? <Notice variant="error">{query.error.message}</Notice> : null}
      <StatGrid>
        <StatCard label="域名总数" value={`${total} 个`} />
        <StatCard label="本页已生效" value={`${active} 个`} hint="跨页统计见站点台账" />
        <StatCard
          label="本页校验失败"
          value={`${rows.filter((row) => row.status === "ERROR").length} 个`}
          hint="失败原因见「最近校验」列"
        />
      </StatGrid>
      <Table<DomainRow>
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        scroll={{ x: 1180 }}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          {
            title: "域名",
            dataIndex: "domain",
            width: 220,
            render: (value: string, row) => (
              <Space orientation="vertical" size={2}>
                <Space size={6}>
                  <Typography.Text copyable={{ text: value }}>{value}</Typography.Text>
                  {row.isPrimary ? <Tag color="blue">主域名</Tag> : null}
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  #{row.id}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: "归属站点",
            key: "site",
            width: 220,
            render: (_, row) => (
              <Space orientation="vertical" size={2}>
                <Typography.Text>{row.siteTitle}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  #{row.siteId} · {row.siteSlug} · {row.siteStatus}
                </Typography.Text>
              </Space>
            ),
          },
          { title: "归属账号", dataIndex: "ownerLabel", width: 160 },
          {
            title: "状态",
            dataIndex: "status",
            width: 110,
            render: (value: string, row) => (
              <Tag color={DOMAIN_STATUS[value]?.color || "default"}>
                {DOMAIN_STATUS[value]?.label || row.statusLabel || value}
              </Tag>
            ),
          },
          {
            title: "解析要求",
            key: "records",
            width: 280,
            render: (_, row) => (
              <Space orientation="vertical" size={2} style={{ fontSize: 12 }}>
                <Typography.Text code style={{ wordBreak: "break-all" }}>
                  TXT {row.txtName}
                </Typography.Text>
                <Typography.Text code>CNAME {row.cnameTarget || row.domain}</Typography.Text>
              </Space>
            ),
          },
          {
            title: "最近校验",
            key: "last",
            width: 220,
            render: (_, row) => (
              <Space orientation="vertical" size={2}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {row.lastCheckAt ? fmtTime(row.lastCheckAt) : "尚未校验"}
                </Typography.Text>
                {row.lastError ? (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {row.lastError}
                  </Typography.Text>
                ) : null}
              </Space>
            ),
          },
          {
            title: "操作",
            key: "ops",
            width: 170,
            fixed: "right",
            render: (_, row) => (
              <Space size={4}>
                <Button
                  size="small"
                  icon={<ReloadOutlined aria-hidden />}
                  loading={actions.checkDomain.isPending}
                  onClick={() => void check(row).catch(() => undefined)}
                >
                  复检
                </Button>
                <Popconfirm
                  title="解绑该域名？"
                  description="解绑后该地址立即停止访问；用户可重新绑定。"
                  onConfirm={() =>
                    actions.removeDomain
                      .mutateAsync({ body: { domainId: row.id } })
                      .then(() => message.success("域名已解绑"))
                      .catch(() => undefined)
                  }
                >
                  <Button size="small" danger>
                    解绑
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
        复检会重新查 TXT、解析地址与 HTTPS 探针。平台只解绑不代客户改 DNS；
        客户侧需要把域名 CNAME 到「域名接入」页展示的目标地址，并保留校验 TXT。
      </Typography.Paragraph>
    </Panel>
  );
}

function HostResolveView() {
  const [input, setInput] = useState("");
  const [probe, setProbe] = useState("");
  const query = useGeoSiteAdminResolveHost(probe, Boolean(probe));
  const data = query.data;

  return (
    <Panel
      title="回源自检"
      titleBadge={data?.matched ? "命中站点" : undefined}
      titleExtra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          输入客户端实际访问的主机名（不带协议与路径），反查应用会落到哪个站点
        </Typography.Text>
      }
    >
      <Space.Compact style={{ width: "100%", maxWidth: 620 }}>
        <Input
          value={input}
          maxLength={253}
          placeholder="例如 shop.customer.com 或 demo.example.com"
          onChange={(event) => setInput(event.target.value)}
          onPressEnter={() => setProbe(input.trim())}
        />
        <Button type="primary" onClick={() => setProbe(input.trim())}>
          自检
        </Button>
      </Space.Compact>

      {query.error ? (
        <div style={{ marginTop: 12 }}>
          <Notice variant="error">{query.error.message}</Notice>
        </div>
      ) : null}

      {data ? (
        <div style={{ marginTop: 16 }}>
          <Notice variant={data.matched ? "success" : "warn"}>
            {data.message || RESOLVE_REASON[data.reason] || data.reason}
          </Notice>
          <Descriptions
            column={2}
            size="small"
            bordered
            style={{ marginTop: 12 }}
            items={[
              { key: "host", label: "请求 Host", children: data.host || "—" },
              {
                key: "matched",
                label: "判定",
                children: data.matched ? "命中站点" : "未命中",
              },
              {
                key: "reason",
                label: "原因",
                children: `${RESOLVE_REASON[data.reason] || data.reason}（${data.reason}）`,
              },
              { key: "via", label: "匹配方式", children: data.via || "—" },
              { key: "root", label: "当前平台根域", children: data.rootDomain || "—" },
              { key: "siteId", label: "站点", children: data.siteId ? `#${data.siteId}` : "—" },
              { key: "title", label: "站点名称", children: data.siteTitle || "—" },
              { key: "slug", label: "访问标识", children: data.siteSlug || "—" },
              { key: "status", label: "站点状态", children: data.siteStatus || "—" },
            ]}
          />
        </div>
      ) : null}

      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }}>
        常见排查顺序：①「按域名访问总开关」是否开启；②域名是否绑定到站点并通过校验；
        ③反代是否原样转发 Host；④平台子域是否与「平台根域」同后缀。
      </Typography.Paragraph>
    </Panel>
  );
}
