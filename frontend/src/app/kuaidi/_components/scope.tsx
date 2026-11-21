"use client";

import { App, Button, Form, Input, Modal, Select, Spin } from "antd";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { KuaidiMeta, KuaidiSite } from "@enterprise/contracts";
import { kuaidiApi } from "@/api/kuaidi";
import { Notice, Panel } from "@/components/ui/panel";

/**
 * 快递寄件的作用域：站点是多租户边界，所有页签共用同一个 `siteId`。
 *
 * `siteId` 只从 query string 取，缺省落到第一家站点：收藏的链接
 * `/kuaidi?siteId=12&tab=order` 能直接打开对应站点，不存在第二份状态源。
 * 没有站点时整页拦成开通引导——先建站，再谈快递公司与订单。
 */
type ScopeValue = {
  siteId: number;
  site: KuaidiSite | null;
  sites: KuaidiSite[];
  meta: KuaidiMeta | null;
  selectSite: (siteId: number) => void;
  /** 寄件点增删改后重拉列表与元信息（页头切换器与总览会变）。 */
  reload: () => Promise<void>;
  tab: string;
  setTab: (tab: string) => void;
};

const ScopeContext = createContext<ScopeValue>({
  siteId: 0,
  site: null,
  sites: [],
  meta: null,
  selectSite: () => {},
  reload: async () => {},
  tab: "overview",
  setTab: () => {},
});

export const useKuaidiScope = () => useContext(ScopeContext);
/** 页签内直接拿当前站点 id；0 表示还没有站点（外层已拦成开通引导）。 */
export const useKuaidiSiteId = () => useContext(ScopeContext).siteId;

export function KuaidiScope({
  tab,
  setTab,
  children: render,
}: {
  tab: string;
  setTab: (tab: string) => void;
  children: (scope: ScopeValue) => ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/kuaidi";
  const params = useSearchParams();
  const { message } = App.useApp();
  const [sites, setSites] = useState<KuaidiSite[]>([]);
  const [meta, setMeta] = useState<KuaidiMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [siteRows, metaRow] = await Promise.all([kuaidiApi.sites(), kuaidiApi.meta()]);
      setSites(siteRows ?? []);
      setMeta(metaRow ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "快递寄件信息读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const wanted = Number(params.get("siteId") || 0);
  const siteId = useMemo(() => {
    if (sites.some((item) => item.id === wanted)) return wanted;
    return sites[0]?.id ?? 0;
  }, [sites, wanted]);
  const site = sites.find((item) => item.id === siteId) ?? null;

  const selectSite = useCallback(
    (next: number) => {
      const qs = new URLSearchParams(params.toString());
      qs.set("siteId", String(next));
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const scope: ScopeValue = {
    siteId,
    site,
    sites,
    meta,
    selectSite,
    reload: load,
    tab,
    setTab,
  };

  if (loading && !sites.length) {
    return (
      <Panel title="快递寄件">
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="快递寄件">
        <Notice variant="error">{error}</Notice>
      </Panel>
    );
  }

  if (!sites.length) {
    return (
      <Panel title="先建一个快递寄件站">
        <div style={{ display: "grid", gap: 12 }}>
          <Notice variant="info">
            快递寄件小程序用于接单寄快递：配置快递公司报价 → 买家在小程序选寄/收件人与快递公司、
            按重量和地区自动算运费 → 付款后你安排取件并推进物流；收款进你自己的微信商户号，平台不经手资金。
          </Notice>
          <div>
            <Button type="primary" onClick={() => setCreating(true)}>
              新建寄件站
            </Button>
          </div>
        </div>
        <Modal
          title="新建快递寄件站"
          open={creating}
          onCancel={() => setCreating(false)}
          footer={null}
          destroyOnHidden
        >
          <Form
            layout="vertical"
            onFinish={async (values: { name: string }) => {
              try {
                const created = await kuaidiApi.siteCreate({
                  body: { name: String(values.name || "").trim() },
                });
                message.success("寄件站已创建（已铺一份快递公司报价模板，改价即可用）");
                setCreating(false);
                await load();
                if (created?.id) selectSite(created.id);
              } catch (cause) {
                message.error(cause instanceof Error ? cause.message : "创建失败");
              }
            }}
          >
            <Form.Item
              name="name"
              label="站点名称"
              rules={[{ required: true, message: "请填写站点名称" }]}
            >
              <Input maxLength={120} placeholder="例如：某某快递寄件" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>
              创建
            </Button>
          </Form>
        </Modal>
      </Panel>
    );
  }

  return render(scope);
}

/** 页头右侧的寄件点切换器：只有一家时只显示数量，不摆无用下拉。 */
export function SiteSwitcher() {
  const { sites, siteId, selectSite } = useKuaidiScope();
  if (sites.length <= 1) {
    return <span className="muted text-12">寄件点 {sites.length} 个</span>;
  }
  return (
    <Select
      size="small"
      value={siteId}
      style={{ minWidth: 160 }}
      onChange={selectSite}
      options={sites.map((item) => ({
        value: item.id,
        label: `${item.name}（${item.siteCode}）`,
      }))}
    />
  );
}
