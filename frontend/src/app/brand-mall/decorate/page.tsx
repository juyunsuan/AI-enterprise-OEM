"use client";
import { CloudUploadOutlined, SaveOutlined } from "@ant-design/icons";
import { App, Button, Space, Spin, Tag } from "antd";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  BrandDiyComponent,
  BrandDiyPage,
  BrandDiyPageRow,
  BrandDiyWidgetMeta,
} from "@enterprise/contracts";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import {
  useBrandDiyActions,
  useBrandDiyPage,
  useBrandDiyPages,
  useBrandDiyWidgets,
} from "@/query/brand-mall";
import { BrandShell, useBrandScope } from "../_components/brand-shell";
import { withShop } from "../_components/brand-common";
import {
  DEFAULT_STYLES,
  DIY_COMPONENT_LIMIT,
  contentKey,
  draftFromPage,
  duplicateComponent,
  makeComponent,
  moveComponent,
  saveBodyOf,
  widgetName,
  type DiyDraft,
} from "./_editor/model";
import { EditorCanvas } from "./_editor/canvas";
import { CreatePageModal, PagePropsForm } from "./_editor/page-form";
import { PagesPanel } from "./_editor/pages-panel";
import { WidgetPropsForm } from "./_editor/props-form";
import { WidgetLibrary } from "./_editor/widget-library";

export default function BrandDecoratePage() {
  return (
    <BrandShell
      active="decorate"
      title="页面装修"
      desc="小程序里顾客看到的首页、分类页、个人中心和活动页都不是写死的，而是用下面的组件拼出来的一份 JSON。改动先存成草稿，点「发布」才冻结成线上快照，改一半不会影响顾客端。组件类型由平台白名单下发，保存时白名单外的内容会被丢弃。"
    >
      <DecorateWorkbench />
    </BrandShell>
  );
}

function DecorateWorkbench() {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const pathname = usePathname() || "/brand-mall/decorate";
  const params = useSearchParams();
  const { shopId, meta } = useBrandScope();
  const pagesQuery = useBrandDiyPages({ shopId });
  const widgetsQuery = useBrandDiyWidgets({ shopId });
  const actions = useBrandDiyActions();
  const [createOpen, setCreateOpen] = useState(false);

  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);
  // 组件清单优先用装修接口，meta 里带的是同一份，接口还没回来时先顶上。
  const widgets = useMemo(
    () => widgetsQuery.data ?? meta?.widgets ?? [],
    [widgetsQuery.data, meta?.widgets],
  );
  const wanted = Number(params.get("pageId") || 0);
  const listed = pages.some((item) => item.id === wanted);
  // 新建/复制后页面列表还在重新拉取，这时先认 URL 里的 pageId，别闪回第一页。
  const pageId = listed || (wanted && pagesQuery.isFetching)
    ? wanted
    : (pages[0]?.id ?? 0);
  const detail = useBrandDiyPage({ shopId }, pageId);

  const goPage = (id: number) => {
    const base = withShop(pathname, shopId);
    router.replace(id ? `${base}&pageId=${id}` : base, { scroll: false });
  };

  const createPage = async (values: { name: string; type: BrandDiyPageRow["type"] }) => {
    try {
      const saved = await actions.save.mutateAsync({
        body: {
          shopId,
          name: values.name,
          type: values.type,
          components: [],
          styles: { ...DEFAULT_STYLES },
          coverImage: "",
          sortOrder: 0,
        },
      });
      if (!saved) return;
      message.success(`已创建「${saved.name}」，现在可以加组件了`);
      setCreateOpen(false);
      goPage(saved.id);
    } catch {
      // 失败原因（重名、配额等）由 mutation 统一弹后端文案，弹窗保持打开。
    }
  };

  const copyPage = async (row: BrandDiyPageRow) => {
    try {
      const created = await actions.copy.mutateAsync({ body: { shopId, id: row.id } });
      if (!created) return;
      message.success(`已复制为「${created.name}」，改完记得发布`);
      goPage(created.id);
    } catch {
      // 同上：文案已由 mutation 弹出。
    }
  };

  const removePage = (row: BrandDiyPageRow) => {
    modal.confirm({
      title: `删除页面「${row.name}」`,
      content: row.isDefault
        ? "默认页（首页/分类页/个人中心）后端不允许删除：顾客端按类型取默认页，删掉后那个 tab 会打不开。要改内容请直接编辑它。"
        : "删除后这份活动页的线上快照同时失效，已分享的链接会打不开。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await actions.remove.mutateAsync({ body: { shopId, id: row.id } });
        } catch {
          // 默认页会被后端拒绝，拒绝理由已由 mutation 弹出原文。
          return;
        }
        message.success("页面已删除");
        if (row.id === pageId) goPage(pages.find((item) => item.id !== row.id)?.id ?? 0);
      },
    });
  };

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ width: 280, flexShrink: 0 }}>
        <PagesPanel
          pages={pages}
          currentId={pageId}
          meta={meta}
          loading={pagesQuery.isPending && !pagesQuery.data}
          onSelect={goPage}
          onCreate={() => setCreateOpen(true)}
          onCopy={(row) => void copyPage(row)}
          onRemove={removePage}
        />
      </div>

      <div style={{ flex: 1, minWidth: 420 }}>
        {pagesQuery.isError ? (
          <Panel title="装修画布">
            <Notice variant="error">
              页面列表读取失败：{pagesQuery.error.message || "请稍后重试"}
            </Notice>
          </Panel>
        ) : !pages.length && !pagesQuery.isPending ? (
          <Panel title="装修画布">
            <EmptyState
              text="这家店铺还没有任何装修页，先建一页再装修。"
              action={
                <Button type="primary" onClick={() => setCreateOpen(true)}>
                  新建页面
                </Button>
              }
            />
          </Panel>
        ) : pageId ? (
          detail.isPending && !detail.data ? (
            <Panel title="装修画布">
              <div style={{ padding: 24, textAlign: "center" }}>
                <Spin />
              </div>
            </Panel>
          ) : detail.isError ? (
            <Panel title="装修画布">
              <Notice variant="error">
                页面内容读取失败：{detail.error.message || "请稍后重试"}
              </Notice>
            </Panel>
          ) : (
            <DecorateEditor
              key={`${shopId}-${pageId}`}
              shopId={shopId}
              page={detail.data as BrandDiyPage}
              pages={pages}
              widgets={widgets}
              widgetsLoading={widgetsQuery.isPending && !widgetsQuery.data}
            />
          )
        ) : null}
      </div>

      <CreatePageModal
        open={createOpen}
        confirmLoading={actions.save.isPending}
        onCancel={() => setCreateOpen(false)}
        onSubmit={createPage}
      />
    </div>
  );
}

/**
 * 单页编辑器：草稿只存在这份组件的内存里，`key` 随 shopId + pageId 变化重建，
 * 切页必然丢弃未保存修改（画布右上角的「未保存」标记与提示文案负责说清这件事）。
 */
function DecorateEditor({
  shopId,
  page,
  pages,
  widgets,
  widgetsLoading,
}: {
  shopId: number;
  page: BrandDiyPage;
  pages: BrandDiyPageRow[];
  widgets: BrandDiyWidgetMeta[];
  widgetsLoading: boolean;
}) {
  const { message, modal } = App.useApp();
  const actions = useBrandDiyActions();
  const [draft, setDraft] = useState<DiyDraft>(() => draftFromPage(page));
  const [baseline, setBaseline] = useState(() => contentKey(draftFromPage(page)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("widget");

  const dirty = contentKey(draft) !== baseline;
  const selectedIndex = draft.components.findIndex((item) => item.id === selectedId);
  const selected = selectedIndex >= 0 ? draft.components[selectedIndex] : null;

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) setTab("widget");
  };
  const setComponents = (components: BrandDiyComponent[]) =>
    setDraft((current) => ({ ...current, components }));

  const insert = (item: BrandDiyWidgetMeta) => {
    if (draft.components.length >= DIY_COMPONENT_LIMIT) {
      message.warning(`一份页面最多 ${DIY_COMPONENT_LIMIT} 个组件，先删掉一些再添加`);
      return;
    }
    const created = makeComponent(item, draft.components.map((row) => row.id));
    const next = [...draft.components];
    next.splice(selectedIndex >= 0 ? selectedIndex + 1 : next.length, 0, created);
    setComponents(next);
    select(created.id);
  };

  const updateComponent = (next: BrandDiyComponent) =>
    setComponents(draft.components.map((item) => (item.id === next.id ? next : item)));

  const duplicate = (index: number) => {
    if (draft.components.length >= DIY_COMPONENT_LIMIT) {
      message.warning(`一份页面最多 ${DIY_COMPONENT_LIMIT} 个组件`);
      return;
    }
    const copy = duplicateComponent(draft.components[index], draft.components.map((r) => r.id));
    const next = [...draft.components];
    next.splice(index + 1, 0, copy);
    setComponents(next);
    select(copy.id);
  };

  const remove = (index: number) => {
    const removed = draft.components[index];
    setComponents(draft.components.filter((_, position) => position !== index));
    if (removed && removed.id === selectedId) select(null);
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!draft.name.trim()) {
      message.warning("请先在右侧「页面」里填页面名称");
      return false;
    }
    try {
      const saved = await actions.save.mutateAsync({ body: saveBodyOf(shopId, draft) });
      if (!saved) return false;
      // 以后端回填的规范化结果为准（白名单过滤、默认属性合并都在这里体现）。
      const next = draftFromPage(saved);
      setDraft(next);
      setBaseline(contentKey(next));
      message.success("草稿已保存；要让顾客看到，还需点「发布」");
      return true;
    } catch {
      return false;
    }
  };

  const publish = () => {
    modal.confirm({
      title: `发布「${draft.name || "未命名页面"}」`,
      content: (
        <Space orientation="vertical" size={6}>
          <span>
            发布会把当前<b>已保存的草稿</b>冻结成线上快照，顾客打开小程序立刻看到新内容，
            不需要重新出包。
          </span>
          {dirty ? (
            <span style={{ color: "#d46b08" }}>
              现在还有未保存的修改，点确认后会自动先保存再发布。
            </span>
          ) : null}
          <span className="muted text-12">页面里一个组件都没有时，后端会拒绝发布。</span>
        </Space>
      ),
      okText: dirty ? "保存并发布" : "发布",
      onOk: async () => {
        if (dirty && !(await saveDraft())) return;
        try {
          await actions.publish.mutateAsync({ body: { shopId, id: draft.id } });
        } catch {
          // 空页面等拒绝理由已由 mutation 弹出后端原文。
          return;
        }
        message.success("已发布，顾客端立即生效；提审与发布仍在你自己的微信公众平台完成");
      },
    });
  };

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ width: 190, flexShrink: 0 }}>
        <WidgetLibrary
          widgets={widgets}
          loading={widgetsLoading}
          reachedLimit={draft.components.length >= DIY_COMPONENT_LIMIT}
          onInsert={insert}
        />
      </div>

      <div style={{ flex: 1, minWidth: 430 }}>
        <Panel
          title="画布（当前草稿）"
          titleExtra={
            <Space size={4}>
              {dirty ? (
                <Tag color="orange">未保存</Tag>
              ) : (
                <Tag color="green">与已保存内容一致</Tag>
              )}
              <span className="muted text-12">
                {draft.components.length}/{DIY_COMPONENT_LIMIT} 个组件
              </span>
            </Space>
          }
          extra={
            <Space size={6}>
              <Button
                size="small"
                icon={<SaveOutlined aria-hidden />}
                loading={actions.save.isPending}
                onClick={() => void saveDraft()}
              >
                保存草稿
              </Button>
              <Button
                size="small"
                type="primary"
                icon={<CloudUploadOutlined aria-hidden />}
                loading={actions.publish.isPending}
                onClick={publish}
              >
                发布
              </Button>
            </Space>
          }
        >
          <div className="muted text-12" style={{ marginBottom: 8 }}>
            切页或刷新会丢掉没保存的修改，改完请先点「保存草稿」。
          </div>
          <EditorCanvas
            components={draft.components}
            styles={draft.styles}
            widgets={widgets}
            selectedId={selectedId}
            onSelect={select}
            onMove={(index, offset) => setComponents(moveComponent(draft.components, index, offset))}
            onDuplicate={duplicate}
            onRemove={remove}
          />
        </Panel>
      </div>

      <div style={{ width: 360, flexShrink: 0 }}>
        <Panel
          title="属性"
          titleExtra={selected ? null : <span className="muted text-12">未选中组件</span>}
        >
          <PanelTabs
            value={tab}
            onChange={setTab}
            items={[
              {
                key: "widget",
                label: "组件",
                children: selected ? (
                  <WidgetPropsForm
                    // 属性面板随选中项重建，换组件时不会留着上一个组件的输入焦点与状态。
                    key={selected.id}
                    shopId={shopId}
                    component={selected}
                    title={widgetName(widgets, selected.type)}
                    onChange={updateComponent}
                  />
                ) : (
                  <EmptyState text="先在中间手机预览里点一个组件，或从左侧组件库加一个" />
                ),
              },
              {
                key: "page",
                label: "页面",
                children: (
                  <PagePropsForm
                    draft={draft}
                    pages={pages}
                    onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                  />
                ),
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
