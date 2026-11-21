"use client";

// 素材库页签：音色分组/音色、BGM 分组/曲目；平台内置（siteId=0）只读。
import {
  AppstoreOutlined,
  AudioOutlined,
  CustomerServiceOutlined,
  PlusOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type {
  DhBgmGroupInput,
  DhBgmGroupRow,
  DhBgmInput,
  DhBgmRow,
  DhPresetVoiceInput,
  DhPresetVoiceRow,
  DhVoiceGroupInput,
  DhVoiceGroupRow,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { EmptyState, Panel, PanelTabs } from "@/components/ui/panel";

export function LibraryTab() {
  const [tab, setTab] = useState("voiceGroups");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "voiceGroups", label: (<><AppstoreOutlined aria-hidden /> 音色分组</>), children: <VoiceGroupSection key="vg" /> },
        { key: "voices", label: (<><AudioOutlined aria-hidden /> 音色</>), children: <PresetVoiceSection key="pv" /> },
        { key: "bgmGroups", label: (<><SoundOutlined aria-hidden /> BGM 分组</>), children: <BgmGroupSection key="bg" /> },
        { key: "bgms", label: (<><CustomerServiceOutlined aria-hidden /> BGM 曲目</>), children: <BgmSection key="bgm" /> },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// 音色分组
// ---------------------------------------------------------------------------

type VoiceGroupDraft = DhVoiceGroupInput & { id?: number };

function VoiceGroupSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<DhVoiceGroupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<VoiceGroupDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await digitalHumanApi.voiceGroups()) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "分组加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.saveVoiceGroup({ body: draft });
      message.success("分组已保存");
      setDraft(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: DhVoiceGroupRow) => {
    Modal.confirm({
      title: "删除分组",
      content: `确定删除「${row.name}」？分组下还有音色时会被后端拦截。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removeVoiceGroup({ body: { id: row.id } });
          message.success("已删除");
          await load();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhVoiceGroupRow> = [
    {
      title: "分组",
      dataIndex: "name",
      render: (value: string, row) => (
        <Space size={6}>
          <span>{value}</span>
          {row.siteId === 0 ? <Tag>平台内置</Tag> : null}
        </Space>
      ),
    },
    { title: "音色数", dataIndex: "voiceCount", width: 90 },
    { title: "排序", dataIndex: "sort", width: 80 },
    {
      title: "启用",
      dataIndex: "enabled",
      width: 80,
      render: (value: boolean) => (value ? "是" : "否"),
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) =>
        row.siteId === 0 ? (
          <span className="muted text-12">只读</span>
        ) : (
          <Space size={4}>
            <Button
              size="small"
              onClick={() =>
                setDraft({ id: row.id, name: row.name, sort: row.sort, enabled: row.enabled })
              }
            >
              编辑
            </Button>
            <Button size="small" danger onClick={() => remove(row)}>
              删除
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <Panel
      title="音色分组"
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setDraft({ name: "", sort: 0, enabled: true })}
        >
          新建分组
        </Button>
      }
    >
      <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={false} />
      <Modal
        open={Boolean(draft)}
        title={draft?.id ? "编辑分组" : "新建分组"}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <label>
              分组名称
              <Input
                value={draft.name}
                maxLength={60}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              排序
              <InputNumber
                style={{ width: "100%" }}
                value={draft.sort}
                min={0}
                max={9999}
                onChange={(value) => setDraft({ ...draft, sort: Number(value ?? 0) })}
              />
            </label>
            <Space size={6}>
              <Switch
                checked={draft.enabled}
                onChange={(enabled) => setDraft({ ...draft, enabled })}
              />
              启用
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 音色
// ---------------------------------------------------------------------------

type PresetVoiceDraft = DhPresetVoiceInput & { id?: number };

function PresetVoiceSection() {
  const { message } = App.useApp();
  const [groups, setGroups] = useState<DhVoiceGroupRow[]>([]);
  const [rows, setRows] = useState<DhPresetVoiceRow[]>([]);
  const [groupId, setGroupId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<PresetVoiceDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const loadGroups = useCallback(async () => {
    try {
      setGroups((await digitalHumanApi.voiceGroups()) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "分组加载失败");
    }
  }, [message]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await digitalHumanApi.presetVoices({ query: groupId ? { groupId } : {} })) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "音色加载失败");
    } finally {
      setLoading(false);
    }
  }, [groupId, message]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);
  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.savePresetVoice({ body: draft });
      message.success("音色已保存");
      setDraft(null);
      await loadRows();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: DhPresetVoiceRow) => {
    Modal.confirm({
      title: "删除音色",
      content: `确定删除「${row.name}」？`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removePresetVoice({ body: { id: row.id } });
          message.success("已删除");
          await loadRows();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhPresetVoiceRow> = [
    { title: "音色", dataIndex: "name", width: 150 },
    {
      title: "分组",
      width: 120,
      render: (_, row) =>
        groups.find((group) => group.id === row.groupId)?.name || `#${row.groupId}`,
    },
    {
      title: "标识",
      dataIndex: "speakerId",
      render: (value: string) => <span className="mono text-12">{value}</span>,
    },
    {
      title: "属性",
      width: 140,
      render: (_, row) =>
        [row.gender, row.language, row.tags].filter(Boolean).join(" · ") || "—",
    },
    {
      title: "试听",
      render: (_, row) =>
        row.demoUrl ? (
          <audio controls preload="none" src={row.demoUrl} style={{ height: 30 }} />
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      title: "状态",
      width: 100,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Tag color={row.enabled ? "green" : "default"}>{row.enabled ? "启用" : "停用"}</Tag>
          {row.siteId === 0 ? <span className="muted text-12">平台内置</span> : null}
        </Space>
      ),
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) =>
        row.siteId === 0 ? (
          <span className="muted text-12">只读</span>
        ) : (
          <Space size={4}>
            <Button
              size="small"
              onClick={() =>
                setDraft({
                  id: row.id,
                  groupId: row.groupId,
                  name: row.name,
                  speakerId: row.speakerId,
                  gender: row.gender,
                  language: row.language,
                  demoUrl: row.demoUrl,
                  tags: row.tags,
                  sort: row.sort,
                  enabled: row.enabled,
                })
              }
            >
              编辑
            </Button>
            <Button size="small" danger onClick={() => remove(row)}>
              删除
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <Panel
      title="公共音色"
      extra={
        <Space>
          <Select
            value={groupId}
            style={{ width: 160 }}
            options={[
              { value: 0, label: "全部分组" },
              ...groups.map((group) => ({ value: group.id, label: group.name })),
            ]}
            onChange={(value: number) => setGroupId(value)}
          />
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setDraft({
                groupId: groupId || groups[0]?.id || 0,
                name: "",
                speakerId: "",
                gender: "",
                language: "zh",
                demoUrl: "",
                tags: "",
                sort: 0,
                enabled: true,
              })
            }
          >
            新增音色
          </Button>
        </Space>
      }
    >
      {rows.length === 0 && !loading ? (
        <EmptyState text="还没有公共音色：新增后会员在创作页可直接选用。" />
      ) : (
        <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={false} />
      )}
      <Modal
        open={Boolean(draft)}
        title={draft?.id ? "编辑音色" : "新增音色"}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <label>
              分组
              <Select
                style={{ width: "100%" }}
                value={draft.groupId}
                options={groups.map((group) => ({ value: group.id, label: group.name }))}
                onChange={(value: number) => setDraft({ ...draft, groupId: value })}
              />
            </label>
            <label>
              音色名称
              <Input
                value={draft.name}
                maxLength={60}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              供应商音色标识（speakerId）
              <Input
                value={draft.speakerId}
                maxLength={120}
                onChange={(event) => setDraft({ ...draft, speakerId: event.target.value })}
              />
            </label>
            <Space size={10} wrap>
              <label>
                性别
                <Input
                  value={draft.gender}
                  maxLength={8}
                  style={{ width: 100 }}
                  onChange={(event) => setDraft({ ...draft, gender: event.target.value })}
                />
              </label>
              <label>
                语言
                <Input
                  value={draft.language}
                  maxLength={16}
                  style={{ width: 100 }}
                  onChange={(event) => setDraft({ ...draft, language: event.target.value })}
                />
              </label>
              <label>
                排序
                <InputNumber
                  value={draft.sort}
                  min={0}
                  max={9999}
                  onChange={(value) => setDraft({ ...draft, sort: Number(value ?? 0) })}
                />
              </label>
            </Space>
            <label>
              标签
              <Input
                value={draft.tags}
                maxLength={120}
                onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
              />
            </label>
            <label>
              试听音频地址
              <Input
                value={draft.demoUrl}
                maxLength={500}
                onChange={(event) => setDraft({ ...draft, demoUrl: event.target.value })}
              />
            </label>
            <Space size={6}>
              <Switch
                checked={draft.enabled}
                onChange={(enabled) => setDraft({ ...draft, enabled })}
              />
              启用
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// BGM 分组
// ---------------------------------------------------------------------------

type BgmGroupDraft = DhBgmGroupInput & { id?: number };

function BgmGroupSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<DhBgmGroupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<BgmGroupDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await digitalHumanApi.bgmGroups()) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "分组加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.saveBgmGroup({ body: draft });
      message.success("分组已保存");
      setDraft(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: DhBgmGroupRow) => {
    Modal.confirm({
      title: "删除分组",
      content: `确定删除「${row.name}」？分组下还有曲目时会被后端拦截。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removeBgmGroup({ body: { id: row.id } });
          message.success("已删除");
          await load();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhBgmGroupRow> = [
    {
      title: "分组",
      dataIndex: "name",
      render: (value: string, row) => (
        <Space size={6}>
          <span>{value}</span>
          {row.siteId === 0 ? <Tag>平台内置</Tag> : null}
        </Space>
      ),
    },
    { title: "曲目数", dataIndex: "bgmCount", width: 90 },
    { title: "排序", dataIndex: "sort", width: 80 },
    {
      title: "启用",
      dataIndex: "enabled",
      width: 80,
      render: (value: boolean) => (value ? "是" : "否"),
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) =>
        row.siteId === 0 ? (
          <span className="muted text-12">只读</span>
        ) : (
          <Space size={4}>
            <Button
              size="small"
              onClick={() =>
                setDraft({ id: row.id, name: row.name, sort: row.sort, enabled: row.enabled })
              }
            >
              编辑
            </Button>
            <Button size="small" danger onClick={() => remove(row)}>
              删除
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <Panel
      title="BGM 分组"
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setDraft({ name: "", sort: 0, enabled: true })}
        >
          新建分组
        </Button>
      }
    >
      <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={false} />
      <Modal
        open={Boolean(draft)}
        title={draft?.id ? "编辑分组" : "新建分组"}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <label>
              分组名称
              <Input
                value={draft.name}
                maxLength={60}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              排序
              <InputNumber
                style={{ width: "100%" }}
                value={draft.sort}
                min={0}
                max={9999}
                onChange={(value) => setDraft({ ...draft, sort: Number(value ?? 0) })}
              />
            </label>
            <Space size={6}>
              <Switch
                checked={draft.enabled}
                onChange={(enabled) => setDraft({ ...draft, enabled })}
              />
              启用
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// BGM 曲目
// ---------------------------------------------------------------------------

type BgmDraft = DhBgmInput & { id?: number };

function BgmSection() {
  const { message } = App.useApp();
  const [groups, setGroups] = useState<DhBgmGroupRow[]>([]);
  const [rows, setRows] = useState<DhBgmRow[]>([]);
  const [groupId, setGroupId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<BgmDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const loadGroups = useCallback(async () => {
    try {
      setGroups((await digitalHumanApi.bgmGroups()) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "分组加载失败");
    }
  }, [message]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await digitalHumanApi.bgms({ query: groupId ? { groupId } : {} })) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "曲目加载失败");
    } finally {
      setLoading(false);
    }
  }, [groupId, message]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);
  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.saveBgm({ body: draft });
      message.success("曲目已保存");
      setDraft(null);
      await loadRows();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: DhBgmRow) => {
    Modal.confirm({
      title: "删除曲目",
      content: `确定删除「${row.name}」？`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removeBgm({ body: { id: row.id } });
          message.success("已删除");
          await loadRows();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhBgmRow> = [
    { title: "曲目", dataIndex: "name", width: 160 },
    {
      title: "分组",
      width: 120,
      render: (_, row) =>
        groups.find((group) => group.id === row.groupId)?.name || `#${row.groupId}`,
    },
    { title: "时长", dataIndex: "durationSec", width: 80, render: (value: number) => `${value}s` },
    {
      title: "试听",
      render: (_, row) => (
        <audio controls preload="none" src={row.url} style={{ height: 30 }} />
      ),
    },
    {
      title: "状态",
      width: 100,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Tag color={row.enabled ? "green" : "default"}>{row.enabled ? "启用" : "停用"}</Tag>
          {row.siteId === 0 ? <span className="muted text-12">平台内置</span> : null}
        </Space>
      ),
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) =>
        row.siteId === 0 ? (
          <span className="muted text-12">只读</span>
        ) : (
          <Space size={4}>
            <Button
              size="small"
              onClick={() =>
                setDraft({
                  id: row.id,
                  groupId: row.groupId,
                  name: row.name,
                  url: row.url,
                  durationSec: row.durationSec,
                  sort: row.sort,
                  enabled: row.enabled,
                })
              }
            >
              编辑
            </Button>
            <Button size="small" danger onClick={() => remove(row)}>
              删除
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <Panel
      title="BGM 曲目"
      extra={
        <Space>
          <Select
            value={groupId}
            style={{ width: 160 }}
            options={[
              { value: 0, label: "全部分组" },
              ...groups.map((group) => ({ value: group.id, label: group.name })),
            ]}
            onChange={(value: number) => setGroupId(value)}
          />
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setDraft({
                groupId: groupId || groups[0]?.id || 0,
                name: "",
                url: "",
                durationSec: 0,
                sort: 0,
                enabled: true,
              })
            }
          >
            新增曲目
          </Button>
        </Space>
      }
    >
      {rows.length === 0 && !loading ? (
        <EmptyState text="还没有 BGM：新增后会员在创作页可选背景音乐。" />
      ) : (
        <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={false} />
      )}
      <Modal
        open={Boolean(draft)}
        title={draft?.id ? "编辑曲目" : "新增曲目"}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <label>
              分组
              <Select
                style={{ width: "100%" }}
                value={draft.groupId}
                options={groups.map((group) => ({ value: group.id, label: group.name }))}
                onChange={(value: number) => setDraft({ ...draft, groupId: value })}
              />
            </label>
            <label>
              曲目名称
              <Input
                value={draft.name}
                maxLength={80}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              音频地址
              <Input
                value={draft.url}
                maxLength={500}
                onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              />
            </label>
            <Space size={10}>
              <label>
                时长（秒）
                <InputNumber
                  value={draft.durationSec}
                  min={0}
                  max={3600}
                  onChange={(value) =>
                    setDraft({ ...draft, durationSec: Number(value ?? 0) })
                  }
                />
              </label>
              <label>
                排序
                <InputNumber
                  value={draft.sort}
                  min={0}
                  max={9999}
                  onChange={(value) => setDraft({ ...draft, sort: Number(value ?? 0) })}
                />
              </label>
            </Space>
            <Space size={6}>
              <Switch
                checked={draft.enabled}
                onChange={(enabled) => setDraft({ ...draft, enabled })}
              />
              启用
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}
