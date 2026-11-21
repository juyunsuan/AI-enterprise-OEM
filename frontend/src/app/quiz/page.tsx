"use client";

import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  TableOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  QuizAttempt,
  QuizBank,
  QuizMaterial,
  QuizParticipant,
  QuizParticipantStatus,
  QuizQuestion,
  QuizQuestionType,
  QuizRankRow,
  QuizSite,
} from "@enterprise/contracts";
import {
  QUIZ_BANK_STATUS_LABELS,
  QUIZ_PARTICIPANT_STATUS_LABELS,
  QUIZ_QUESTION_TYPE_LABELS,
} from "@enterprise/contracts";
import { quizApi } from "@/api/quiz";
import { serviceDeskApi } from "@/api/collab";
import { AssetReferencePicker } from "@/components/content/asset-reference-picker";
import { PageHero, Panel, Notice } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";
import { fmtTime } from "@/lib/datetime";

type PickerFor = "siteCover" | "bankCover" | "questionImage" | "material" | null;

const TYPE_OPTIONS = (Object.keys(QUIZ_QUESTION_TYPE_LABELS) as QuizQuestionType[]).map(
  (value) => ({ value, label: QUIZ_QUESTION_TYPE_LABELS[value] }),
);

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "default",
  PUBLISHED: "processing",
  CLOSED: "success",
};

const PARTICIPANT_COLOR: Record<QuizParticipantStatus, string> = {
  PENDING: "gold",
  APPROVED: "green",
  REJECTED: "red",
};

const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"] as const;

function durationText(seconds: number) {
  const value = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(value / 60)}分${value % 60}秒`;
}

function defaultSiteForm(site: QuizSite | null) {
  return {
    name: site?.name || "",
    slogan: site?.slogan || "",
    themeColor: site?.themeColor || "#1bd0ad",
    coverUrl: site?.coverUrl || "",
    deskSiteKey: site?.deskSiteKey || "",
    aiEnabled: site?.aiEnabled !== false,
    registerRequired: site?.settings.registerRequired !== false,
    checkUser: site?.settings.checkUser === true,
    allowPractice: site?.settings.allowPractice !== false,
    allowExam: site?.settings.allowExam !== false,
  };
}

export default function QuizPage() {
  return <QuizInner />;
}

function QuizInner() {
  const { message } = App.useApp();
  const [tab, setTab] = useState("banks");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [site, setSite] = useState<QuizSite | null>(null);
  const [banks, setBanks] = useState<QuizBank[]>([]);
  const [deskSites, setDeskSites] = useState<{ siteKey: string; name: string }[]>([]);
  const [materials, setMaterials] = useState<QuizMaterial[]>([]);

  const [siteForm] = Form.useForm();
  const [bankForm] = Form.useForm();
  const [questionForm] = Form.useForm();

  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<QuizBank | null>(null);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [optionInputs, setOptionInputs] = useState<string[]>(["", "", "", "", "", ""]);
  const [pickerFor, setPickerFor] = useState<PickerFor>(null);
  const siteCover = Form.useWatch("coverUrl", siteForm);

  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [results, setResults] = useState<QuizAttempt[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [rank, setRank] = useState<QuizRankRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [participants, setParticipants] = useState<QuizParticipant[]>([]);
  const [participantTotal, setParticipantTotal] = useState(0);
  const [participantStatus, setParticipantStatus] = useState<QuizParticipantStatus | "">(
    "PENDING",
  );
  const [participantKeyword, setParticipantKeyword] = useState("");
  const [reviewTarget, setReviewTarget] = useState<QuizParticipant | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [packaging, setPackaging] = useState(false);

  const selectedBank = useMemo(
    () => banks.find((item) => item.id === selectedBankId) || null,
    [banks, selectedBankId],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [siteRow, bankRows] = await Promise.all([quizApi.site(), quizApi.banks()]);
      const safeBanks = bankRows || [];
      setSite(siteRow);
      setBanks(safeBanks);
      setMaterials(siteRow?.materials || []);
      siteForm.setFieldsValue(defaultSiteForm(siteRow));
      if (!selectedBankId && safeBanks.length) setSelectedBankId(safeBanks[0].id);
    } catch (err) {
      setError((err as Error).message || "答题配置加载失败");
    } finally {
      setLoading(false);
    }
  }, [selectedBankId, siteForm]);

  useEffect(() => {
    void loadAll();
    serviceDeskApi
      .sites()
      .then((rows) => setDeskSites((rows || []).map((row) => ({ siteKey: row.siteKey, name: row.name }))))
      .catch(() => setDeskSites([]));
  }, [loadAll]);

  const loadDetail = useCallback(async (bankId: number) => {
    setDetailLoading(true);
    try {
      const [questionRows, resultPage, rankRows] = await Promise.all([
        quizApi.questions({ params: { id: String(bankId) } }),
        quizApi.results({ params: { id: String(bankId) }, query: { page: 1, pageSize: 20 } }),
        quizApi.rank({ params: { id: String(bankId) }, query: { limit: 20 } }),
      ]);
      setQuestions(questionRows || []);
      setResults(resultPage?.list || []);
      setResultTotal(resultPage?.total || 0);
      setRank(rankRows || []);
    } catch (err) {
      message.error((err as Error).message || "题库明细加载失败");
    } finally {
      setDetailLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (selectedBankId) void loadDetail(selectedBankId);
  }, [selectedBankId, loadDetail]);

  const loadParticipants = useCallback(async () => {
    if (!site) return;
    try {
      const page = await quizApi.participants({
        query: {
          page: 1,
          pageSize: 100,
          status: participantStatus || undefined,
          keyword: participantKeyword.trim() || undefined,
        },
      });
      setParticipants(page?.list || []);
      setParticipantTotal(page?.total || 0);
    } catch (err) {
      message.error((err as Error).message || "参赛者加载失败");
    }
  }, [message, participantKeyword, participantStatus, site]);

  useEffect(() => {
    if (tab === "participants") void loadParticipants();
  }, [tab, loadParticipants]);

  const openReview = (row: QuizParticipant, status: "APPROVED" | "REJECTED") => {
    setReviewTarget(row);
    setReviewStatus(status);
    setReviewNote("");
  };

  const downloadPackage = async () => {
    setPackaging(true);
    try {
      const file = await quizApi.downloadPackage();
      if (!file?.url) throw new Error("没有拿到源码包地址");
      window.open(file.url, "_blank");
      message.success(`已生成 ${file.fileName}（${(file.fileSize / 1024).toFixed(1)} KB）`);
    } catch (err) {
      message.error((err as Error).message || "源码包生成失败");
    } finally {
      setPackaging(false);
    }
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      await quizApi.reviewParticipant({
        params: { rowId: String(reviewTarget.rowId) },
        body: { status: reviewStatus, note: reviewNote },
      });
      message.success(reviewStatus === "APPROVED" ? "已通过" : "已驳回");
      setReviewTarget(null);
      await loadParticipants();
    } catch (err) {
      message.error((err as Error).message || "审核失败");
    } finally {
      setReviewing(false);
    }
  };

  const saveSite = async () => {
    try {
      const value = await siteForm.validateFields();
      const saved = await quizApi.saveSite({
        body: {
          name: value.name,
          slogan: value.slogan || "",
          themeColor: value.themeColor || "#1bd0ad",
          coverUrl: value.coverUrl || "",
          deskSiteKey: value.deskSiteKey || "",
          aiEnabled: value.aiEnabled !== false,
          materials,
          settings: {
            registerRequired: value.registerRequired !== false,
            checkUser: value.checkUser === true,
            allowPractice: value.allowPractice !== false,
            allowExam: value.allowExam !== false,
          },
        },
      });
      setSite(saved);
      message.success("站点设置已保存");
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return;
      message.error((err as Error).message || "保存失败");
    }
  };

  const openBankModal = (bank: QuizBank | null) => {
    setEditingBank(bank);
    if (bank) {
      bankForm.setFieldsValue({
        title: bank.title,
        description: bank.description,
        coverUrl: bank.coverUrl,
        sort: bank.sort,
        durationSec: bank.settings.durationSec,
        examCount: bank.settings.examCount,
        passScore: bank.settings.passScore,
        randomize: bank.settings.randomize,
        showAnalysis: bank.settings.showAnalysis,
        aiExplain: bank.settings.aiExplain,
      });
    } else {
      bankForm.resetFields();
      bankForm.setFieldsValue({
        sort: 0,
        durationSec: 600,
        examCount: 20,
        passScore: 60,
        randomize: true,
        showAnalysis: true,
        aiExplain: true,
      });
    }
    setBankModalOpen(true);
  };

  const saveBank = async () => {
    try {
      const value = await bankForm.validateFields();
      const body = {
        title: value.title,
        description: value.description || "",
        coverUrl: value.coverUrl || "",
        sort: Number(value.sort) || 0,
        settings: {
          durationSec: Number(value.durationSec) || 600,
          examCount: Number(value.examCount) || 20,
          passScore: Number(value.passScore) || 0,
          randomize: value.randomize !== false,
          showAnalysis: value.showAnalysis !== false,
          aiExplain: value.aiExplain !== false,
        },
      };
      if (editingBank) {
        await quizApi.updateBank({ params: { id: String(editingBank.id) }, body });
        message.success("题库已更新");
      } else {
        const created = await quizApi.createBank({ body });
        if (created?.id) setSelectedBankId(created.id);
        message.success("题库已创建，题目与记录两张多维表格也建好了");
      }
      setBankModalOpen(false);
      await loadAll();
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return;
      message.error((err as Error).message || "保存题库失败");
    }
  };

  const openQuestionModal = (question: QuizQuestion | null) => {
    setEditingQuestion(question);
    if (question) {
      questionForm.setFieldsValue({
        type: question.type,
        title: question.title,
        imageUrl: question.imageUrl,
        answer: question.answer,
        analysis: question.analysis,
        category: question.category,
        sort: question.sort,
      });
      const next = ["", "", "", "", "", ""];
      question.options.forEach((option) => {
        const index = OPTION_KEYS.indexOf(option.key as (typeof OPTION_KEYS)[number]);
        if (index >= 0) next[index] = option.label;
      });
      setOptionInputs(next);
    } else {
      questionForm.resetFields();
      questionForm.setFieldsValue({ type: "single", sort: 0, answer: "A" });
      setOptionInputs(["", "", "", "", "", ""]);
    }
    setQuestionModalOpen(true);
  };

  const saveQuestion = async () => {
    if (!selectedBankId) return;
    try {
      const value = await questionForm.validateFields();
      const type = value.type as QuizQuestionType;
      const options = optionInputs
        .map((label, index) => ({ key: OPTION_KEYS[index], label: label.trim(), imageUrl: "" }))
        .filter((item) => item.label);
      if (type !== "judge" && !options.length) {
        message.warning("请至少填写一个选项");
        return;
      }
      const body = {
        type,
        title: value.title,
        imageUrl: value.imageUrl || "",
        options,
        answer: value.answer,
        analysis: value.analysis || "",
        category: value.category || "",
        sort: Number(value.sort) || 0,
      };
      if (editingQuestion) {
        await quizApi.updateQuestion({
          params: { id: String(selectedBankId), rowId: String(editingQuestion.id) },
          body,
        });
        message.success("题目已更新");
      } else {
        await quizApi.createQuestion({ params: { id: String(selectedBankId) }, body });
        message.success("题目已添加");
      }
      setQuestionModalOpen(false);
      await loadDetail(selectedBankId);
      await loadAll();
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return;
      message.error((err as Error).message || "保存题目失败");
    }
  };

  const removeQuestion = async (question: QuizQuestion) => {
    if (!selectedBankId) return;
    try {
      await quizApi.removeQuestion({
        params: { id: String(selectedBankId), rowId: String(question.id) },
      });
      message.success("题目已删除");
      await loadDetail(selectedBankId);
      await loadAll();
    } catch (err) {
      message.error((err as Error).message || "删除失败");
    }
  };

  const bankAction = async (bank: QuizBank, action: "publish" | "close" | "reopen" | "remove") => {
    try {
      if (action === "publish") await quizApi.publishBank({ params: { id: String(bank.id) } });
      if (action === "close") await quizApi.closeBank({ params: { id: String(bank.id) } });
      if (action === "reopen") await quizApi.reopenBank({ params: { id: String(bank.id) } });
      if (action === "remove") await quizApi.removeBank({ params: { id: String(bank.id) } });
      message.success("操作完成");
      if (action === "remove" && selectedBankId === bank.id) setSelectedBankId(null);
      await loadAll();
    } catch (err) {
      message.error((err as Error).message || "操作失败");
    }
  };

  const bankColumns = [
    {
      title: "题库",
      dataIndex: "title",
      render: (_: unknown, row: QuizBank) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{row.title}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {row.description || "未填写说明"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: QuizBank["status"]) => (
        <Tag color={STATUS_COLOR[value]}>{QUIZ_BANK_STATUS_LABELS[value]}</Tag>
      ),
    },
    { title: "题目", dataIndex: "questionCount", width: 70 },
    { title: "答卷", dataIndex: "attemptCount", width: 70 },
    {
      title: "操作",
      width: 280,
      render: (_: unknown, row: QuizBank) => (
        <Space wrap>
          <Button size="small" onClick={() => setSelectedBankId(row.id)}>
            管理题目
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openBankModal(row)}>
            编辑
          </Button>
          {row.status === "PUBLISHED" ? (
            <Button size="small" onClick={() => void bankAction(row, "close")}>
              关闭
            </Button>
          ) : (
            <Button size="small" type="primary" onClick={() => void bankAction(row, "publish")}>
              发布
            </Button>
          )}
          <Popconfirm
            title="删除题库会同时删除题目与记录两张多维表格，确定吗？"
            onConfirm={() => void bankAction(row, "remove")}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const questionColumns = [
    {
      title: "题型",
      dataIndex: "type",
      width: 80,
      render: (value: QuizQuestionType) => <Tag>{QUIZ_QUESTION_TYPE_LABELS[value]}</Tag>,
    },
    {
      title: "题干",
      dataIndex: "title",
      render: (value: string, row: QuizQuestion) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{value}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {row.options.length} 个选项 · 答案 {row.answer}
            {row.category ? ` · ${row.category}` : ""}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "操作",
      width: 160,
      render: (_: unknown, row: QuizQuestion) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openQuestionModal(row)}>
            编辑
          </Button>
          <Popconfirm title="删除这道题？" onConfirm={() => void removeQuestion(row)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const participantColumns = [
    {
      title: "参赛者",
      dataIndex: "nickname",
      render: (value: string, row: QuizParticipant) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value || "未填昵称"}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {row.company || "未填单位"}
            {row.department ? ` · ${row.department}` : ""}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: QuizParticipantStatus) => (
        <Tag color={PARTICIPANT_COLOR[value]}>
          {QUIZ_PARTICIPANT_STATUS_LABELS[value]}
        </Tag>
      ),
    },
    {
      title: "备注",
      dataIndex: "note",
      render: (value: string) => value || "—",
    },
    {
      title: "提交时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      width: 170,
      render: (_: unknown, row: QuizParticipant) => (
        <Space>
          <Button size="small" type="primary" onClick={() => openReview(row, "APPROVED")}>
            通过
          </Button>
          <Button size="small" danger onClick={() => openReview(row, "REJECTED")}>
            驳回
          </Button>
        </Space>
      ),
    },
  ];

  const resultColumns = [
    { title: "选手", dataIndex: "nickname", render: (value: string) => value || "匿名" },
    { title: "单位", dataIndex: "company" },
    { title: "得分", dataIndex: "score", width: 80 },
    { title: "用时", dataIndex: "durationSec", width: 100, render: (value: number) => durationText(value) },
    { title: "模式", dataIndex: "mode", width: 80 },
    {
      title: "交卷时间",
      dataIndex: "submittedAt",
      width: 170,
      render: (value: string) => fmtTime(value),
    },
  ];

  return (
    <>
      <PageHero
        title="答题小程序"
        desc="做自己的答题/考试小程序：题目与交卷记录都落在账号自己的多维表格，封面与学习资料从数字资产管理选取，AI 出题/解析/复盘走平台模型网关，客服入口绑定已有 AI 客服站点。"
        tabs={[
          { key: "banks", label: "题库与记录" },
          { key: "participants", label: "参赛者" },
          { key: "site", label: "站点设置" },
          { key: "publish", label: "发布说明" },
        ]}
        activeTab={tab}
        onTabChange={setTab}
      />

      {error ? <Notice variant="warn">{error}</Notice> : null}

      {tab === "banks" ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Panel
            title="题库"
            titleExtra={<Typography.Text type="secondary">一个题库 = 一个分类/套题，小程序按题库进入练习与考试。</Typography.Text>}
            extra={
              <Space>
                <Button icon={<ReloadOutlined />} onClick={() => void loadAll()} loading={loading}>
                  刷新
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openBankModal(null)}>
                  新建题库
                </Button>
              </Space>
            }
          >
            <Table
              rowKey="id"
              loading={loading}
              dataSource={banks}
              columns={bankColumns}
              pagination={false}
              locale={{ emptyText: <Empty description="还没有题库，先新建一个" /> }}
              onRow={(row) => ({ onClick: () => setSelectedBankId(row.id) })}
            />
          </Panel>

          <Panel
            title={selectedBank ? `题目与记录 · ${selectedBank.title}` : "题目与记录"}
            titleExtra={
              selectedBank ? (
                <Typography.Text type="secondary">
                  {selectedBank.questionCount} 题 · {selectedBank.attemptCount} 份答卷
                </Typography.Text>
              ) : null
            }
            extra={
              selectedBank ? (
                <Space wrap>
                  <Button icon={<TableOutlined />} href={`/data-table?table=${selectedBank.questionTableId}`}>
                    题目表
                  </Button>
                  <Button icon={<TableOutlined />} href={`/data-table?table=${selectedBank.attemptTableId}`}>
                    记录表
                  </Button>
                  <Button icon={<RobotOutlined />} onClick={() => setAiModalOpen(true)}>
                    AI 出题
                  </Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => openQuestionModal(null)}>
                    添加题目
                  </Button>
                </Space>
              ) : null
            }
          >
            {!selectedBank ? (
              <Empty description="先从上方选一个题库" />
            ) : (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Space size={24} wrap>
                  <Statistic title="题目数" value={selectedBank.questionCount} />
                  <Statistic title="答卷数" value={selectedBank.attemptCount} />
                  <Statistic
                    title="考试时长"
                    value={durationText(selectedBank.settings.durationSec)}
                  />
                  <Statistic title="每次抽题" value={selectedBank.settings.examCount} />
                  <Statistic title="及格分" value={selectedBank.settings.passScore} />
                </Space>
                <Table
                  rowKey="id"
                  loading={detailLoading}
                  dataSource={questions}
                  columns={questionColumns}
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  locale={{ emptyText: <Empty description="还没有题目，手动添加或用 AI 出题" /> }}
                />
                <Panel
                  title="答题记录"
                  titleExtra={<Typography.Text type="secondary">共 {resultTotal} 份；一行一次交卷，可在多维表格里筛选导出。</Typography.Text>}
                >
                  <Table
                    rowKey="id"
                    loading={detailLoading}
                    dataSource={results}
                    columns={resultColumns}
                    pagination={false}
                    locale={{ emptyText: <Empty description="还没有人交卷" /> }}
                  />
                </Panel>
                <Panel
                  title="排行榜"
                  titleExtra={<Typography.Text type="secondary">按最高分、同分用时最短排序。</Typography.Text>}
                >
                  {rank.length ? (
                    <Space direction="vertical" size={6} style={{ width: "100%" }}>
                      {rank.map((row) => (
                        <Space key={row.participantId} style={{ width: "100%", justifyContent: "space-between" }}>
                          <Space>
                            <Tag color={row.rank <= 3 ? "gold" : "default"}>{row.rank}</Tag>
                            <Typography.Text strong>{row.nickname}</Typography.Text>
                            <Typography.Text type="secondary">{row.bestScore} 分</Typography.Text>
                          </Space>
                          <Typography.Text type="secondary">
                            {durationText(row.bestDurationSec)} · {row.attempts} 次
                          </Typography.Text>
                        </Space>
                      ))}
                    </Space>
                  ) : (
                    <Empty description="还没有排名数据" />
                  )}
                </Panel>
              </Space>
            )}
          </Panel>
        </Space>
      ) : null}

      {tab === "participants" ? (
        <Panel
          title="参赛者审核"
          titleExtra={
            <Typography.Text type="secondary">
              资料落在「参赛者」多维表格；审核通过后才能开始练习或考试。
            </Typography.Text>
          }
          extra={
            <Space>
              <Select
                value={participantStatus}
                onChange={(value) => setParticipantStatus(value)}
                style={{ width: 120 }}
                options={[
                  { value: "", label: "全部" },
                  { value: "PENDING", label: "待审核" },
                  { value: "APPROVED", label: "已通过" },
                  { value: "REJECTED", label: "已驳回" },
                ]}
              />
              <Input.Search
                allowClear
                placeholder="昵称 / 单位 / 部门"
                onSearch={(value) => setParticipantKeyword(value)}
                style={{ width: 220 }}
              />
              <Button icon={<ReloadOutlined />} onClick={() => void loadParticipants()}>
                刷新
              </Button>
            </Space>
          }
        >
          {!site ? (
            <Empty description="先保存站点设置" />
          ) : (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              {!site.settings.checkUser ? (
                <Notice variant="info">
                  审核制未开启：参赛者提交资料即视为通过。打开「站点设置 → 审核制标记」后，
                  新提交与重新提交的资料会进入待审核。
                </Notice>
              ) : null}
              <Typography.Text type="secondary">
                共 {participantTotal} 人；审核会写入多维表格并留痕。
              </Typography.Text>
              <Table
                rowKey="rowId"
                dataSource={participants}
                columns={participantColumns}
                pagination={false}
                locale={{ emptyText: <Empty description="还没有参赛者提交资料" /> }}
              />
            </Space>
          )}
        </Panel>
      ) : null}

      {tab === "site" ? (
        <Panel
          title="站点设置"
          titleExtra={<Typography.Text type="secondary">这些配置会随小程序启动接口下发，改完不用重出包。</Typography.Text>}
          extra={
            <Button type="primary" onClick={() => void saveSite()}>
              保存设置
            </Button>
          }
        >
          <Form form={siteForm} layout="vertical" initialValues={defaultSiteForm(null)}>
            <Card size="small" title="门面" style={{ marginBottom: 16 }}>
              <Form.Item name="name" label="小程序名称" rules={[{ required: true, max: 120 }]}>
                <Input placeholder="如：智汇答题" />
              </Form.Item>
              <Form.Item name="slogan" label="一句话介绍">
                <Input maxLength={200} placeholder="如：每天进步一点点" />
              </Form.Item>
              <Form.Item name="themeColor" label="主题色">
                <Input placeholder="#1bd0ad" />
              </Form.Item>
              <Form.Item name="coverUrl" label="首页封面">
                <Space.Compact style={{ width: "100%" }}>
                  <Input placeholder="可从数字资产管理选择图片" />
                  <Button icon={<LinkOutlined />} onClick={() => setPickerFor("siteCover")}>
                    选择
                  </Button>
                </Space.Compact>
              </Form.Item>
              {siteCover ? (
                <RawImg
                  src={siteCover}
                  alt="站点封面"
                  style={{ width: 180, borderRadius: 8 }}
                />
              ) : null}
            </Card>

            <Card size="small" title="参赛与模式" style={{ marginBottom: 16 }}>
              <Space size={24} wrap>
                <Form.Item name="registerRequired" label="先填资料再答题" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item name="checkUser" label="审核制标记" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item name="allowPractice" label="开放练习" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item name="allowExam" label="开放考试" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item name="aiEnabled" label="AI 解析/复盘" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Space>
              <Typography.Text type="secondary">
                审核制开启后，参赛者提交资料会进入「参赛者」页签待审核；通过后才能练习/考试。
              </Typography.Text>
              <div style={{ marginTop: 8 }}>
                <Typography.Text type="secondary">
                  未配置平台模型时 AI 调用会失败；请在「模型设置」绑定可用模型。
                </Typography.Text>
              </div>
            </Card>

            <Card size="small" title="AI 客服绑定" style={{ marginBottom: 16 }}>
              <Form.Item
                name="deskSiteKey"
                label="客服站点"
                extra="绑定 AI 客服已有的站点；留空则小程序不展示客服入口。"
              >
                <Select
                  allowClear
                  placeholder="选择 AI 客服站点"
                  options={deskSites.map((row) => ({
                    value: row.siteKey,
                    label: `${row.name}（${row.siteKey}）`,
                  }))}
                />
              </Form.Item>
              <Space>
                <Link href="/service-desk" target="_blank">
                  <Button size="small">去 AI 客服配置纯 AI 员工</Button>
                </Link>
                <Typography.Text type="secondary">
                  客服复用基础模块，不在答题域另建客服实体。
                </Typography.Text>
              </Space>
            </Card>

            <Card size="small" title="学习资料（数字资产）">
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                {materials.map((item) => (
                  <Space key={item.url} style={{ width: "100%", justifyContent: "space-between" }}>
                    <Space>
                      <Tag>{item.type || "file"}</Tag>
                      <Typography.Text>{item.title}</Typography.Text>
                    </Space>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => setMaterials((prev) => prev.filter((row) => row.url !== item.url))}
                    />
                  </Space>
                ))}
                <Button icon={<PlusOutlined />} onClick={() => setPickerFor("material")}>
                  从数字资产管理选择
                </Button>
              </Space>
            </Card>
          </Form>
        </Panel>
      ) : null}

      {tab === "publish" ? (
        <Panel title="发布说明">
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Notice variant="info">
              答题小程序源码包（quiz-miniprogram）：导入微信开发者工具后，把 `config.js` 的
              `apiBase` 填成你的站点地址、`siteCode` 填成下面的站点码，再上传提审。
            </Notice>
            <Card size="small" title="要填的参数">
              <Space direction="vertical" size={8}>
                <Typography.Text>
                  站点码（siteCode）：
                  <Typography.Text copyable strong>
                    {site?.code || "保存站点设置后生成"}
                  </Typography.Text>
                </Typography.Text>
                <Typography.Text type="secondary">
                  服务器地址（apiBase）就是本系统访问地址，不带尾斜杠；微信后台需把该域名加入 request 合法域名。
                </Typography.Text>
              </Space>
            </Card>
            <Card size="small" title="题库与记录（多维表格）">
              {selectedBank ? (
                <Space wrap>
                  <Button href={`/data-table?table=${selectedBank.questionTableId}`} icon={<TableOutlined />}>
                    打开题目表 #{selectedBank.questionTableId}
                  </Button>
                  <Button href={`/data-table?table=${selectedBank.attemptTableId}`} icon={<TableOutlined />}>
                    打开记录表 #{selectedBank.attemptTableId}
                  </Button>
                </Space>
              ) : (
                <Empty description="先建一个题库" />
              )}
            </Card>
            <Space wrap>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={packaging}
                onClick={() => void downloadPackage()}
              >
                下载源码包
              </Button>
              <Link href="/site-builder/mini-dev-guide">
                <Button>小程序开发与发布说明</Button>
              </Link>
            </Space>
          </Space>
        </Panel>
      ) : null}

      <AssetReferencePicker
        open={!!pickerFor}
        existingUrls={pickerFor === "material" ? materials.map((item) => item.url) : []}
        mediaTypes={pickerFor === "material" ? ["image", "video", "audio"] : ["image"]}
        onCancel={() => setPickerFor(null)}
        onPick={(assets) => {
          if (pickerFor === "siteCover") {
            const url = assets[0]?.url || "";
            if (url) siteForm.setFieldValue("coverUrl", url);
          }
          if (pickerFor === "bankCover") {
            const url = assets[0]?.url || "";
            if (url) bankForm.setFieldValue("coverUrl", url);
          }
          if (pickerFor === "questionImage") {
            const url = assets[0]?.url || "";
            if (url) questionForm.setFieldValue("imageUrl", url);
          }
          if (pickerFor === "material") {
            setMaterials((prev) => {
              const next = [...prev];
              for (const asset of assets) {
                if (next.some((item) => item.url === asset.url)) continue;
                next.push({
                  title: asset.name || asset.url.split("/").pop() || "学习资料",
                  url: asset.url,
                  type: asset.type || "file",
                });
              }
              return next;
            });
          }
          setPickerFor(null);
        }}
      />

      <Modal
        title={editingBank ? "编辑题库" : "新建题库"}
        open={bankModalOpen}
        onCancel={() => setBankModalOpen(false)}
        onOk={() => void saveBank()}
        destroyOnHidden
        width={620}
      >
        <Form form={bankForm} layout="vertical">
          <Form.Item name="title" label="题库名称" rules={[{ required: true, max: 120 }]}>
            <Input placeholder="如：安全生产知识" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Form.Item name="coverUrl" label="封面">
            <Space.Compact style={{ width: "100%" }}>
              <Input placeholder="可从数字资产管理选择" />
              <Button icon={<LinkOutlined />} onClick={() => setPickerFor("bankCover")}>
                选择
              </Button>
            </Space.Compact>
          </Form.Item>
          <Space size={16} wrap>
            <Form.Item name="sort" label="排序">
              <InputNumber min={0} max={9999} />
            </Form.Item>
            <Form.Item name="durationSec" label="考试时长（秒）">
              <InputNumber min={60} max={86400} />
            </Form.Item>
            <Form.Item name="examCount" label="每次抽题">
              <InputNumber min={1} max={200} />
            </Form.Item>
            <Form.Item name="passScore" label="及格分">
              <InputNumber min={0} max={100} />
            </Form.Item>
          </Space>
          <Space size={24} wrap>
            <Form.Item name="randomize" label="随机抽题" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showAnalysis" label="答后看解析" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="aiExplain" label="允许 AI 解析" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        title={editingQuestion ? "编辑题目" : "添加题目"}
        open={questionModalOpen}
        onCancel={() => setQuestionModalOpen(false)}
        onOk={() => void saveQuestion()}
        destroyOnHidden
        width={720}
      >
        <Form form={questionForm} layout="vertical">
          <Space size={16} wrap>
            <Form.Item name="type" label="题型" rules={[{ required: true }]}>
              <Select options={TYPE_OPTIONS} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="category" label="分类">
              <Input placeholder="如：安全法规" style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="sort" label="排序">
              <InputNumber min={0} max={999999} />
            </Form.Item>
          </Space>
          <Form.Item name="title" label="题干" rules={[{ required: true, max: 2000 }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="imageUrl" label="题图">
            <Space.Compact style={{ width: "100%" }}>
              <Input placeholder="可从数字资产管理选择" />
              <Button icon={<LinkOutlined />} onClick={() => setPickerFor("questionImage")}>
                选择
              </Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) =>
              getFieldValue("type") === "judge" ? (
                <Notice variant="info">判断题选项固定为「正确 / 错误」，答案填 A 或 B。</Notice>
              ) : (
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  <Typography.Text type="secondary">选项（留空的不显示）</Typography.Text>
                  {OPTION_KEYS.map((key, index) => (
                    <Space.Compact key={key} style={{ width: "100%" }}>
                      <Button disabled style={{ width: 46 }}>
                        {key}
                      </Button>
                      <Input
                        value={optionInputs[index]}
                        onChange={(event) => {
                          const next = [...optionInputs];
                          next[index] = event.target.value;
                          setOptionInputs(next);
                        }}
                        placeholder={`选项 ${key}`}
                      />
                    </Space.Compact>
                  ))}
                </Space>
              )
            }
          </Form.Item>
          <Form.Item
            name="answer"
            label="正确答案"
            rules={[{ required: true }]}
            extra="单选/判断填一个字母；多选填多个字母（如 AB）。"
          >
            <Input placeholder="A / AB" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="analysis" label="解析">
            <Input.TextArea rows={3} maxLength={4000} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={reviewStatus === "APPROVED" ? "通过参赛者" : "驳回参赛者"}
        open={!!reviewTarget}
        onCancel={() => setReviewTarget(null)}
        onOk={() => void submitReview()}
        confirmLoading={reviewing}
        destroyOnHidden
      >
        {reviewTarget ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Typography.Text>
              {reviewTarget.nickname || "未填昵称"}
              {reviewTarget.company ? ` · ${reviewTarget.company}` : ""}
              {reviewTarget.department ? ` · ${reviewTarget.department}` : ""}
            </Typography.Text>
            <Select
              value={reviewStatus}
              onChange={(value) => setReviewStatus(value)}
              style={{ width: "100%" }}
              options={[
                { value: "APPROVED", label: "通过" },
                { value: "REJECTED", label: "驳回" },
              ]}
            />
            <Input.TextArea
              rows={3}
              maxLength={500}
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder={reviewStatus === "APPROVED" ? "备注（可选）" : "驳回原因（会展示给参赛者）"}
            />
          </Space>
        ) : null}
      </Modal>

      <Modal
        title="AI 出题"
        open={aiModalOpen}
        onCancel={() => setAiModalOpen(false)}
        footer={null}
        destroyOnHidden
        width={620}
      >
        <Form
          layout="vertical"
          onFinish={async (value) => {
            if (!selectedBankId) return;
            try {
              const result = await quizApi.aiGenerate({
                params: { id: String(selectedBankId) },
                body: {
                  prompt: value.prompt,
                  count: Number(value.count) || 5,
                  type: value.type || undefined,
                },
              });
              message.success(`AI 已生成 ${result?.created || 0} 道题`);
              setAiModalOpen(false);
              await loadDetail(selectedBankId);
              await loadAll();
            } catch (err) {
              message.error((err as Error).message || "AI 出题失败");
            }
          }}
          initialValues={{ count: 5 }}
        >
          <Form.Item
            name="prompt"
            label="资料"
            rules={[{ required: true, message: "把资料或出题要求贴进来" }]}
          >
            <Input.TextArea rows={8} maxLength={4000} placeholder="粘贴制度条文、课程要点或直接描述要出的题" />
          </Form.Item>
          <Space size={16}>
            <Form.Item name="count" label="题数">
              <InputNumber min={1} max={20} />
            </Form.Item>
            <Form.Item name="type" label="题型（可选）">
              <Select allowClear options={TYPE_OPTIONS} placeholder="不限制" style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Button type="primary" htmlType="submit" icon={<RobotOutlined />} block>
            生成并写入题库
          </Button>
        </Form>
      </Modal>
    </>
  );
}