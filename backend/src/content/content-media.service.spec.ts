import type { CurrentUser } from '../auth/current-user';
import { stub } from '../../test/doubles';
import type { AipddAssetClient } from './aipdd-asset.client';
import type { ContentAssetService } from './asset-registry.service';
import { ContentMediaService, type JobControl } from './content-media.service';
import type { ContentModelSettingService } from './model-setting.service';

const user = stub<CurrentUser>({ userId: 'u1' });
type AssetInput = { url: string };
const input: AssetInput = { url: 'https://upstream.example/result.png' };

function build() {
  const tryRegister = jest.fn(async () => ({
    ok: true,
    assetId: '77',
    url: input.url,
    message: '',
  }));
  const service = new ContentMediaService(
    stub<ContentModelSettingService>({}),
    stub<ContentAssetService>({ tryRegister }),
    stub<AipddAssetClient>({}),
  );
  const deliver = (source: string) =>
    (
      service as unknown as {
        registerDeliverable: (
          control: JobControl,
          user: CurrentUser,
          token: string | undefined,
          input: AssetInput,
        ) => Promise<{
          ok: boolean;
          assetId: string;
          url: string;
          message: string;
        }>;
      }
    ).registerDeliverable({ source }, user, undefined, input);
  return { deliver, tryRegister };
}

describe('ContentMediaService 产物登记分流', () => {
  it('画布 / 工作室产物交给任务层入本站台账，不再先登记上游平台资产', async () => {
    const { deliver, tryRegister } = build();
    for (const source of ['canvas', 'studio', 'workbench']) {
      const result = await deliver(source);
      expect(result).toMatchObject({ ok: true, assetId: '', url: input.url });
    }
    expect(tryRegister).not.toHaveBeenCalled();
  });

  it('旧小工具仍走上游平台资产登记', async () => {
    const { deliver, tryRegister } = build();
    const result = await deliver('tool');
    expect(result).toMatchObject({ ok: true, assetId: '77' });
    expect(tryRegister).toHaveBeenCalledTimes(1);
  });
});
