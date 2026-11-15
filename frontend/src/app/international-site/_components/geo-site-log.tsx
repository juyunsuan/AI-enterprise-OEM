"use client";

import { useState } from "react";
import { Space, Table, Tag, Typography } from "antd";
import { Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { useGeoSitePublishLog } from "@/query/geo-site";

/**
 * 发布台账：谁在什么时候把哪一页 / 哪篇内容发上线了，只读展示。
 * 数据是发布成功后旁路写入的，写失败不会中断发布，因此这里可能比线上少几行——
 * 排查时以页面右下角的「最近更新时间」为准，台账只用来对时间线。
 */

const KIND_COLOR: Record<string, string> = {
  SITE: "blue",
  PAGE: "green",
  ARTICLE: "purple",
  PRODUCT: "orange",
  ADMIN: "red",
};

export function PublishLogPanel({ siteId }: { siteId: number }) {
  const [page, setPage] = useState(1);
  const query = useGeoSitePublishLog(siteId, page);
  const rows = query.data?.items ?? [];

  return (
    <Panel
      title="发布台账"
      titleBadge={query.data ? `${query.data.total} 条` : undefined}
      titleExtra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          整站发布、单页发布 / 下线、文章与产品发布 / 下线都会留一行
        </Typography.Text>
      }
    >
      {query.error ? <Notice variant="error">{query.error.message}</Notice> : null}
      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        scroll={{ x: 760 }}
        pagination={{
          current: page,
          pageSize: query.data?.pageSize ?? 20,
          total: query.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          {
            title: "时间",
            dataIndex: "createdAt",
            width: 170,
            render: (value: string) => fmtTime(value),
          },
          {
            title: "动作",
            dataIndex: "targetKind",
            width: 110,
            render: (_, row) => (
              <Tag color={KIND_COLOR[row.targetKind] || "default"}>
                {row.targetKindLabel}
              </Tag>
            ),
          },
          {
            title: "对象",
            dataIndex: "label",
            width: 240,
            render: (value: string) => value || "-",
          },
          {
            title: "摘要",
            dataIndex: "note",
            render: (value: string) => value || "-",
          },
          {
            title: "操作人",
            dataIndex: "operator",
            width: 140,
            render: (value: string) => (
              <Space orientation="vertical" size={2}>
                <Typography.Text style={{ fontSize: 12 }}>
                  {value || "-"}
                </Typography.Text>
              </Space>
            ),
          },
        ]}
      />
    </Panel>
  );
}
