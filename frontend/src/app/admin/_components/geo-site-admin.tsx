"use client";

import { SearchOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import { useEffect, useState } from "react";
import {
  GEO_SITE_STATUS_LABELS,
  geoSiteStatusLabel,
} from "@enterprise/contracts";
import { Notice, Panel, StatCard, StatGrid } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import {
  useGeoSiteAdminActions,
  useGeoSiteAdminPage,
  useGeoSiteAdminSettings,
  useGeoSiteAdminStats,
} from "@/query/geo-site";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "default",
  PUBLISHED: "green",
  SUSPENDED: "red",
};

const STATUS_OPTIONS = Object.entries(GEO_SITE_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/**
 * GEO 建站设置（平台侧）：自定义域名开关、备案承诺、容量上限与欠费宽限。
 * 站点月费单价不在这里——复用「积分与充值 → 价目与用量」的 geo_site 行，避免两处改价。
 */
export function GeoSiteSettingsView() {
  const { message } = App.useApp();
  const query = useGeoSiteAdminSettings();
  const actions = useGeoSiteAdminActions();
  const [form] = Form.useForm();
  const data = query.data;

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue(data);
  }, [data, form]);

  const save = async () => {
    const values = await form.validateFields();
    await actions.saveSettings.mutateAsync({ body: values });
    message.success("GEO 建站设置已保存，即刻对全部账号生效");
  };

  return (
    <Panel
      title="GEO 建站设置"
      titleExtra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          站点月费积分价、免费站点数与起扣额在
          <a href="/admin/points" target="_blank" rel="noopener noreferrer">
            「积分与充值 · 价目与用量」
          </a>
          的 geo_site 行配置
        </Typography.Text>
      }
      extra={
        <Button
          type="primary"
          loading={actions.saveSettings.isPending}
          onClick={() => void save().catch(() => undefined)}
        >
          保存设置
        </Button>
      }
    >
      {query.error ? <Notice variant="error">{query.error.message}</Notice> : null}
      <Form form={form} layout="vertical" disabled={query.isPending}>
        <div className="form-2col">
          <Form.Item
            name="customDomainEnabled"
            label="允许绑定自定义域名"
            valuePropName="checked"
            extra="关闭后站点只能用平台子域访问，用户侧域名页会给出说明"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="hostAccessEnabled"
            label="按域名访问总开关"
            valuePropName="checked"
            extra="关闭后平台子域与已生效自定义域名一律不认站，全部回落到本站路径 /geo-site/{标识}；用于回源未就绪时先挡错误域名"
          >
            <Switch />
          </Form.Item>
        </div>
        <div className="form-2col">
          <Form.Item
            name="needsIcpAck"
            label="绑定前必须承诺备案"
            valuePropName="checked"
            extra="与活码短链同口径：不勾选承诺即拒绝绑定"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="rootDomainOverride"
            label="平台子域根域覆盖"
            extra="留空取「站点设置」站点域名的主机名（去 www.）。本地 localhost 无法签发子域证书时留空即可"
          >
            <Input maxLength={253} placeholder="例如 example.com" />
          </Form.Item>
        </div>
        <Form.Item
          name="cnameTargetOverride"
          label="自定义域名 CNAME 目标覆盖"
          extra="留空取站点域名的主机名。客户在 DNS 里把自有域名 CNAME 到这里；用阿里云 ESA SaaS 管理器接入时填 ESA 分配的 CNAME"
        >
          <Input maxLength={253} placeholder="例如 origin.example.com" />
        </Form.Item>
        <div className="form-2col">
          <Form.Item
            name="maxSitesPerOwner"
            label="每账号站点上限"
            rules={[{ required: true, message: "请填写每账号站点上限" }]}
            extra="含草稿；达到上限后用户需先删除旧站点"
          >
            <InputNumber min={1} max={500} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="maxDomainsPerSite"
            label="单站点域名上限"
            rules={[{ required: true, message: "请填写单站点域名上限" }]}
          >
            <InputNumber min={1} max={20} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <div className="form-2col">
          <Form.Item
            name="graceHours"
            label="欠费宽限小时数"
            rules={[{ required: true, message: "请填写欠费宽限小时数" }]}
            extra="出账失败后在此时长内保持可访问，超时才停服"
          >
            <InputNumber min={0} max={720} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="suspendOnArrears"
            label="欠费自动停服"
            valuePropName="checked"
            extra="关闭则只记欠费账单、站点继续可访问"
          >
            <Switch />
          </Form.Item>
        </div>
        <div className="form-2col">
          <Form.Item
            name="customScriptEnabled"
            label="允许页面注入第三方脚本"
            valuePropName="checked"
            extra="总开关：关闭后所有站点的统计 / 客服脚本一律不注入，保存也会被拒绝"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="maxScriptsPerPage"
            label="单页脚本条数上限"
            rules={[{ required: true, message: "请填写单页脚本条数上限" }]}
            extra="兜住首屏请求数，超出部分保存时直接拒回"
          >
            <InputNumber min={1} max={50} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item
          name="scriptHostWhitelist"
          label="脚本域名白名单"
          extra="支持 *.example.com 后缀通配，回车逐条添加；清空即全禁。只放已知厂商 CDN，切勿写顶级域通配。"
        >
          <Select
            mode="tags"
            tokenSeparators={[",", " ", "\n"]}
            maxTagCount="responsive"
            placeholder="hm.baidu.com、*.gstatic.com"
          />
        </Form.Item>
      </Form>
      <Notice variant="info">
        欠费只冻结公开访问，站点内容、域名与账单完整保留；积分充值后由日批自动补扣并恢复发布态。
        平台子域取自「站点设置」的站点域名（host），改站点域名即改子域根域，无需另行配置。
      </Notice>
    </Panel>
  );
}

/** 全站站点台账：跨账号检索 + 合规强制下线（含操作原因留痕）。 */
export function GeoSiteLedgerView() {
  const { message } = App.useApp();
  const stats = useGeoSiteAdminStats();
  const actions = useGeoSiteAdminActions();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<{ id: number; title: string } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const query = useGeoSiteAdminPage(keyword, status, page);
  const rows = query.data?.list ?? [];

  const offline = async () => {
    if (!target) return;
    await actions.offline.mutateAsync({
      body: { id: target.id, reason: reason.trim() },
    });
    setTarget(null);
    setReason("");
    message.success("站点已强制下线，公开地址即刻停服");
  };

  const restore = async (row: (typeof rows)[number]) => {
    const result = await actions.online.mutateAsync({ body: { id: row.id } });
    message.success(
      result?.status === "PUBLISHED"
        ? `「${row.title}」已恢复发布`
        : "处置已解除，该站点仍有欠费账单，结清后自动恢复",
    );
  };

  return (
    <Panel
      title="站点台账"
      titleBadge={query.data ? `${query.data.total} 个站点` : undefined}
      extra={
        <Space.Compact>
          <Input
            value={keyword}
            allowClear
            maxLength={120}
            placeholder="站点名称 / 标识 / 域名"
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
            onPressEnter={() => setPage(1)}
            style={{ width: 240 }}
          />
          <Button icon={<SearchOutlined aria-hidden />} onClick={() => setPage(1)}>
            检索
          </Button>
        </Space.Compact>
      }
    >
      {query.error ? <Notice variant="error">{query.error.message}</Notice> : null}
      <StatGrid>
        <StatCard label="站点总数" value={`${stats.data?.total ?? 0} 个`} />
        <StatCard label="已发布" value={`${stats.data?.published ?? 0} 个`} />
        <StatCard label="草稿" value={`${stats.data?.draft ?? 0} 个`} />
        <StatCard
          label="停服"
          value={`${stats.data?.suspended ?? 0} 个`}
          hint="含欠费停服与平台强制下线"
        />
        <StatCard
          label="自定义域名"
          value={`${stats.data?.domains.total ?? 0} 个`}
          hint={`生效 ${stats.data?.domains.active ?? 0} · 校验失败 ${stats.data?.domains.error ?? 0}`}
        />
        <StatCard
          label="本月出账"
          value={`${stats.data?.chargedThisMonth ?? 0} 积分`}
          hint="已扣费 + 免费额内的站点合计"
        />
        <StatCard
          label="页面"
          value={`${stats.data?.pages.total ?? 0} 个`}
          hint={`已发布 ${stats.data?.pages.published ?? 0} 个`}
        />
        <StatCard
          label="文章"
          value={`${stats.data?.articles.total ?? 0} 篇`}
          hint={`已发布 ${stats.data?.articles.published ?? 0} 篇`}
        />
        <StatCard
          label="产品"
          value={`${stats.data?.products.total ?? 0} 个`}
          hint={`已发布 ${stats.data?.products.published ?? 0} 个`}
        />
      </StatGrid>

      <div style={{ margin: "12px 0" }}>
        <Select
          allowClear
          placeholder="全部状态"
          value={status || undefined}
          options={STATUS_OPTIONS}
          style={{ width: 160 }}
          onChange={(value) => {
            setStatus(value ?? "");
            setPage(1);
          }}
        />
      </div>

      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        scroll={{ x: 1130 }}
        pagination={{
          current: page,
          pageSize: 20,
          total: query.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          {
            title: "站点",
            dataIndex: "title",
            width: 220,
            render: (_, row) => (
              <Space orientation="vertical" size={2}>
                <Typography.Text strong>{row.title}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  #{row.id} · {row.slug}
                </Typography.Text>
              </Space>
            ),
          },
          { title: "归属账号", dataIndex: "ownerLabel", width: 160 },
          {
            title: "状态",
            dataIndex: "status",
            width: 150,
            render: (_, row) => (
              <Space orientation="vertical" size={2}>
                <Tag color={STATUS_COLOR[row.status] || "default"}>
                  {geoSiteStatusLabel(row.status, row.offReason)}
                </Tag>
                {row.offReason ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: row.offReason }}>
                    处置：{row.offReason}
                  </Typography.Text>
                ) : null}
              </Space>
            ),
          },
          {
            title: "访问地址",
            key: "entry",
            width: 240,
            render: (_, row) => (
              <Space orientation="vertical" size={2}>
                <Typography.Text style={{ fontSize: 12 }}>
                  {row.url.replace(/^https?:\/\//, "")}
                </Typography.Text>
                {row.primaryDomain ? (
                  <Tag color="blue" style={{ fontSize: 12 }}>
                    {row.primaryDomain}
                  </Tag>
                ) : null}
              </Space>
            ),
          },
          {
            title: "本月积分",
            dataIndex: "monthlyPoints",
            width: 100,
            render: (value: number) => `${value} 积分`,
          },
          {
            title: "最近更新",
            dataIndex: "updatedAt",
            width: 160,
            render: (value: string) => fmtTime(value),
          },
          {
            title: "操作",
            key: "ops",
            width: 120,
            fixed: "right",
            render: (_, row) =>
              row.offReason ? (
                <Popconfirm
                  title="解除下线处置？"
                  description={
                    row.status === "SUSPENDED"
                      ? "欠费账单未结清的站点解除后仍保持停服，充值后自动恢复。"
                      : "解除后站点即刻恢复公开访问，用户可继续自行发布。"
                  }
                  okText="解除"
                  cancelText="取消"
                  disabled={actions.online.isPending}
                  onConfirm={() => void restore(row).catch(() => undefined)}
                >
                  <Button size="small" loading={actions.online.isPending}>
                    解除下线
                  </Button>
                </Popconfirm>
              ) : (
                <Button
                  size="small"
                  danger
                  disabled={row.status === "SUSPENDED"}
                  onClick={() => {
                    setTarget({ id: row.id, title: row.title });
                    setReason("");
                  }}
                >
                  强制下线
                </Button>
              ),
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
        强制下线用于合规处置：公开地址立即停服、站点数据保留，且用户侧无法自行重新发布，
        只能由平台在这里「解除下线」。处置原因会展示在建站者的站点编辑器与账单页。
      </Typography.Paragraph>

      <Modal
        open={!!target}
        title={`强制下线「${target?.title ?? ""}」`}
        okText="确认下线"
        okButtonProps={{ danger: true, loading: actions.offline.isPending }}
        onCancel={() => setTarget(null)}
        onOk={() => void offline().catch(() => undefined)}
      >
        <Form layout="vertical">
          <Form.Item
            label="下线原因（展示给建站者）"
            extra="留空则记为「内容需整改后重新发布，请联系平台复核」"
          >
            <Input.TextArea
              rows={3}
              maxLength={500}
              showCount
              value={reason}
              placeholder="例如：页面含未授权品牌标识，需整改后重新发布"
              onChange={(event) => setReason(event.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Panel>
  );
}
