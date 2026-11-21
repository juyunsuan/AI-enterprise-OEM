"use client";
import { Button, Form, Input, Modal, Select, Space } from "antd";
import type { BrandDiyPageRow, BrandDiyPageType } from "@enterprise/contracts";
import { ImageUrlField } from "@/components/ui/image-field";
import type { DiyDraft } from "./model";
import { DEFAULT_STYLES, PAGE_TYPE_OPTIONS } from "./model";
import { ColorField, Field, SizeField } from "./props-form";

/**
 * 页面级属性：名称/类型/排序/封面 + `styles`（背景色、背景图、头部色、顶部留白）。
 *
 * `paddingTop` 契约里写明是 CSS px（与组件属性的 rpx 口径不同），面板上标出来。
 */
export function PagePropsForm({
  draft,
  pages,
  onChange,
}: {
  draft: DiyDraft;
  pages: BrandDiyPageRow[];
  onChange: (patch: Partial<DiyDraft>) => void;
}) {
  const current = pages.find((item) => item.id === draft.id);
  return (
    <Space orientation="vertical" size={0} style={{ width: "100%" }}>
      <Field label="页面名称" extra="1-40 个字，列表与小程序端标题都用它">
        <Input
          size="small"
          maxLength={40}
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </Field>
      <Field
        label="页面类型"
        extra={
          current?.isDefault
            ? "这是默认页：发布后小程序端按类型取它，顾客打开对应 tab 就看到这份内容"
            : "活动页可以有多份；首页/分类页/个人中心发布后会成为该类型的默认页"
        }
      >
        <Select
          size="small"
          style={{ width: 200 }}
          value={draft.type}
          onChange={(value: BrandDiyPageType) => onChange({ type: value })}
          options={PAGE_TYPE_OPTIONS}
        />
      </Field>
      <Field label="排序值" extra="同类型多份页面时，端上取排序值大的那张">
        <Input
          size="small"
          style={{ width: 120 }}
          inputMode="numeric"
          value={String(draft.sortOrder)}
          onChange={(event) => onChange({ sortOrder: Number(event.target.value.replace(/\D/g, "") || 0) })}
        />
      </Field>
      <Field label="封面图" extra="只在本列表里当缩略图用，小程序端不读">
        <ImageUrlField
          value={draft.coverImage}
          size={64}
          onChange={(url) => onChange({ coverImage: url })}
        />
      </Field>

      <div className="muted text-12" style={{ margin: "4px 0 10px" }}>
        页面样式
      </div>
      <ColorField
        label="页面背景色"
        value={draft.styles.backgroundColor}
        onChange={(value) => onChange({ styles: { ...draft.styles, backgroundColor: value } })}
      />
      <Field label="页面背景图" extra="宽度按 750rpx 设计稿，顶部对齐平铺">
        <ImageUrlField
          value={draft.styles.backgroundImage}
          size={64}
          onChange={(url) => onChange({ styles: { ...draft.styles, backgroundImage: url } })}
        />
      </Field>
      <ColorField
        label="头部/主题色"
        value={draft.styles.headerColor}
        onChange={(value) => onChange({ styles: { ...draft.styles, headerColor: value } })}
      />
      <SizeField
        label="内容顶部留白"
        unit="px"
        step={2}
        value={draft.styles.paddingTop}
        min={0}
        max={200}
        extra="背景图压在组件下面时用它让出高度"
        onChange={(value) => onChange({ styles: { ...draft.styles, paddingTop: value } })}
      />
      <Space wrap size={6}>
        <Button size="small" type="link" onClick={() => onChange({ styles: { ...DEFAULT_STYLES } })}>
          恢复默认样式
        </Button>
      </Space>
    </Space>
  );
}

/** 新建页面：契约的 save 允许不带 id 直接建草稿，这里只收名称与类型。 */
export function CreatePageModal({
  open,
  confirmLoading,
  defaultType = "ACTIVITY",
  onCancel,
  onSubmit,
}: {
  open: boolean;
  confirmLoading: boolean;
  defaultType?: BrandDiyPageType;
  onCancel: () => void;
  onSubmit: (values: { name: string; type: BrandDiyPageType }) => Promise<void>;
}) {
  const [form] = Form.useForm<{ name: string; type: BrandDiyPageType }>();
  return (
    <Modal
      open={open}
      title="新建页面"
      okText="创建"
      destroyOnHidden
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={async () => {
        let values: { name: string; type: BrandDiyPageType };
        try {
          values = await form.validateFields();
        } catch {
          return; // 校验失败时 antd 已标红，弹窗保持打开
        }
        await onSubmit({ name: values.name.trim(), type: values.type });
      }}
    >
      {/* antd 6 的 Modal 不重置 Form 实例，靠 key 在每次打开时重建初值。 */}
      <Form
        key={open ? "create-page" : "create-page-closed"}
        form={form}
        layout="vertical"
        initialValues={{ name: "", type: defaultType }}
      >
        <Form.Item
          name="name"
          label="页面名称"
          extra="例如：618 主会场。首页/分类页/个人中心已有默认页，新建的活动页用于分享落地。"
          rules={[
            { required: true, message: "请填写页面名称" },
            { max: 40, message: "最多 40 个字" },
          ]}
        >
          <Input placeholder="页面名称" maxLength={40} showCount />
        </Form.Item>
        <Form.Item
          name="type"
          label="页面类型"
          extra="发布首页/分类页/个人中心类型的页面后，小程序端对应 tab 会改用它"
          rules={[{ required: true, message: "请选择页面类型" }]}
        >
          <Select options={PAGE_TYPE_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
