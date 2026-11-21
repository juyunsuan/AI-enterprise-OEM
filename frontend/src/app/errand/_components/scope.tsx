"use client";

import { App, Button, Form, Input, Modal, Spin } from "antd";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { ErrandMeta, ErrandSite } from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";

type ScopeValue = {
  site: ErrandSite | null;
  meta: ErrandMeta | null;
  reload: () => Promise<void>;
  tab: string;
  setTab: (tab: string) => void;
};

const ScopeContext = createContext<ScopeValue>({
  site: null,
  meta: null,
  reload: async () => {},
  tab: "overview",
  setTab: () => {},
});

export const useErrandScope = () => useContext(ScopeContext);

/**
 * 跑腿工具的作用域：一个账号只有一个跑腿站点（账号负责人就是小程序管理员），
 * 因此不再做站点切换，所有页签共享这一份 site + meta。
 */
export function ErrandScope({
  tab,
  setTab,
  children: render,
}: {
  tab: string;
  setTab: (tab: string) => void;
  children: (scope: ScopeValue) => ReactNode;
}) {
  const { message } = App.useApp();
  const [site, setSite] = useState<ErrandSite | null>(null);
  const [meta, setMeta] = useState<ErrandMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [siteRow, metaRow] = await Promise.all([errandApi.site(), errandApi.meta()]);
      setSite(siteRow ?? null);
      setMeta(metaRow ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "跑腿站点信息读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !site && !meta) {
    return (
      <Panel title="跑腿小程序">
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="跑腿小程序">
        <Notice variant="error">{error}</Notice>
      </Panel>
    );
  }

  if (!site) {
    return (
      <Panel title="先创建跑腿站点">
        <div style={{ display: "grid", gap: 12 }}>
          <Notice variant="info">
            跑腿小程序是相对独立的业务：一个账号就是一部小程序，账号负责人即小程序管理员；
            创建站点后配置计价（起步价 + 距离 + 重量 + 夜间/帮买服务费），顾客与骑手都在你自己的小程序里。
            客服复用平台 AI 客服，AI 调度走平台模型网关，二维码与素材进平台数字资产。
          </Notice>
          <div>
            <Button type="primary" onClick={() => setCreating(true)}>
              创建跑腿站点
            </Button>
          </div>
        </div>
        <Modal
          title="创建跑腿站点"
          open={creating}
          onCancel={() => setCreating(false)}
          footer={null}
          destroyOnHidden
        >
          <Form
            layout="vertical"
            onFinish={async (values: { name: string }) => {
              try {
                await errandApi.siteSave({
                  body: {
                    name: String(values.name || "").trim(),
                  },
                });
                message.success("跑腿站点已创建，先到「站点与计价」补全门面与价格");
                setCreating(false);
                await load();
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
              <Input maxLength={120} placeholder="例如：某某同城跑腿" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>
              创建
            </Button>
          </Form>
        </Modal>
      </Panel>
    );
  }

  return render({ site, meta, reload: load, tab, setTab });
}
