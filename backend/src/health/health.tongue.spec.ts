import type { PrismaService } from '../prisma/prisma.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import { stub } from '../../test/doubles';
import * as gateway from '../ai/ai-gateway';
import {
  HealthTongueService,
  parseTongueAnalysis,
} from './health.tongue.service';

/**
 * 舌象结论收敛口径：模型说「不是舌头 / 拍糊了」时绝不落库；
 * 正常结果只收结构化字段，数组截断、置信度夹紧，不在服务端替模型补编。
 */
describe('parseTongueAnalysis', () => {
  it('非舌象或质量太差返回 null', () => {
    expect(parseTongueAnalysis(null)).toBeNull();
    expect(
      parseTongueAnalysis({ isTongue: false, interpretation: '不是舌头' }),
    ).toBeNull();
    expect(
      parseTongueAnalysis({ quality: 'POOR', interpretation: '照片太糊' }),
    ).toBeNull();
    expect(parseTongueAnalysis({ interpretation: '' })).toBeNull();
  });

  it('店铺未开通或图片格式不支持时，不写资产、不调模型', async () => {
    const assets = stub<SystemAssetService>();
    const service = new HealthTongueService(stub<PrismaService>(), assets);
    const file = new File([new Uint8Array([1, 2, 3])], 'tongue.jpg', {
      type: 'image/jpeg',
    });

    await expect(
      service.analyze(
        {
          shopId: 1,
          ownerUserId: '1',
          name: '测试店',
          tongueAiEnabled: false,
          tongueAiChannelId: 0,
          tongueAiModel: '',
        },
        { id: 2, nickname: '顾客', phone: '' },
        file,
      ),
    ).rejects.toThrow('尚未开通舌象分析');

    await expect(
      service.analyze(
        {
          shopId: 1,
          ownerUserId: '1',
          name: '测试店',
          tongueAiEnabled: true,
          tongueAiChannelId: 0,
          tongueAiModel: '',
        },
        { id: 2, nickname: '顾客', phone: '' },
        new File([new Uint8Array([1, 2, 3])], 'tongue.txt', {
          type: 'text/plain',
        }),
      ),
    ).rejects.toThrow('请上传 JPG / PNG / WebP');
  });

  it('分析成功后原图入账、记录落库并返回结构化结论', async () => {
    const put = jest.fn().mockResolvedValue({
      key: 'health/tongue/1/2/a.jpg',
      url: 'https://oss.example/a.jpg',
      size: 3,
      assetId: 9,
    });
    const assets = stub<SystemAssetService>({
      put,
      urlOf: () => 'https://oss.example/a.jpg',
      remove: jest.fn(),
    });
    const create = jest.fn().mockResolvedValue({
      id: 5,
      customerId: 2,
      imageUrl: 'https://oss.example/a.jpg',
      quality: 'GOOD',
      tongueColor: '淡红',
      coatingColor: '薄白苔',
      tongueShape: '正常',
      constitution: '平和质',
      interpretation: '舌象大致正常。',
      suggestionsJson: ['规律作息'],
      cautionsJson: ['不适随诊'],
      confidence: 82,
      model: 'vision-x',
      createdAt: new Date('2026-11-20T00:00:00Z'),
    });
    const prisma = stub<PrismaService>({
      healthTongueRecord: { create },
    });
    const spy = jest.spyOn(gateway, 'aiChat').mockResolvedValue({
      reply: JSON.stringify({
        isTongue: true,
        quality: 'GOOD',
        tongueColor: '淡红',
        coatingColor: '薄白苔',
        tongueShape: '正常',
        constitution: '平和质',
        interpretation: '舌象大致正常。',
        suggestions: ['规律作息'],
        cautions: ['不适随诊'],
        confidence: 82,
      }),
      model: 'vision-x',
      source: 'account',
      usage: { tokenIn: 10, tokenOut: 20, call: 1 },
      elapsedMs: 5,
    } as never);

    const service = new HealthTongueService(prisma, assets);
    const result = await service.analyze(
      {
        shopId: 1,
        ownerUserId: '1',
        name: '测试店',
        tongueAiEnabled: true,
        tongueAiChannelId: 0,
        tongueAiModel: '',
      },
      { id: 2, nickname: '顾客', phone: '' },
      new File([new Uint8Array([1, 2, 3])], 'tongue.jpg', {
        type: 'image/jpeg',
      }),
    );

    expect(put).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      id: 5,
      customerName: '顾客',
      tongueColor: '淡红',
      constitution: '平和质',
      confidence: 82,
      model: 'vision-x',
    });
    spy.mockRestore();
  });

  it('收敛字段、数组与置信度，并保留 FAIR 质量', () => {
    const parsed = parseTongueAnalysis({
      isTongue: true,
      quality: 'fair',
      qualityNote: '光线偏暗',
      tongueColor: ' 淡红 ',
      coatingColor: '薄白苔',
      tongueShape: '胖大有齿痕',
      constitution: '气虚质',
      interpretation: '舌淡红、苔薄白，常见于气血不足。',
      suggestions: ['规律作息', '', '适度运动'],
      cautions: ['持续乏力请就医'],
      confidence: 128,
    });
    expect(parsed).toEqual({
      quality: 'FAIR',
      qualityNote: '光线偏暗',
      tongueColor: '淡红',
      coatingColor: '薄白苔',
      tongueShape: '胖大有齿痕',
      constitution: '气虚质',
      interpretation: '舌淡红、苔薄白，常见于气血不足。',
      suggestions: ['规律作息', '适度运动'],
      cautions: ['持续乏力请就医'],
      confidence: 100,
    });
  });
});
