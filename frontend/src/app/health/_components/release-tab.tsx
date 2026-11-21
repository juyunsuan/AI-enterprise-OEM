"use client";

// 代码包页签：直接下载统一源码包（zip）+ 小程序码。
// 没有「生成代码包」按钮，也没有发布台账：包是平台模板源码，点了就下；
// 填参数、上传、提审与发布都在店主自己的微信开发者工具 / 微信公众平台完成。
import { QrcodeOutlined } from "@ant-design/icons";
import { App, Button, Input, Space } from "antd";
import { useState } from "react";
import type { HealthQrcode } from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { MiniProgramPublishGuide } from "@/components/mini-program/publish-guide";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";
import { useHealthResource } from "./health-common";
import { useHealthShopId } from "./health-scope";

export function ReleaseTab({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const shopId = useHealthShopId();
  const { message } = App.useApp();
  const [qrPage, setQrPage] = useState("");
  const [qrScene, setQrScene] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrcode, setQrcode] = useState<HealthQrcode | null>(null);

  const app = useHealthResource(
    () => healthApi.wechat({ query: { shopId } }),
    [shopId],
    shopId > 0,
  ).data;

  const makeQrcode = async () => {
    setQrLoading(true);
    try {
      const result = await healthApi.qrcode({
        query: { shopId, page: qrPage.trim(), scene: qrScene.trim() },
      });
      setQrcode(result ?? null);
      message.success(result?.message || "小程序码已生成");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setQrLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 与「建站管理·小程序板块」「帮助中心」同一份说明、同一个后端接口；下载按钮就在组件里。 */}
      <MiniProgramPublishGuide tool="health" onOpenSettings={onOpenSettings} />

      <Panel
        title="小程序码"
        titleExtra={<span className="muted text-12">scene 留空即店铺码，扫码直接进这一家店，不会串店</span>}
      >
        <Space wrap align="center">
          <Input
            style={{ width: 280 }}
            maxLength={120}
            placeholder="落地页路径，留空为 pages/index/index"
            value={qrPage}
            onChange={(event) => setQrPage(event.target.value)}
          />
          <Input
            style={{ width: 200 }}
            maxLength={32}
            placeholder="scene 参数，留空为店铺码"
            value={qrScene}
            onChange={(event) => setQrScene(event.target.value)}
          />
          <Button
            type="primary"
            icon={<QrcodeOutlined aria-hidden />}
            loading={qrLoading}
            disabled={!app?.appId || !app?.appSecretConfigured}
            onClick={() => void makeQrcode()}
          >
            生成小程序码
          </Button>
        </Space>
        {app?.appId && app?.appSecretConfigured ? null : (
          <Notice variant="warn">
            生成小程序码要调微信 wxacode 接口：请先在「微信凭据」保存 AppID 与 AppSecret。
          </Notice>
        )}
        <div style={{ marginTop: 12 }}>
          {qrcode?.url ? (
            <Space align="start">
              <RawImg
                src={qrcode.url}
                alt="本店小程序码"
                width={180}
                height={180}
                style={{ objectFit: "contain", background: "#fafafa" }}
              />
              <Space orientation="vertical" size={4}>
                <a href={qrcode.url} target="_blank" rel="noopener noreferrer">
                  下载小程序码原图
                </a>
                <span className="muted text-12">
                  落地页 {qrcode.page}，scene {qrcode.scene}；扫码进的是当前线上版本，与开发版无关。
                </span>
              </Space>
            </Space>
          ) : (
            <EmptyState text="还没有生成小程序码：填好落地页（或留空）后点「生成小程序码」。" />
          )}
        </div>
        <div className="muted text-12" style={{ marginTop: 8 }}>
          提审发布仍在店主自己的微信公众平台完成：本站只负责提供源码包与生成小程序码。
        </div>
      </Panel>
    </div>
  );
}
