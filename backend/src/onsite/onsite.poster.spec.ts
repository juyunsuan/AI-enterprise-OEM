import { buildOnsitePosterSvg } from './onsite.poster.service';

const base = {
  shopName: '本机上门理疗测试店',
  title: '微信扫码 · 立即预约上门服务',
  subtitle: '专业技师上门，明码标价',
  contact: '',
  qr: 'iVBORw0KGgo=',
  shopCode: 'GP9A8DVD',
};

describe('buildOnsitePosterSvg', () => {
  it('店铺海报带店名、店铺码与小程序码', () => {
    const svg = buildOnsitePosterSvg(base);
    expect(svg).toContain('本机上门理疗测试店');
    expect(svg).toContain('店铺码 GP9A8DVD');
    expect(svg).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(svg).toContain('width="750"');
    expect(svg).toContain('height="1180"');
  });

  it('代理海报展示联系人，空联系人不出空行', () => {
    const withContact = buildOnsitePosterSvg({
      ...base,
      title: '张三 · 专属服务顾问',
      contact: '电话 13800000000',
    });
    expect(withContact).toContain('张三 · 专属服务顾问');
    expect(withContact).toContain('电话 13800000000');
    expect(buildOnsitePosterSvg(base)).not.toContain('fill="#3370ff">电话');
  });

  it('用户输入中的尖括号引号被转义，不能注入标签', () => {
    const svg = buildOnsitePosterSvg({
      ...base,
      shopName: '<script>alert(1)</script>',
      contact: `电话 "1" & '2'`,
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&quot;1&quot; &amp; &apos;2&apos;');
  });
});
