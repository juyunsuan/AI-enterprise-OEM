"use client";

import { ArrowLeftOutlined, RobotOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  ConfigProvider,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type {
  CircleActivity,
  CircleAiResult,
  CircleCategory,
  CircleComment,
  CircleCommunity,
  CircleGroup,
  CircleMedal,
  CircleMeta,
  CircleOverview,
  CirclePost,
  CircleReport,
  MiniAppTestResult,
  CircleTopic,
  CircleUser,
} from "@enterprise/contracts";
import {
  CIRCLE_ACTIVITY_STATUS_LABELS,
  CIRCLE_MEDAL_TYPE_LABELS,
  CIRCLE_POST_STATUS_LABELS,
  CIRCLE_REPORT_STATUS_LABELS,
  CIRCLE_GROUP_STATUS_LABELS,
  CIRCLE_USER_STATUS_LABELS,
} from "@enterprise/contracts";
import { circleApi } from "@/api/circle";
import { MiniProgramPublishGuide } from "@/components/mini-program/publish-guide";
import { PageHero, Panel, ColumnSwitch } from "@/components/ui/panel";
import { ToolLaunchBanner } from "@/components/tool-launch/launch-banner";
import { AssetReferencePicker } from "@/components/content/asset-reference-picker";

const TABS = [
  { value: "overview", label: "概览" },
  { value: "settings", label: "社区设置" },
  { value: "categories", label: "分类" },
  { value: "topics", label: "话题" },
  { value: "activities", label: "活动" },
  { value: "medals", label: "勋章" },
  { value: "groups", label: "圈子" },
  { value: "posts", label: "帖子" },
  { value: "comments", label: "评论" },
  { value: "reports", label: "举报" },
  { value: "users", label: "成员" },
  { value: "ai", label: "AI 运营助手" },
  { value: "publish", label: "发布" },
];

const DESC: Record<string, string> = {
  overview: "社区今日看板：成员、帖子、评论、待审核与近 30 天访问/浏览/流量。",
  settings: "账号负责人就是社区管理员：门面、审核口径、AI 客服绑定与协议正文都在这里。",
  categories: "圈子分类：管理员维护，圈子按分类归档；有圈子的分类不能直接删除。",
  topics: "话题：帖子可挂最多 5 个话题；有帖子的话题不能删除，只能停用。",
  activities: "活动：发起报名、设置人数上限与结束时间；成员可在小程序报名与取消。",
  medals: "勋章：按发帖/评论/粉丝阈值自动授予；可增删改与停用。",
  groups: "圈子台账：审核成员申请、停用/推荐圈子；圈主可在小程序端管理自己的圈子。",
  posts: "帖子台账：审核待审内容、置顶/精选、隐藏或删除违规内容。",
  comments: "评论台账：审核待审评论、隐藏或删除违规内容；删除一级评论会连同其回复一起删除。",
  reports: "举报处理：隐藏/删除目标、封禁成员，或驳回举报。",
  users: "社区成员：禁言/封禁只影响本社区，不影响站内账号。",
  ai: "AI 运营助手：生成圈子简介、公告、帖子摘要与周报；统一走平台模型网关并按用量计积分。",
  publish: "一部自己的微信小程序：下载平台统一源码包，在微信开发者工具里自填参数、上传与提审。",
};

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN");
}

export default function CirclePage() {
  return (
    <Suspense fallback={<Panel title="圈子社区">正在读取社区信息…</Panel>}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <CircleInner />
      </ConfigProvider>
    </Suspense>
  );
}

function CircleInner() {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [tab, setTab] = useState("overview");
  const [meta, setMeta] = useState<CircleMeta | null>(null);
  const [overview, setOverview] = useState<CircleOverview | null>(null);
  const [categories, setCategories] = useState<CircleCategory[]>([]);
  const [topics, setTopics] = useState<CircleTopic[]>([]);
  const [activities, setActivities] = useState<CircleActivity[]>([]);
  const [medals, setMedals] = useState<CircleMedal[]>([]);
  const [groups, setGroups] = useState<CircleGroup[]>([]);
  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [comments, setComments] = useState<CircleComment[]>([]);
  const [reports, setReports] = useState<CircleReport[]>([]);
  const [users, setUsers] = useState<CircleUser[]>([]);
  const [aiResult, setAiResult] = useState<CircleAiResult | null>(null);
  const [appTest, setAppTest] = useState<MiniAppTestResult | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [pickerFor, setPickerFor] = useState<"logo" | "cover" | "shareImage" | null>(null);

  const [form] = Form.useForm<CircleCommunity>();
  const [categoryForm] = Form.useForm();
  const [aiForm] = Form.useForm();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [medalOpen, setMedalOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [topicForm] = Form.useForm();
  const [credentialForm] = Form.useForm();
  const [noticeForm] = Form.useForm();
  const [activityForm] = Form.useForm();
  const [medalForm] = Form.useForm();
  const [groupForm] = Form.useForm();

  const loadMeta = useCallback(async () => {
    try {
      const data = (await circleApi.meta()) || null;
      setMeta(data);
      if (data && data.community) form.setFieldsValue(data.community);
      if (data && data.app) credentialForm.setFieldsValue({
        appId: data.app.appId,
        templates: data.app.templates,
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "社区信息读取失败");
    }
  }, [credentialForm, form, message]);

  const loadTab = useCallback(
    async (key: string) => {
      try {
        if (key === "overview") setOverview((await circleApi.overview()) || null);
        if (key === "categories") setCategories((await circleApi.categories()) || []);
        if (key === "topics") setTopics((await circleApi.topics()) || []);
        if (key === "activities") setActivities(((await circleApi.activities({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
        if (key === "medals") setMedals((await circleApi.medals()) || []);
        if (key === "groups") setGroups(((await circleApi.groups({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
        if (key === "posts") setPosts(((await circleApi.posts({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
        if (key === "comments") setComments(((await circleApi.comments({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
        if (key === "reports") setReports(((await circleApi.reports({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
        if (key === "users") setUsers(((await circleApi.users({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
      } catch (error) {
        message.error(error instanceof Error ? error.message : "数据读取失败");
      }
    },
    [message],
  );

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadTab(tab);
  }, [tab, loadTab]);

  const community = meta?.community;
  const deskOptions = useMemo(
    () =>
      (meta?.deskSites || []).map((item) => ({
        value: item.siteKey,
        label: `${item.name}${item.enabled ? "" : "（已停用）"}`,
      })),
    [meta],
  );

  const saveCommunity = async () => {
    const values = await form.validateFields();
    try {
      await circleApi.communitySave({ body: values });
      message.success("社区设置已保存");
      await loadMeta();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const toggleOnline = async () => {
    if (!community) return;
    const next = community.status === "ONLINE" ? "DRAFT" : "ONLINE";
    const label = next === "ONLINE" ? "上线" : "下线";
    modal.confirm({
      title: `${label}圈子社区？`,
      content:
        next === "ONLINE"
          ? "上线后 C 端小程序即可访问；未启动「圈子社区」工具时仍会被启动闸门拦下。"
          : "下线后 C 端小程序立即不可访问，成员与内容都保留。",
      onOk: async () => {
        await circleApi.communityStatus({ body: { status: next } });
        message.success(`已${label}`);
        await loadMeta();
      },
    });
  };

  const saveCategory = async () => {
    const values = await categoryForm.validateFields();
    try {
      await circleApi.categorySave({ body: values });
      message.success("分类已保存");
      setCategoryOpen(false);
      setCategories((await circleApi.categories()) || []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const saveTopic = async () => {
    const values = await topicForm.validateFields();
    try {
      await circleApi.topicSave({ body: values });
      message.success("话题已保存");
      setTopicOpen(false);
      setTopics((await circleApi.topics()) || []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const saveGroup = async () => {
    const values = await groupForm.validateFields();
    try {
      await circleApi.groupSave({ body: values });
      message.success("圈子已保存");
      setGroupOpen(false);
      setGroups(((await circleApi.groups({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const groupAction = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      message.success(ok);
      setGroups(((await circleApi.groups({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const postAction = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      message.success(ok);
      setPosts(((await circleApi.posts({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const saveCredentials = async () => {
    const values = await credentialForm.validateFields();
    try {
      await circleApi.appSave({
        body: {
          appId: String(values.appId || ""),
          appSecret: values.appSecret || undefined,
          templates: values.templates || {},
        },
      });
      message.success("小程序凭据已保存（密钥只写不读，留空即保留原值）");
      await loadMeta();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const testApp = async () => {
    try {
      setAppTest((await circleApi.appTest({ body: {} })) || null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "自检失败");
    }
  };

  const sendNotice = async () => {
    const values = await noticeForm.validateFields();
    try {
      const result = await circleApi.notificationSend({ body: values });
      message.success(result?.message || "公告已发送");
      setNoticeOpen(false);
      noticeForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "发送失败");
    }
  };

  const saveActivity = async () => {
    const values = await activityForm.validateFields();
    try {
      await circleApi.activitySave({ body: values });
      message.success("活动已保存");
      setActivityOpen(false);
      setActivities(((await circleApi.activities({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const saveMedal = async () => {
    const values = await medalForm.validateFields();
    try {
      await circleApi.medalSave({ body: values });
      message.success("勋章已保存");
      setMedalOpen(false);
      setMedals((await circleApi.medals()) || []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const generate = async () => {
    const values = await aiForm.validateFields();
    try {
      setAiResult((await circleApi.aiGenerate({ body: values })) || null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "AI 生成失败");
    }
  };

  return (
    <>
      <PageHero
        title="圈子社区小程序"
        desc={DESC[tab]}
        extra={
          <>
            <Button icon={<ArrowLeftOutlined aria-hidden />} onClick={() => router.push("/site-builder")}>
              返回工具总览
            </Button>
            {community ? (
              <Button type={community.status === "ONLINE" ? "default" : "primary"} onClick={toggleOnline}>
                {community.status === "ONLINE" ? "下线社区" : "上线社区"}
              </Button>
            ) : null}
          </>
        }
      />
      <ToolLaunchBanner tool="circle" />
      <ColumnSwitch value={tab} onChange={setTab} options={TABS} />

      {tab === "overview" ? (
        <Panel title="社区看板">
          {overview ? (
            <Space size="large" wrap>
              <Statistic title="成员" value={overview.counts.users} />
              <Statistic title="圈子" value={overview.counts.groups} />
              <Statistic title="帖子" value={overview.counts.posts} />
              <Statistic title="评论" value={overview.counts.comments} />
              <Statistic title="待审帖子" value={overview.counts.pendingPosts} />
              <Statistic title="待审圈子" value={overview.counts.pendingGroups} />
              <Statistic title="待处理举报" value={overview.counts.pendingReports} />
              <Statistic title="今日新增成员" value={overview.today.users} />
              <Statistic title="今日帖子" value={overview.today.posts} />
              <Statistic title="今日评论" value={overview.today.comments} />
              <Statistic title="近30天访问" value={overview.usage.pv} />
              <Statistic title="近30天浏览" value={overview.usage.views} />
            </Space>
          ) : (
            <Typography.Text type="secondary">正在读取看板…</Typography.Text>
          )}
        </Panel>
      ) : null}

      {tab === "settings" ? (
        <Panel
          title="社区设置"
          extra={<Button onClick={() => setNoticeOpen(true)}>发系统公告</Button>}
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="账号负责人就是本社区的管理员；C 端成员是社区自己的用户，与站内账号隔离。"
          />
          <Form form={form} layout="vertical" initialValues={{ themeColor: "#1677ff" }}>
            <Space size="large" wrap>
              <Form.Item name="name" label="社区名称" rules={[{ required: true, max: 40 }]}>
                <Input style={{ width: 260 }} />
              </Form.Item>
              <Form.Item name="themeColor" label="主题色">
                <Input style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="slogan" label="一句话标语">
                <Input style={{ width: 300 }} />
              </Form.Item>
            </Space>
            <Space size="large" wrap>
              <Form.Item label="Logo">
                <Space>
                  <Button onClick={() => setPickerFor("logo")}>从数字资产选择</Button>
                  <Form.Item name="logo" noStyle>
                    <Input style={{ width: 300 }} placeholder="也可直接粘贴图片地址" />
                  </Form.Item>
                </Space>
              </Form.Item>
              <Form.Item label="封面">
                <Space>
                  <Button onClick={() => setPickerFor("cover")}>从数字资产选择</Button>
                  <Form.Item name="cover" noStyle>
                    <Input style={{ width: 300 }} placeholder="也可直接粘贴图片地址" />
                  </Form.Item>
                </Space>
              </Form.Item>
            </Space>
            <Form.Item name="intro" label="社区简介">
              <Input.TextArea rows={3} maxLength={2000} />
            </Form.Item>
            <Form.Item name="notice" label="社区公告">
              <Input.TextArea rows={3} maxLength={1000} />
            </Form.Item>
            <Space size="large" wrap>
              <Form.Item name="deskSiteKey" label="绑定 AI 客服站点">
                <Select
                  allowClear
                  style={{ width: 300 }}
                  placeholder="不启用在线客服"
                  options={deskOptions}
                />
              </Form.Item>
              <Form.Item name="servicePhone" label="客服电话">
                <Input style={{ width: 200 }} />
              </Form.Item>
              <Form.Item name="serviceWechat" label="客服微信">
                <Input style={{ width: 200 }} />
              </Form.Item>
            </Space>
            <Space size="large" wrap>
              <Form.Item name="joinApproval" label="加入圈子需圈主审核" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="allowUserCreateCircle" label="允许成员申请建圈" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="postReview" label="发帖需管理员审核" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="commentReview" label="评论需管理员审核" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="aiAssistantEnabled" label="启用 AI 运营助手" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Space>
            <Form.Item name="agreement" label="社区协议">
              <Input.TextArea rows={3} maxLength={20000} />
            </Form.Item>
            <Form.Item name="privacy" label="隐私说明">
              <Input.TextArea rows={3} maxLength={20000} />
            </Form.Item>
            <Form.Item name="about" label="关于我们">
              <Input.TextArea rows={3} maxLength={20000} />
            </Form.Item>
            <Button type="primary" onClick={saveCommunity}>
              保存设置
            </Button>
          </Form>
        </Panel>
      ) : null}

      {tab === "categories" ? (
        <Panel
          title="分类"
          extra={
            <Button
              type="primary"
              onClick={() => {
                categoryForm.resetFields();
                setCategoryOpen(true);
              }}
            >
              新建分类
            </Button>
          }
         
        >
          <Table<CircleCategory>
            rowKey="id"
            dataSource={categories}
            pagination={false}
            columns={[
              { title: "名称", dataIndex: "name" },
              { title: "排序", dataIndex: "sort", width: 100 },
              { title: "圈子数", dataIndex: "groupCount", width: 100 },
              {
                title: "状态",
                dataIndex: "enabled",
                width: 100,
                render: (value: boolean) =>
                  value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
              },
              {
                title: "操作",
                width: 220,
                render: (_, row) => (
                  <Space>
                    <Button
                      size="small"
                      onClick={() => {
                        categoryForm.setFieldsValue(row);
                        setCategoryOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() =>
                        modal.confirm({
                          title: `删除分类「${row.name}」？`,
                          onOk: async () => {
                            await circleApi.categoryRemove({ body: { id: row.id } });
                            message.success("已删除");
                            setCategories((await circleApi.categories()) || []);
                          },
                        })
                      }
                    >
                      删除
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "groups" ? (
        <Panel
          title="圈子"
          extra={
            <Button
              type="primary"
              onClick={() => {
                groupForm.resetFields();
                setGroupOpen(true);
              }}
            >
              新建圈子
            </Button>
          }
        >
          <Table<CircleGroup>
            rowKey="id"
            dataSource={groups}
            pagination={false}
            columns={[
              { title: "圈子", dataIndex: "name" },
              { title: "分类", dataIndex: "categoryName", width: 120 },
              {
                title: "圈主",
                width: 140,
                render: (_, row) => row.creator.nickname,
              },
              {
                title: "成员/帖子",
                width: 120,
                render: (_, row) => `${row.memberCount} / ${row.postCount}`,
              },
              {
                title: "状态",
                dataIndex: "status",
                width: 100,
                render: (value: string) => (
                  <Tag
                    color={
                      value === "ACTIVE"
                        ? "green"
                        : value === "PENDING"
                          ? "orange"
                          : value === "REJECTED"
                            ? "red"
                            : "default"
                    }
                  >
                    {CIRCLE_GROUP_STATUS_LABELS[value] || value}
                  </Tag>
                ),
              },
              {
                title: "推荐",
                width: 90,
                render: (_, row) => (
                  <Switch
                    checked={row.isRecommended}
                    onChange={(checked) =>
                      void groupAction(
                        () =>
                          circleApi.groupRecommend({
                            body: { id: row.id, recommended: checked },
                          }),
                        "已更新推荐",
                      )
                    }
                  />
                ),
              },
              {
                title: "操作",
                width: 260,
                render: (_, row) => (
                  <Space wrap>
                    {row.status === "PENDING" ? (
                      <>
                        <Button
                          size="small"
                          type="primary"
                          onClick={() =>
                            void groupAction(
                              () => circleApi.groupAudit({ body: { id: row.id, approve: true, note: "" } }),
                              "已通过",
                            )
                          }
                        >
                          通过
                        </Button>
                        <Button
                          size="small"
                          danger
                          onClick={() =>
                            void groupAction(
                              () => circleApi.groupAudit({ body: { id: row.id, approve: false, note: "内容不符合社区规范" } }),
                              "已驳回",
                            )
                          }
                        >
                          驳回
                        </Button>
                      </>
                    ) : null}
                    <Button
                      size="small"
                      danger={row.status === "ACTIVE"}
                      onClick={() =>
                        void groupAction(
                          () =>
                            circleApi.groupStatus({
                              body: { id: row.id, status: row.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
                            }),
                          "已更新状态",
                        )
                      }
                    >
                      {row.status === "ACTIVE" ? "停用" : "启用"}
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() =>
                        modal.confirm({
                          title: `删除圈子「${row.name}」？`,
                          content: "圈子下还有帖子时会被拒绝；无帖子时会连同成员与关注一起删除。",
                          onOk: () =>
                            groupAction(
                              () => circleApi.groupRemove({ body: { id: row.id } }),
                              "已删除",
                            ),
                        })
                      }
                    >
                      删除
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "posts" ? (
        <Panel title="帖子">
          <Table<CirclePost>
            rowKey="id"
            dataSource={posts}
            pagination={false}
            columns={[
              {
                title: "内容",
                render: (_, row) => (
                  <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ maxWidth: 360, marginBottom: 0 }}>
                    {row.content}
                  </Typography.Paragraph>
                ),
              },
              { title: "圈子", dataIndex: "groupName", width: 140 },
              { title: "作者", width: 120, render: (_, row) => row.author.nickname },
              {
                title: "互动",
                width: 140,
                render: (_, row) => `赞 ${row.likeCount} · 评 ${row.commentCount} · 看 ${row.viewCount}`,
              },
              {
                title: "状态",
                dataIndex: "status",
                width: 100,
                render: (value: string) => (
                  <Tag
                    color={
                      value === "PUBLISHED"
                        ? "green"
                        : value === "PENDING"
                          ? "orange"
                          : value === "REJECTED"
                            ? "red"
                            : "default"
                    }
                  >
                    {CIRCLE_POST_STATUS_LABELS[value] || value}
                  </Tag>
                ),
              },
              {
                title: "操作",
                width: 300,
                render: (_, row) => (
                  <Space wrap>
                    {row.status === "PENDING" ? (
                      <Button
                        size="small"
                        type="primary"
                        onClick={() =>
                          void postAction(
                            () => circleApi.postAudit({ body: { id: row.id, approve: true, note: "" } }),
                            "已通过",
                          )
                        }
                      >
                        通过
                      </Button>
                    ) : null}
                    <Button
                      size="small"
                      onClick={() =>
                        void postAction(
                          () => circleApi.postPin({ body: { id: row.id, pinned: !row.isPinned } }),
                          "已更新置顶",
                        )
                      }
                    >
                      {row.isPinned ? "取消置顶" : "置顶"}
                    </Button>
                    <Button
                      size="small"
                      onClick={() =>
                        void postAction(
                          () => circleApi.postFeature({ body: { id: row.id, featured: !row.isFeatured } }),
                          "已更新精选",
                        )
                      }
                    >
                      {row.isFeatured ? "取消精选" : "精选"}
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() =>
                        modal.confirm({
                          title: "删除这条帖子？",
                          content: "删除后成员端不可见，数据保留在库中供审计。",
                          onOk: () =>
                            postAction(
                              () => circleApi.postRemove({ body: { id: row.id } }),
                              "已删除",
                            ),
                        })
                      }
                    >
                      删除
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "topics" ? (
        <Panel
          title="话题"
          extra={
            <Button
              type="primary"
              onClick={() => {
                topicForm.resetFields();
                setTopicOpen(true);
              }}
            >
              新建话题
            </Button>
          }
        >
          <Table<CircleTopic>
            rowKey="id"
            dataSource={topics}
            pagination={false}
            columns={[
              { title: "话题", dataIndex: "name" },
              { title: "说明", dataIndex: "description", ellipsis: true },
              { title: "帖子数", dataIndex: "postCount", width: 100 },
              { title: "排序", dataIndex: "sort", width: 90 },
              {
                title: "状态",
                dataIndex: "enabled",
                width: 100,
                render: (value: boolean) => (value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
              },
              {
                title: "操作",
                width: 200,
                render: (_, row) => (
                  <Space>
                    <Button
                      size="small"
                      onClick={() => {
                        topicForm.setFieldsValue(row);
                        setTopicOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() =>
                        modal.confirm({
                          title: `删除话题「${row.name}」？`,
                          onOk: async () => {
                            await circleApi.topicRemove({ body: { id: row.id } });
                            setTopics((await circleApi.topics()) || []);
                            message.success("已删除");
                          },
                        })
                      }
                    >
                      删除
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "comments" ? (
        <Panel title="评论">
          <Table<CircleComment>
            rowKey="id"
            dataSource={comments}
            pagination={false}
            columns={[
              { title: "内容", dataIndex: "content", ellipsis: true },
              { title: "作者", width: 130, render: (_, row) => row.user.nickname },
              { title: "帖子", dataIndex: "postId", width: 90 },
              { title: "赞", dataIndex: "likeCount", width: 80 },
              {
                title: "状态",
                dataIndex: "status",
                width: 100,
                render: (value: string) => (
                  <Tag color={value === "PUBLISHED" ? "green" : value === "PENDING" ? "orange" : "default"}>
                    {value === "PUBLISHED" ? "已发布" : value === "PENDING" ? "待审核" : value === "HIDDEN" ? "已隐藏" : "已删除"}
                  </Tag>
                ),
              },
              {
                title: "操作",
                width: 260,
                render: (_, row) => (
                  <Space>
                    {row.status === "PENDING" ? (
                      <Button
                        size="small"
                        type="primary"
                        onClick={() =>
                          void (async () => {
                            await circleApi.commentStatus({ body: { id: row.id, status: "PUBLISHED" } });
                            setComments(((await circleApi.comments({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
                            message.success("已通过");
                          })()
                        }
                      >
                        通过
                      </Button>
                    ) : null}
                    <Button
                      size="small"
                      onClick={() =>
                        void (async () => {
                          await circleApi.commentStatus({ body: { id: row.id, status: "HIDDEN" } });
                          setComments(((await circleApi.comments({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
                          message.success("已隐藏");
                        })()
                      }
                    >
                      隐藏
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() =>
                        modal.confirm({
                          title: "删除这条评论及其回复？",
                          onOk: async () => {
                            await circleApi.commentRemove({ body: { id: row.id } });
                            setComments(((await circleApi.comments({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
                            message.success("已删除");
                          },
                        })
                      }
                    >
                      删除
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "activities" ? (
        <Panel
          title="活动"
          extra={
            <Button
              type="primary"
              onClick={() => {
                activityForm.resetFields();
                setActivityOpen(true);
              }}
            >
              新建活动
            </Button>
          }
        >
          <Table<CircleActivity>
            rowKey="id"
            dataSource={activities}
            pagination={false}
            columns={[
              { title: "活动", dataIndex: "title" },
              { title: "圈子", dataIndex: "groupName", width: 140 },
              { title: "开始", dataIndex: "startAt", width: 180, render: (v: string) => fmt(v) },
              {
                title: "报名",
                width: 100,
                render: (_, row) => `${row.joinCount}/${row.capacity || "不限"}`,
              },
              {
                title: "状态",
                dataIndex: "status",
                width: 100,
                render: (value: string) => (
                  <Tag color={value === "ACTIVE" ? "green" : value === "DRAFT" ? "default" : "orange"}>
                    {CIRCLE_ACTIVITY_STATUS_LABELS[value] || value}
                  </Tag>
                ),
              },
              {
                title: "操作",
                width: 260,
                render: (_, row) => (
                  <Space>
                    <Button
                      size="small"
                      onClick={() => {
                        activityForm.setFieldsValue({
                          ...row,
                          startAt: row.startAt?.slice(0, 16),
                          endAt: row.endAt?.slice(0, 16),
                        });
                        setActivityOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      size="small"
                      onClick={() =>
                        void (async () => {
                          await circleApi.activityStatus({
                            body: { id: row.id, status: row.status === "ACTIVE" ? "CLOSED" : "ACTIVE" },
                          });
                          setActivities(((await circleApi.activities({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
                          message.success("已更新");
                        })()
                      }
                    >
                      {row.status === "ACTIVE" ? "结束" : "开放"}
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() =>
                        modal.confirm({
                          title: `删除活动「${row.title}」？`,
                          onOk: async () => {
                            await circleApi.activityRemove({ body: { id: row.id } });
                            setActivities(((await circleApi.activities({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
                            message.success("已删除");
                          },
                        })
                      }
                    >
                      删除
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "medals" ? (
        <Panel
          title="勋章"
          extra={
            <Button
              type="primary"
              onClick={() => {
                medalForm.resetFields();
                setMedalOpen(true);
              }}
            >
              新建勋章
            </Button>
          }
        >
          <Table<CircleMedal>
            rowKey="id"
            dataSource={medals}
            pagination={false}
            columns={[
              { title: "勋章", dataIndex: "name" },
              {
                title: "条件",
                width: 180,
                render: (_, row) => `${CIRCLE_MEDAL_TYPE_LABELS[row.type] || row.type} ≥ ${row.threshold}`,
              },
              {
                title: "启用",
                width: 100,
                render: (_, row) => (
                  <Switch
                    checked={row.enabled}
                    onChange={(checked) =>
                      void (async () => {
                        await circleApi.medalSave({ body: { ...row, enabled: checked } });
                        setMedals((await circleApi.medals()) || []);
                        message.success("已更新");
                      })()
                    }
                  />
                ),
              },
              {
                title: "操作",
                width: 180,
                render: (_, row) => (
                  <Space>
                    <Button
                      size="small"
                      onClick={() => {
                        medalForm.setFieldsValue(row);
                        setMedalOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() =>
                        modal.confirm({
                          title: `删除勋章「${row.name}」？`,
                          onOk: async () => {
                            await circleApi.medalRemove({ body: { id: row.id } });
                            setMedals((await circleApi.medals()) || []);
                            message.success("已删除");
                          },
                        })
                      }
                    >
                      删除
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "reports" ? (
        <Panel title="举报">
          <Table<CircleReport>
            rowKey="id"
            dataSource={reports}
            pagination={false}
            columns={[
              { title: "类型", dataIndex: "targetType", width: 100 },
              { title: "对象", dataIndex: "targetId", width: 100 },
              { title: "原因", dataIndex: "reason", width: 160 },
              { title: "说明", dataIndex: "detail", ellipsis: true },
              { title: "举报人", width: 130, render: (_, row) => row.reporter.nickname },
              {
                title: "状态",
                dataIndex: "status",
                width: 100,
                render: (value: string) => (
                  <Tag color={value === "PENDING" ? "orange" : value === "RESOLVED" ? "green" : "default"}>
                    {CIRCLE_REPORT_STATUS_LABELS[value] || value}
                  </Tag>
                ),
              },
              {
                title: "操作",
                width: 300,
                render: (_, row) =>
                  row.status !== "PENDING" ? (
                    <Typography.Text type="secondary">{row.action || "已处理"}</Typography.Text>
                  ) : (
                    <Space wrap>
                      <Button
                        size="small"
                        onClick={() =>
                          void (async () => {
                            await circleApi.reportHandle({
                              body: { id: row.id, action: "HIDE", note: "举报核实隐藏" },
                            });
                            setReports(((await circleApi.reports({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
                            message.success("已隐藏");
                          })()
                        }
                      >
                        隐藏
                      </Button>
                      <Button
                        size="small"
                        danger
                        onClick={() =>
                          void (async () => {
                            await circleApi.reportHandle({
                              body: { id: row.id, action: "DELETE", note: "举报核实删除" },
                            });
                            setReports(((await circleApi.reports({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
                            message.success("已删除");
                          })()
                        }
                      >
                        删除
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          void (async () => {
                            await circleApi.reportHandle({ body: { id: row.id, action: "REJECT", note: "" } });
                            setReports(((await circleApi.reports({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
                            message.success("已驳回举报");
                          })()
                        }
                      >
                        驳回
                      </Button>
                    </Space>
                  ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "users" ? (
        <Panel title="成员">
          <Table<CircleUser>
            rowKey="id"
            dataSource={users}
            pagination={false}
            columns={[
              { title: "昵称", dataIndex: "nickname" },
              { title: "简介", dataIndex: "bio", ellipsis: true },
              { title: "帖子", dataIndex: "postCount", width: 80 },
              { title: "粉丝", dataIndex: "followerCount", width: 80 },
              {
                title: "状态",
                dataIndex: "status",
                width: 100,
                render: (value: string) => (
                  <Tag color={value === "ACTIVE" ? "green" : value === "MUTED" ? "orange" : "red"}>
                    {CIRCLE_USER_STATUS_LABELS[value] || value}
                  </Tag>
                ),
              },
              {
                title: "操作",
                width: 220,
                render: (_, row) => (
                  <Space>
                    <Button
                      size="small"
                      onClick={() =>
                        void (async () => {
                          await circleApi.userStatus({
                            body: { id: row.id, status: row.status === "MUTED" ? "ACTIVE" : "MUTED" },
                          });
                          setUsers(((await circleApi.users({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
                          message.success("已更新");
                        })()
                      }
                    >
                      {row.status === "MUTED" ? "解除禁言" : "禁言"}
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() =>
                        modal.confirm({
                          title: `封禁成员「${row.nickname}」？`,
                          content: "封禁只影响本社区；成员无法再登录与互动。",
                          onOk: async () => {
                            await circleApi.userStatus({ body: { id: row.id, status: "BANNED" } });
                            setUsers(((await circleApi.users({ query: { page: 1, pageSize: 50 } })) || { list: [] }).list);
                            message.success("已封禁");
                          },
                        })
                      }
                    >
                      封禁
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === "ai" ? (
        <Panel title="AI 运营助手">
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="AI 调用统一走平台模型网关；未配置模型时请到「模型服务 → 模型设置」选择渠道。"
          />
          <Form form={aiForm} layout="vertical" initialValues={{ action: "NOTICE", prompt: "" }}>
            <Form.Item name="action" label="生成类型">
              <Select
                style={{ width: 240 }}
                options={[
                  { value: "NOTICE", label: "社区公告" },
                  { value: "GROUP_INTRO", label: "圈子简介" },
                  { value: "POST_SUMMARY", label: "帖子摘要" },
                  { value: "HOT_DIGEST", label: "社区周报" },
                ]}
              />
            </Form.Item>
            <Form.Item name="groupId" label="关联圈子（可选）">
              <Select
                allowClear
                style={{ width: 320 }}
                options={groups.map((row) => ({ value: row.id, label: row.name }))}
              />
            </Form.Item>
            <Form.Item name="prompt" label="补充要求">
              <Input.TextArea rows={3} maxLength={2000} />
            </Form.Item>
            <Space>
              <Button type="primary" icon={<RobotOutlined />} onClick={generate}>
                生成
              </Button>
              <Button
                onClick={() =>
                  navigator.clipboard?.writeText(aiResult?.text || "").then(
                    () => message.success("已复制"),
                    () => message.error("复制失败"),
                  )
                }
                disabled={!aiResult}
              >
                复制结果
              </Button>
            </Space>
          </Form>
          {aiResult ? (
            <Panel title={`生成结果（${aiResult.model}）`}>
              <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{aiResult.text}</Typography.Paragraph>
            </Panel>
          ) : null}
        </Panel>
      ) : null}

      {tab === "publish" ? (
        <Panel title="发布">
          <Panel title="小程序凭据">
            <Form form={credentialForm} layout="vertical">
              <Space size="large" wrap align="start">
                <Form.Item name="appId" label="AppID" rules={[{ max: 64 }]}>
                  <Input style={{ width: 300 }} placeholder="wx 开头的 18 位 AppID" />
                </Form.Item>
                <Form.Item name="appSecret" label="AppSecret（留空保留原值）">
                  <Input.Password style={{ width: 300 }} autoComplete="new-password" />
                </Form.Item>
              </Space>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                订阅消息模板 ID（可选）：按微信模板字段 <Typography.Text code>thing1</Typography.Text> /
                <Typography.Text code>thing2</Typography.Text> / <Typography.Text code>time3</Typography.Text> 发送；
                未配置时只发站内消息。
              </Typography.Paragraph>
              <Space size="large" wrap>
                <Form.Item name={["templates", "circleComment"]} label="评论/回复提醒">
                  <Input style={{ width: 260 }} />
                </Form.Item>
                <Form.Item name={["templates", "circleLike"]} label="点赞提醒">
                  <Input style={{ width: 260 }} />
                </Form.Item>
                <Form.Item name={["templates", "circleAudit"]} label="审核结果提醒">
                  <Input style={{ width: 260 }} />
                </Form.Item>
                <Form.Item name={["templates", "circleActivity"]} label="活动提醒">
                  <Input style={{ width: 260 }} />
                </Form.Item>
              </Space>
              <Space>
                <Button type="primary" onClick={saveCredentials}>
                  保存凭据
                </Button>
                <Button onClick={testApp}>连通自检</Button>
                {appTest ? (
                  <Tag color={appTest.ok ? "green" : "red"}>
                    {appTest.ok ? "凭据可用" : appTest.message || "自检失败"}
                  </Tag>
                ) : null}
              </Space>
            </Form>
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              正式上线前还需在微信公众平台登记 request / uploadFile / downloadFile 合法域名；
              使用 AI 客服 web-view 时还要登记业务域名。平台不代编译、不代传。
            </Typography.Paragraph>
          </Panel>

          <MiniProgramPublishGuide tool="circle" />
        </Panel>
      ) : null}

      <Modal
        title="新建/编辑圈子"
        open={groupOpen}
        onCancel={() => setGroupOpen(false)}
        onOk={saveGroup}
        destroyOnHidden
      >
        <Form form={groupForm} layout="vertical" initialValues={{ joinMode: "APPROVAL" }}>
          <Form.Item name="id" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item name="categoryId" label="分类" rules={[{ required: true }]}>
            <Select options={categories.map((row) => ({ value: row.id, label: row.name }))} />
          </Form.Item>
          <Form.Item name="name" label="圈子名称" rules={[{ required: true, max: 40 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="cover" label="封面地址">
            <Input />
          </Form.Item>
          <Form.Item name="intro" label="简介">
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <Form.Item name="rules" label="圈规">
            <Input.TextArea rows={3} maxLength={5000} />
          </Form.Item>
          <Form.Item name="joinMode" label="加入方式">
            <Select options={[{ value: "APPROVAL", label: "申请加入" }, { value: "FREE", label: "自由加入" }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建/编辑话题"
        open={topicOpen}
        onCancel={() => setTopicOpen(false)}
        onOk={saveTopic}
        destroyOnHidden
      >
        <Form form={topicForm} layout="vertical" initialValues={{ sort: 0, enabled: true }}>
          <Form.Item name="id" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item name="name" label="话题名称" rules={[{ required: true, max: 30 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} maxLength={200} />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber min={0} max={9999} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="发送系统公告"
        open={noticeOpen}
        onCancel={() => setNoticeOpen(false)}
        onOk={sendNotice}
        destroyOnHidden
      >
        <Form form={noticeForm} layout="vertical" initialValues={{ title: "社区公告" }}>
          <Form.Item name="title" label="标题" rules={[{ max: 60 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, max: 500 }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建/编辑活动"
        open={activityOpen}
        onCancel={() => setActivityOpen(false)}
        onOk={saveActivity}
        destroyOnHidden
      >
        <Form form={activityForm} layout="vertical" initialValues={{ status: "ACTIVE", capacity: 0, groupId: 0 }}>
          <Form.Item name="id" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item name="title" label="活动标题" rules={[{ required: true, max: 80 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="groupId" label="所属圈子（0＝全社区）">
            <Select options={[{ value: 0, label: "全社区" }].concat(groups.map((row) => ({ value: row.id, label: row.name })))} />
          </Form.Item>
          <Space size="large" wrap>
            <Form.Item name="startAt" label="开始时间" rules={[{ required: true }]}>
              <Input type="datetime-local" style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="endAt" label="结束时间">
              <Input type="datetime-local" style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="capacity" label="人数上限（0＝不限）">
              <InputNumber min={0} max={100000} />
            </Form.Item>
          </Space>
          <Form.Item name="address" label="地点">
            <Input />
          </Form.Item>
          <Form.Item name="cover" label="封面地址">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="活动说明">
            <Input.TextArea rows={4} maxLength={5000} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={Object.entries(CIRCLE_ACTIVITY_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建/编辑勋章"
        open={medalOpen}
        onCancel={() => setMedalOpen(false)}
        onOk={saveMedal}
        destroyOnHidden
      >
        <Form form={medalForm} layout="vertical" initialValues={{ type: "POST", threshold: 10, enabled: true, sort: 0 }}>
          <Form.Item name="id" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item name="name" label="勋章名称" rules={[{ required: true, max: 30 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="icon" label="图标地址">
            <Input />
          </Form.Item>
          <Form.Item name="type" label="条件类型">
            <Select options={Object.entries(CIRCLE_MEDAL_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="threshold" label="阈值">
            <InputNumber min={1} max={1000000} />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber min={0} max={9999} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <AssetReferencePicker
        open={!!pickerFor}
        existingUrls={[]}
        mediaTypes={["image"]}
        onCancel={() => setPickerFor(null)}
        onPick={(assets) => {
          const url = assets[0]?.url || "";
          if (pickerFor && url) form.setFieldValue(pickerFor, url);
          setPickerFor(null);
        }}
      />

      <Modal
        title="新建/编辑分类"
        open={categoryOpen}
        onCancel={() => setCategoryOpen(false)}
        onOk={saveCategory}
        destroyOnHidden
      >
        <Form form={categoryForm} layout="vertical" initialValues={{ sort: 0, enabled: true }}>
          <Form.Item name="id" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, max: 30 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="icon" label="图标地址">
            <Input />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber min={0} max={9999} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}