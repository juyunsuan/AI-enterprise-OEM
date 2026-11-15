"use client";

import { useState } from "react";
import { App, Alert, Button, Checkbox, Input, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { CopyOutlined, ReloadOutlined } from "@ant-design/icons";
import { useGeoSiteActions, useGeoSiteDomains } from "@/query/geo-site";
import { Notice } from "@/components/ui/panel";

/**
 * 自定义域名：绑定 → 按提示加 TXT/CNAME → 校验。
 * 校验由后端发起（DoH 查记录 + 探针回显令牌 + 公网地址闸门），这里只展示结果与下一步。
 */

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "green",
  PENDING: "gold",
  VERIFYING: "blue",
  ERROR: "red",
  DISABLED: "default",
};

export function DomainPanel({
  siteId,
  customDomainEnabled,
  needsIcpAck,
  maxDomains,
  adminSettingsUrl,
}: {
  siteId: number;
  customDomainEnabled: boolean;
  needsIcpAck: boolean;
  maxDomains: number;
  adminSettingsUrl: string;
}) {
  const { message } = App.useApp();
  const [domain, setDomain] = useState("");
  const [acked, setAcked] = useState(false);
  const query = useGeoSiteDomains(siteId);
  const actions = useGeoSiteActions();
  const rows = query.data ?? [];

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    message.success("已复制");
  };

  if (!customDomainEnabled) {
    return (
      <Notice variant="warn">
        平台尚未开放自定义域名，站点暂用平台子域访问。管理员可在
        <a href={adminSettingsUrl} target="_blank" rel="noopener noreferrer">
          「平台管理 · GEO 建站设置」
        </a>
        中开启。
      </Notice>
    );
  }

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Space.Compact block>
        <Input
          value={domain}
          maxLength={253}
          placeholder="例如 shop.example.com（只填主机名，不带 http:// 与路径）"
          onChange={(event) => setDomain(event.target.value)}
          disabled={actions.bindDomain.isPending}
        />
        <Button
          type="primary"
          loading={actions.bindDomain.isPending}
          disabled={!domain.trim() || rows.length >= maxDomains}
          onClick={async () => {
            try {
              await actions.bindDomain.mutateAsync({
                body: { siteId, domain: domain.trim(), icpAcknowledged: acked },
              });
              setDomain("");
              setAcked(false);
              message.success("域名已添加，请按下面的记录完成解析后点校验");
            } catch {
              /* 统一 Mutation Hook 已展示错误 */
            }
          }}
        >
          添加
        </Button>
      </Space.Compact>
      <div>
        <Checkbox checked={acked} onChange={(event) => setAcked(event.target.checked)}>
          我确认该域名已完成 ICP 备案（或使用无需备案的境外域名），内容责任与 HTTPS 证书由本人承担。
        </Checkbox>
        <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
          已用 {rows.length}/{maxDomains}
        </Typography.Text>
      </div>
      {needsIcpAck && !acked ? (
        <Alert
          type="info"
          showIcon
          message="平台要求先勾选上面的承诺才能提交绑定。"
        />
      ) : null}
      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 900 }}
        columns={[
          {
            title: "域名",
            dataIndex: "domain",
            render: (value: string, row) => (
              <Space size={6}>
                <Typography.Text copyable={{ text: value }}>{value}</Typography.Text>
                {row.isPrimary ? <Tag color="blue">主域名</Tag> : null}
              </Space>
            ),
          },
          {
            title: "状态",
            dataIndex: "status",
            width: 96,
            render: (value: string, row) => (
              <Tag color={STATUS_COLOR[value] || "default"}>{row.statusLabel}</Tag>
            ),
          },
          {
            title: "校验记录",
            key: "verify",
            width: 260,
            render: (_, row) => (
              <Space orientation="vertical" size={2} style={{ fontSize: 12 }}>
                <Space size={4}>
                  <Typography.Text type="secondary">TXT</Typography.Text>
                  <Typography.Text code style={{ wordBreak: "break-all" }}>
                    {row.txtName}
                  </Typography.Text>
                  <Button size="small" type="text" icon={<CopyOutlined aria-hidden />} onClick={() => copy(row.txtValue)} />
                </Space>
                <Space size={4}>
                  <Typography.Text type="secondary">CNAME</Typography.Text>
                  <Typography.Text code>{row.cnameTarget || row.domain}</Typography.Text>
                </Space>
              </Space>
            ),
          },
          {
            title: "最近校验",
            key: "last",
            width: 200,
            render: (_, row) => (
              <Space orientation="vertical" size={2}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {row.lastCheckAt ? new Date(row.lastCheckAt).toLocaleString() : "尚未校验"}
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
            width: 210,
            render: (_, row) => (
              <Space size={4}>
                <Button
                  size="small"
                  icon={<ReloadOutlined aria-hidden />}
                  loading={actions.verifyDomain.isPending}
                  onClick={async () => {
                    const result = await actions.verifyDomain.mutateAsync({
                      body: { domainId: row.id },
                    });
                    if (result?.status === "ACTIVE") message.success("校验通过，域名已生效");
                    else message.warning(result?.lastError || "校验未通过，请按记录检查解析");
                  }}
                >
                  校验
                </Button>
                {row.status === "ACTIVE" && !row.isPrimary ? (
                  <Button
                    size="small"
                    onClick={async () => {
                      await actions.setPrimaryDomain.mutateAsync({ body: { domainId: row.id } });
                      message.success("已设为主域名，规范地址与 sitemap 随之切换");
                    }}
                  >
                    设为主域名
                  </Button>
                ) : null}
                <Popconfirm
                  title="移除该域名？"
                  description="移除后该地址立即停止访问，站点数据不受影响。"
                  onConfirm={async () => {
                    await actions.removeDomain.mutateAsync({ body: { domainId: row.id } });
                  }}
                >
                  <Button size="small" danger>
                    移除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
        解析生效通常需要几分钟到数小时（TTL）。校验包含三步：TXT 令牌一致、域名解析到公网地址、
        探针地址能回显令牌。通过 HTTPS 访问需要证书：平台子域由平台签发，自定义域名请确保证书覆盖该主机名。
      </Typography.Paragraph>
    </Space>
  );
}
