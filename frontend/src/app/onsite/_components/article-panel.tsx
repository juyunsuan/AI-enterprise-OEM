"use client";
// 图文资讯：文章本身 + 可选挂一张留资表单；正文是 HTML 片段，一期不引入富文本编辑器。
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Tag } from "antd";
import type { TableProps } from "antd";
import { useMemo, useState } from "react";
import {
  ONSITE_ARTICLE_STATUSES,
  type OnsiteArticleInput,
  type OnsiteArticleRow,
  type OnsiteFormFieldRow,
} from "@enterprise/contracts";
import { EmptyState, Panel } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";
import {
  useOnsiteArticles,
  useOnsiteContentActions,
  useOnsiteFormFields,
} from "@/query/onsite";
import { DataTable, FilterBar } from "./list-kit";
import { statusOptions, StatusTag, statusText, timeText } from "./onsite-common";

const PAGE_SIZE = 20;
const COVER = {
  width: 64,
  height: 44,
  borderRadius: 6,
  objectFit: "cover" as const,
  background: "#fafafa",
};

/** 表单用途：契约是内联枚举、没导出常量与字典，按同一套取值补齐。 */
const FORM_PURPOSES: OnsiteArticleInput["formPurpose"][] = [
  "AGREEMENT",
  "STAFF_APPLY",
  "CUSTOM",
];
const FORM_PURPOSE_LABELS: Record<OnsiteArticleInput["formPurpose"], string> = {
  AGREEMENT: "协议 / 条款阅读确认",
  STAFF_APPLY: "技师报名",
  CUSTOM: "自定义留资",
};
/** 行数据里的 formPurpose 是普通字符串，历史脏值统一按自定义留资展示。 */
const purposeOf = (value: string): OnsiteArticleInput["formPurpose"] =>
  FORM_PURPOSES.find((item) => item === value) ?? "CUSTOM";

const ARTICLE_STATUS_KIND = "article";
const ARTICLE_STATUS_OPTIONS = statusOptions(ARTICLE_STATUS_KIND, ONSITE_ARTICLE_STATUSES);
const ARTICLE_STATUS_LABEL_OPTIONS = ONSITE_ARTICLE_STATUSES.map((value) => ({
  value,
  label: statusText(ARTICLE_STATUS_KIND, value),
}));

type ArticleForm = Omit<OnsiteArticleInput, "id">;

const NEW_ARTICLE: ArticleForm = {
  title: "",
  summary: "",
  content: "",
  cover: "",
  formEnabled: false,
  formPurpose: "CUSTOM",
  fieldIds: [],
  sortOrder: 0,
  status: "DRAFT",
};

export function ArticlePanel({
  shopId,
  onOpenFields,
}: {
  shopId: number;
  onOpenFields: () => void;
}) {
  const { message, modal } = App.useApp();
  const actions = useOnsiteContentActions();
  const [status, setStatus] = useState("all");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ open: boolean; row: OnsiteArticleRow | null }>({
    open: false,
    row: null,
  });

  const fieldsQuery = useOnsiteFormFields({ shopId });
  const fields = useMemo(() => fieldsQuery.data?.list ?? [], [fieldsQuery.data]);
  const filter = useMemo(() => ({ status, keyword }), [status, keyword]);
  const query = useOnsiteArticles({ shopId }, filter, page, PAGE_SIZE);
  const rows = query.data?.list ?? [];
  const filtered = Boolean(status !== "all" || keyword);

  const removeRow = (row: OnsiteArticleRow) => {
    modal.confirm({
      title: `删除文章「${row.title}」`,
      content: row.submissionCount
        ? `这篇文章已收到 ${row.submissionCount} 条留资，删除后顾客端打不开，已提交的记录仍保留在留资台账里。`
        : "删除后顾客端立即打不开这篇文章，可恢复性差，确认后再删。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.removeArticle.mutateAsync({
          params: { id: String(shopId) },
          body: { id: row.id },
        });
        message.success("文章已删除");
      },
    });
  };

  const columns: TableProps<OnsiteArticleRow>["columns"] = [
    {
      title: "标题",
      dataIndex: "title",
      width: 300,
      render: (_, row) => (
        <div style={{ minWidth: 0 }}>
          <div>{row.title}</div>
          <div className="muted text-12">{row.summary || "没有摘要"}</div>
        </div>
      ),
    },
    {
      title: "封面",
      dataIndex: "cover",
      width: 88,
      render: (value: string) =>
        value ? <RawImg src={value} alt="" style={COVER} /> : <span className="muted">—</span>,
    },
    {
      title: "留资表单",
      dataIndex: "formEnabled",
      width: 200,
      render: (_, row) =>
        row.formEnabled ? (
          <div>
            <Tag color="blue">{FORM_PURPOSE_LABELS[row.formPurpose as keyof typeof FORM_PURPOSE_LABELS] ?? row.formPurpose}</Tag>
            <div className="muted text-12">
              {row.fieldIds.length} 个字段 · 已收 {row.submissionCount} 条
            </div>
          </div>
        ) : (
          <span className="muted">未挂表单</span>
        ),
    },
    { title: "浏览", dataIndex: "pv", width: 80 },
    { title: "排序", dataIndex: "sortOrder", width: 80 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag kind={ARTICLE_STATUS_KIND} value={value} />,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 150,
      render: (value: string) => timeText(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button
            size="small"
            type="link"
            icon={<EditOutlined aria-hidden />}
            onClick={() => setEditing({ open: true, row })}
          >
            编辑
          </Button>
          <Button size="small" type="link" danger onClick={() => removeRow(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="图文资讯"
      titleBadge={query.data ? `${query.data.total}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ open: true, row: null })}
        >
          新建文章
        </Button>
      }
    >
      <FilterBar
        action={
          filtered ? (
            <Button
              size="small"
              type="link"
              onClick={() => {
                setStatus("all");
                setKeywordInput("");
                setKeyword("");
                setPage(1);
              }}
            >
              清除筛选
            </Button>
          ) : null
        }
      >
        <Select
          style={{ width: 130 }}
          value={status}
          onChange={(value: string) => {
            setStatus(value);
            setPage(1);
          }}
          options={ARTICLE_STATUS_OPTIONS}
        />
        <Input.Search
          allowClear
          style={{ width: 220 }}
          placeholder="标题或摘要关键字"
          value={keywordInput}
          onChange={(event) => {
            setKeywordInput(event.target.value);
            // 点清除图标时不回车也要立刻回到未筛选态
            if (!event.target.value) setKeyword("");
          }}
          onSearch={(value) => {
            setKeyword(value.trim());
            setPage(1);
          }}
        />
        <span className="muted text-12">
          只有「已发布」的文章在小程序里可见；挂表单的文章把留资字段与用途一起下发。
        </span>
      </FilterBar>
      {rows.length || query.isFetching ? (
        <DataTable<OnsiteArticleRow>
          rows={rows}
          columns={columns}
          total={query.data?.total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={query.isFetching}
          onPage={setPage}
          scroll={{ x: 1200 }}
        />
      ) : (
        <EmptyState
          text={
            filtered
              ? "没有符合条件的文章，换个关键字或清除筛选试试。"
              : "还没有文章。服务介绍、活动说明、用户协议都写在这里，也可以顺手收顾客留资。"
          }
          action={
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden />}
              onClick={() => setEditing({ open: true, row: null })}
            >
              新建文章
            </Button>
          }
        />
      )}
      <ArticleModal
        shopId={shopId}
        editing={editing}
        fields={fields}
        onOpenFields={onOpenFields}
        onClose={() => setEditing({ open: false, row: null })}
      />
    </Panel>
  );
}

function ArticleModal({
  shopId,
  editing,
  fields,
  onOpenFields,
  onClose,
}: {
  shopId: number;
  editing: { open: boolean; row: OnsiteArticleRow | null };
  fields: OnsiteFormFieldRow[];
  onOpenFields: () => void;
  onClose: () => void;
}) {
  const row = editing.row;
  const initial: ArticleForm = row
    ? {
        title: row.title,
        summary: row.summary,
        content: row.content,
        cover: row.cover,
        formEnabled: row.formEnabled,
        formPurpose: purposeOf(row.formPurpose),
        fieldIds: row.fieldIds,
        sortOrder: row.sortOrder,
        status: row.status,
      }
    : NEW_ARTICLE;

  return (
    <Modal
      open={editing.open}
      title={row ? "编辑文章" : "新建文章"}
      width={820}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      {editing.open ? (
        <ArticleFormBlock
          key={row?.id ?? "new"}
          shopId={shopId}
          rowId={row?.id}
          initial={initial}
          fields={fields}
          onOpenFields={onOpenFields}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function ArticleFormBlock({
  shopId,
  rowId,
  initial,
  fields,
  onOpenFields,
  onClose,
}: {
  shopId: number;
  rowId?: number;
  initial: ArticleForm;
  fields: OnsiteFormFieldRow[];
  onOpenFields: () => void;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const save = useOnsiteContentActions().saveArticle;
  const [form] = Form.useForm<ArticleForm>();
  const formEnabled = Form.useWatch("formEnabled", form) ?? initial.formEnabled;
  const cover = Form.useWatch("cover", form) ?? "";

  const submit = async () => {
    const values = await form.validateFields();
    if (values.formEnabled && !values.fieldIds.length) {
      message.warning("勾选了挂表单，请至少选择一个留资字段");
      return;
    }
    await save.mutateAsync({
      params: { id: String(shopId) },
      body: rowId ? { ...values, id: rowId } : values,
    });
    message.success(rowId ? "文章已保存" : "文章已创建（草稿），发布后顾客端才能看到");
    onClose();
  };

  return (
    <Form form={form} layout="vertical" initialValues={initial}>
      <Form.Item
        name="title"
        label="文章标题"
        rules={[{ required: true, message: "请填写文章标题" }]}
      >
        <Input maxLength={120} />
      </Form.Item>
      <Form.Item name="summary" label="摘要" extra="列表页展示的一句话">
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item
        name="content"
        label="正文"
        extra="可写 HTML 片段，小程序用 rich-text 渲染；一期不引入富文本编辑器"
      >
        <Input.TextArea rows={10} maxLength={60000} showCount />
      </Form.Item>
      <Form.Item name="cover" label="封面图" extra="分享卡片与列表缩略图，填直链">
        <Input maxLength={500} placeholder="https://…" />
      </Form.Item>
      {cover ? (
        <RawImg
          src={cover}
          alt=""
          style={{ width: 200, height: 112, objectFit: "cover", borderRadius: 8, marginBottom: 16 }}
        />
      ) : null}
      <Space wrap align="start">
        <Form.Item
          name="formEnabled"
          label="文末挂留资表单"
          valuePropName="checked"
          extra="开启后顾客在这篇文章里填表"
          style={{ width: 200 }}
        >
          <Switch />
        </Form.Item>
        <Form.Item name="sortOrder" label="排序值" extra="越小越靠前" style={{ width: 150 }}>
          <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="status" label="发布状态" style={{ width: 160 }}>
          <Select options={ARTICLE_STATUS_LABEL_OPTIONS} />
        </Form.Item>
      </Space>
      {formEnabled ? (
        <>
          <Space wrap align="start">
            <Form.Item
              name="formPurpose"
              label="表单用途"
              extra="决定留资记录在「顾客私域」里怎么归类"
              style={{ width: 260 }}
            >
              <Select
                options={FORM_PURPOSES.map((value) => ({
                  value,
                  label: FORM_PURPOSE_LABELS[value],
                }))}
              />
            </Form.Item>
            <Form.Item
              name="fieldIds"
              label="要问的字段"
              extra="按排序值展示，最多 30 个"
              style={{ width: 420 }}
            >
              <Select
                mode="multiple"
                allowClear
                maxCount={30}
                optionFilterProp="label"
                placeholder={fields.length ? "选择字段" : "还没有字段，先去「留资表单」新建"}
                options={fields.map((item) => ({
                  value: item.id,
                  label: `${item.name}${item.required ? "（必填）" : ""}${
                    item.enabled ? "" : "（已停用）"
                  }`,
                }))}
              />
            </Form.Item>
          </Space>
          {!fields.length ? (
            <div
              className="muted text-12"
              style={{ marginTop: -8, marginBottom: 16, color: "#d46b08" }}
            >
              留资字段库是空的，挂表单也问不出东西。
              <Button size="small" type="link" onClick={onOpenFields}>
                去新建字段
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      <Space wrap>
        <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
          保存文章
        </Button>
        <Button onClick={onClose}>取消</Button>
        <span className="muted text-12">
          留资记录在「顾客私域 → 留资台账」里跟进
        </span>
      </Space>
    </Form>
  );
}
