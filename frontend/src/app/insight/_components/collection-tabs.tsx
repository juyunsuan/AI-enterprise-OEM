"use client";

import {
  DatabaseOutlined,
  DownloadOutlined,
  HistoryOutlined,
  ReloadOutlined,
  TableOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Empty,
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
} from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  INSIGHT_COLLECTION_SCOPE_LABELS,
  INSIGHT_ECOM_PLATFORMS,
  INSIGHT_ECOM_PLATFORM_LABELS,
  INSIGHT_FREQUENCY_LABELS,
  INSIGHT_FREQUENCIES,
  INSIGHT_PAGE_OBJECT_LABELS,
  INSIGHT_PLATFORMS,
  INSIGHT_PLATFORM_LABELS,
  INSIGHT_PRESET_TABLES,
  INSIGHT_PURPOSE_LABELS,
  INSIGHT_RUN_CHANNEL_LABELS,
  INSIGHT_RUN_STATUS_LABELS,
  INSIGHT_SOURCE_KIND_LABELS,
  insightKindsInScope,
  insightPurposesInScope,
  validateInsightUrlTemplate,
  type InsightCollectionScope,
  type InsightPageObject,
  type InsightPurpose,
  type InsightSourceKind,
} from "@enterprise/contracts";
import { EmptyState, Panel, StatCard, StatGrid } from "@/components/ui/panel";
import {
  insightApi,
  insightCollectionApi,
  type InsightCollectionHealth,
  type InsightCollectionRunRow,
  type InsightCollectionSkillRow,
  type InsightCollectionSourceRow,
  type InsightCollectResult,
  type InsightSubscriptionRow,
} from "@/api/insight";

/**
 * 采集配置组件（数据源 / 排班 / 批次）：热点分析与流行趋势分析共用同一套模式与实现，
 * 由 scope 决定用哪一族端点、能选哪组采集目的与类型、文案落在哪个页面。
 */

const ECOM_KINDS: InsightSourceKind[] = ["ecomList", "shopPage"];

/** 每种数据源类型可选的页面对象（闭集）；默认值与后端 defaultPageObject 同口径。 */
const PAGE_OBJECT_BY_KIND: Record<InsightSourceKind, InsightPageObject[]> = {
  platformSearch: ["searchPage"],
  topic: ["topicPage"],
  creator: ["creatorPage"],
  ecomList: ["listPage", "searchPage", "categoryRanking"],
  shopPage: ["shopPage"],
  customSite: ["listPage", "searchPage", "categoryRanking"],
};

const DEFAULT_PAGE_OBJECT: Record<InsightSourceKind, InsightPageObject> = {
  platformSearch: "searchPage",
  topic: "topicPage",
  creator: "creatorPage",
  ecomList: "listPage",
  shopPage: "shopPage",
  customSite: "listPage",
};

const RUN_STATUS_COLOR: Record<string, string> = {
  queued: "default",
  dispatched: "blue",
  succeeded: "green",
  failed: "red",
  skipped: "orange",
};

/** 本页能用的采集包：社媒/电商走各自专属包，自定义网站源头两侧共用泛化包。 */
const SKILL_KEYS_BY_SCOPE: Record<InsightCollectionScope, string[]> = {
  hotspot: ["hotspot", "site"],
  trend: ["trend", "site"],
};

const SCOPE_TEXT: Record<
  InsightCollectionScope,
  {
    tool: string;
    sourcesHint: string;
    scheduleTitle: string;
    scheduleHint: string;
    collectTable: string;
    entryPath: string;
  }
> = {
  hotspot: {
    tool: INSIGHT_COLLECTION_SCOPE_LABELS.hotspot,
    sourcesHint:
      "无目的不采集、无数据源不采集：本页只管「内容互动热度」，订阅只能挂这里登记过的源头，采集回来的行按「来源数据源」回写采集表",
    scheduleTitle: "垂类订阅",
    scheduleHint:
      "订阅＝给数据源排班：挂哪些采集数据源、按什么频率跑，采集范围由源头决定，不做全站爬取",
    collectTable: INSIGHT_PRESET_TABLES.content.tableName,
    entryPath: "/insight/hotspot",
  },
  trend: {
    tool: INSIGHT_COLLECTION_SCOPE_LABELS.trend,
    sourcesHint:
      "同一套采集模式，另一组采集目的：本页只管「趋势·元素 / 色彩 / 商业选品」，源头与热点分析分开配置，采集行落「电商选品观测」表",
    scheduleTitle: "采集排班",
    scheduleHint:
      "排班＝给趋势数据源定频：采集目的与热点分析互不共用源头，攒够一轮再谈元素/色彩/商业热度",
    collectTable: INSIGHT_PRESET_TABLES.ecommerce.tableName,
    entryPath: "/insight/trends",
  },
};

function siteHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function platformName(key: string): string {
  return (
    INSIGHT_PLATFORM_LABELS[key] ?? INSIGHT_ECOM_PLATFORM_LABELS[key] ?? key
  );
}

function platformOptionsFor(kind: InsightSourceKind) {
  const isEcom = ECOM_KINDS.includes(kind);
  return (isEcom ? INSIGHT_ECOM_PLATFORMS : INSIGHT_PLATFORMS).map((item) => ({
    value: item,
    label:
      (isEcom ? INSIGHT_ECOM_PLATFORM_LABELS : INSIGHT_PLATFORM_LABELS)[item] ??
      item,
  }));
}

/** 采集 SKILL 包下载：契约是唯一来源，两侧共读同一份清单，只按本页能用的包过滤展示。 */
export function SkillPackPanel({ scope }: { scope: InsightCollectionScope }) {
  const router = useRouter();
  const [skills, setSkills] = useState<InsightCollectionSkillRow[]>([]);
  useEffect(() => {
    void insightApi
      .collectionSkills()
      .then((data) => setSkills((data as InsightCollectionSkillRow[]) ?? []))
      .catch(() => undefined);
  }, []);
  const usable = skills.filter((skill) =>
    SKILL_KEYS_BY_SCOPE[scope].includes(skill.key),
  );
  if (!usable.length) return null;
  const text = SCOPE_TEXT[scope];
  return (
    <Panel
      title={
        <>
          <DownloadOutlined aria-hidden /> 采集 SKILL 包
        </>
      }
      titleExtra="AWBotDSH / WorkBuddy / Codex 这类能定时执行 SKILL 的通道装上包即可采集；包内是 SKILL.md + field-mapping.json"
      extra={
        <Button
          size="small"
          onClick={() => router.push("/data-table")}
        >{`打开采集表（${text.collectTable}）`}</Button>
      }
    >
      <Space orientation="vertical" size={10} style={{ width: "100%" }}>
        {usable.map((skill) => (
          <div
            key={skill.key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <Space size={6} wrap>
                <span>{skill.title}</span>
                <Tag>v{skill.version}</Tag>
                <Tag color="blue">
                  {
                    (INSIGHT_PRESET_TABLES as Record<string, { tableName: string }>)[
                      skill.targetTable
                    ]?.tableName
                  }
                </Tag>
              </Space>
              <div className="muted text-12">{skill.description}</div>
            </div>
            <Button
              icon={<DownloadOutlined aria-hidden />}
              href={skill.downloadUrl}
            >
              下载 {skill.zipFile}
            </Button>
          </div>
        ))}
        <div className="muted text-12">
          用法：解压后把整个目录放进 AWBotDSH 客户端本机技能库（或让已配对主机在技能中心按
          slug 同步）→ 回本页挂数据源 → 保存{SCOPE_TEXT[scope].scheduleTitle}后按频率定时执行；「立即采集」随时可补跑一轮。
        </div>
        <Button size="small" onClick={() => router.push("/agent-bot")}>
          去 Agent-Bot 看托管窗口与技能库
        </Button>
      </Space>
    </Panel>
  );
}

export function CollectionSourcesTab({
  scope,
  onGoRuns,
}: {
  scope: InsightCollectionScope;
  onGoRuns: () => void;
}) {
  const { message } = App.useApp();
  const api = insightCollectionApi(scope);
  const text = SCOPE_TEXT[scope];
  const kinds = insightKindsInScope(scope);
  const purposes = insightPurposesInScope(scope);
  const [rows, setRows] = useState<InsightCollectionSourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<InsightCollectionSourceRow | null>(
    null,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const kind = (Form.useWatch("kind", form) ?? kinds[0]) as InsightSourceKind;
  const isSite = kind === "customSite";
  const isEcom = ECOM_KINDS.includes(kind);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        (await api.listSources()) as unknown as InsightCollectionSourceRow[],
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const openForm = (record: InsightCollectionSourceRow | null) => {
    setEditing(record);
    form.setFieldsValue(
      record
        ? {
            name: record.name,
            purpose: record.purpose,
            kind: record.kind,
            platform: record.platform || undefined,
            siteUrl: record.siteUrl,
            pageObject: record.pageObject,
            urlTemplate: record.urlTemplate,
            keyword: record.keyword,
            loginRequired: record.loginRequired,
          }
        : {
            purpose: purposes[0],
            kind: kinds[0],
            pageObject: DEFAULT_PAGE_OBJECT[kinds[0]],
            loginRequired: false,
          },
    );
    setFormOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await api.saveSource({
        body: {
          id: editing?.id,
          name: values.name,
          purpose: values.purpose,
          kind: values.kind,
          pageObject: values.pageObject,
          platform: values.kind === "customSite" ? "" : values.platform,
          siteUrl: values.siteUrl ?? "",
          urlTemplate: values.urlTemplate ?? "",
          keyword: values.keyword,
          loginRequired: values.loginRequired === true,
          status: editing?.status ?? "ACTIVE",
        },
      });
      message.success(editing ? "数据源已更新" : "数据源已创建");
      setFormOpen(false);
      void load();
    } catch (error) {
      message.error((error as Error)?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (record: InsightCollectionSourceRow) => {
    await api.saveSource({
      body: {
        id: record.id,
        name: record.name,
        purpose: record.purpose,
        kind: record.kind,
        pageObject: record.pageObject,
        platform: record.platform,
        siteUrl: record.siteUrl,
        urlTemplate: record.urlTemplate,
        keyword: record.keyword,
        loginRequired: record.loginRequired,
        status: record.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
      },
    });
    void load();
  };

  const remove = async (record: InsightCollectionSourceRow) => {
    await api.removeSource({ params: { id: String(record.id) } });
    message.success("数据源已删除，引用它的排班会自动重建采集任务");
    void load();
  };

  return (
    <>
      <SkillPackPanel scope={scope} />

      <Panel
        title={
          <>
            <DatabaseOutlined aria-hidden /> 采集数据源
          </>
        }
        titleExtra={text.sourcesHint}
        extra={
          <Space wrap>
            <Button onClick={onGoRuns}>看采集批次</Button>
            <Button type="primary" onClick={() => openForm(null)}>
              新建数据源
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={false}
          locale={{
            emptyText: (
              <Empty description="还没有数据源，先「新建数据源」（本页只列本工具采集目的下的源头）" />
            ),
          }}
          columns={[
            { title: "名称", dataIndex: "name" },
            {
              title: "采集目的",
              dataIndex: "purposeLabel",
              render: (value: string, record) =>
                value || INSIGHT_PURPOSE_LABELS[record.purpose as InsightPurpose],
            },
            { title: "类型", dataIndex: "kindLabel" },
            {
              title: "站点 / 平台",
              render: (_v, record) =>
                record.kind === "customSite"
                  ? siteHost(record.siteUrl)
                  : platformName(record.platform),
            },
            { title: "页面对象", dataIndex: "pageObjectLabel" },
            { title: "关键词 / 账号", dataIndex: "keyword" },
            {
              title: "采集包",
              render: (_v, record) => (
                <Tag>{`${record.skillKey} v${record.skillVersion}`}</Tag>
              ),
            },
            { title: "落表行数", dataIndex: "rowCount" },
            {
              title: "最近采集",
              render: (_v, record) =>
                record.lastRunAt ? (
                  <Space size={4}>
                    <span className="text-12">
                      {new Date(record.lastRunAt).toLocaleString()}
                    </span>
                    <Tag color={RUN_STATUS_COLOR[record.lastRunStatus] ?? "default"}>
                      {INSIGHT_RUN_STATUS_LABELS[record.lastRunStatus] ??
                        record.lastRunStatus}
                    </Tag>
                  </Space>
                ) : (
                  <span className="muted text-12">未采集</span>
                ),
            },
            {
              title: "启用",
              dataIndex: "status",
              render: (_v, record) => (
                <Switch
                  checked={record.status === "ACTIVE"}
                  onChange={() => void toggle(record)}
                />
              ),
            },
            {
              title: "操作",
              render: (_v, record) => (
                <Space wrap>
                  <Button type="link" onClick={() => openForm(record)}>
                    编辑
                  </Button>
                  <Popconfirm
                    title="删除该数据源？"
                    description="已采集进表的行不会删除；引用它的排班会自动换任务。"
                    onConfirm={() => void remove(record)}
                  >
                    <Button type="link" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Panel>

      <Modal
        open={formOpen}
        title={editing ? "编辑数据源" : "新建数据源"}
        confirmLoading={saving}
        onOk={() => void submit()}
        onCancel={() => setFormOpen(false)}
        destroyOnHidden
        width={640}
      >
        <Form form={form} layout="vertical" key={editing?.id ?? "new"}>
          <Form.Item
            name="name"
            label="数据源名称"
            rules={[{ required: true, message: "请输入名称" }]}
          >
            <Input
              placeholder={
                scope === "trend" ? "如：淘宝-冲锋衣搜索榜 / 某行业榜单站" : "如：小红书-露营搜索"
              }
              maxLength={120}
            />
          </Form.Item>
          <Space wrap size={16}>
            <Form.Item
              name="purpose"
              label="采集目的（本页闭集）"
              rules={[{ required: true, message: "请选择采集目的" }]}
            >
              <Select
                style={{ minWidth: 220 }}
                options={purposes.map((item) => ({
                  value: item,
                  label: INSIGHT_PURPOSE_LABELS[item],
                }))}
              />
            </Form.Item>
            <Form.Item
              name="kind"
              label="数据源类型（本页闭集）"
              rules={[{ required: true, message: "请选择类型" }]}
            >
              <Select
                style={{ minWidth: 200 }}
                options={kinds.map((item) => ({
                  value: item,
                  label: INSIGHT_SOURCE_KIND_LABELS[item],
                }))}
                onChange={(next: InsightSourceKind) =>
                  form.setFieldsValue({
                    pageObject: DEFAULT_PAGE_OBJECT[next],
                    platform: undefined,
                  })
                }
              />
            </Form.Item>
          </Space>
          {isSite ? (
            <>
              <Form.Item
                name="siteUrl"
                label="网站源头（http/https）"
                rules={[
                  {
                    required: true,
                    pattern: /^https?:\/\//i,
                    message: "请填写 http/https 开头的站点地址",
                  },
                ]}
              >
                <Input placeholder="如：https://www.smzdm.com" maxLength={500} />
              </Form.Item>
              <Form.Item
                name="urlTemplate"
                label="URL 模板（必须带 {keyword} 或 {page} 占位符）"
                extra="示例：https://www.smzdm.com/search/{keyword}/p{page}/"
                rules={[
                  { required: true, message: "自定义网站源头要给 URL 模板" },
                  {
                    validator: (_r, value: string) => {
                      const issues = validateInsightUrlTemplate(value ?? "", true);
                      return issues.length
                        ? Promise.reject(new Error(issues[0].message))
                        : Promise.resolve();
                    },
                  },
                ]}
              >
                <Input maxLength={500} />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="platform"
              label={isEcom ? "电商平台" : "内容平台"}
              rules={[
                { required: true, message: isEcom ? "请选择电商平台" : "请选择内容平台" },
              ]}
            >
              <Select
                options={platformOptionsFor(kind)}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          )}
          <Space wrap size={16}>
            <Form.Item
              name="pageObject"
              label="页面对象"
              rules={[{ required: true, message: "请选择页面对象" }]}
            >
              <Select
                style={{ minWidth: 180 }}
                options={PAGE_OBJECT_BY_KIND[kind].map((item) => ({
                  value: item,
                  label: INSIGHT_PAGE_OBJECT_LABELS[item],
                }))}
              />
            </Form.Item>
            <Form.Item
              name="keyword"
              label="关键词 / 话题名 / 账号"
              rules={[{ required: true, message: "采集包按它打开页面，必填" }]}
            >
              <Input style={{ minWidth: 240 }} placeholder="如：露营" maxLength={200} />
            </Form.Item>
          </Space>
          <Form.Item
            name="loginRequired"
            label="需要登录态（走已登录的托管窗口 / 浏览器代理）"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function CollectionSchedulesTab({
  scope,
  onCollected,
}: {
  scope: InsightCollectionScope;
  onCollected: (result: InsightCollectResult) => void;
}) {
  const { message } = App.useApp();
  const api = insightCollectionApi(scope);
  const text = SCOPE_TEXT[scope];
  const purposes = insightPurposesInScope(scope);
  const [rows, setRows] = useState<InsightSubscriptionRow[]>([]);
  const [sources, setSources] = useState<InsightCollectionSourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<InsightSubscriptionRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const purpose = (Form.useWatch("purpose", form) ??
    purposes[0]) as InsightPurpose;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, packs] = await Promise.all([
        api.listSubscriptions() as unknown as Promise<InsightSubscriptionRow[]>,
        api.listSources() as unknown as Promise<InsightCollectionSourceRow[]>,
      ]);
      setRows(list ?? []);
      setSources(packs ?? []);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const openForm = (record: InsightSubscriptionRow | null) => {
    setEditing(record);
    form.setFieldsValue(
      record
        ? {
            name: record.name,
            purpose: record.purpose,
            sourceIds: record.sourceIds,
            platforms: record.platforms,
            keywords: record.keywords.join(","),
            topics: record.topics.join(","),
            creators: record.creators.join(","),
            frequency: record.frequency,
            minEngagement: record.minEngagement,
            alertGrowthPct: record.alertGrowthPct,
          }
        : {
            frequency: "daily",
            purpose: purposes[0],
            platforms: scope === "hotspot" ? ["xiaohongshu"] : [],
            minEngagement: 0,
            alertGrowthPct: 50,
          },
    );
    setFormOpen(true);
  };

  const splitList = (value?: string) =>
    (value ?? "")
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await api.saveSubscription({
        body: {
          id: editing?.id,
          name: values.name,
          purpose: values.purpose,
          sourceIds: values.sourceIds ?? [],
          platforms: values.platforms ?? [],
          keywords: splitList(values.keywords),
          topics: splitList(values.topics),
          creators: splitList(values.creators),
          frequency: values.frequency,
          minEngagement: values.minEngagement ?? 0,
          alertGrowthPct: values.alertGrowthPct ?? 50,
        },
      });
      message.success(editing ? "已更新" : "已创建");
      setFormOpen(false);
      void load();
    } catch (error) {
      message.error((error as Error)?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (record: InsightSubscriptionRow) => {
    await api.toggleSubscription({
      params: { id: String(record.id) },
      body: { status: record.status === "ACTIVE" ? "PAUSED" : "ACTIVE" },
    });
    void load();
  };

  const remove = async (record: InsightSubscriptionRow) => {
    await api.removeSubscription({ params: { id: String(record.id) } });
    message.success("已删除，对应的采集任务一并收口");
    void load();
  };

  const collect = async (record: InsightSubscriptionRow) => {
    const result = (await api.collectNow({
      params: { id: String(record.id) },
    })) as unknown as InsightCollectResult;
    onCollected(result);
  };

  const sourceOptions = sources
    .filter((item) => item.purpose === purpose && item.status !== "PAUSED")
    .map((item) => ({
      value: item.id,
      label: `${item.name}（${item.kindLabel}·${item.keyword}）`,
    }));

  return (
    <>
      <Panel
        title={
          <>
            <TableOutlined aria-hidden /> {text.scheduleTitle}
          </>
        }
        titleExtra={text.scheduleHint}
        extra={
          <Button type="primary" onClick={() => openForm(null)}>
            新建{text.scheduleTitle}
          </Button>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={false}
          locale={{
            emptyText: (
              <EmptyState text={`还没有${text.scheduleTitle}，先「新建${text.scheduleTitle}」（采集目的：${purposes
                .map((item) => INSIGHT_PURPOSE_LABELS[item])
                .join(" / ")}）`} />
            ),
          }}
          columns={[
            { title: "名称", dataIndex: "name" },
            {
              title: "采集目的",
              dataIndex: "purpose",
              render: (value: string, record) =>
                (record as { purposeLabel?: string }).purposeLabel ||
                INSIGHT_PURPOSE_LABELS[value as InsightPurpose] ||
                value,
            },
            {
              title: "数据源",
              dataIndex: "sourceIds",
              render: (value: number[]) =>
                value.length
                  ? value
                      .map(
                        (id) =>
                          sources.find((item) => item.id === id)?.name ?? `#${id}`,
                      )
                      .join(" / ")
                  : "按目的取全部启用源",
            },
            ...(scope === "hotspot"
              ? [
                  {
                    title: "平台",
                    dataIndex: "platforms",
                    render: (value: string[]) => value.map(platformName).join("/"),
                  },
                ]
              : []),
            {
              title: "频率",
              dataIndex: "frequency",
              render: (value: string) => INSIGHT_FREQUENCY_LABELS[value] ?? value,
            },
            {
              title: scope === "hotspot" ? "内容数" : "已采行数",
              dataIndex: "contentCount",
              render: (value: number) => (scope === "hotspot" ? value : "看批次"),
            },
            {
              title: "启用",
              dataIndex: "status",
              render: (_v, record) => (
                <Switch
                  checked={record.status === "ACTIVE"}
                  onChange={() => void toggle(record)}
                />
              ),
            },
            {
              title: "操作",
              render: (_v, record) => (
                <Space wrap>
                  <Button type="link" onClick={() => void collect(record)}>
                    立即采集
                  </Button>
                  <Button type="link" onClick={() => openForm(record)}>
                    编辑
                  </Button>
                  <Popconfirm
                    title={`删除该${text.scheduleTitle}？`}
                    description="不会删除已采集进表的行。"
                    onConfirm={() => void remove(record)}
                  >
                    <Button type="link" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Panel>

      <Modal
        open={formOpen}
        title={editing ? `编辑${text.scheduleTitle}` : `新建${text.scheduleTitle}`}
        confirmLoading={saving}
        onOk={() => void submit()}
        onCancel={() => setFormOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" key={editing?.id ?? "new"}>
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: "请输入名称" }]}
          >
            <Input
              placeholder={scope === "trend" ? "如：女装选品日报 / 家居元素观察" : "如：户外运动赛道 / 母婴辅食"}
              maxLength={120}
            />
          </Form.Item>
          <Form.Item
            name="purpose"
            label="采集目的（本页闭集，不许跨工具）"
            rules={[{ required: true, message: "请选择采集目的" }]}
          >
            <Select
              options={purposes.map((item) => ({
                value: item,
                label: INSIGHT_PURPOSE_LABELS[item],
              }))}
              onChange={() => form.setFieldsValue({ sourceIds: [] })}
            />
          </Form.Item>
          <Form.Item
            name="sourceIds"
            label="挂载的采集数据源"
            extra={`留空＝该采集目的下全部启用源头（本页只看 ${text.tool} 的源头）；关键词会自动并进这里`}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="先到「采集数据源」新建"
              options={sourceOptions}
            />
          </Form.Item>
          {scope === "hotspot" ? (
            <Form.Item
              name="platforms"
              label="平台"
              rules={[{ required: true, message: "请至少选择一个平台" }]}
            >
              <Select
                mode="multiple"
                options={INSIGHT_PLATFORMS.map((item) => ({
                  value: item,
                  label: INSIGHT_PLATFORM_LABELS[item],
                }))}
              />
            </Form.Item>
          ) : null}
          <Form.Item name="keywords" label="关键词（逗号分隔）">
            <Input.TextArea rows={2} placeholder="如：露营,徒步,冲锋衣" />
          </Form.Item>
          <Form.Item name="topics" label="话题标签（逗号分隔）">
            <Input.TextArea rows={2} placeholder="如：新中式穿搭" />
          </Form.Item>
          <Form.Item name="creators" label="博主账号（逗号分隔）">
            <Input.TextArea rows={2} placeholder="如：@某博主" />
          </Form.Item>
          <Form.Item name="frequency" label="采集频率">
            <Select
              options={INSIGHT_FREQUENCIES.map((item) => ({
                value: item,
                label: INSIGHT_FREQUENCY_LABELS[item],
              }))}
            />
          </Form.Item>
          {scope === "hotspot" ? (
            <Space wrap size={16}>
              <Form.Item name="minEngagement" label="最低互动门槛">
                <InputNumber min={0} />
              </Form.Item>
              <Form.Item name="alertGrowthPct" label="告警增速(%)">
                <InputNumber min={0} max={1000} />
              </Form.Item>
            </Space>
          ) : null}
        </Form>
      </Modal>
    </>
  );
}

export function CollectionRunsTab({
  scope,
  health,
}: {
  scope: InsightCollectionScope;
  health: InsightCollectionHealth | null;
}) {
  const api = insightCollectionApi(scope);
  const text = SCOPE_TEXT[scope];
  const [rows, setRows] = useState<InsightCollectionRunRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await api.listRuns({
        query: { page, pageSize },
      })) as unknown as { list: InsightCollectionRunRow[]; total: number };
      setRows(data?.list ?? []);
      setTotal(data?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [api, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Panel
        title={
          <>
            <HistoryOutlined aria-hidden /> 采集健康度
          </>
        }
        titleExtra="只数本页采集目的下的源头与批次；状态由执行通道回填（主机读运行记录，浏览器代理读计划最近结果）"
        extra={
          <Button icon={<ReloadOutlined aria-hidden />} onClick={() => void load()}>
            刷新
          </Button>
        }
      >
        <StatGrid>
          <StatCard
            label="启用数据源"
            value={health?.enabledSourceCount ?? 0}
            hint={`登记 ${health?.sourceCount ?? 0} 个`}
          />
          <StatCard label="近 24h 批次" value={health?.runCount24h ?? 0} />
          <StatCard
            label="近 24h 失败"
            value={health?.failedRunCount24h ?? 0}
            hint={
              health?.lastRunAt
                ? `最近一轮 ${new Date(health.lastRunAt).toLocaleString()}`
                : "还没跑过"
            }
          />
          <StatCard
            label="落表"
            value={text.collectTable}
            hint={`${text.tool} 的采集行只进这张表`}
          />
        </StatGrid>
      </Panel>

      <Panel
        title={
          <>
            <TableOutlined aria-hidden /> 采集批次
          </>
        }
        titleExtra="一轮一行：关联数据源 / 排班 / 采集包 / 通道，落表行数按「来源数据源」+ 本轮时间窗回读"
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          locale={{ emptyText: <Empty description="还没有采集批次" /> }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            },
          }}
          columns={[
            { title: "ID", dataIndex: "id", width: 70 },
            { title: "数据源", dataIndex: "sourceName" },
            { title: text.scheduleTitle, dataIndex: "subscriptionName" },
            {
              title: "采集包",
              render: (_v, record) => `${record.skillKey} v${record.skillVersion}`,
            },
            {
              title: "通道",
              dataIndex: "channel",
              render: (value: string) =>
                INSIGHT_RUN_CHANNEL_LABELS[value] ?? value ?? "-",
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string, record) => (
                <Space size={4}>
                  <Tag color={RUN_STATUS_COLOR[value] ?? "default"}>
                    {INSIGHT_RUN_STATUS_LABELS[value] ?? value}
                  </Tag>
                  {record.error ? (
                    <span className="muted text-12">{record.error}</span>
                  ) : null}
                </Space>
              ),
            },
            { title: "落表", dataIndex: "rowCount" },
            { title: "新增", dataIndex: "insertedCount" },
            { title: "去重", dataIndex: "dedupCount" },
            {
              title: "开始",
              dataIndex: "startedAt",
              render: (value: string) =>
                value ? new Date(value).toLocaleString() : "-",
            },
          ]}
        />
      </Panel>
    </>
  );
}
