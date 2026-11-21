import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from '../health.controller';
import { UserLookupService } from '../directory/user-lookup.service';
import { OssService } from '../oss/oss.service';
import { OssSettingsService } from '../oss/oss-settings.service';
import { OssSettingsController } from '../oss/oss-settings.controller';
import { IdentityService } from '../identity/identity.service';
import { CurrentUser } from '../auth/current-user';
import { CapabilityService } from '../capability/capability.service';
import { GeoSettingsService } from '../geo/geo-settings.service';
import { GeoCollectionService } from '../geo/geo-collection.service';
import { AdminService } from '../admin/admin.service';
import { AdminController } from '../admin/admin.controller';
import { AiworkinClient } from '../aiworkin/aiworkin.client';
import { DemandService } from '../aiworkin/demand.service';
import { EnterpriseProfileService } from '../aiworkin/enterprise-profile.service';
import { AiworkinController } from '../aiworkin/aiworkin.controller';
import { ConnectionsService } from '../aiworkin/connections.service';
import { ConnectionsController } from '../aiworkin/connections.controller';
import { DemandSyncService } from '../aiworkin/demand-sync.service';
import { MarketMcpService } from '../aiworkin/market-mcp.service';
import { ContactResolver } from '../shared/contacts.service';
import { AssetService } from '../asset/asset.service';
import { AssetController } from '../asset/asset.controller';
import { CapabilityController } from '../capability/capability.controller';
import { ContractsService } from '../contracts/contracts.service';
import { ContractsController } from '../contracts/contracts.controller';
import { ExternalService } from '../external/external.service';
import { ExternalCredentialService } from '../external/external-credential.service';
import { ExternalController } from '../external/external.controller';
import { FlexService } from '../flex/flex.service';
import { FlexController } from '../flex/flex.controller';
import { GeoService } from '../geo/geo.service';
import { GeoController } from '../geo/geo.controller';
import { GeoSiteSettingsService } from '../geo-site/geo-site.settings.service';
import { GeoSiteService } from '../geo-site/geo-site.service';
import { GeoSiteDomainService } from '../geo-site/geo-site-domain.service';
import { GeoSiteBillingService } from '../geo-site/geo-site.billing.service';
import { GeoSiteController } from '../geo-site/geo-site.controller';
import {
  GeoSiteContentController,
  GeoSiteMenuController,
  GeoSitePageController,
  GeoSiteTemplateController,
} from '../geo-site/geo-site-cms.controller';
import { GeoSiteContentService } from '../geo-site/geo-site-content.service';
import { GeoSiteMenuService } from '../geo-site/geo-site-menu.service';
import { GeoSitePageService } from '../geo-site/geo-site-page.service';
import { GeoSiteTemplateService } from '../geo-site/geo-site-template.service';
import { GeoSiteRenderDataService } from '../geo-site/geo-site.render-data.service';
import { GeoSiteScheduler } from '../geo-site/geo-site.scheduler';
import { ToolLaunchAdminService } from '../tool-launch/tool-launch.admin.service';
import { ToolLaunchBillingService } from '../tool-launch/tool-launch.billing.service';
import {
  ToolLaunchAdminController,
  ToolLaunchController,
} from '../tool-launch/tool-launch.controller';
import { bindToolLaunch } from '../tool-launch/tool-launch.holder';
import { ToolLaunchMeterService } from '../tool-launch/tool-launch.meter';
import { ToolLaunchScheduler } from '../tool-launch/tool-launch.scheduler';
import { bindToolLaunchBilling } from '../tool-launch/tool-launch.billing.holder';
import { ToolLaunchService } from '../tool-launch/tool-launch.service';
import { ToolLaunchSettingsService } from '../tool-launch/tool-launch.settings.service';
import { MiniGuideService } from '../mini-guide/mini-guide.service';
import {
  MiniGuideAdminController,
  MiniGuideController,
} from '../mini-guide/mini-guide.controller';
import { DevGuideService } from '../dev-guide/dev-guide.service';
import { DevGuideAdminController } from '../dev-guide/dev-guide.controller';
import { IdentityController } from '../identity/identity.controller';
import { QxySettingsService } from '../qixiangyun/qxy-settings.service';
import { QxyClient } from '../qixiangyun/qxy.client';
import { QxyService } from '../qixiangyun/qxy.service';
import { InvoiceService } from '../invoice/invoice.service';
import { InvoiceController } from '../invoice/invoice.controller';
import { IpService } from '../ip/ip.service';
import { IpController } from '../ip/ip.controller';
import { ThinkTankService } from '../think-tank/think-tank.service';
import { ThinkTankController } from '../think-tank/think-tank.controller';
import { LegalService } from '../legal/legal.service';
import { LegalController } from '../legal/legal.controller';
import { LogisticsService } from '../logistics/logistics.service';
import { LogisticsController } from '../logistics/logistics.controller';
import { MarketBoardService } from '../market-board/market-board.service';
import { MarketBoardController } from '../market-board/market-board.controller';
import { MarketListingRecordService } from '../market-board/market-listing-record.service';
import { AppDirectoryService } from '../apps/app-directory.service';
import { AppDirectoryController } from '../apps/app-directory.controller';
import { MarketingService } from '../marketing/marketing.service';
import { MarketingController } from '../marketing/marketing.controller';
import { OverseasService } from '../overseas/overseas.service';
import { QxyOpenApiClient } from '../qixiangyun/qxy-openapi.client';
import { InvoiceOcrService } from '../ocr/invoice-ocr.service';
import { TaxService } from '../tax/tax.service';
import { OpenApiController } from '../openapi/openapi.controller';
import { OverseasController } from '../overseas/overseas.controller';
import { QxyController } from '../qixiangyun/qxy.controller';
import { ServicesService } from '../services/services.service';
import { ServicesController } from '../services/services.controller';
import { SmartServiceService } from '../smart-service/smart-service.service';
import { SmartServiceController } from '../smart-service/smart-service.controller';
import { SupplyService } from '../supply/supply.service';
import { SupplyController } from '../supply/supply.controller';
import { TaxController } from '../tax/tax.controller';
import { ModelKeyService } from '../aiworkin/model-key.service';
import { SkillGeneratorService } from '../content/skill-generator.service';
import { AssetVisionService } from '../content/vision.service';
import { DataTableService } from '../data-table/data-table.service';
import { DataTableAiService } from '../data-table/data-table-ai.service';
import { DataTableViewService } from '../data-table/data-table-view.service';
import { DataTableController } from '../data-table/data-table.controller';
import { DataTableOpenController } from '../data-table/data-table-open.controller';
import { FeishuBitableClient } from '../feishu/feishu-bitable.client';
import { FeishuSyncCrypto } from '../feishu/feishu-crypto';
import { DataTableFeishuService } from '../feishu/data-table-feishu.service';
import { DataTableFeishuController } from '../feishu/data-table-feishu.controller';
import { AiSocialService } from '../ai-social/ai-social.service';
import { AiSocialController } from '../ai-social/ai-social.controller';
import { AiSocialNotificationsService } from '../ai-social/ai-social-notifications.service';
import { RpaCrypto } from '../rpa/rpa-crypto';
import { RpaScriptService } from '../rpa/rpa-script.service';
import { RpaAccountService } from '../rpa/rpa-account.service';
import { RpaSettingService } from '../rpa/rpa-setting.service';
import { RpaTaskService } from '../rpa/rpa-task.service';
import { RpaLlmService } from '../rpa/rpa-llm.service';
import { RpaController } from '../rpa/rpa.controller';
import { RpaChromeController } from '../rpa/rpa-chrome.controller';
import { RpaChromeDeviceService } from '../rpa/chrome-device.service';
import { BrowserAgentToolsService } from '../rpa/browser-agent-tools.service';
import { ChromeAgentService } from '../rpa/chrome-agent.service';
import { RpaChromeLibraryService } from '../rpa/chrome-library.service';
import { RpaChromeScheduleService } from '../rpa/chrome-schedule.service';
import { RpaOpenController } from '../rpa/rpa-open.controller';
import { WorkbuddyCrypto } from '../workbuddy/workbuddy-crypto';
import { WorkbuddyAccountService } from '../workbuddy/workbuddy-account.service';
import { WorkbuddyAgentService } from '../workbuddy/workbuddy-agent.service';
import { WorkbuddyPlanService } from '../workbuddy/workbuddy-plan.service';
import { WorkbuddyLlmService } from '../workbuddy/workbuddy-llm.service';
import { WorkbuddyController } from '../workbuddy/workbuddy.controller';
import { WorkbuddyCloudService } from '../workbuddy/workbuddy-cloud.service';
import { BotHostService } from '../bot-host/bot-host.service';
import type { BotTerminalNoticePayload } from '../bot-host/dispatch-notice';
import { BotHostController } from '../bot-host/bot-host.controller';
import { AgentDispatchController } from '../bot-host/agent-dispatch.controller';
import { AgentDispatchService } from '../bot-host/agent-dispatch.service';
import { AiCallCrypto } from '../ai-call/ai-call-crypto';
import { AiCallAccountService } from '../ai-call/ai-call-account.service';
import { AiCallController } from '../ai-call/ai-call.controller';
import { AiCallOpenController } from '../ai-call/ai-call-open.controller';
import { LeadProspectingService } from '../lead-prospecting/lead-prospecting.service';
import { LeadProspectingController } from '../lead-prospecting/lead-prospecting.controller';
import { BigdataQueryService } from '../bigdata/bigdata-query.service';
import { BigdataQueryController } from '../bigdata/bigdata-query.controller';
import { InsightService } from '../insight/insight.service';
import { InsightController } from '../insight/insight.controller';
import { InsightScheduler } from '../insight/insight.scheduler';
import { EcomPdpService } from '../ecom-pdp/ecom-pdp.service';
import { EcomPdpController } from '../ecom-pdp/ecom-pdp.controller';
import { DomesticPdpService } from '../domestic-pdp/domestic-pdp.service';
import { DomesticPdpController } from '../domestic-pdp/domestic-pdp.controller';
import { DistributionService } from '../distribution/distribution.service';
import { DistributionController } from '../distribution/distribution.controller';
import { ExtensionCatalogService } from '../platform/extension-catalog.service';
import { BrowserTaskService } from '../platform/browser-task.service';
import { SurveyService } from '../survey/survey.service';
import { SurveyController } from '../survey/survey.controller';
import { QuizService } from '../quiz/quiz.service';
import { QuizController } from '../quiz/quiz.controller';
import { PublishReviewService } from '../moderation/publish-review.service';
import { HelpService } from '../help/help.service';
import { HelpController } from '../help/help.controller';
import { AliyunCallCrypto } from '../aliyun-call/aliyun-call-crypto';
import { AliyunCallService } from '../aliyun-call/aliyun-call.service';
import { AliyunCallController } from '../aliyun-call/aliyun-call.controller';
import { AliyunMailCrypto } from '../aliyun-mail/aliyun-mail-crypto';
import { AliyunMailService } from '../aliyun-mail/aliyun-mail.service';
import { AliyunMailController } from '../aliyun-mail/aliyun-mail.controller';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';
import { ContentCrypto } from '../content/content-crypto';
import { ContentModelCatalogService } from '../content/model-catalog.service';
import { ContentModelSettingService } from '../content/model-setting.service';
import { ContentChannelPolicyService } from '../content/channel-policy.service';
import { AipddAssetClient } from '../content/aipdd-asset.client';
import { ContentAssetService } from '../content/asset-registry.service';
import { ContentController } from '../content/content.controller';
import { QuestionHallController } from '../question-hall/question-hall.controller';
import { ImCrypto } from '../im/im.crypto';
import { ImController } from '../im/im.controller';
import { ImService } from '../im/im.service';
import { QuestionHallService } from '../question-hall/question-hall.service';
import { ComfyClient } from '../community/comfy.client';
import { ComfyCrypto } from '../community/comfy-crypto';
import { CommunityAwardService } from '../community/community-award.service';
import { CommunityService } from '../community/community.service';
import { CommunityController } from '../community/community.controller';
import { CommunityImportService } from '../community/community-import.service';
import { CommunityRunScheduler } from '../community/community-run.scheduler';
import { ContentAgentExpertService } from '../content/agent-experts.service';
import {
  ContentAgentConnectorService,
  type BuiltinMcpRunner,
} from '../content/agent-connectors.service';
import { AgentMcpCrypto } from '../content/agent-mcp-crypto';
import { ContentAgentMemoryService } from '../content/agent-memory.service';
import { ContentAgentLibraryService } from '../content/agent-library.service';
import { ContentAgentSkillService } from '../content/agent-skills.service';
import { runAgentTool } from '../content/agent-tools';
import { SkillHubClient } from '../skillhub/skillhub.client';
import { SkillHubService } from '../skillhub/skillhub.service';
import { SkillHubController } from '../skillhub/skillhub.controller';
import { ContentMediaService } from '../content/content-media.service';
import { ContentAgentEngine } from '../content/agent-engine';
import { ContentAgentService } from '../content/agent.service';
import { ContentAgentScheduleService } from '../content/agent-schedule.service';
import { ContentAgentAssistantService } from '../content/agent-assistant.service';
import { ContentJobService } from '../content/content-job.service';
import { ContentJobWorkerPool } from '../content/content-job.worker-pool';
import { CanvasProjectService } from '../content/canvas.service';
import { DigitalAssetService } from '../content/digital-asset.service';
import { AssetShareService } from '../content/asset-share.service';
import { VideoTemplateService } from '../content/video-template.service';
import { VideoTemplateController } from '../content/video-template.controller';
import { VideoTemplateSyncScheduler } from '../content/video-template.sync.scheduler';
import { AgentMemoryController } from '../agent-memory/agent-memory.controller';
import { MailCrypto } from '../mailbox/mail-crypto';
import { MailboxService } from '../mailbox/mailbox.service';
import { MailboxController } from '../mailbox/mailbox.controller';
import { NotificationService } from '../notifications/notification.service';
import { NotificationController } from '../notifications/notification.controller';
import { WechatMpSettingsService } from '../wechat-mp/wechat-mp.settings';
import { WechatMpClient } from '../wechat-mp/wechat-mp.client';
import { WechatMpBindingService } from '../wechat-mp/wechat-mp.binding.service';
import { WechatMpPushService } from '../wechat-mp/wechat-mp.push.service';
import { WechatMpInboundService } from '../wechat-mp/wechat-mp.inbound.service';
import { WechatMpController } from '../wechat-mp/wechat-mp.controller';
import { WechatMpRetryScheduler } from '../wechat-mp/wechat-mp.scheduler';
import { MiniProgramSettingsService } from '../miniprogram/miniprogram.settings';
import { MiniProgramClient } from '../miniprogram/miniprogram.client';
import { MiniProgramService } from '../miniprogram/miniprogram.service';
import { MiniProgramController } from '../miniprogram/miniprogram.controller';
// 建站管理底座：自营主体凭据 + 出包器（上门服务与后续电商工具共用同一套凭据台账）
import { MiniAppService } from '../private-mini/mini-app.service';
import { OnsitePlatformService } from '../onsite/onsite.platform.service';
import { OnsiteShopService } from '../onsite/onsite.shop.service';
import { OnsiteReleaseService } from '../onsite/onsite.release.service';
import { OnsitePosterService } from '../onsite/onsite.poster.service';
import { OnsiteCustomerService } from '../onsite/onsite.customer.service';
import { OnsiteCatalogService } from '../onsite/onsite.catalog.service';
import { OnsiteStaffService } from '../onsite/onsite.staff.service';
import { OnsiteScheduleService } from '../onsite/onsite.schedule.service';
import { OnsiteCityService } from '../onsite/onsite.city.service';
import { OnsiteContentService } from '../onsite/onsite.content.service';
import { OnsiteNotifyService } from '../onsite/onsite.notify.service';
import { OnsiteOrderService } from '../onsite/onsite.order.service';
import { OnsiteRefundService } from '../onsite/onsite.refund.service';
import { OnsiteReviewService } from '../onsite/onsite.review.service';
import { OnsiteAlertService } from '../onsite/onsite.alert.service';
import { OnsiteAssistService } from '../onsite/onsite.assist.service';
import { OnsiteMarketingService } from '../onsite/onsite.marketing.service';
import { OnsiteWalletService } from '../onsite/onsite.wallet.service';
import { OnsiteCommissionService } from '../onsite/onsite.commission.service';
import { OnsiteAgentService } from '../onsite/onsite.agent.service';
import { OnsiteController } from '../onsite/onsite.controller';
import { OnsiteAdminController } from '../onsite/onsite.admin.controller';
import { RentalService } from '../rental/rental.service';
import { RentalPayService } from '../rental/rental.pay.service';
import { RentalScrmService } from '../rental/rental.scrm.service';
import { RentalController } from '../rental/rental.controller';
import { ParkController } from '../park/park.controller';
import { ParkSiteService } from '../park/park.site.service';
import { ParkPackageService } from '../park/park.package.service';
import { ParkApprovalService } from '../park/park.approval.service';
import { ParkReservationService } from '../park/park.reservation.service';
import { ParkWorkOrderService } from '../park/park.workorder.service';
import { ParkIdentityService } from '../park/park.identity.service';
import { ParkResourceService } from '../park/park.resource.service';
import { ParkActivityService } from '../park/park.activity.service';
import { ParkOrderService } from '../park/park.order.service';
import { ParkLeaseService } from '../park/park.lease.service';
import { ParkOpsService } from '../park/park.ops.service';
import { ParkNotifyService } from '../park/park.notify.service';
import { ParkPayService } from '../park/park.pay.service';
import { MpCategoryService } from '../marketplace/mp.category.service';
import { MpMarketService } from '../marketplace/mp.market.service';
import { MpMerchantService } from '../marketplace/mp.merchant.service';
import { MpPlatformService } from '../marketplace/mp.platform.service';
import { MpCatalogService } from '../marketplace/mp.catalog.service';
import { MpPayService } from '../marketplace/mp.pay.service';
import { MpTradeService } from '../marketplace/mp.trade.service';
import { MpAftersaleService } from '../marketplace/mp.aftersale.service';
import { MpFinanceService } from '../marketplace/mp.finance.service';
import { MpReleaseService } from '../marketplace/mp.release.service';
import { MpDiyService } from '../marketplace/mp.diy.service';
import { MpCouponService } from '../marketplace/mp.coupon.service';
import { MpFollowService } from '../marketplace/mp.follow.service';
import { MpScrmService } from '../marketplace/mp.scrm.service';
import { MarketplaceController } from '../marketplace/mp.controller';
import { MarketplaceAdminController } from '../marketplace/mp.admin.controller';
import { BrandPlatformService } from '../brand-mall/brand.platform.service';
import { BrandShopService } from '../brand-mall/brand.shop.service';
import { BrandShippingService } from '../brand-mall/brand.shipping.service';
import { BrandGoodsService } from '../brand-mall/brand.goods.service';
import { BrandDiyService } from '../brand-mall/brand.diy.service';
import { BrandReleaseService } from '../brand-mall/brand.release.service';
import { BrandStatService } from '../brand-mall/brand.stat.service';
import { BrandCouponService } from '../brand-mall/brand.coupon.service';
import { BrandCustomerService } from '../brand-mall/brand.customer.service';
import { BrandPayService } from '../brand-mall/brand.pay.service';
import { BrandOrderService } from '../brand-mall/brand.order.service';
import { BrandScrmService } from '../brand-mall/brand.scrm.service';
import { BrandController } from '../brand-mall/brand.controller';
import { BrandAdminController } from '../brand-mall/brand.admin.controller';
import { TakeoutShopService } from '../takeout/takeout.shop.service';
import { TakeoutGoodsService } from '../takeout/takeout.goods.service';
import { TakeoutCustomerService } from '../takeout/takeout.customer.service';
import { TakeoutCouponService } from '../takeout/takeout.coupon.service';
import { TakeoutScrmService } from '../takeout/takeout.scrm.service';
import { TakeoutPayService } from '../takeout/takeout.pay.service';
import { TakeoutOrderService } from '../takeout/takeout.order.service';
import { TakeoutController } from '../takeout/takeout.controller';
import { CardShopPlatformService } from '../card-shop/card-shop.platform.service';
import { CardShopSiteService } from '../card-shop/card-shop.site.service';
import { CardShopGoodsService } from '../card-shop/card-shop.goods.service';
import { CardShopCardService } from '../card-shop/card-shop.card.service';
import { CardShopContentService } from '../card-shop/card-shop.content.service';
import { CardShopCouponService } from '../card-shop/card-shop.coupon.service';
import { CardShopCustomerService } from '../card-shop/card-shop.customer.service';
import { CardShopOrderService } from '../card-shop/card-shop.order.service';
import { CardShopPayService } from '../card-shop/card-shop.pay.service';
import { CardShopReleaseService } from '../card-shop/card-shop.release.service';
import { CardShopController } from '../card-shop/card-shop.controller';
import { CardShopAdminController } from '../card-shop/card-shop.admin.controller';
import { KuaidiPlatformService } from '../kuaidi/kuaidi.platform.service';
import { KuaidiSiteService } from '../kuaidi/kuaidi.site.service';
import { KuaidiCompanyService } from '../kuaidi/kuaidi.company.service';
import { KuaidiCustomerService } from '../kuaidi/kuaidi.customer.service';
import { KuaidiPayService } from '../kuaidi/kuaidi.pay.service';
import { KuaidiOrderService } from '../kuaidi/kuaidi.order.service';
import { KuaidiReleaseService } from '../kuaidi/kuaidi.release.service';
import { KuaidiController } from '../kuaidi/kuaidi.controller';
import { KuaidiAdminController } from '../kuaidi/kuaidi.admin.controller';
import { CircleCommunityService } from '../circle/circle.community.service';
import { CircleUserService } from '../circle/circle.user.service';
import { CircleGroupService } from '../circle/circle.group.service';
import { CirclePostService } from '../circle/circle.post.service';
import { CircleCommentService } from '../circle/circle.comment.service';
import { CircleInteractionService } from '../circle/circle.interaction.service';
import { CircleNotificationService } from '../circle/circle.notification.service';
import { CircleReportService } from '../circle/circle.report.service';
import { CircleMediaService } from '../circle/circle.media.service';
import { CircleAiService } from '../circle/circle.ai.service';
import { CircleActivityService } from '../circle/circle.activity.service';
import { CircleMedalService } from '../circle/circle.medal.service';
import { CircleSubscribeService } from '../circle/circle.subscribe.service';
import { CircleController } from '../circle/circle.controller';
import { CircleAdminController } from '../circle/circle.admin.controller';
import { ErrandPlatformService } from '../errand/errand.platform.service';
import { ErrandSiteService } from '../errand/errand.site.service';
import { ErrandCityService } from '../errand/errand.city.service';
import { ErrandAgentService } from '../errand/errand.agent.service';
import { ErrandCustomerService } from '../errand/errand.customer.service';
import { ErrandRiderService } from '../errand/errand.rider.service';
import { ErrandCouponService } from '../errand/errand.coupon.service';
import { ErrandWalletService } from '../errand/errand.wallet.service';
import { ErrandPayService } from '../errand/errand.pay.service';
import { ErrandOrderService } from '../errand/errand.order.service';
import { ErrandAiService } from '../errand/errand.ai.service';
import { ErrandMapService } from '../errand/errand.map.service';
import { ErrandNotifyService } from '../errand/errand.notify.service';
import { ErrandReleaseService } from '../errand/errand.release.service';
import {
  ErrandController,
  ErrandAdminController,
} from '../errand/errand.controller';
import { HealthPlatformService } from '../health/health.platform.service';
import { HealthShopService } from '../health/health.shop.service';
import { HealthReleaseService } from '../health/health.release.service';
import { HealthScrmService } from '../health/health.scrm.service';
import { HealthSubjectService } from '../health/health.subject.service';
import { HealthStatService } from '../health/health.stat.service';
import { HealthArchiveService } from '../health/health.archive.service';
import { HealthMonitorService } from '../health/health.monitor.service';
import { HealthCareService } from '../health/health.care.service';
import { HealthServiceItemService } from '../health/health.service-item.service';
import { HealthClinicService } from '../health/health.clinic.service';
import { HealthExamService } from '../health/health.exam.service';
import { HealthCrypto } from '../health/health-crypto';
import { HealthController as HealthWorkbenchController } from '../health/health.controller';
import { HealthAdminController } from '../health/health.admin.controller';
import { HealthMallService } from '../health/health.mall.service';
import { HealthMarketingService } from '../health/health.marketing.service';
import { HealthOrderService } from '../health/health.order.service';
import { HealthFinanceService } from '../health/health.finance.service';
import { HealthPromoterService } from '../health/health.promoter.service';
import { HealthContentService } from '../health/health.content.service';
import { HealthPublicService } from '../health/health.public.service';
import { HealthStaffService } from '../health/health.staff.service';
import { HealthTongueService } from '../health/health.tongue.service';
import { KnowledgePayService } from '../knowledge-pay/kp.service';
import { KnowledgePayMemberService } from '../knowledge-pay/kp.member';
import { KnowledgePayPayService } from '../knowledge-pay/kp.pay.service';
import { KnowledgePayController } from '../knowledge-pay/kp.controller';
import { DhChannelService } from '../digital-human/dh.channel.service';
import { DhSiteService } from '../digital-human/dh.site.service';
import { DhMemberService } from '../digital-human/dh.member.service';
import { DhLibraryService } from '../digital-human/dh.library.service';
import { DhSynthService } from '../digital-human/dh.synth.service';
import { DhContentService } from '../digital-human/dh.content.service';
import { DhPayService } from '../digital-human/dh.pay.service';
import { DhCommissionService } from '../digital-human/dh.commission.service';
import { DhStoreService } from '../digital-human/dh.store.service';
import { DhReleaseService } from '../digital-human/dh.release.service';
import { DigitalHumanController } from '../digital-human/dh.controller';
import { SnsService } from '../sns/sns.service';
import { SnsController } from '../sns/sns.controller';
import { OrgStaffService } from '../org-staff/org-staff.service';
import { OrgStaffController } from '../org-staff/org-staff.controller';
import { ServiceDeskService } from '../service-desk/service-desk.service';
import { ServiceDeskController } from '../service-desk/service-desk.controller';
import { LivecodeService } from '../livecode/livecode.service';
import { LivecodeController } from '../livecode/livecode.controller';
import { OverseasNavController } from '../overseas-nav/overseas-nav.controller';
import { OverseasNavService } from '../overseas-nav/overseas-nav.service';
import { CrmScopeService } from '../crm/crm.scope';
import { CrmSettingsService } from '../crm/crm.settings.service';
import { CrmLeadService } from '../crm/crm.lead.service';
import { CrmCustomerService } from '../crm/crm.customer.service';
import { CrmFollowService } from '../crm/crm.follow.service';
import { CrmProductService } from '../crm/crm.product.service';
import { CrmOpportunityService } from '../crm/crm.opportunity.service';
import { CrmContractService } from '../crm/crm.contract.service';
import { CrmOrderService } from '../crm/crm.order.service';
import { CrmApprovalService } from '../crm/crm.approval.service';
import { CrmReportService } from '../crm/crm.report.service';
import { CrmAiService } from '../crm/crm.ai.service';
import { CrmController } from '../crm/crm.controller';
import { TencentQidianCrypto } from '../tencent-qidian/tp-crypto';
import { TencentQidianService } from '../tencent-qidian/tp.service';
import { TencentQidianController } from '../tencent-qidian/tp.controller';
import { BiScopeService } from '../bi/bi.scope';
import { BiCrypto } from '../bi/bi-crypto';
import { BiDatasourceService } from '../bi/bi.datasource.service';
import { BiQueryService } from '../bi/bi.query.service';
import { BiDatasetService } from '../bi/bi.dataset.service';
import { BiChatService } from '../bi/bi.chat.service';
import { BiChartService } from '../bi/bi.chart.service';
import { BiDashboardService } from '../bi/bi.dashboard.service';
import { BiSettingsService } from '../bi/bi.settings.service';
import { BiController } from '../bi/bi.controller';
import { LowCodeAccessService } from '../lowcode/lowcode.access.service';
import { LowCodeService } from '../lowcode/lowcode.service';
import { LowCodeContentService } from '../lowcode/lowcode.content.service';
import { LowCodeRowService } from '../lowcode/lowcode.row.service';
import { LowCodeApprovalService } from '../lowcode/lowcode.approval.service';
import { LowCodeAiService } from '../lowcode/lowcode.ai.service';
import { LowCodeAssetsService } from '../lowcode/lowcode.assets.service';
import { LowCodeController } from '../lowcode/lowcode.controller';
import { OkrScopeService } from '../okr/okr.scope';
import { OkrMetricsService } from '../okr/okr.metrics.service';
import { OkrService } from '../okr/okr.service';
import { OkrBriefService } from '../okr/okr-brief.service';
import { OkrDecompositionService } from '../okr/okr-decomposition.service';
import { OkrTaskLinkageService } from '../okr/okr.task-linkage.service';
import { OkrController } from '../okr/okr.controller';
import { RbacService } from '../rbac/rbac.service';
import { RbacController } from '../rbac/rbac.controller';
import { TenantScopeService } from '../tenant/tenant-scope.service';
import { PartyService } from '../party/party.service';
import { PartyController } from '../party/party.controller';
import { OaScopeService } from '../oa/oa.scope';
import { OaTemplateService } from '../oa/oa.templates';
import { OaFlowService } from '../oa/oa.flow';
import { OaLinkageService } from '../oa/oa.linkage';
import { OaInboxService } from '../oa/oa.inbox';
import { OaService } from '../oa/oa.service';
import { OaController } from '../oa/oa.controller';
import { TaskCenterService } from '../task-center/task-center.service';
import {
  TaskAssignmentController,
  TaskCenterController,
} from '../task-center/task-center.controller';
import { TaskAssignmentService } from '../task-center/task-assignment.service';
import { registerTaskDocumentBindings } from '../task-center/task-document.binding';
import { TaskRouterService } from '../task-center/task-router.service';
import { TaskSourceRegistry } from '../task-center/task-source.registry';
import { registerTaskSources } from '../task-center/task-sources';
import { UiPreferencesService } from '../ui-preferences/ui-preferences.service';
import { UiPreferencesController } from '../ui-preferences/ui-preferences.controller';
import { WorkflowEngine } from '../workflow/workflow-engine';
import { WorkflowService } from '../workflow/workflow.service';
import { WorkflowController } from '../workflow/workflow.controller';
import { workflowSource } from '../workflow/workflow.source';
import type { WorkflowRuntime } from '../workflow/workflow.types';
import { AccountCrypto } from '../account/account-crypto';
import { AipddKeyService } from '../account/aipdd-key.service';
import { FeatureToggleService } from '../feature/feature-toggle.service';
import { AccessPolicyService } from '../feature/access-policy.service';
import { SkillReviewService } from '../feature/skill-review.service';
import { SkillReviewRunner } from '../feature/skill-review.runner';
import { PointsSettingsService } from '../points/points-settings.service';
import { PointsService } from '../points/points.service';
import { PricingService } from '../points/pricing.service';
import { BillingRuleService } from '../points/billing-rule.service';
import { ModelUpstreamService } from '../model-plaza/upstream.service';
import { ModelCatalogService } from '../model-plaza/catalog.service';
import { ModelUsageService } from '../model-plaza/usage.service';
import { ModelRelayService } from '../model-plaza/relay.service';
import { ModelPlazaController } from '../model-plaza/model-plaza.controller';
import { PlatformDefaultsService } from '../model-plaza/platform-defaults.service';
import { HardwareService } from '../hardware/hardware.service';
import { HardwareController } from '../hardware/hardware.controller';
import { AiEvalService } from '../ai/ai-eval.service';
import { AiGuardService, registerAiGuard } from '../ai/ai-guard.service';
import { registerAiMetering } from '../ai/ai-gateway';
import { AiAbilitiesService } from '../ai/ai-abilities.service';
import { AiPointsService } from '../ai/ai-points.service';
import { AiController } from '../ai/ai.controller';
import { HrmScopeService } from '../hrm/hrm.scope';
import { HrmProfileService } from '../hrm/hrm-profile.service';
import { HrmAttendanceService } from '../hrm/hrm-attendance.service';
import { HrmRecruitService } from '../hrm/hrm-recruit.service';
import { HrmTalentService } from '../hrm/hrm-talent.service';
import { HrmLifecycleService } from '../hrm/hrm-lifecycle.service';
import { TalentMatchService } from '../talent-match/talent-match.service';
import { HrmController } from '../hrm/hrm.controller';
import { KbSpaceService } from '../kb/kb-space.service';
import { KbSourceService } from '../kb/kb-source.service';
import { KbPageService } from '../kb/kb-page.service';
import { normalizeSlug } from '../kb/kb-util';
import { KbIngestService } from '../kb/kb-ingest.service';
import { KbSearchService } from '../kb/kb-search.service';
import {
  KbRetrieveService,
  type RetrieveInput,
} from '../kb/kb-retrieve.service';
import { KbIntakeService } from '../kb/kb-intake.service';
import { KbAssistService } from '../kb/kb-assist.service';
import { KbGraphService } from '../kb/kb-graph.service';
import { KbConsumerService } from '../kb/kb-consumer.service';
import { KbMemoryService } from '../kb/kb-memory.service';
import { KbAgentStoreService } from '../kb/kb-agent-store.service';
import { KbController } from '../kb/kb.controller';
import {
  PlatformController,
  PointsBillingController,
} from '../feature/governance.controller';
import { WechatPayClient } from '../points/wechat-pay.client';
import { RechargeService } from '../points/recharge.service';
import { CardService } from '../points/card.service';
import { CardTemplateService } from '../points/card-template.service';
import { AdminCardController, CardController } from '../points/card.controller';
import { AwcoinClient } from '../points/awcoin.client';
import { PointsBillingService } from '../points/points-billing.service';
import { ServicePackageService } from '../service-package/service-package.service';
import { ServicePackageFulfillmentService } from '../service-package/service-package-fulfillment.service';
import { StorageService } from '../storage/storage.service';
import { SystemAssetService } from '../system-asset/system-asset.service';
import { StorageMigrationService } from '../storage/storage-migration.service';
import { MechanismService } from '../mechanisms/mechanism.service';
import { MechanismController } from '../mechanisms/mechanism.controller';
import { GrowthLinkageService } from '../growth/growth-linkage.service';
import { GrowthCockpitService } from '../growth/growth-cockpit.service';
import { GrowthController } from '../growth/growth.controller';
import { OperationRiskService } from '../growth/operation-risk.service';
import { FulfillmentAdvisorService } from '../growth/fulfillment-advisor.service';
import { ProjectService } from '../project/project.service';
import { ProjectCostService } from '../project/project-cost.service';
import { ProjectDemandService } from '../project/project-demand.service';
import { ProjectController } from '../project/project.controller';
import { ErpService } from '../erp/erp.service';
import { registerErpMechanismModules } from '../erp/erp-mechanism.module';
import { ErpBridge } from '../erp/erp.bridge';
import { ErpWriteBridge } from '../erp/erp-write.bridge';
import { ErpController } from '../erp/erp.controller';
import { MktService } from '../marketing/mkt.service';
import { MktController } from '../marketing/mkt.controller';
import { SeoDataForSeoClient } from '../seo/seo-dataforseo.client';
import { SeoProjectService } from '../seo/seo-project.service';
import { SeoAuditService } from '../seo/seo-audit.service';
import { SeoKeywordService } from '../seo/seo-keyword.service';
import { SeoRankService } from '../seo/seo-rank.service';
import { SeoCompetitorService } from '../seo/seo-competitor.service';
import { SeoLocalService } from '../seo/seo-local.service';
import { SeoGoogleService } from '../seo/seo-google.service';
import { SeoOutreachService } from '../seo/seo-outreach.service';
import { SeoSchemaService } from '../seo/seo-schema.service';
import { SeoProgrammaticService } from '../seo/seo-programmatic.service';
import { SeoReportService } from '../seo/seo-report.service';
import { SeoController } from '../seo/seo.controller';
import { AcquisitionSettingsService } from '../acquisition/acquisition-settings.service';
import { AcquisitionRadarService } from '../acquisition/radar.service';
import { AcquisitionPluginBridgeService } from '../acquisition/plugin-bridge.service';
import { AcquisitionOutreachService } from '../acquisition/outreach.service';
import { AcquisitionProfileService } from '../acquisition/profile.service';
import { AcquisitionPlaybookService } from '../acquisition/playbook.service';
import { AcquisitionFollowUpService } from '../acquisition/follow-up.service';
import { AcquisitionReceptionService } from '../acquisition/reception.service';
import { AcquisitionQcService } from '../acquisition/qc.service';
import { AcquisitionDashboardService } from '../acquisition/dashboard.service';
import { AcquisitionScheduler } from '../acquisition/acquisition.scheduler';
import { AcquisitionController } from '../acquisition/acquisition.controller';
import { ScrmSettingsService } from '../wecom-scrm/scrm-settings.service';
import { ScrmScopeService } from '../wecom-scrm/scrm.scope';
import { ScrmCrypto } from '../wecom-scrm/scrm-crypto';
import { ScrmClient } from '../wecom-scrm/scrm.client';
import { ScrmContactService } from '../wecom-scrm/scrm-contact.service';
import { ScrmChatService } from '../wecom-scrm/scrm-chat.service';
import { ScrmCodeService } from '../wecom-scrm/scrm-code.service';
import { ScrmMaterialService } from '../wecom-scrm/scrm-material.service';
import { ScrmMassService } from '../wecom-scrm/scrm-mass.service';
import { ScrmTransferService } from '../wecom-scrm/scrm-transfer.service';
import { ScrmSopService } from '../wecom-scrm/scrm-sop.service';
import { ScrmComplianceService } from '../wecom-scrm/scrm-compliance';
import { ScrmStatsService } from '../wecom-scrm/scrm-stats.service';
import { ScrmSidebarService } from '../wecom-scrm/scrm-sidebar.service';
import { ScrmSyncService } from '../wecom-scrm/scrm-sync.service';
import { ScrmCallbackService } from '../wecom-scrm/scrm-callback';
import { ScrmScheduler } from '../wecom-scrm/scrm.scheduler';
import { ScrmController } from '../wecom-scrm/scrm.controller';
import { WecomScrmBridge } from '../wecom-scrm/scrm-bridge';
import { ScrmSourceTagService } from '../wecom-scrm/scrm-source-tag.service';
import { TerminalScrmService } from '../wecom-scrm/terminal-scrm.service';
import { CollabService } from '../collab/collab.service';
import { CollabController } from '../collab/collab.controller';
import { GapScopeService } from '../gaps/gaps.scope';
import { EntitlementService } from '../gaps/entitlement.service';
import { AppointmentService } from '../gaps/appointment.service';
import { MailTemplateService } from '../gaps/mail-template.service';
import { PageAssistantService } from '../gaps/assistant.service';
import { TranscriptionService } from '../gaps/transcription.service';
import { QuotationDocumentService } from '../gaps/quotation-doc.service';
import { TimeAuditService } from '../gaps/time-audit.service';
import { PromoService } from '../gaps/promo.service';
import { AfterSalesService } from '../gaps/after-sales.service';
import { ReviewService } from '../gaps/review.service';
import { TaskSyncService } from '../gaps/task-sync.service';
import { TermsService } from '../gaps/terms.service';
import { OnboardingService } from '../gaps/onboarding.service';
import { ChangelogService } from '../gaps/changelog.service';
import { OrgContextService } from '../gaps/org-context.service';
import { UsageService } from '../gaps/usage.service';
import {
  EntitlementController,
  AppointmentController,
  MailTemplateController,
  AssistantController,
  TranscriptionController,
  QuotationDocumentController,
  TimeAuditController,
  PromoController,
  AfterSalesController,
  ReviewController,
  TaskSyncController,
  TermsController,
  OnboardingController,
  ChangelogController,
  OrgContextController,
  UsageController,
} from '../gaps/gaps.controller';
import { UpgradePackageService } from '../upgrade/upgrade-package.service';
import { UpgradeAnalysisService } from '../upgrade/upgrade-analysis.service';
import { UpgradeJobService } from '../upgrade/upgrade-job.service';
import { UpgradeController } from '../upgrade/upgrade.controller';
import { AiCodeService } from '../ai-code/ai-code.service';
import { AiCodeController } from '../ai-code/ai-code.controller';
export function createServices() {
  const prismaService = new PrismaService();
  const healthController = new HealthController(prismaService);
  const userLookupService = new UserLookupService(prismaService);
  const ossSettingsService = new OssSettingsService(prismaService);
  const ossService = new OssService(ossSettingsService);
  const storageService = new StorageService(ossService);
  const identityService = new IdentityService(prismaService, userLookupService);
  // HRM 组织口径（数据按 (orgType, orgUserId) 隔离）是多个基础服务的公共依赖，
  // 且「离职撤权」复核也复用这里，故尽早构造、全站共用同一实例。
  const hrmScopeService = new HrmScopeService(prismaService, identityService);
  // 企享云账号池需先于能力服务创建：审核通过时按税号写入「企业税号 ↔ 账号」绑定。
  const qxySettingsService = new QxySettingsService(
    prismaService,
    identityService,
  );
  const capabilityService = new CapabilityService(
    prismaService,
    identityService,
    userLookupService,
    qxySettingsService,
  );
  const geoSettingsService = new GeoSettingsService(prismaService);
  const geoCollectionService = new GeoCollectionService(
    prismaService,
    geoSettingsService,
  );
  const adminService = new AdminService(
    prismaService,
    identityService,
    userLookupService,
    capabilityService,
    geoCollectionService,
  );
  const adminController = new AdminController(adminService);
  const aiworkinClient = new AiworkinClient();
  const aipddKeyService = new AipddKeyService(prismaService);
  const marketMcpService = new MarketMcpService(aipddKeyService);
  // AI 社交：全部能力由 AIworkin 的 DSH 社交插件提供，本站只做 Key 准入与入口聚合。
  const aiSocialService = new AiSocialService(prismaService);
  const aiSocialController = new AiSocialController(aiSocialService);
  // 插件通知按绑定的每把 AIPDD Key 所属账号聚合（一个账号可绑多把 Key）。
  const aiSocialNotifications = new AiSocialNotificationsService(
    aipddKeyService,
  );
  const marketListingRecordService = new MarketListingRecordService(
    prismaService,
  );
  const demandService = new DemandService(aiworkinClient, marketMcpService);
  const enterpriseProfileService = new EnterpriseProfileService(aiworkinClient);
  const aiworkinController = new AiworkinController(
    aiworkinClient,
    demandService,
    enterpriseProfileService,
  );
  const connectionsService = new ConnectionsService(aiworkinClient);
  const connectionsController = new ConnectionsController(connectionsService);
  const demandSyncService = new DemandSyncService(
    aiworkinClient,
    demandService,
  );
  const contactResolver = new ContactResolver(prismaService);
  const assetService = new AssetService(
    prismaService,
    identityService,
    userLookupService,
    demandSyncService,
    contactResolver,
  );
  const assetController = new AssetController(assetService);
  const capabilityController = new CapabilityController(capabilityService);
  const contractsService = new ContractsService(
    prismaService,
    identityService,
    userLookupService,
    contactResolver,
  );
  const contractsController = new ContractsController(contractsService);
  const externalService = new ExternalService(prismaService, identityService);
  const externalCredentialService = new ExternalCredentialService(
    prismaService,
  );
  const externalController = new ExternalController(
    externalService,
    externalCredentialService,
  );
  const flexService = new FlexService(
    prismaService,
    identityService,
    contractsService,
    demandSyncService,
    userLookupService,
    contactResolver,
  );
  const flexController = new FlexController(flexService);
  const geoService = new GeoService(
    prismaService,
    identityService,
    geoCollectionService,
    geoSettingsService,
  );
  const geoController = new GeoController(geoService, geoSettingsService);
  // GEO 独立站建站器：站点内容/发布 + 自定义域名校验 + 按月扣积分出账。
  // 出账与域名复检调度器由 main.ts 启停，公开投递通道由 app.ts 注册。
  const geoSiteSettingsService = new GeoSiteSettingsService(
    prismaService,
    identityService,
  );
  const geoSiteService = new GeoSiteService(
    prismaService,
    identityService,
    geoSiteSettingsService,
  );
  const geoSiteDomainService = new GeoSiteDomainService(
    prismaService,
    identityService,
    geoSiteSettingsService,
  );
  const geoSiteController = new GeoSiteController(
    geoSiteService,
    geoSiteDomainService,
    geoSiteSettingsService,
  );
  // 站点 CMS：页面 / 菜单 / 内容库 + 公开页取数装配。
  // 三个服务都要回查站点归属，站点服务又要在发布与删除时驱动它们，
  // 所以构造完再用 attachCms 回填这条环。
  const geoSitePageService = new GeoSitePageService(
    prismaService,
    geoSiteService,
    geoSiteSettingsService,
  );
  const geoSiteMenuService = new GeoSiteMenuService(
    prismaService,
    geoSiteService,
  );
  const geoSiteContentService = new GeoSiteContentService(
    prismaService,
    geoSiteService,
  );
  // 模板库套用到页面要复用页面服务的保存与校验，所以它排在页面服务之后
  const geoSiteTemplateService = new GeoSiteTemplateService(
    prismaService,
    geoSiteService,
    geoSitePageService,
  );
  geoSiteService.attachCms({
    pages: geoSitePageService,
    menus: geoSiteMenuService,
    contents: geoSiteContentService,
  });
  const geoSiteRenderDataService = new GeoSiteRenderDataService(
    prismaService,
    geoSiteSettingsService,
    geoSiteContentService,
  );
  const geoSitePageController = new GeoSitePageController(geoSitePageService);
  const geoSiteMenuController = new GeoSiteMenuController(geoSiteMenuService);
  const geoSiteContentController = new GeoSiteContentController(
    geoSiteContentService,
  );
  const geoSiteTemplateController = new GeoSiteTemplateController(
    geoSiteTemplateService,
  );
  const identityController = new IdentityController(identityService);
  const qxyClient = new QxyClient(qxySettingsService);
  const qxyService = new QxyService(
    prismaService,
    identityService,
    capabilityService,
    qxyClient,
    qxySettingsService,
  );
  const invoiceService = new InvoiceService(
    prismaService,
    identityService,
    qxyService,
    contactResolver,
  );
  const invoiceController = new InvoiceController(invoiceService);
  const ipService = new IpService(
    prismaService,
    identityService,
    contractsService,
    demandSyncService,
    contactResolver,
  );
  const ipController = new IpController(ipService);
  const thinkTankService = new ThinkTankService(
    prismaService,
    identityService,
    contractsService,
    demandSyncService,
    contactResolver,
    userLookupService,
  );
  const thinkTankController = new ThinkTankController(thinkTankService);
  const legalService = new LegalService(
    prismaService,
    identityService,
    contractsService,
    userLookupService,
    demandSyncService,
    contactResolver,
  );
  const legalController = new LegalController(legalService);
  const logisticsService = new LogisticsService(
    prismaService,
    identityService,
    userLookupService,
    demandSyncService,
    contactResolver,
  );
  const logisticsController = new LogisticsController(logisticsService);
  const marketBoardService = new MarketBoardService(
    aiworkinClient,
    demandService,
    identityService,
    contactResolver,
    marketListingRecordService,
  );
  const marketBoardController = new MarketBoardController(marketBoardService);
  const marketingService = new MarketingService(
    prismaService,
    identityService,
    userLookupService,
    demandSyncService,
    contactResolver,
  );
  const marketingController = new MarketingController(marketingService);
  const overseasService = new OverseasService(
    prismaService,
    identityService,
    contractsService,
    userLookupService,
    contactResolver,
  );
  const qxyOpenApiClient = new QxyOpenApiClient(qxySettingsService);
  const invoiceOcrService = new InvoiceOcrService(
    qxyOpenApiClient,
    qxySettingsService,
  );
  const taxService = new TaxService(
    prismaService,
    identityService,
    contractsService,
    externalService,
    invoiceOcrService,
    contactResolver,
  );
  const openApiController = new OpenApiController(
    identityService,
    contractsService,
    logisticsService,
    overseasService,
    legalService,
    ipService,
    flexService,
    taxService,
    thinkTankService,
  );
  const overseasController = new OverseasController(overseasService);
  const ossSettingsController = new OssSettingsController(
    ossSettingsService,
    identityService,
    ossService,
  );
  const qxyController = new QxyController(qxyService);
  const servicesService = new ServicesService(
    prismaService,
    identityService,
    demandSyncService,
    contactResolver,
  );
  const servicesController = new ServicesController(servicesService);
  const smartServiceService = new SmartServiceService(
    prismaService,
    identityService,
    userLookupService,
    demandSyncService,
    contactResolver,
  );
  const smartServiceController = new SmartServiceController(
    smartServiceService,
  );
  const supplyService = new SupplyService(
    prismaService,
    identityService,
    contractsService,
    aiworkinClient,
  );
  const supplyController = new SupplyController(supplyService);
  const taxController = new TaxController(taxService);
  const modelKeyService = new ModelKeyService();
  const dataTableService = new DataTableService(
    prismaService,
    identityService,
    userLookupService,
  );
  // 多维表格 AI 与视图：AI 三条经 §4.1 网关，视图与列定义同归归属账号。
  const dataTableAiService = new DataTableAiService(
    prismaService,
    dataTableService,
    identityService,
  );
  const dataTableViewService = new DataTableViewService(
    prismaService,
    dataTableService,
    identityService,
  );
  const dataTableController = new DataTableController(
    dataTableService,
    dataTableAiService,
    dataTableViewService,
  );
  // 营销问卷：回收数据写入账号自己的多维表格，公开填写页只走只读视图与提交校验。
  const surveyService = new SurveyService(
    prismaService,
    dataTableService,
    identityService,
  );
  const surveyController = new SurveyController(surveyService);
  // 答题小程序：题库与交卷记录落账号自己的多维表格，公开通道只做判分与限流。
  const quizService = new QuizService(
    prismaService,
    dataTableService,
    identityService,
    storageService,
  );
  const quizController = new QuizController(quizService);
  // 发布审核：后台配置阿里云内容安全凭据，四类发布动作在鉴权后统一送审。
  const publishReviewService = new PublishReviewService(prismaService);
  const dataTableOpenController = new DataTableOpenController(dataTableService);
  const feishuBitableClient = new FeishuBitableClient();
  const dataTableFeishuService = new DataTableFeishuService(
    prismaService,
    identityService,
    feishuBitableClient,
    new FeishuSyncCrypto(),
  );
  const dataTableFeishuController = new DataTableFeishuController(
    dataTableFeishuService,
  );
  dataTableService.setRowListener((tableId, action, rowId) =>
    dataTableFeishuService.onRowChange(tableId, action, rowId),
  );
  const rpaCrypto = new RpaCrypto();
  const rpaScriptService = new RpaScriptService(prismaService, identityService);
  const rpaAccountService = new RpaAccountService(
    prismaService,
    identityService,
    rpaCrypto,
  );
  const rpaSettingService = new RpaSettingService(
    prismaService,
    identityService,
    rpaCrypto,
  );
  // 本地 Chrome 插件 RPA：设备通道（根 app 公开路由，只认设备令牌）+ 会话引擎（LLM 决策/动作回放）。
  const rpaChromeDeviceService = new RpaChromeDeviceService(
    prismaService,
    hrmScopeService,
  );
  const rpaTaskService = new RpaTaskService(
    prismaService,
    identityService,
    rpaScriptService,
    rpaAccountService,
    rpaSettingService,
    rpaChromeDeviceService,
  );
  const rpaLlmService = new RpaLlmService(
    prismaService,
    identityService,
    modelKeyService,
  );
  const rpaController = new RpaController(
    rpaScriptService,
    rpaAccountService,
    rpaTaskService,
    rpaLlmService,
    rpaSettingService,
  );
  const rpaOpenController = new RpaOpenController(
    rpaScriptService,
    rpaAccountService,
    rpaTaskService,
    rpaLlmService,
  );
  const chromeAgentService = new ChromeAgentService(
    prismaService,
    rpaChromeDeviceService,
    storageService,
    rpaTaskService,
    dataTableService,
  );
  // 浏览器代理的本账号私有资产台账：插件（设备通道）与界面端点共用。
  const rpaChromeLibraryService = new RpaChromeLibraryService(prismaService);
  // 浏览器代理的 MCP 语义层：外部 MCP 客户端凭设备绿灯（在线）把任务派给本人本机的 Chrome。
  const browserAgentToolsService = new BrowserAgentToolsService(
    rpaChromeDeviceService,
    chromeAgentService,
    rpaChromeLibraryService,
  );
  // 浏览器代理计划任务：到点让本人某台在线设备跑一个目标（离线当轮跳过；停用即自动暂停）。
  const rpaChromeScheduleService = new RpaChromeScheduleService(
    prismaService,
    hrmScopeService,
    chromeAgentService,
  );
  const rpaChromeController = new RpaChromeController(
    rpaChromeDeviceService,
    chromeAgentService,
    rpaChromeLibraryService,
    rpaChromeScheduleService,
  );
  const workbuddyCrypto = new WorkbuddyCrypto();
  const workbuddyAccountService = new WorkbuddyAccountService(
    prismaService,
    identityService,
    workbuddyCrypto,
  );
  const workbuddyAgentService = new WorkbuddyAgentService(
    workbuddyAccountService,
    identityService,
  );
  const workbuddyPlanService = new WorkbuddyPlanService(
    prismaService,
    identityService,
    workbuddyAccountService,
  );
  const workbuddyLlmService = new WorkbuddyLlmService(
    prismaService,
    identityService,
    modelKeyService,
  );
  const workbuddyCloudService = new WorkbuddyCloudService(
    prismaService,
    workbuddyAccountService,
  );
  const workbuddyController = new WorkbuddyController(
    workbuddyAccountService,
    workbuddyAgentService,
    workbuddyLlmService,
    workbuddyPlanService,
    workbuddyCloudService,
  );
  // Bot 主机（Agent-Bot）：本机装 WorkBuddy + AWBotDSH 客户端，
  // 平台按心跳下发指令、客户端串行执行；设备通道免登录，只认主机令牌。
  const botHostService = new BotHostService(prismaService, hrmScopeService);
  const botHostController = new BotHostController(botHostService);
  const aiCallCrypto = new AiCallCrypto();
  const aiCallAccountService = new AiCallAccountService(
    prismaService,
    identityService,
    aiCallCrypto,
  );
  const aiCallController = new AiCallController(aiCallAccountService);
  const aiCallOpenController = new AiCallOpenController(aiCallAccountService);
  const leadProspectingService = new LeadProspectingService(
    prismaService,
    identityService,
    rpaCrypto,
    modelKeyService,
    dataTableService,
    rpaLlmService,
  );
  const leadProspectingController = new LeadProspectingController(
    leadProspectingService,
  );
  const bigdataQueryService = new BigdataQueryService(
    prismaService,
    identityService,
    modelKeyService,
    dataTableService,
    rpaLlmService,
  );
  const bigdataQueryController = new BigdataQueryController(
    bigdataQueryService,
  );
  // 智慧分析板块：订阅 / 预置表 / 热点聚合 / 趋势只读，scheduler 由 main.ts 启停。
  const insightService = new InsightService(
    prismaService,
    identityService,
    dataTableService,
  );
  const insightController = new InsightController(insightService);
  const insightScheduler = new InsightScheduler(insightService);
  const aliyunCallService = new AliyunCallService(
    prismaService,
    identityService,
    new AliyunCallCrypto(),
    dataTableService,
  );
  const aliyunCallController = new AliyunCallController(aliyunCallService);
  const aliyunMailService = new AliyunMailService(
    prismaService,
    identityService,
    new AliyunMailCrypto(),
    dataTableService,
  );
  const aliyunMailController = new AliyunMailController(aliyunMailService);
  const agentMemoryService = new AgentMemoryService(prismaService);
  const agentMemoryController = new AgentMemoryController(agentMemoryService);
  // Agent 群控（替换插件页签）：读侧给页签与工具同源台账，写侧仍走 BotHostService 的受控方法；
  // 派单动作要在「智能体记忆」操作流留痕，故装配在 agentMemoryService 之后。
  const agentDispatchService = new AgentDispatchService(
    prismaService,
    botHostService,
    workbuddyCloudService,
    agentMemoryService,
  );
  const agentDispatchController = new AgentDispatchController(
    agentDispatchService,
  );
  const contentCrypto = new ContentCrypto();
  const aipddAssetClient = new AipddAssetClient();
  // §5.7 安全三件套：平台/组织 AI 主开关 + 用户×组织双维限流，网关与模型设置共用同一闸。
  const aiGuardService = new AiGuardService(prismaService);
  registerAiGuard((userId) => aiGuardService.assertAllowed(userId));
  const contentChannelPolicyService = new ContentChannelPolicyService(
    prismaService,
    identityService,
  );
  const contentModelSettingService = new ContentModelSettingService(
    prismaService,
    identityService,
    modelKeyService,
    contentCrypto,
    new ContentModelCatalogService(),
    contentChannelPolicyService,
  );
  // 平台升级：包台账 / 差异分析 / 任务与备份，执行由独立 runner 进程完成。
  const platformUpgradePackageService = new UpgradePackageService(
    prismaService,
  );
  const platformUpgradeAnalysisService = new UpgradeAnalysisService(
    prismaService,
    platformUpgradePackageService,
    contentModelSettingService,
    identityService,
  );
  const platformUpgradeJobService = new UpgradeJobService(
    prismaService,
    platformUpgradePackageService,
    identityService,
  );
  const upgradeController = new UpgradeController(
    prismaService,
    platformUpgradePackageService,
    platformUpgradeAnalysisService,
    platformUpgradeJobService,
    contentModelSettingService,
    identityService,
    (user) => identityService.requireAdmin(user),
  );
  // AI 编程：模型只写暂存区，落地复用平台升级执行器（CODE_EDIT 任务）。
  const aiCodeService = new AiCodeService(
    prismaService,
    contentModelSettingService,
    identityService,
    userLookupService,
    platformUpgradeJobService,
  );
  const aiCodeController = new AiCodeController(aiCodeService);
  // 平台管理员「生成 Skill」：目录随 MCP_OPERATIONS 增长，模型生成 + 包内安全门禁都在服务内收口。
  const skillGeneratorService = new SkillGeneratorService(
    prismaService,
    identityService,
    contentModelSettingService,
  );
  const contentAssetService = new ContentAssetService(
    prismaService,
    modelKeyService,
    contentCrypto,
    aipddAssetClient,
  );
  const contentAgentMemoryService = new ContentAgentMemoryService(
    prismaService,
  );
  const contentAgentSkillService = new ContentAgentSkillService(
    prismaService,
    identityService,
  );
  const skillHubService = new SkillHubService(
    new SkillHubClient(),
    contentAgentSkillService,
  );
  const skillHubController = new SkillHubController(skillHubService);
  const contentMediaService = new ContentMediaService(
    contentModelSettingService,
    contentAssetService,
    aipddAssetClient,
  );
  // 跨境电商商品页优化：规划走文本槽位、出图走图片槽位，全部经本系统模型网关。
  const ecomPdpService = new EcomPdpService(
    prismaService,
    contentModelSettingService,
    contentMediaService,
  );
  const ecomPdpController = new EcomPdpController(ecomPdpService);
  // 国内电商商品页优化：同一套模型网关装配，文案与合规规则走 domestic-pdp 知识层。
  const domesticPdpService = new DomesticPdpService(
    prismaService,
    contentModelSettingService,
    contentMediaService,
  );
  const domesticPdpController = new DomesticPdpController(domesticPdpService);
  // 平台统一插件能力目录（§10.7）：单一实例，派发门槛与后台维护共用同一份生效口径。
  const extensionCatalogService = new ExtensionCatalogService(prismaService);
  // 平台统一浏览器任务服务（§10.3）：持久队列 + 认领租约 + 结果回执，分发等派发通道复用同一份。
  const browserTaskService = new BrowserTaskService(
    prismaService,
    extensionCatalogService,
  );
  // 多平台内容分发：台账与结果落库在本系统，实际发布由 AIPDD Enterprise 浏览器插件在本地完成。
  const distributionService = new DistributionService(
    prismaService,
    extensionCatalogService,
    browserTaskService,
  );
  const distributionController = new DistributionController(
    distributionService,
  );
  // 帮助中心：章节知识库内置随代码版本化，前端 /help 与 MCP（Help_*）读同一份。
  const helpService = new HelpService();
  const helpController = new HelpController(helpService);
  const contentAgentExpertService = new ContentAgentExpertService(
    prismaService,
    contentMediaService,
  );
  // 本站 MCP Server 需要完整的 Services 对象，由 app 组装后回填给内置连接器。
  const builtinMcp: { current?: BuiltinMcpRunner } = {};
  const contentAgentConnectorService = new ContentAgentConnectorService(
    prismaService,
    new AgentMcpCrypto(),
    identityService,
    builtinMcp,
    agentMemoryService,
    agentMemoryService,
  );
  const contentDigitalAssetService = new DigitalAssetService(
    prismaService,
    contentModelSettingService,
    aipddAssetClient,
    identityService,
    storageService,
    publishReviewService,
  );
  // 系统资产层：字节仍由门面落桶，这里补台账（入账才可计费/可治理），见 system-asset 目录注释。
  const systemAssetService = new SystemAssetService(
    storageService,
    contentDigitalAssetService,
  );
  // IdentityService / FlexService 构造早于台账服务（DigitalAssetService 依赖 IdentityService），
  // 拿不到构造函数注入，故按 deliverableSink 同口径后置回填字节写入槽位。
  identityService.systemAsset = systemAssetService;
  flexService.systemAsset = systemAssetService;
  // 存储底座巡检/迁移：存量 AIPDD 资产按批转存本站 OSS，可中断续跑。
  const storageMigrationService = new StorageMigrationService(
    prismaService,
    storageService,
    identityService,
  );
  // 营销工具产物登记通道（设计 §10）：任务成功的 CSV/报告经此存自有 OSS 并入数字资产台账。
  bigdataQueryService.deliverableSink = (userId, input) =>
    contentDigitalAssetService.registerDeliverable(userId, input);
  leadProspectingService.deliverableSink = (userId, input) =>
    contentDigitalAssetService.registerDeliverable(userId, input);
  // 智慧分析：快报产物入数字资产、采集派发复用浏览器代理计划任务、打标复用视觉理解。
  insightService.deliverableSink = (userId, input) =>
    contentDigitalAssetService.registerDeliverable(userId, input);
  insightService.schedule = rpaChromeScheduleService;
  insightService.hostChannel = botHostService;
  insightService.vision = new AssetVisionService(prismaService);
  insightService.media = contentMediaService;
  const contentAgentLibraryService = new ContentAgentLibraryService(
    prismaService,
    contentModelSettingService,
    aipddAssetClient,
    contentDigitalAssetService,
    identityService,
  );
  // 智能硬件：型号/开发包/设备/工具/授权 + 设备通道 + 独立 MCP；控制器由契约 moduleHandlers（Hw_/AdminHw_）注册。
  // 实例化提前到 Agent 工具装配之前：站内 Agent 的 hw__ 工具派发要用它（prisma/oss 均已就绪）。
  const hardwareService = new HardwareService(
    prismaService,
    systemAssetService,
  );
  const contentAgentTools = {
    media: contentMediaService,
    memory: contentAgentMemoryService,
    skills: contentAgentSkillService,
    connectors: contentAgentConnectorService,
    library: contentAgentLibraryService,
    prisma: prismaService,
    identity: identityService,
    hardware: hardwareService,
    // Agent 群控工具（dispatchScope 勾选后注入）：读写都经 AgentDispatchService 收口到 BotHostService 受控方法
    dispatch: agentDispatchService,
    // 统一 RAG 出口（kb_retrieve）：kb 装配在下方，闭包延后解析
    retrieve: (user: CurrentUser, input: RetrieveInput) =>
      kbRetrieveService.retrieve(user, input),
    // 会话沉淀到知识库（save_to_kb）：没指定空间就写进账号的智能记忆库
    writeKbPage: async (
      user: CurrentUser,
      input: { title: string; content: string; spaceId?: number },
    ) => {
      const spaceId =
        input.spaceId && input.spaceId > 0
          ? input.spaceId
          : (await kbSpaceService.ensureAgentSpace(user.userId)).id;
      return kbPageService.writePage(
        {
          spaceId,
          slug: normalizeSlug(
            `agent-${input.title}-${Date.now().toString(36)}`,
          ),
          type: 'SYNTHESIS',
          title: input.title,
          body: input.content,
          frontmatter: { tags: ['agent', 'conversation'] },
          status: 'PUBLISHED',
          sourceIds: [],
        },
        user,
      );
    },
    // 首批业务动作工具：各模块服务装配在下方，闭包延后解析（TDZ 只在调用时生效）
    business: {
      crmLeads: {
        create: (user: CurrentUser, body: Record<string, unknown>) =>
          crmLeadService.create(user, body),
      },
      dataTable: {
        list: (user: CurrentUser) => dataTableService.list(user),
        createRow: (user: CurrentUser, tableId: number, data: unknown) =>
          dataTableService.createRow(user, tableId, data),
      },
      erp: {
        listStock: (
          user: CurrentUser,
          query: Parameters<ErpService['listStock']>[1],
        ) => erpService.listStock(user, query),
      },
      oa: {
        saveDraft: (user: CurrentUser, body: Record<string, unknown>) =>
          oaService.saveDraft(user, body),
        submit: (user: CurrentUser, id: string) => oaService.submit(user, id),
      },
      // 本地 Chrome 插件 RPA：设备清单与会话生命周期，均以登录人身份进真实服务。
      rpaChrome: {
        listDevices: (user: CurrentUser) =>
          rpaChromeDeviceService.listDevices(user),
        startSession: (user: CurrentUser, body: Record<string, unknown>) =>
          chromeAgentService.startSession(user, body),
        session: (user: CurrentUser, id: number) =>
          chromeAgentService.sessionView(user, id),
        pauseSession: (user: CurrentUser, id: number) =>
          chromeAgentService.pauseSession(user, id),
        resumeSession: (user: CurrentUser, id: number) =>
          chromeAgentService.resumeSession(user, id),
        stopSession: (user: CurrentUser, id: number) =>
          chromeAgentService.stopSession(user, id),
        retryStep: (user: CurrentUser, stepId: number) =>
          chromeAgentService.retryStep(user, stepId),
      },
    },
  };
  const contentAgentEngine = new ContentAgentEngine(
    contentModelSettingService,
    contentAgentTools,
  );
  const contentAgentService = new ContentAgentService(
    prismaService,
    contentAgentMemoryService,
    contentAgentSkillService,
    contentAgentExpertService,
    contentAgentConnectorService,
    contentAgentEngine,
    contentAgentTools,
  );
  const contentJobService = new ContentJobService(
    prismaService,
    contentModelSettingService,
    contentMediaService,
    contentDigitalAssetService,
    aipddAssetClient,
  );
  const canvasProjectService = new CanvasProjectService(
    prismaService,
    contentJobService,
    contentDigitalAssetService,
  );
  // 任务调度池：DB 唯一真值，每轮按剩余并发槽捞 PENDING（main.ts 启动/停机关闭）
  const contentJobPool = new ContentJobWorkerPool(
    prismaService,
    contentJobService,
  );
  const contentAgentScheduleService = new ContentAgentScheduleService(
    prismaService,
    identityService,
    userLookupService,
    hrmScopeService,
    contentAgentService,
    contentAgentExpertService,
  );
  const contentAgentAssistantService = new ContentAgentAssistantService(
    prismaService,
    identityService,
    contentAgentService,
  );
  const contentAssetShareService = new AssetShareService(
    prismaService,
    userLookupService,
  );
  // 工作流服务依赖 orgContextService（在文件后半段构造）；Agent 工具目录要读到
  // 已共享工作流，故先占位、构造完成后回填，ContentController 惰性取用。
  const workflowRef: { service?: WorkflowService } = {};
  const contentController = new ContentController(
    contentModelSettingService,
    contentAssetService,
    contentAgentService,
    contentJobService,
    contentDigitalAssetService,
    contentAgentLibraryService,
    contentAgentScheduleService,
    contentAgentAssistantService,
    contentAssetShareService,
    contentAgentConnectorService,
    contentAgentSkillService,
    canvasProjectService,
    systemAssetService,
    (user) =>
      workflowRef.service
        ? workflowRef.service.toolSpecs(user)
        : Promise.resolve([]),
  );
  const appDirectoryService = new AppDirectoryService();
  const appDirectoryController = new AppDirectoryController(
    appDirectoryService,
  );
  const mailboxService = new MailboxService(
    prismaService,
    identityService,
    new MailCrypto(),
  );
  const mailboxController = new MailboxController(mailboxService);
  const snsService = new SnsService(prismaService, identityService);
  const snsController = new SnsController(snsService);
  // 微信服务号：配置、绑定、推送、回调与重试调度；推送作为站内通知的旁路。
  const wechatMpSettingsService = new WechatMpSettingsService(prismaService);
  const wechatMpClient = new WechatMpClient(wechatMpSettingsService);
  const wechatMpBindingService = new WechatMpBindingService(
    prismaService,
    wechatMpSettingsService,
    wechatMpClient,
    userLookupService,
    identityService,
  );
  const wechatMpPushService = new WechatMpPushService(
    prismaService,
    wechatMpSettingsService,
    wechatMpClient,
    wechatMpBindingService,
    userLookupService,
  );
  const wechatMpInboundService = new WechatMpInboundService(
    prismaService,
    wechatMpSettingsService,
    wechatMpBindingService,
  );
  const wechatMpController = new WechatMpController(
    wechatMpSettingsService,
    wechatMpBindingService,
    wechatMpPushService,
    wechatMpClient,
    identityService,
  );
  const wechatMpScheduler = new WechatMpRetryScheduler(wechatMpPushService);
  // 用户版小程序：后台托管代码包台账 + 小程序码，公开通道（启动配置 / 免登）由 app.ts 取用。
  const miniProgramSettingsService = new MiniProgramSettingsService(
    prismaService,
  );
  const miniProgramClient = new MiniProgramClient(miniProgramSettingsService);
  const miniProgramService = new MiniProgramService(
    prismaService,
    storageService,
    systemAssetService,
    miniProgramSettingsService,
    miniProgramClient,
  );
  const miniProgramController = new MiniProgramController(
    miniProgramSettingsService,
    miniProgramService,
    miniProgramClient,
    identityService,
  );
  // 微信支付 v3 客户端（积分充值与自营店铺收款共用一个实例，凭据按次传入）
  const wechatPayClient = new WechatPayClient();
  // 工具用量计量：圈子等模块在装配早期就要注入，声明必须早于使用点。
  const toolLaunchMeterService = new ToolLaunchMeterService(prismaService);

  // 建站管理底座：按店铺归属的自营主体凭据（上门服务工具第一站用上，后续电商工具同表）。
  const miniAppService = new MiniAppService(prismaService, miniProgramClient);
  // 上门服务小程序工具：店铺与平台参数 → 出包直传 → C 端顾客，公开通道由 app.ts 注册。
  const onsitePlatformService = new OnsitePlatformService(
    prismaService,
    identityService,
  );
  const onsiteShopService = new OnsiteShopService(
    prismaService,
    miniAppService,
    onsitePlatformService,
  );
  const onsiteReleaseService = new OnsiteReleaseService(
    prismaService,
    storageService,
    systemAssetService,
    miniAppService,
    miniProgramClient,
    onsiteShopService,
  );
  const onsitePosterService = new OnsitePosterService(
    prismaService,
    onsiteReleaseService,
    systemAssetService,
    onsiteShopService,
  );
  const onsiteCustomerService = new OnsiteCustomerService(
    prismaService,
    miniProgramClient,
    miniAppService,
    onsiteShopService,
  );
  // P1 目录与引擎：服务目录、技师档案、排期时间轴（唯一实现点）、城市与车费、内容表单。
  const onsiteCatalogService = new OnsiteCatalogService(
    prismaService,
    onsiteShopService,
  );
  const onsiteStaffService = new OnsiteStaffService(
    prismaService,
    onsiteShopService,
  );
  const onsiteScheduleService = new OnsiteScheduleService(
    prismaService,
    onsiteShopService,
  );
  const onsiteCityService = new OnsiteCityService(
    prismaService,
    onsiteShopService,
    miniAppService,
  );
  const onsiteContentService = new OnsiteContentService(
    prismaService,
    onsiteShopService,
    onsiteStaffService,
  );

  // 电商小程序工具（工作台 → 建站管理 → 电商小程序工具）：主体凭据与出包直传走私域底座，
  // 一个店铺一部独立小程序；公开顾客通道由 app.ts 注册。
  const brandPlatformService = new BrandPlatformService(
    prismaService,
    identityService,
  );
  const brandShopService = new BrandShopService(
    prismaService,
    miniAppService,
    brandPlatformService,
  );
  const brandShippingService = new BrandShippingService(prismaService);
  // SCRM 松耦合格子：商城只经 ScrmBridge 类型调用；真实实现落在 wecom-scrm 侧，
  // 未接入/停用时它自己返回降级值，永不抛错，所以这里始终注入真实桥即可。
  // 来源渠道标签：同一企微联系人可同时拥有多个小程序的来源 AUTO 标签。
  const scrmSourceTagService = new ScrmSourceTagService(prismaService);
  const brandScrmService = new BrandScrmService(
    prismaService,
    new WecomScrmBridge(prismaService),
    scrmSourceTagService,
  );
  const brandGoodsService = new BrandGoodsService(
    prismaService,
    brandShippingService,
  );
  brandGoodsService.productQuotaLoader = async () =>
    (await brandPlatformService.limits()).productQuota;
  const brandDiyService = new BrandDiyService(prismaService);
  const brandReleaseService = new BrandReleaseService(
    prismaService,
    storageService,
    systemAssetService,
    miniAppService,
    miniProgramClient,
    brandShopService,
  );
  const brandStatService = new BrandStatService(
    prismaService,
    identityService,
    brandPlatformService,
  );
  const brandCouponService = new BrandCouponService(
    prismaService,
    brandScrmService,
  );
  const brandCustomerService = new BrandCustomerService(
    prismaService,
    miniProgramClient,
    miniAppService,
    brandShopService,
    brandScrmService,
  );
  const brandPayService = new BrandPayService(
    prismaService,
    miniAppService,
    brandPlatformService,
    wechatPayClient,
  );
  const brandOrderService = new BrandOrderService(
    prismaService,
    brandShopService,
    brandCustomerService,
    brandCouponService,
    brandPayService,
    brandShippingService,
    brandScrmService,
  );
  // 外卖点餐：独立 takeout_* 数据域，只复用登录令牌、微信支付客户端、SCRM 桥与算价引擎。
  const takeoutShopService = new TakeoutShopService(prismaService);
  const takeoutGoodsService = new TakeoutGoodsService(prismaService);
  const takeoutScrmService = new TakeoutScrmService(
    prismaService,
    new WecomScrmBridge(prismaService),
    scrmSourceTagService,
  );
  const takeoutCustomerService = new TakeoutCustomerService(
    prismaService,
    miniProgramClient,
    miniAppService,
    takeoutScrmService,
  );
  const takeoutCouponService = new TakeoutCouponService(prismaService);
  const takeoutPayService = new TakeoutPayService(
    prismaService,
    takeoutShopService,
    miniAppService,
    wechatPayClient,
    async () => (await brandPlatformService.limits()).payAllowed,
  );
  const takeoutOrderService = new TakeoutOrderService(
    prismaService,
    takeoutShopService,
    takeoutCustomerService,
    takeoutCouponService,
    takeoutPayService,
    takeoutScrmService,
  );
  const takeoutController = new TakeoutController(
    takeoutShopService,
    takeoutGoodsService,
    takeoutOrderService,
    takeoutCouponService,
    miniAppService,
  );

  const brandController = new BrandController(
    brandShopService,
    brandGoodsService,
    brandDiyService,
    brandReleaseService,
    brandStatService,
    brandPlatformService,
    miniAppService,
    brandCustomerService,
    brandOrderService,
    brandCouponService,
    brandShippingService,
    brandScrmService,
  );
  const brandAdminController = new BrandAdminController(
    prismaService,
    brandStatService,
    brandPlatformService,
    identityService,
  );
  // 卡密商城小程序工具（工作台 → 建站管理）：店主自有微信商户号直收，平台只管配额与处置；
  // 顾客端走 app.ts 注册的 /api/public/card-shop 公开通道，客服复用系统 AI 客服（service-desk）。
  const cardShopPlatformService = new CardShopPlatformService(
    prismaService,
    identityService,
  );
  const cardShopSiteService = new CardShopSiteService(
    prismaService,
    miniAppService,
    cardShopPlatformService,
  );
  const cardShopGoodsService = new CardShopGoodsService(
    prismaService,
    cardShopSiteService,
    cardShopPlatformService,
  );
  const cardShopCardService = new CardShopCardService(
    prismaService,
    cardShopSiteService,
    cardShopPlatformService,
  );
  const cardShopReleaseService = new CardShopReleaseService(
    prismaService,
    storageService,
    systemAssetService,
    miniAppService,
    miniProgramClient,
    cardShopSiteService,
  );
  // 知识付费小程序工具（工作台 → 建站管理）：管理端由契约 moduleHandlers（Kp_）派发，
  // 小程序端会员走 app.ts 注册的 /api/public/knowledge-pay 公开通道。
  const knowledgePayService = new KnowledgePayService(
    prismaService,
    storageService,
  );
  const knowledgePayMemberService = new KnowledgePayMemberService(
    prismaService,
    knowledgePayService,
    miniProgramClient,
  );
  const knowledgePayPayService = new KnowledgePayPayService(
    prismaService,
    knowledgePayService,
    wechatPayClient,
  );
  const knowledgePayController = new KnowledgePayController(
    knowledgePayService,
    miniProgramClient,
    knowledgePayPayService,
  );
  // 数字人小程序工具（工作台 → 建站管理 → 数字人小程序工具）：管理端由契约 moduleHandlers（Dh_）派发，
  // 小程序端走 app.ts 注册的 /api/public/digital-human 公开通道；客服复用 service-desk。
  const dhChannelService = new DhChannelService(prismaService);
  const dhSiteService = new DhSiteService(
    prismaService,
    miniAppService,
    dhChannelService,
  );
  const dhMemberService = new DhMemberService(
    prismaService,
    miniAppService,
    miniProgramClient,
  );
  const dhLibraryService = new DhLibraryService(prismaService, dhMemberService);
  const dhSynthService = new DhSynthService(
    prismaService,
    dhMemberService,
    dhChannelService,
  );
  const dhContentService = new DhContentService(prismaService, dhMemberService);
  const dhPayService = new DhPayService(
    prismaService,
    miniAppService,
    wechatPayClient,
  );
  const dhCommissionService = new DhCommissionService(
    prismaService,
    dhMemberService,
    dhPayService,
  );
  const dhStoreService = new DhStoreService(
    prismaService,
    systemAssetService,
    dhMemberService,
    dhPayService,
    dhCommissionService,
  );
  const dhReleaseService = new DhReleaseService(
    prismaService,
    storageService,
    systemAssetService,
    miniAppService,
    miniProgramClient,
    dhMemberService,
  );
  const digitalHumanController = new DigitalHumanController(
    dhSiteService,
    dhMemberService,
    dhChannelService,
    dhLibraryService,
    dhSynthService,
    dhContentService,
    dhStoreService,
    dhCommissionService,
    dhReleaseService,
    miniAppService,
  );
  const notificationService = new NotificationService(
    prismaService,
    aiSocialNotifications,
    wechatMpPushService,
  );
  // 卡密商城交易域：订单售出通知依赖 NotificationService，所以这一组必须在它之后装配。
  const cardShopContentService = new CardShopContentService(
    prismaService,
    cardShopSiteService,
  );
  const cardShopCouponService = new CardShopCouponService(
    prismaService,
    cardShopSiteService,
  );
  const cardShopCustomerService = new CardShopCustomerService(
    prismaService,
    cardShopSiteService,
    miniProgramClient,
    miniAppService,
  );
  const cardShopPayService = new CardShopPayService(
    prismaService,
    cardShopSiteService,
    miniAppService,
    cardShopPlatformService,
    wechatPayClient,
  );
  const cardShopOrderService = new CardShopOrderService(
    prismaService,
    cardShopSiteService,
    cardShopPlatformService,
    cardShopGoodsService,
    cardShopContentService,
    cardShopCouponService,
    cardShopCustomerService,
    cardShopPayService,
    notificationService,
  );
  const cardShopController = new CardShopController(
    cardShopSiteService,
    cardShopGoodsService,
    cardShopCardService,
    cardShopReleaseService,
    cardShopPlatformService,
    miniAppService,
    cardShopOrderService,
    cardShopCouponService,
    cardShopCustomerService,
    cardShopContentService,
  );
  const cardShopAdminController = new CardShopAdminController(
    cardShopPlatformService,
    identityService,
    cardShopOrderService,
  );
  // 快递寄件小程序工具：站点 / 报价 / 订单履约 / 顾客 / 支付 / 出包，C 端走 app.ts 的公开通道。
  const kuaidiPlatformService = new KuaidiPlatformService(
    prismaService,
    identityService,
  );
  const kuaidiSiteService = new KuaidiSiteService(
    prismaService,
    miniAppService,
    kuaidiPlatformService,
  );
  const kuaidiCompanyService = new KuaidiCompanyService(
    prismaService,
    kuaidiSiteService,
  );
  const kuaidiCustomerService = new KuaidiCustomerService(
    prismaService,
    kuaidiSiteService,
    miniProgramClient,
    miniAppService,
  );
  const kuaidiPayService = new KuaidiPayService(
    prismaService,
    kuaidiSiteService,
    miniAppService,
    kuaidiPlatformService,
    identityService,
    wechatPayClient,
  );
  const kuaidiOrderService = new KuaidiOrderService(
    prismaService,
    kuaidiSiteService,
    kuaidiCustomerService,
    kuaidiPayService,
    kuaidiCompanyService,
  );
  const kuaidiReleaseService = new KuaidiReleaseService(
    prismaService,
    storageService,
    systemAssetService,
    miniAppService,
    miniProgramClient,
    kuaidiSiteService,
  );
  const kuaidiController = new KuaidiController(
    kuaidiSiteService,
    kuaidiCompanyService,
    kuaidiOrderService,
    kuaidiCustomerService,
    kuaidiReleaseService,
    kuaidiPlatformService,
    miniAppService,
    kuaidiPayService,
  );
  const kuaidiAdminController = new KuaidiAdminController(
    kuaidiPlatformService,
    identityService,
  );
  // 圈子社区：账号负责人＝社区管理员；C 端成员独立于站内账号，公开通道走 app.ts。
  const circleCommunityService = new CircleCommunityService(
    prismaService,
    miniAppService,
    userLookupService,
  );
  const circleUserService = new CircleUserService(
    prismaService,
    circleCommunityService,
    miniAppService,
    miniProgramClient,
    publishReviewService,
  );
  const circleGroupService = new CircleGroupService(
    prismaService,
    circleCommunityService,
    publishReviewService,
  );
  const circlePostService = new CirclePostService(
    prismaService,
    circleCommunityService,
    publishReviewService,
    toolLaunchMeterService,
  );
  const circleCommentService = new CircleCommentService(
    prismaService,
    circleCommunityService,
    publishReviewService,
  );
  const circleInteractionService = new CircleInteractionService(prismaService);
  const circleNotificationService = new CircleNotificationService(
    prismaService,
  );
  const circleReportService = new CircleReportService(prismaService);
  const circleMediaService = new CircleMediaService(
    prismaService,
    storageService,
    publishReviewService,
  );
  const circleAiService = new CircleAiService(prismaService);
  const circleActivityService = new CircleActivityService(prismaService);
  const circleMedalService = new CircleMedalService(prismaService);
  const circleSubscribeService = new CircleSubscribeService(
    prismaService,
    miniAppService,
    miniProgramClient,
    circleCommunityService,
  );
  const circleController = new CircleController(
    circleCommunityService,
    miniAppService,
    circleGroupService,
    circlePostService,
    circleCommentService,
    circleNotificationService,
    circleReportService,
    circleUserService,
    circleAiService,
    circleActivityService,
    circleMedalService,
    circleSubscribeService,
  );
  const circleAdminController = new CircleAdminController(
    circleCommunityService,
    identityService,
  );

  // 跑腿小程序：站点 / 计价 / 顾客 / 骑手 / 优惠券 / 钱包 / 支付 / 出包 / AI，C 端走 app.ts 公开通道。
  const errandPlatformService = new ErrandPlatformService(
    prismaService,
    identityService,
  );
  const errandSiteService = new ErrandSiteService(
    prismaService,
    miniAppService,
    errandPlatformService,
  );
  const errandCityService = new ErrandCityService(
    prismaService,
    errandSiteService,
  );
  const errandAgentService = new ErrandAgentService(
    prismaService,
    errandSiteService,
  );
  const errandCustomerService = new ErrandCustomerService(
    prismaService,
    errandSiteService,
    miniProgramClient,
    miniAppService,
  );
  const errandCouponService = new ErrandCouponService(
    prismaService,
    errandSiteService,
  );
  const errandPayService = new ErrandPayService(
    prismaService,
    miniAppService,
    errandPlatformService,
    wechatPayClient,
  );
  const errandWalletService = new ErrandWalletService(
    prismaService,
    errandSiteService,
    errandPayService,
  );
  const errandRiderService = new ErrandRiderService(
    prismaService,
    errandSiteService,
    miniProgramClient,
    miniAppService,
    errandWalletService,
  );
  const errandMapService = new ErrandMapService(miniAppService);
  const errandNotifyService = new ErrandNotifyService(
    miniAppService,
    miniProgramClient,
    notificationService,
  );
  const errandOrderService = new ErrandOrderService(
    prismaService,
    errandSiteService,
    errandCustomerService,
    errandRiderService,
    errandPayService,
    errandWalletService,
    errandMapService,
    errandNotifyService,
    errandAgentService,
  );
  const errandAiService = new ErrandAiService(
    prismaService,
    errandSiteService,
    errandPlatformService,
  );
  const errandReleaseService = new ErrandReleaseService(
    prismaService,
    storageService,
    systemAssetService,
    miniAppService,
    miniProgramClient,
    errandSiteService,
  );
  const errandController = new ErrandController(
    prismaService,
    errandSiteService,
    errandCityService,
    errandAgentService,
    errandOrderService,
    errandRiderService,
    errandCustomerService,
    errandCouponService,
    errandWalletService,
    errandReleaseService,
    errandAiService,
    miniAppService,
  );
  const errandAdminController = new ErrandAdminController(
    errandPlatformService,
    identityService,
  );
  // 订单与触达：通知服务构造更晚，这两个必须在它之后装配（触达是旁路，不参与鉴权链）。
  const onsiteNotifyService = new OnsiteNotifyService(
    prismaService,
    miniAppService,
    miniProgramClient,
    notificationService,
  );
  // P2：钱包与分账只依赖 prisma + 店铺鉴权，先于订单构造，订单支付后要发佣与发邀请奖励。
  const onsiteWalletService = new OnsiteWalletService(
    prismaService,
    onsiteShopService,
  );
  const onsiteCommissionService = new OnsiteCommissionService(
    prismaService,
    onsiteShopService,
  );
  const onsiteMarketingService = new OnsiteMarketingService(
    prismaService,
    onsiteShopService,
    onsiteWalletService,
  );
  const onsiteAgentService = new OnsiteAgentService(
    prismaService,
    onsiteShopService,
  );
  const onsiteOrderService = new OnsiteOrderService(
    prismaService,
    onsiteShopService,
    onsiteScheduleService,
    onsiteCityService,
    miniAppService,
    wechatPayClient,
    onsiteNotifyService,
    onsiteCommissionService,
    onsiteMarketingService,
    onsiteWalletService,
  );
  // 售后与口碑：退款要能打微信原路退回并回写台账，评价要能重算口碑分，报警只走站内提醒。
  const onsiteRefundService = new OnsiteRefundService(
    prismaService,
    onsiteShopService,
    miniAppService,
    wechatPayClient,
    onsiteScheduleService,
    onsiteNotifyService,
    onsiteCommissionService,
  );
  const onsiteReviewService = new OnsiteReviewService(
    prismaService,
    onsiteShopService,
    onsiteNotifyService,
  );
  const onsiteAlertService = new OnsiteAlertService(
    prismaService,
    onsiteShopService,
    onsiteNotifyService,
  );
  const onsiteAssistService = new OnsiteAssistService(
    prismaService,
    onsiteShopService,
    {
      // 运行时才取用，此时 featureToggleService 已装配完成
      isOpen: (code, orgUserId) => featureToggleService.isOpen(code, orgUserId),
    },
  );
  const onsiteController = new OnsiteController(
    onsiteShopService,
    miniAppService,
    onsiteReleaseService,
    onsitePosterService,
    onsiteCatalogService,
    onsiteStaffService,
    onsiteScheduleService,
    onsiteCityService,
    onsiteContentService,
    onsiteOrderService,
    onsiteRefundService,
    onsiteReviewService,
    onsiteAlertService,
    onsiteAssistService,
    onsiteCustomerService,
    onsiteMarketingService,
    onsiteWalletService,
    onsiteCommissionService,
    onsiteAgentService,
  );
  const onsiteAdminController = new OnsiteAdminController(
    onsitePlatformService,
  );
  // 多店铺商城平台（B2B2C）B0：市场运营方（Market_）、商户后台（独立令牌通道）、
  // 平台类目与平台管理员台账（MpAdmin_）四个服务；商户通道由根 app 手写注册。
  const mpCategoryService = new MpCategoryService(prismaService);
  const mpMarketService = new MpMarketService(prismaService);
  const mpMerchantService = new MpMerchantService(prismaService);
  const mpPlatformService = new MpPlatformService(prismaService);
  const mpCatalogService = new MpCatalogService(
    prismaService,
    mpMerchantService,
  );
  const mpPayService = new MpPayService(
    prismaService,
    miniAppService,
    wechatPayClient,
  );
  const mpFinanceService = new MpFinanceService(
    prismaService,
    mpMerchantService,
  );
  const mpDiyService = new MpDiyService(prismaService, mpMerchantService);
  // 企微 SCRM：与品牌商城共用端口与真实桥，但 outbox 按商户维度记账（B4）。
  const mpScrmService = new MpScrmService(
    prismaService,
    new WecomScrmBridge(prismaService),
    scrmSourceTagService,
  );
  const mpCouponService = new MpCouponService(
    prismaService,
    mpMerchantService,
    mpScrmService,
  );
  const mpFollowService = new MpFollowService(prismaService);
  const mpTradeService = new MpTradeService(
    prismaService,
    mpMerchantService,
    miniAppService,
    miniProgramClient,
    mpPayService,
    mpFinanceService,
    mpDiyService,
    mpCouponService,
    mpFollowService,
    mpScrmService,
  );
  const mpAftersaleService = new MpAftersaleService(
    prismaService,
    mpMerchantService,
    mpPayService,
    mpScrmService,
  );
  const mpReleaseService = new MpReleaseService(
    prismaService,
    storageService,
    systemAssetService,
    miniAppService,
    miniProgramClient,
    mpMarketService,
  );
  const marketplaceController = new MarketplaceController(
    mpMarketService,
    mpMerchantService,
    mpCategoryService,
    mpCatalogService,
    mpAftersaleService,
    mpFinanceService,
    mpReleaseService,
    mpDiyService,
    mpCouponService,
    mpScrmService,
  );
  const marketplaceAdminController = new MarketplaceAdminController(
    mpPlatformService,
    (user) => identityService.requireAdmin(user),
  );
  // 群控任务终态的站内信出口（方案 §4.4、§4.7）：通知服务比这两个服务构造更晚，装配后再交给设备回执与云端追平两条链路。
  const dispatchTerminalNotice = async (
    userId: string,
    input: BotTerminalNoticePayload,
  ) => {
    await notificationService.notify(userId, {
      category: 'bot',
      title: input.title,
      body: input.body,
      level: input.level,
      link: '/agent?tab=dispatch',
      entityType: input.entityType,
      entityId: input.commandCode,
    });
  };
  botHostService.terminalNotice = dispatchTerminalNotice;
  workbuddyCloudService.terminalNotice = dispatchTerminalNotice;
  const notificationController = new NotificationController(
    notificationService,
  );
  const questionHallController = new QuestionHallController(
    new QuestionHallService(
      prismaService,
      identityService,
      notificationService,
      contentModelSettingService,
    ),
  );
  const orgStaffService = new OrgStaffService(
    prismaService,
    userLookupService,
    identityService,
    notificationService,
  );
  const orgStaffController = new OrgStaffController(orgStaffService);
  const imService = new ImService(
    prismaService,
    identityService,
    new ImCrypto(),
    orgStaffService,
    notificationService,
  );
  const imController = new ImController(imService);

  const serviceDeskService = new ServiceDeskService(
    prismaService,
    identityService,
    userLookupService,
    notificationService,
    systemAssetService,
    contentModelSettingService,
  );
  const serviceDeskController = new ServiceDeskController(serviceDeskService);
  // 商城开店即自动开通专属客服站点：客服服务构建在商城之后，用钩子回填避免装配乱序
  takeoutShopService.deskSiteHook = {
    view: (ownerUserId, id) => serviceDeskService.siteRef(ownerUserId, id),
    ensure: (ownerUserId, name) =>
      serviceDeskService.ensureSite(ownerUserId, name),
  };
  brandShopService.deskSiteHook = {
    view: (ownerUserId, id) => serviceDeskService.siteRef(ownerUserId, id),
    ensure: (ownerUserId, name) =>
      serviceDeskService.ensureSite(ownerUserId, name),
  };
  // 多店铺商城：市场 = 一个小程序实例，客服站点同样落到市场运营方名下
  mpMarketService.deskSiteHook = {
    view: (ownerUserId, id) => serviceDeskService.siteRef(ownerUserId, id),
    ensure: (ownerUserId, name) =>
      serviceDeskService.ensureSite(ownerUserId, name),
  };
  const livecodeService = new LivecodeService(prismaService, ossService);
  const livecodeController = new LivecodeController(livecodeService);
  const overseasNavService = new OverseasNavService(prismaService);
  const overseasNavController = new OverseasNavController(overseasNavService);
  const lowcodeAccessService = new LowCodeAccessService(
    prismaService,
    identityService,
    hrmScopeService,
  );
  const lowcodeService = new LowCodeService(
    prismaService,
    identityService,
    userLookupService,
    notificationService,
    lowcodeAccessService,
  );
  const lowcodeContentService = new LowCodeContentService(
    prismaService,
    identityService,
    dataTableService,
    lowcodeAccessService,
  );
  const lowcodeRowService = new LowCodeRowService(
    prismaService,
    dataTableService,
    lowcodeAccessService,
  );
  const lowcodeApprovalService = new LowCodeApprovalService(
    prismaService,
    lowcodeAccessService,
    dataTableService,
    notificationService,
    userLookupService,
    identityService,
  );
  const lowcodeAiService = new LowCodeAiService(
    prismaService,
    lowcodeAccessService,
    contentModelSettingService,
  );
  const lowcodeAssetsService = new LowCodeAssetsService(
    contentDigitalAssetService,
    lowcodeAccessService,
  );
  const lowcodeController = new LowCodeController(
    lowcodeService,
    lowcodeContentService,
    lowcodeRowService,
    lowcodeApprovalService,
    lowcodeAiService,
    lowcodeAssetsService,
  );
  const tenantScopeService = new TenantScopeService(prismaService);
  const crmScopeService = new CrmScopeService(
    prismaService,
    userLookupService,
    tenantScopeService,
  );
  const crmSettingsService = new CrmSettingsService(
    prismaService,
    crmScopeService,
  );
  const crmLeadService = new CrmLeadService(
    prismaService,
    crmScopeService,
    crmSettingsService,
  );
  const crmCustomerService = new CrmCustomerService(
    prismaService,
    crmScopeService,
    crmSettingsService,
  );
  const crmFollowService = new CrmFollowService(
    prismaService,
    crmScopeService,
    crmSettingsService,
  );
  const crmProductService = new CrmProductService(
    prismaService,
    crmScopeService,
  );
  const crmOpportunityService = new CrmOpportunityService(
    prismaService,
    crmScopeService,
    crmSettingsService,
  );
  const crmContractService = new CrmContractService(
    prismaService,
    crmScopeService,
    crmSettingsService,
  );
  const crmOrderService = new CrmOrderService(
    prismaService,
    crmScopeService,
    crmSettingsService,
  );
  const crmApprovalService = new CrmApprovalService(
    prismaService,
    crmScopeService,
    crmSettingsService,
  );
  const crmReportService = new CrmReportService(
    prismaService,
    crmScopeService,
    crmSettingsService,
    dataTableService,
  );
  const crmAiService = new CrmAiService(
    prismaService,
    crmScopeService,
    contentModelSettingService,
  );
  const crmController = new CrmController(
    crmScopeService,
    crmSettingsService,
    crmLeadService,
    crmCustomerService,
    crmFollowService,
    crmProductService,
    crmOpportunityService,
    crmContractService,
    crmOrderService,
    crmApprovalService,
    crmReportService,
    crmAiService,
  );
  // HRM 组织口径：企点客户导入要判断 SCRM 同步源，与 SCRM 共用同一套组织归属。
  const tencentQidianService = new TencentQidianService(
    prismaService,
    identityService,
    notificationService,
    new TencentQidianCrypto(),
    dataTableService,
    crmReportService,
    hrmScopeService,
  );
  const tpController = new TencentQidianController(tencentQidianService);
  // 企点分群导出产物也进数字资产（与大数据/潜客同一登记通道）。
  tencentQidianService.deliverableSink = (userId, input) =>
    contentDigitalAssetService.registerDeliverable(userId, input);
  const biScopeService = new BiScopeService(
    prismaService,
    userLookupService,
    tenantScopeService,
  );
  const biDatasourceService = new BiDatasourceService(
    prismaService,
    biScopeService,
    new BiCrypto(),
  );
  const biQueryService = new BiQueryService(
    prismaService,
    biScopeService,
    crmScopeService,
    biDatasourceService,
  );
  const biDatasetService = new BiDatasetService(
    prismaService,
    biScopeService,
    biQueryService,
  );
  const biChatService = new BiChatService(
    prismaService,
    biScopeService,
    biQueryService,
    contentModelSettingService,
  );
  const biChartService = new BiChartService(
    prismaService,
    biScopeService,
    biQueryService,
  );
  const biDashboardService = new BiDashboardService(
    prismaService,
    biScopeService,
    biQueryService,
  );
  const biSettingsService = new BiSettingsService(
    prismaService,
    biScopeService,
    biQueryService,
    biChartService,
    dataTableService,
  );
  const biController = new BiController(
    biScopeService,
    biDatasourceService,
    biDatasetService,
    biChatService,
    biChartService,
    biDashboardService,
    biSettingsService,
  );
  const partyService = new PartyService(prismaService, tenantScopeService);
  const partyController = new PartyController(partyService);
  const okrScopeService = new OkrScopeService(
    prismaService,
    userLookupService,
    tenantScopeService,
  );
  const okrMetricsService = new OkrMetricsService(
    prismaService,
    crmScopeService,
    dataTableService,
    lowcodeAccessService,
    notificationService,
  );
  const okrService = new OkrService(
    prismaService,
    okrScopeService,
    okrMetricsService,
    notificationService,
  );
  const okrBriefService = new OkrBriefService(prismaService, okrScopeService);
  const okrTaskLinkageService = new OkrTaskLinkageService(prismaService);
  const okrDecompositionService = new OkrDecompositionService(
    prismaService,
    okrScopeService,
    okrBriefService,
    okrService,
    notificationService,
    okrTaskLinkageService,
  );
  const okrController = new OkrController(
    okrService,
    okrBriefService,
    okrDecompositionService,
  );
  // 租户 RBAC：主账号子账号与写操作留痕（守卫在 app.ts 挂载）。
  const rbacService = new RbacService(prismaService);
  const rbacController = new RbacController(rbacService);
  const oaScopeService = new OaScopeService(
    prismaService,
    userLookupService,
    tenantScopeService,
  );
  const oaTemplateService = new OaTemplateService(prismaService);
  const oaFlowService = new OaFlowService((ctx) => oaScopeService.members(ctx));
  const oaLinkageService = new OaLinkageService(
    prismaService,
    crmScopeService,
    crmSettingsService,
    contractsService,
    identityService,
    dataTableService,
    lowcodeAccessService,
  );
  const oaInboxService = new OaInboxService(
    prismaService,
    crmApprovalService,
    invoiceService,
    flexService,
    contractsService,
  );
  const oaService = new OaService(
    prismaService,
    oaScopeService,
    oaTemplateService,
    oaFlowService,
    oaLinkageService,
    oaInboxService,
    notificationService,
    contentMediaService,
  );
  const oaController = new OaController(oaService);
  // 统一任务中心：Pull 源聚合各板块待办，Push 通道供各模块派发 @ 到某账号。
  const riskServiceRef: { current?: OperationRiskService } = {};
  const taskSourceRegistry = registerTaskSources(
    new TaskSourceRegistry(),
    prismaService,
    {
      identity: identityService,
      marketing: marketingService,
      logistics: logisticsService,
      tax: taxService,
      risks: () => riskServiceRef.current,
      chrome: () => chromeAgentService,
    },
  );
  const taskCenterService = new TaskCenterService(
    prismaService,
    taskSourceRegistry,
    notificationService,
  );
  // 浏览器代理（docs §8.4）：敏感动作待确认 / 需登录时，向操作人派确认与登录待办。
  chromeAgentService.useTaskCenter(taskCenterService);
  // 派单原语：规则 > 板块默认承办人 > 机构队列；改派时任务与业务单据同事务。
  const taskDocumentRegistry = registerTaskDocumentBindings();
  const taskRouterService = new TaskRouterService(
    prismaService,
    taskCenterService,
    taskDocumentRegistry,
    identityService,
    notificationService,
  );
  const taskCenterController = new TaskCenterController(
    taskCenterService,
    taskRouterService,
  );
  const taskAssignmentService = new TaskAssignmentService(
    prismaService,
    identityService,
  );
  const taskAssignmentController = new TaskAssignmentController(
    taskAssignmentService,
  );
  supplyService.useTaskDispatch(taskRouterService);
  // 账号级界面偏好（跨设备）：本轮承载驾驶舱「快捷导航」。
  const uiPreferencesService = new UiPreferencesService(prismaService);
  const uiPreferencesController = new UiPreferencesController(
    uiPreferencesService,
  );
  // 积分与计费域（设计方案 P2/P3/P5）：账户/流水/设置/定价/充值/AWcoin/日批出账。
  // 构造在此集中一处，供 account 注册赠分、bi/oa/service-desk 扣费、数字资产与营销产物登记取用。
  const accountCrypto = new AccountCrypto();
  const pointsSettingsService = new PointsSettingsService(
    prismaService,
    accountCrypto,
  );
  const pointsService = new PointsService(prismaService, pointsSettingsService);
  // GEO 独立站按月出账：依赖积分台账，构造晚于 pointsService。
  const geoSiteBillingService = new GeoSiteBillingService(
    prismaService,
    pointsService,
    geoSiteSettingsService,
  );
  const geoSiteScheduler = new GeoSiteScheduler(
    geoSiteBillingService,
    geoSiteDomainService,
  );
  // 建站工具「启动设置」：一个账号一个工具一条订阅，未启动＝C 端停服 + 禁出包 + 管理端只读，且不扣积分。
  // 依赖积分台账出首期，构造同样晚于 pointsService；日批调度在 main.ts 启停。
  const toolLaunchSettingsService = new ToolLaunchSettingsService(
    prismaService,
    identityService,
  );
  const toolLaunchService = new ToolLaunchService(
    prismaService,
    pointsService,
    toolLaunchSettingsService,
  );
  const toolLaunchBillingService = new ToolLaunchBillingService(
    prismaService,
    pointsService,
    toolLaunchSettingsService,
    toolLaunchService,
  );
  // 公开通道与出包链路按工具名取闸门：横切依赖在此装配一次，见 tool-launch.holder.ts。
  bindToolLaunch(toolLaunchService);
  bindToolLaunchBilling(toolLaunchBillingService);
  const toolLaunchScheduler = new ToolLaunchScheduler(
    toolLaunchBillingService,
    toolLaunchMeterService,
  );
  const toolLaunchAdminService = new ToolLaunchAdminService(
    prismaService,
    toolLaunchService,
    toolLaunchSettingsService,
    userLookupService,
  );
  const toolLaunchController = new ToolLaunchController(toolLaunchService);
  const toolLaunchAdminController = new ToolLaunchAdminController(
    toolLaunchAdminService,
    toolLaunchService,
    (user) => identityService.requireAdmin(user),
  );
  // 小程序发布说明：正文后台维护，域名/账号参数按站点与本账号根实体自动渲染。
  const miniGuideService = new MiniGuideService(prismaService, storageService);
  const miniGuideController = new MiniGuideController(miniGuideService);
  const miniGuideAdminController = new MiniGuideAdminController(
    miniGuideService,
    (user) => identityService.requireAdmin(user),
  );
  // 二次开发指引：正文真源在 docs/dev-kit/，后台只读渲染并分发套件；库内仅存本站补充说明。
  const devGuideService = new DevGuideService(prismaService);
  const devGuideAdminController = new DevGuideAdminController(
    devGuideService,
    (user) => identityService.requireAdmin(user),
  );
  // 视频模版社区：发布、付费查看（查看者扣分 / 发布者入账）、评分与复刻生成；
  // AIWORKIN 平台模版的展示开关与定时补充由后台设置驱动，调度器在 main.ts 启动。
  const videoTemplateService = new VideoTemplateService(
    prismaService,
    userLookupService,
    pointsService,
    contentJobService,
    aiworkinClient,
  );
  const videoTemplateController = new VideoTemplateController(
    videoTemplateService,
  );
  const videoTemplateSyncScheduler = new VideoTemplateSyncScheduler(
    videoTemplateService,
  );
  const pricingService = new PricingService(prismaService);
  // 官方服务套餐：目录 + 积分直购 + 平台整合交付（主持企业与多家服务商签约兑现）。
  // 交付服务复用 contracts 主持发起/撤销与 points 退款；目录服务购买后 best-effort 自动发起。
  const servicePackageFulfillment = new ServicePackageFulfillmentService(
    prismaService,
    identityService,
    pointsService,
    contractsService,
    userLookupService,
  );
  const servicePackageService = new ServicePackageService(
    prismaService,
    identityService,
    pointsService,
    pointsSettingsService,
    userLookupService,
    servicePackageFulfillment,
  );
  // L0 平台治理底座（§5.9/§5.10/§5.12）：功能开关、访问策略、审查台账、按用量计费规则。
  const featureToggleService = new FeatureToggleService(prismaService);
  const accessPolicyService = new AccessPolicyService(prismaService);
  const skillReviewService = new SkillReviewService(prismaService);
  const skillReviewRunner = new SkillReviewRunner(
    prismaService,
    skillReviewService,
    accessPolicyService,
    contentModelSettingService,
  );
  // §5.9 先审后用：技能/插件入库（上传/覆盖/安装/回滚）后异步起审，
  // 静态硬红线直接拒收，LLM 绝对安全门通过后才允许启用。
  contentAgentSkillService.reviewHook = (kind, itemId, userId) =>
    skillReviewRunner.enqueue(kind, itemId, userId);
  // 上传入口改为同步审查：用户配置的 LLM 分析结果决定放行/拒绝，不安全不落库；
  // 确定性四组规则作为补充证据与既有红线兜底（不替换原策略）。
  contentAgentSkillService.uploadReview = (userId, pkg) =>
    skillReviewRunner.reviewPackage(userId, pkg);
  // 运行期复扫与出站黑名单共用平台访问策略
  contentAgentSkillService.blacklistProvider = async () =>
    (await accessPolicyService.current()).blacklist;
  // 2.1 单轮请求上限走平台沙箱硬上限（技能正文无权调大）
  contentAgentEngine.guardOptions = async () => {
    const policy = await accessPolicyService.current();
    return {
      maxToolCalls: policy.limits.maxRequestsPerRun,
      maxOutputChars: 400_000,
    };
  };
  const billingRuleService = new BillingRuleService(prismaService);
  // ai-eval 计费收口（§5.12）：所有 AI 链路出结果后按 BillingRule 用量扣分；审查引擎接技。
  const aiEvalService = new AiEvalService(
    prismaService,
    billingRuleService,
    pointsService,
  );
  skillReviewRunner.chargeUsage = (userId, code, usage, refId) =>
    aiEvalService.chargeByUsage(userId, code, usage, refId);
  // 统一 AI 网关的计量出口（§4.4）：带科目按 BillingRule 扣分，不带科目只落用量事实、一分不扣。
  registerAiMetering({
    charge: (userId, code, usage, refId, meta) =>
      aiEvalService.chargeByUsage(userId, code, usage, refId, meta),
    record: (userId, usage, meta) =>
      aiEvalService.recordUsage(userId, usage, meta),
  });
  // L1 知识库底座（§10）：空间/源/页/摄取/检索/图谱/消费者/记忆提炼；
  // 可见性与写闸都在服务内部收口，路由层只解参与转发；LLM 不可用全部链路规则式回落。
  const kbSpaceService = new KbSpaceService(prismaService, identityService);
  const kbSourceService = new KbSourceService(prismaService, kbSpaceService);
  const kbPageService = new KbPageService(prismaService, kbSpaceService);
  const kbIngestService = new KbIngestService(
    prismaService,
    kbSpaceService,
    kbSourceService,
    kbPageService,
    aiEvalService,
  );
  const kbSearchService = new KbSearchService(
    prismaService,
    kbSpaceService,
    kbPageService,
    aiEvalService,
  );
  const kbGraphService = new KbGraphService(prismaService, kbSpaceService);
  const kbConsumerService = new KbConsumerService(
    prismaService,
    kbSpaceService,
  );
  const kbMemoryService = new KbMemoryService(
    prismaService,
    kbSpaceService,
    kbPageService,
    aiEvalService,
    identityService,
  );
  const kbRetrieveService = new KbRetrieveService(
    prismaService,
    kbSpaceService,
    kbSearchService,
    contentAgentLibraryService,
    helpService,
  );
  // Agent 的记忆与资料在知识库里的唯一落点（§10.4 整合）：长期记忆＝AGENT 空间的记忆页、
  // 资料库＝AGENT 空间的「资料」+ 摄取编译；Agent 侧两个服务只做翻译（设置口注入，避免构造顺序耦合）。
  const kbAgentStoreService = new KbAgentStoreService(
    prismaService,
    kbSpaceService,
    kbPageService,
    kbSourceService,
    kbIngestService,
    kbSearchService,
  );
  contentAgentMemoryService.store = kbAgentStoreService;
  contentAgentLibraryService.store = kbAgentStoreService;
  // 摄取管道（P1-A）：上传走本站 OSS、URL 抓取、飞书文档（凭据取自 IM 连接器）
  const kbIntakeService = new KbIntakeService(
    kbSpaceService,
    kbSourceService,
    storageService,
    () => imService.feishuAppCredentials(),
  );
  // 统一挂载（P1-A）：业务板块（客服/专题厅/法务/出海）按 consumerType 召回并综合作答
  const kbAssistService = new KbAssistService(
    prismaService,
    () => kbRetrieveService,
    () => aiEvalService,
  );
  // 客服 AI 回复前先召回知识：给了 spaceIds 就按空间召（纯AI客服员工自带范围），
  // 没给才按账号级 SERVICE_DESK 消费者绑定召（老配置行为不变）。
  serviceDeskService.kbRecall = (ownerUserId, query, spaceIds) =>
    kbRetrieveService
      .retrieve(new CurrentUser(ownerUserId, '', ''), {
        query,
        ...(spaceIds?.length
          ? { spaceIds }
          : { consumerType: 'SERVICE_DESK' as const, consumerId: ownerUserId }),
        topK: 4,
        maxChars: 1200,
      })
      .then((result) => ({
        text: result.snippets
          .map((snippet) => `- ${snippet.title}：${snippet.text}`)
          .join('\n'),
        references: result.snippets.map((snippet) => ({
          title: snippet.title,
          ref: snippet.ref,
        })),
      }));
  // 客服闭环（P4-5）：会话派交付任务进任务中心；解决稿写成待审知识页（绝不直发）。
  serviceDeskService.tasks = taskCenterService;
  serviceDeskService.kbDraft = async (input) => {
    const actor = new CurrentUser(input.actorId, '', '');
    const space = input.spaceId
      ? await kbSpaceService.loadReadable(input.spaceId, actor)
      : await kbSpaceService.resolveActiveSpace(actor);
    const page = await kbPageService.writePage(
      {
        spaceId: space.id,
        slug: input.slug,
        type: 'SUMMARY',
        title: input.title,
        body: input.body,
        frontmatter: { source: 'service-desk', ownerUserId: input.ownerUserId },
        status: 'PENDING_REVIEW',
        sourceIds: [],
      },
      actor,
    );
    return { pageId: page.id, spaceId: space.id };
  };
  // 点状 AI（P2-B）：通用能力（摘要/抽取/分类/评分/RAG 问答）与各模块点共用一套出口。
  const aiAbilitiesService = new AiAbilitiesService(
    prismaService,
    kbRetrieveService,
  );
  const aiPointsService = new AiPointsService(
    prismaService,
    aiAbilitiesService,
    crmScopeService,
    okrScopeService,
    hrmScopeService,
    oaScopeService,
  );
  const aiController = new AiController(aiAbilitiesService, aiPointsService);
  const kbController = new KbController(
    kbSpaceService,
    kbSourceService,
    kbPageService,
    kbIngestService,
    kbSearchService,
    kbGraphService,
    kbConsumerService,
    kbMemoryService,
    kbRetrieveService,
    kbIntakeService,
    kbAssistService,
  );
  const requireAdmin = (user: CurrentUser) =>
    identityService.requireAdmin(user);
  // 模型广场：平台统一上架的模型目录 + 按量计费 + OpenAI 兼容对外网关。
  const modelUpstreamService = new ModelUpstreamService(prismaService);
  const modelUsageService = new ModelUsageService(prismaService, pointsService);
  const modelCatalogService = new ModelCatalogService(
    prismaService,
    pointsService,
    pointsSettingsService,
    modelUpstreamService,
  );
  const modelRelayService = new ModelRelayService();
  const platformDefaultsService = new PlatformDefaultsService(
    prismaService,
    pointsService,
    pointsSettingsService,
  );
  const modelPlazaController = new ModelPlazaController(
    prismaService,
    modelCatalogService,
    modelUpstreamService,
    modelUsageService,
    modelRelayService,
    pointsService,
    pointsSettingsService,
    contentChannelPolicyService,
    platformDefaultsService,
    requireAdmin,
  );
  // 智能硬件控制器（服务实例已在 Agent 工具装配前创建）。
  const hardwareController = new HardwareController(
    hardwareService,
    requireAdmin,
  );
  const platformController = new PlatformController(
    featureToggleService,
    accessPolicyService,
    skillReviewService,
    aiGuardService,
    requireAdmin,
  );
  const pointsBillingController = new PointsBillingController(
    billingRuleService,
    requireAdmin,
  );
  // L2 HRM 底座（§5.1/§12.9）：档案、假勤、招聘、人才评估、Offer/述职/rubric（组织口径已在企点前初始化）。
  // 通用协作底座（§5.2）：评论/@/标签/收藏/资源链接，任何模块传 targetType+targetId 即可挂载。
  const collabService = new CollabService(
    prismaService,
    hrmScopeService,
    notificationService,
  );
  const collabController = new CollabController(collabService);
  // §5.8 横切机制（Outbox/Webhook、导入导出、报表目录、规则、公开分享、OIDC、资产策略、IM 同步）。
  // 先于项目 / ERP / 营销 / 招聘构造，后三者用 dispatch 发业务事件。
  const mechanismService = new MechanismService(
    prismaService,
    hrmScopeService,
    accountCrypto,
    storageService,
    notificationService,
    (user: CurrentUser) => identityService.requireAdmin(user),
  );
  const mechanismController = new MechanismController(mechanismService);
  // 领域联动：任务完成/重开 → 已挂接的 OKR 关键结果自动回写（进程内监听，不产生外部副作用）。
  mechanismService.on('task.completed', (org, _event, payload) =>
    okrTaskLinkageService.onTaskStatus(org, payload),
  );
  mechanismService.on('task.reopened', (org, _event, payload) =>
    okrTaskLinkageService.onTaskStatus(org, payload),
  );
  // 增长联动：CRM 订单审批通过 → 自动立项（幂等），并把项目 id 回写订单。
  const growthLinkageService = new GrowthLinkageService(
    prismaService,
    mechanismService,
  );
  mechanismService.on('crm.order.approved', (org, _event, payload) =>
    growthLinkageService.onOrderApproved(org, payload),
  );
  crmApprovalService.attachMechanisms(mechanismService);
  crmOrderService.attachMechanisms(mechanismService);
  crmContractService.attachMechanisms(mechanismService);
  crmLeadService.attachMechanisms(mechanismService);
  // 增长驾驶舱：OKR / 销售 / 交付 / 获客 / 客服 的当期快照。
  // ERP 读侧桥：增长/项目域只经 ErpPort 读 ERP 表，超时与降级在调用方落地。
  const erpReadPort = new ErpBridge(prismaService);
  // ERP 写侧桥：跨域落 ERP 单据只走这里（单号流水、审批态、归属自证、事件都在 ERP 域内）。
  const erpWritePort = new ErpWriteBridge(
    prismaService,
    mechanismService,
    erpReadPort,
  );
  const growthCockpitService = new GrowthCockpitService(
    prismaService,
    hrmScopeService,
    erpReadPort,
  );
  // 经营异常（P4-6）：五类异常扫描 → 责任任务派发；关闭前复核与驾驶舱共用同一扫描口径。
  const operationRiskService = new OperationRiskService(
    prismaService,
    hrmScopeService,
    mechanismService,
    taskCenterService,
    erpReadPort,
    erpWritePort,
  );
  riskServiceRef.current = operationRiskService;
  // 合同履约助手（P4-8）：四态事实 → 卡点与下一步动作；派履约任务走任务中心同一入口。
  const fulfillmentAdvisorService = new FulfillmentAdvisorService(
    prismaService,
    growthCockpitService,
    taskCenterService,
  );
  const growthController = new GrowthController(
    growthCockpitService,
    operationRiskService,
    fulfillmentAdvisorService,
  );
  // AI 获客（营销工具）：雷达/触达/档案/剧本/跟进/质检/看板，插件与调度器同域装配。
  const acquisitionSettingsService = new AcquisitionSettingsService(
    prismaService,
    hrmScopeService,
  );
  const acquisitionRadarService = new AcquisitionRadarService(
    prismaService,
    acquisitionSettingsService,
    mechanismService,
    dataTableService,
    aiEvalService,
  );
  acquisitionRadarService.registerExports();
  const acquisitionPluginService = new AcquisitionPluginBridgeService(
    prismaService,
    acquisitionSettingsService,
    hrmScopeService,
    extensionCatalogService,
    browserTaskService,
  );
  const acquisitionOutreachService = new AcquisitionOutreachService(
    prismaService,
    acquisitionSettingsService,
    acquisitionRadarService,
    publishReviewService,
    mechanismService,
    aiEvalService,
    tencentQidianService,
  );
  const acquisitionProfileService = new AcquisitionProfileService(
    prismaService,
    acquisitionSettingsService,
    acquisitionRadarService,
    crmLeadService,
  );
  // CRM 阶段变化回写获客档案业务状态（档案 → CRM 由 pushCrmStage 走另一条路，两向都不经过对方写方法，不会回环）。
  crmLeadService.onStageChanged(({ ownerUserId, leadId, stage }) =>
    acquisitionProfileService.syncCrmStage(ownerUserId, leadId, stage),
  );
  const acquisitionPlaybookService = new AcquisitionPlaybookService(
    prismaService,
    acquisitionSettingsService,
    acquisitionRadarService,
    acquisitionProfileService,
    kbRetrieveService,
  );
  const acquisitionFollowUpService = new AcquisitionFollowUpService(
    prismaService,
    acquisitionSettingsService,
    publishReviewService,
  );
  const acquisitionReceptionService = new AcquisitionReceptionService(
    prismaService,
    acquisitionSettingsService,
    acquisitionProfileService,
    acquisitionPlaybookService,
    acquisitionFollowUpService,
  );
  const acquisitionQcService = new AcquisitionQcService(
    prismaService,
    acquisitionSettingsService,
    aiEvalService,
  );
  const acquisitionDashboardService = new AcquisitionDashboardService(
    prismaService,
    acquisitionSettingsService,
    hrmScopeService,
    mechanismService,
  );
  // 插件只认令牌：采集与触达各自认领/回执，桥只负责令牌、限流与分发。
  acquisitionPluginService.register({
    type: 'collect',
    claim: (key, limit) => acquisitionRadarService.claimCollectJobs(key, limit),
    report: (key, body, actorUserId) =>
      acquisitionRadarService.reportCollect(key, body, actorUserId),
  });
  acquisitionPluginService.register({
    type: 'outreach',
    claim: (key, limit) =>
      acquisitionOutreachService.claimOutreachJobs(key, limit),
    report: (key, body, actorUserId) =>
      acquisitionOutreachService.reportOutreach(key, body, actorUserId),
  });
  // 跟进复用触达链路回执；企微跟进借服务台既有渠道发送。
  acquisitionOutreachService.followUpReceipt = (input) =>
    acquisitionFollowUpService.receipt(input);
  acquisitionFollowUpService.sendChannel = (input) =>
    serviceDeskService.sendFollowUpText(input);
  // 服务台自动回复处插入销售剧本与档案上下文。
  serviceDeskService.acqReception = (input) =>
    acquisitionReceptionService.context(input);
  const acquisitionController = new AcquisitionController(
    acquisitionSettingsService,
    acquisitionRadarService,
    acquisitionPluginService,
    acquisitionOutreachService,
    acquisitionProfileService,
    acquisitionPlaybookService,
    acquisitionFollowUpService,
    acquisitionQcService,
    acquisitionDashboardService,
  );
  const acquisitionScheduler = new AcquisitionScheduler(
    acquisitionRadarService,
    acquisitionOutreachService,
    acquisitionFollowUpService,
  );
  // 企业微信原生 SCRM（营销工具）：客户/群/活码/群发/继承/SOP/合规/统计/员工侧边栏。
  // 同步源唯一：启用后企点侧客户导入暂停，避免双写。
  const scrmCrypto = new ScrmCrypto();
  const scrmClient = new ScrmClient();
  const scrmScopeService = new ScrmScopeService(
    prismaService,
    hrmScopeService,
    scrmCrypto,
  );
  const scrmSettingsService = new ScrmSettingsService(
    prismaService,
    scrmScopeService,
    scrmCrypto,
    scrmClient,
  );
  const scrmSopService = new ScrmSopService(
    prismaService,
    scrmScopeService,
    scrmClient,
  );
  const scrmContactService = new ScrmContactService(
    prismaService,
    scrmScopeService,
    scrmClient,
    scrmSopService,
  );
  const scrmChatService = new ScrmChatService(
    prismaService,
    scrmScopeService,
    scrmClient,
  );
  const scrmMaterialService = new ScrmMaterialService(
    prismaService,
    scrmScopeService,
  );
  const scrmComplianceService = new ScrmComplianceService(
    prismaService,
    scrmScopeService,
    scrmSopService,
    aiEvalService,
  );
  const scrmCodeService = new ScrmCodeService(
    prismaService,
    scrmScopeService,
    scrmClient,
    scrmMaterialService,
    scrmComplianceService,
  );
  const scrmMassService = new ScrmMassService(
    prismaService,
    scrmScopeService,
    scrmClient,
    scrmComplianceService,
  );
  const scrmTransferService = new ScrmTransferService(
    prismaService,
    scrmScopeService,
    scrmClient,
  );
  const scrmStatsService = new ScrmStatsService(
    prismaService,
    scrmScopeService,
    scrmContactService,
    scrmChatService,
    mechanismService,
  );
  scrmStatsService.registerExports();
  const scrmSidebarService = new ScrmSidebarService(
    scrmScopeService,
    scrmContactService,
    scrmSopService,
    scrmMaterialService,
  );
  const scrmSyncService = new ScrmSyncService(
    prismaService,
    scrmScopeService,
    scrmClient,
    scrmContactService,
    scrmChatService,
    scrmSopService,
  );
  const scrmCallbackService = new ScrmCallbackService(
    scrmScopeService,
    scrmSyncService,
    scrmCodeService,
  );
  const terminalScrmService = new TerminalScrmService(
    prismaService,
    new WecomScrmBridge(prismaService),
    scrmSourceTagService,
  );
  const scrmController = new ScrmController(
    scrmSettingsService,
    scrmSyncService,
    scrmContactService,
    scrmChatService,
    scrmCodeService,
    scrmMassService,
    scrmTransferService,
    scrmSopService,
    scrmComplianceService,
    scrmStatsService,
    scrmMaterialService,
    scrmSidebarService,
    terminalScrmService,
  );
  const scrmScheduler = new ScrmScheduler(
    scrmMassService,
    scrmTransferService,
    scrmSopService,
    scrmCodeService,
  );
  // 建站管理 · 健康管理小程序工具（C1/C2）：凭据与出包复用私域底座 scene='HEALTH'，
  // 沟通复用 AI客服，SCRM 只做单向出站（本域不写 scrm_* 表）。
  const healthPlatformService = new HealthPlatformService(
    prismaService,
    identityService,
  );
  const healthShopService = new HealthShopService(
    prismaService,
    healthPlatformService,
    miniAppService,
  );
  const healthReleaseService = new HealthReleaseService(
    prismaService,
    storageService,
    systemAssetService,
    miniAppService,
    miniProgramClient,
    healthShopService,
  );
  const healthScrmService = new HealthScrmService(
    prismaService,
    scrmSopService,
    undefined,
    scrmSourceTagService,
  );
  const healthSubjectService = new HealthSubjectService(prismaService);
  const healthStatService = new HealthStatService(prismaService);
  const healthCrypto = new HealthCrypto();
  const healthArchiveService = new HealthArchiveService(
    prismaService,
    systemAssetService,
    healthCrypto,
  );
  const healthMonitorService = new HealthMonitorService(prismaService);
  const healthCareService = new HealthCareService(
    prismaService,
    healthMonitorService,
  );
  const healthServiceItemService = new HealthServiceItemService(prismaService);
  const healthClinicService = new HealthClinicService(
    prismaService,
    serviceDeskService,
  );
  const healthExamService = new HealthExamService(prismaService);
  const healthMallService = new HealthMallService(prismaService);
  const healthMarketingService = new HealthMarketingService(prismaService);
  const healthOrderService = new HealthOrderService(
    prismaService,
    systemAssetService,
    miniAppService,
    wechatPayClient,
    healthMallService,
    healthClinicService,
    healthCareService,
    healthMarketingService,
  );
  const healthFinanceService = new HealthFinanceService(
    prismaService,
    healthCrypto,
  );
  const healthPromoterService = new HealthPromoterService(prismaService);
  const healthContentService = new HealthContentService(
    prismaService,
    miniAppService,
    miniProgramClient,
  );
  // 舌象分析增值服务：视觉模型走统一网关，原图入数字资产台账。
  const healthTongueService = new HealthTongueService(
    prismaService,
    systemAssetService,
  );
  // 平台自检的 HealthController（src/health.controller.ts）已在上面注册为 `healthController`，
  // 这里的工具工作台控制器用独立键名，避免与自检控制器重名。
  const healthWorkbenchController = new HealthWorkbenchController(
    healthPlatformService,
    healthShopService,
    healthReleaseService,
    healthScrmService,
    healthSubjectService,
    healthStatService,
    healthArchiveService,
    healthMonitorService,
    healthCareService,
    healthServiceItemService,
    healthClinicService,
    healthExamService,
    healthMallService,
    healthMarketingService,
    healthOrderService,
    healthFinanceService,
    healthPromoterService,
    healthContentService,
    healthTongueService,
    miniAppService,
  );
  const healthAdminController = new HealthAdminController(
    healthPlatformService,
    identityService,
  );
  // 健康管理小程序 C 端公开通道：顾客令牌只来自 private-mini 底座（scene=HEALTH），
  // 支付用店铺自有商户号，沟通复用 AI客服站点。
  const healthPublicService = new HealthPublicService(
    prismaService,
    miniProgramClient,
    miniAppService,
    healthPlatformService,
    healthMonitorService,
    healthCrypto,
    serviceDeskService,
    wechatPayClient,
  );
  // 医护工作台通道：医护令牌与顾客令牌物理隔离，服务层按 shopId + practitionerId 双条件过滤。
  const healthStaffService = new HealthStaffService(
    prismaService,
    healthMonitorService,
    healthCrypto,
  );
  // AI 医护接线（后置挂钩子，与 serviceDeskService.kbRecall 同一写法）：
  // 健康域只存「开没开」和「每位医护绑了哪位纯AI客服员工」，
  // 问答走 AI客服的通用口 answerForAgent，员工清单走 aiAgents；健康侧不拼提示词、不查知识库。
  const aiAgentListOf = (ownerUserId: string) =>
    serviceDeskService.aiAgents(new CurrentUser(ownerUserId, '', ''));
  healthStaffService.aiAnswer = (input) =>
    serviceDeskService.answerForAgent(input);
  healthStaffService.aiAgentList = aiAgentListOf;
  // 业主端的「AI 医护」配置卡与医护绑定同一份员工清单，避免两处口径不一致。
  healthShopService.aiAgentList = aiAgentListOf;
  // L2 项目 / 任务 / 工时（§5.2）：组织口径复用 HRM，业务事件走 mechanisms 分发。
  const projectCostService = new ProjectCostService(
    prismaService,
    hrmScopeService,
    mechanismService,
    erpReadPort,
    erpWritePort,
  );
  const projectService = new ProjectService(
    prismaService,
    hrmScopeService,
    mechanismService,
    aiEvalService,
    erpReadPort,
    erpWritePort,
  );
  const projectDemandService = new ProjectDemandService(
    prismaService,
    hrmScopeService,
    mechanismService,
  );
  const projectController = new ProjectController(
    projectService,
    projectCostService,
    projectDemandService,
  );
  // L2 ERP 进销存 + 应收应付（§5.4）：主数据与单据同组织键，AI 经营评估可回落规则式。
  const erpService = new ErpService(
    prismaService,
    hrmScopeService,
    mechanismService,
    aiEvalService,
  );
  // ERP 主数据的导入导出挂到机制层：机制层因此不再直读直写 erp_* 表，
  // 「供应商要挂 bizParty、税率要截断」这些规则只留在 ERP 域一份实现里。
  registerErpMechanismModules(mechanismService, prismaService, erpService);
  const erpController = new ErpController(erpService);
  // L3 营销技能库（§5.5）：内置技能种子 + LLM 运行 + 内容资产；平台凭据走 AccountCrypto。
  const mktService = new MktService(
    prismaService,
    hrmScopeService,
    mechanismService,
    aiEvalService,
    accountCrypto,
    // 生成完成→内容审核→渠道发布（docs §8.4）：任务走统一任务中心派发与收口。
    taskCenterService,
  );
  const mktController = new MktController(mktService);
  // SEO 工作台（营销工具）：三层数据源（自有抓取 / DataForSEO 用户自带 Key / 系统 LLM）。
  const seoDfs = new SeoDataForSeoClient(prismaService, accountCrypto);
  const seoCtx = {
    prisma: prismaService,
    scope: hrmScopeService,
    aiEval: aiEvalService,
    crypto: accountCrypto,
    mechanisms: mechanismService,
    tables: dataTableService,
    mail: aliyunMailService,
    dfs: seoDfs,
  };
  const seoProjects = new SeoProjectService(seoCtx);
  const seoAudits = new SeoAuditService(seoCtx);
  const seoKeywords = new SeoKeywordService(seoCtx);
  const seoRank = new SeoRankService(seoCtx);
  const seoCompetitors = new SeoCompetitorService(seoCtx);
  const seoLocal = new SeoLocalService(seoCtx);
  const seoGoogle = new SeoGoogleService(seoCtx, seoKeywords);
  const seoOutreach = new SeoOutreachService(seoCtx);
  const seoSchema = new SeoSchemaService(seoCtx);
  const seoProgrammatic = new SeoProgrammaticService(seoCtx);
  const seoReports = new SeoReportService(seoCtx, seoProjects);
  const seoController = new SeoController({
    projects: seoProjects,
    audits: seoAudits,
    keywords: seoKeywords,
    rank: seoRank,
    competitors: seoCompetitors,
    local: seoLocal,
    google: seoGoogle,
    outreach: seoOutreach,
    schema: seoSchema,
    programmatic: seoProgrammatic,
    reports: seoReports,
  });
  const hrmProfileService = new HrmProfileService(
    prismaService,
    hrmScopeService,
    taskCenterService,
    notificationService,
  );
  const hrmAttendanceService = new HrmAttendanceService(
    prismaService,
    hrmScopeService,
  );
  const hrmRecruitService = new HrmRecruitService(
    prismaService,
    hrmScopeService,
    aiEvalService,
  );
  const talentMatchService = new TalentMatchService(prismaService);
  const hrmTalentService = new HrmTalentService(
    prismaService,
    hrmScopeService,
    talentMatchService,
    aiEvalService,
  );
  const hrmLifecycleService = new HrmLifecycleService(
    prismaService,
    hrmScopeService,
  );
  const hrmController = new HrmController(
    hrmProfileService,
    hrmAttendanceService,
    hrmRecruitService,
    hrmTalentService,
    hrmLifecycleService,
  );
  // 附录 B 补齐项（一体化升级）：统一组织口径 + 各域服务；公开路由取 gaps 组。
  const gapScopeService = new GapScopeService(hrmScopeService);
  const entitlementService = new EntitlementService(
    prismaService,
    gapScopeService,
  );
  const appointmentService = new AppointmentService(
    prismaService,
    gapScopeService,
  );
  const mailTemplateService = new MailTemplateService(
    prismaService,
    gapScopeService,
    mailboxService,
  );
  const pageAssistantService = new PageAssistantService(
    prismaService,
    gapScopeService,
    // 会议/邮件助手：把提取到的行动项作为「待确认」任务派进任务中心（docs §11.2）。
    taskCenterService,
  );
  const transcriptionService = new TranscriptionService(
    prismaService,
    gapScopeService,
    contentMediaService,
  );
  const quotationDocumentService = new QuotationDocumentService(
    prismaService,
    crmScopeService,
  );
  const timeAuditService = new TimeAuditService(prismaService, gapScopeService);
  // 时长卡（日卡 / 30 天卡）：规格目录只软停用，发卡/扣额/兑换订单集中在 CardService。
  // 支付客户端提前到这里构造——现金购卡与充值共用同一个微信商户客户端。
  const cardTemplateService = new CardTemplateService(
    prismaService,
    gapScopeService,
  );
  const cardService = new CardService(
    prismaService,
    pointsService,
    pointsSettingsService,
    wechatPayClient,
    gapScopeService,
  );
  // 扣费顺序「卡 → 积分」的唯一收口点：站内试用、对外 /v1、Agent 内部调用共用这里。
  // modelUsageService 比卡服务先构造（广场域不依赖积分设置之外的东西），故回填字段而非加构造参数。
  modelUsageService.cards = cardService;
  const promoService = new PromoService(
    prismaService,
    gapScopeService,
    pointsService,
    cardService,
  );
  const afterSalesService = new AfterSalesService(prismaService);
  const reviewService = new ReviewService(prismaService, gapScopeService);
  const taskSyncService = new TaskSyncService(prismaService, gapScopeService);
  const termsService = new TermsService(prismaService, gapScopeService);
  const onboardingService = new OnboardingService(
    prismaService,
    gapScopeService,
  );
  const changelogService = new ChangelogService(prismaService, gapScopeService);
  const orgContextService = new OrgContextService(
    prismaService,
    gapScopeService,
  );
  const usageService = new UsageService(prismaService, gapScopeService);
  const entitlementController = new EntitlementController(entitlementService);
  const appointmentController = new AppointmentController(appointmentService);
  const mailTemplateController = new MailTemplateController(
    mailTemplateService,
  );
  const assistantController = new AssistantController(pageAssistantService);
  const transcriptionController = new TranscriptionController(
    transcriptionService,
  );
  const quotationDocumentController = new QuotationDocumentController(
    quotationDocumentService,
  );
  const timeAuditController = new TimeAuditController(timeAuditService);
  const promoController = new PromoController(promoService);
  const cardController = new CardController(cardService, cardTemplateService);
  const adminCardController = new AdminCardController(
    cardService,
    cardTemplateService,
  );
  const afterSalesController = new AfterSalesController(afterSalesService);
  const reviewController = new ReviewController(reviewService);
  const taskSyncController = new TaskSyncController(taskSyncService);
  const termsController = new TermsController(termsService);
  const onboardingController = new OnboardingController(onboardingService);
  const changelogController = new ChangelogController(changelogService);
  const orgContextController = new OrgContextController(orgContextService);
  const usageController = new UsageController(usageService);
  // 工作流：图编排 + 版本冻结 + 运行台账。节点目录从既有注册表派生（契约 + Agent manifest）；
  // 作为 Push-only 任务源接入「我的任务」（挂起/唤醒），并以 wf__ 前缀进 Agent/MCP 工具目录。
  const workflowEngine = new WorkflowEngine(prismaService, taskCenterService);
  taskSourceRegistry.register(workflowSource(workflowEngine));
  const workflowService = new WorkflowService(
    prismaService,
    orgContextService,
    workflowEngine,
    {
      connectorTools: (user) => contentAgentConnectorService.toolSpecs(user),
      hardwareTools: (user) => contentAgentService.hardwareToolSpecs(user),
      skills: (user) => contentAgentSkillService.list(user),
    },
    hrmScopeService,
  );
  workflowRef.service = workflowService;
  // 领域事件桥：本主体的领域事件命中已发布工作流的 trigger.event 节点即起运行。
  // 幂等锚＝事件台账 id，重复投递只起一次；外部 Webhook 触发不开放（决策 D2=C）。
  mechanismService.on('*', async (org, event, payload, meta) => {
    await workflowService.runOnEvent({
      orgType: org.orgType,
      orgUserId: org.orgUserId,
      event,
      payload,
      eventLogId: meta?.eventLogId ?? 0,
    });
  });
  // 任务事件桥：created / closed / overdue 命中已发布工作流的 trigger.task（幂等锚＝任务 + 变化类型）。
  taskCenterService.useTaskEventPort((input) =>
    workflowService.runOnTaskEvent(input),
  );
  // 规则动作（§4.3）：run_workflow 复用统一触发入口、以事件主体负责人身份运行；
  // assign_task 只经 TaskCenterService 写入，source=rule 让「我的任务」能反查规则与事件。
  mechanismService.useWorkflowInvoker((input) =>
    workflowService.invokeByUser(input.ownerUserId, {
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
      ...(input.businessKey ? { businessKey: input.businessKey } : {}),
      trigger: 'EVENT',
      input: input.input,
      sourceType: 'rule',
      sourceId: input.dedupeKey,
      dedupeKey: input.dedupeKey,
    }),
  );
  mechanismService.useTaskAssigner(async (input) => {
    const orgTarget = input.target.startsWith('ORG:');
    const assignee = (orgTarget ? input.target.slice(4) : input.target).trim();
    if (!assignee) throw new Error('assign_task 未指定承办人');
    const payload = input.payload;
    const str = (value: unknown) => (typeof value === 'string' ? value : '');
    await taskCenterService.assign({
      source: 'rule',
      sourceId: input.sourceId,
      title: str(payload.title) || `规则 ${input.ruleId} 自动任务`,
      description:
        str(payload.description) || JSON.stringify(payload).slice(0, 20000),
      link: str(payload.link) || '/tasks',
      category: str(payload.category) || 'matter',
      priority: str(payload.priority) || 'NORMAL',
      dueAt: str(payload.dueAt) || null,
      assigneeType: orgTarget ? 'ORG' : 'USER',
      assigneeUserId: orgTarget ? '' : assignee,
      orgType: orgTarget ? 'PROVIDER' : '',
      orgUserId: orgTarget ? assignee : '',
      assignedBy: `rule:${input.ruleId}`,
      createdBy: input.org.orgUserId || input.org.actorId,
    });
  });
  const workflowController = new WorkflowController(workflowService);
  // 工作流运行期能力：动作节点走内部自执行器（app.ts 装配 mcpService 后回填），
  // 工具节点走 Agent 统一派发，AI 节点走统一网关 / RAG / 站内 Agent。
  const workflowRunOperation: { current?: WorkflowRuntime['runOperation'] } =
    {};
  workflowEngine.setRuntime({
    runOperation: (user, requestId, operationId, input) =>
      workflowRunOperation.current
        ? workflowRunOperation.current(user, requestId, operationId, input)
        : Promise.resolve({
            status: 503,
            code: undefined,
            message: '执行器尚未就绪',
            data: undefined,
          }),
    callTool: async (user, name, args) => {
      if (name.startsWith('mcp__')) {
        return contentAgentConnectorService.callTool(user, name, args);
      }
      if (name.startsWith('hw__')) {
        const result = await hardwareService.mcpCall(user.userId, name, args);
        const text = result.content.map((item) => item.text).join('\n');
        return {
          text:
            text || (result.isError ? '硬件工具调用失败' : '硬件工具已执行'),
          ok: !result.isError,
        };
      }
      // 内置 / 业务 / 技能 / 插件：走统一派发，工具内部已把失败转成可读文案。
      const result = await runAgentTool(name, args, contentAgentTools, {
        user,
        token: undefined,
      });
      return { text: result.text, ok: true };
    },
    chat: async (user, messages) => {
      const result = await contentMediaService.chat(
        user,
        undefined,
        messages,
        'text',
        undefined,
        { module: 'workflow', operation: 'ai_llm' },
      );
      return { text: result.text, usage: result.usage };
    },
    retrieve: (user, input) =>
      kbRetrieveService.retrieve(user, input as RetrieveInput),
    runAgent: async (user, prompt) => {
      const conversation = await contentAgentService.createConversation(user, {
        title: '工作流 AI 节点',
      });
      const result = await contentAgentService.runSilent(
        user,
        undefined,
        conversation.id,
        prompt,
        {},
      );
      return { text: result.text, usage: result.usage };
    },
  });
  const rechargeService = new RechargeService(
    prismaService,
    pointsSettingsService,
    pointsService,
    wechatPayClient,
  );
  const awcoinClient = new AwcoinClient(prismaService, accountCrypto);
  const pointsBillingService = new PointsBillingService(
    prismaService,
    pointsSettingsService,
    pointsService,
    rechargeService,
    cardService,
  );
  // 实时扣费：BI 每查一次、OA 每提交一单、AI 客服每开一个新会话，均按价目计费；
  // chargeSafely 余额不足只转欠费状态，不回滚已完成的业务。
  const chargeSafely = (
    userId: string,
    code: string,
    quantity: number,
    refId?: string,
  ) => pointsService.chargeSafely(userId, code, quantity, refId || '');
  biQueryService.pointsChargeSafely = chargeSafely;
  oaService.pointsChargeSafely = chargeSafely;
  serviceDeskService.pointsChargeSafely = chargeSafely;
  // 创意社区（Comfy Cloud 工作流市场·纯 BYOK）：Key 独立加密域、上游唯一出口、
  // 发布校验与审核发奖都在 community 域内；运行产物由调度器转存进本站 OSS 并入数字资产。
  const comfyCrypto = new ComfyCrypto();
  const comfyClient = new ComfyClient();
  const communityAwardService = new CommunityAwardService(
    prismaService,
    pointsService,
    pointsSettingsService,
    identityService,
  );
  const communityService = new CommunityService(
    prismaService,
    identityService,
    userLookupService,
    storageService,
    comfyClient,
    comfyCrypto,
    communityAwardService,
    systemAssetService,
  );
  const communityController = new CommunityController(
    communityService,
    communityAwardService,
    new CommunityImportService(
      prismaService,
      identityService,
      userLookupService,
      ossService,
      comfyClient,
      systemAssetService,
    ),
  );
  const communityRunScheduler = new CommunityRunScheduler(
    prismaService,
    comfyClient,
    communityService,
    contentDigitalAssetService,
  );
  // 租赁管理小程序：复用站内账号、微信支付客户端、SCRM 桥、service-desk 与对象存储。
  const rentalScrmService = new RentalScrmService(
    prismaService,
    new WecomScrmBridge(prismaService),
    scrmSourceTagService,
  );
  const rentalPayService = new RentalPayService(
    prismaService,
    miniAppService,
    wechatPayClient,
    rentalScrmService,
  );
  const rentalService = new RentalService(
    prismaService,
    miniProgramClient,
    miniAppService,
    rentalPayService,
    rentalScrmService,
    storageService,
    {
      isOpen: (code, orgUserId) => featureToggleService.isOpen(code, orgUserId),
    },
  );
  const rentalController = new RentalController(rentalService);
  // 园区管理：独立身份/令牌/数据域，只复用平台级 AI 客服、文件、支付与通知。
  const parkSiteService = new ParkSiteService(prismaService);
  const parkPackageService = new ParkPackageService(
    parkSiteService,
    storageService,
  );
  const parkApprovalService = new ParkApprovalService(
    prismaService,
    parkSiteService,
  );
  const parkPayService = new ParkPayService(
    prismaService,
    miniAppService,
    wechatPayClient,
  );
  const parkOrderService = new ParkOrderService(
    prismaService,
    parkSiteService,
    parkPayService,
  );
  const parkNotifyService = new ParkNotifyService(
    prismaService,
    miniAppService,
    miniProgramClient,
  );
  const parkReservationService = new ParkReservationService(
    prismaService,
    parkSiteService,
    parkApprovalService,
    appointmentService,
    parkOrderService,
    parkNotifyService,
  );
  const parkWorkOrderService = new ParkWorkOrderService(
    prismaService,
    parkSiteService,
    parkNotifyService,
    parkOrderService,
  );
  const parkResourceService = new ParkResourceService(
    prismaService,
    parkSiteService,
    appointmentService,
  );
  const parkActivityService = new ParkActivityService(
    prismaService,
    parkSiteService,
  );
  const parkIdentityService = new ParkIdentityService(
    prismaService,
    parkSiteService,
    miniAppService,
    miniProgramClient,
  );
  const parkLeaseService = new ParkLeaseService(
    prismaService,
    parkSiteService,
    hrmScopeService,
    erpWritePort,
  );
  const parkOpsService = new ParkOpsService(prismaService, parkSiteService);
  const parkController = new ParkController(
    parkSiteService,
    parkApprovalService,
    parkReservationService,
    parkWorkOrderService,
    parkResourceService,
    parkActivityService,
    parkOrderService,
    parkLeaseService,
    parkOpsService,
    miniAppService,
    parkPackageService,
  );
  return {
    prisma: prismaService,
    // 平台统一插件能力目录：派发门槛（分发/获客）与后台维护复用同一实例。
    extensionCatalog: extensionCatalogService,
    // 智慧分析板块：service 供路由与调度复用，scheduler 由 main.ts 启停。
    insight: {
      service: insightService,
      scheduler: insightScheduler,
    },
    // M6 供求广场：社交板复用企业板块同一上游通道（DemandService + AiworkinClient）。
    aiworkinClient,
    demandService,
    users: userLookupService,
    identity: identityService,
    external: externalService,
    collection: geoCollectionService,
    // GEO 独立站：公开投递通道取 domain 解析站点，scheduler 由 main.ts 启停。
    geoSite: {
      site: geoSiteService,
      domain: geoSiteDomainService,
      settings: geoSiteSettingsService,
      billing: geoSiteBillingService,
      scheduler: geoSiteScheduler,
      // CMS：公开投递通道（geo-site.public.ts）用 render 装配整页数据
      page: geoSitePageService,
      menu: geoSiteMenuService,
      content: geoSiteContentService,
      render: geoSiteRenderDataService,
    },
    // 建站工具启动设置：闸门（管理端中间件 / C 端通道 / 出包）与日批调度共用这一个服务实例。
    toolLaunch: {
      service: toolLaunchService,
      billing: toolLaunchBillingService,
      meter: toolLaunchMeterService,
      settings: toolLaunchSettingsService,
      scheduler: toolLaunchScheduler,
    },
    // 小程序发布说明（源码分发包口径）：用户侧说明页与平台侧正文维护共用这一个服务实例。
    miniGuide: {
      service: miniGuideService,
    },
    rpaTaskService,
    workbuddyPlanService,
    workbuddyCloudService,
    contentAgentScheduleService,
    agentMemory: agentMemoryService,
    skillGenerator: skillGeneratorService,
    mailbox: mailboxService,
    notification: notificationService,
    // 微信服务号：公开回调/OAuth 由 app.ts 取用，调度器由 main.ts 启停。
    wechatMp: {
      settings: wechatMpSettingsService,
      client: wechatMpClient,
      binding: wechatMpBindingService,
      push: wechatMpPushService,
      inbound: wechatMpInboundService,
      controller: wechatMpController,
      scheduler: wechatMpScheduler,
    },
    // 用户版小程序：后台代码包台账与用户绑定；公开通道（启动配置 / 免登）由 app.ts 取用。
    miniprogram: {
      settings: miniProgramSettingsService,
      client: miniProgramClient,
      service: miniProgramService,
      controller: miniProgramController,
    },
    // 建站管理底座（自营主体凭据）：上门服务与后续电商工具共用。
    privateMini: { app: miniAppService },
    // 多店铺商城平台：根 app 的商户通道与 /api/public/market 公开通道都从这里取同一批实例。
    marketplace: {
      market: mpMarketService,
      merchant: mpMerchantService,
      category: mpCategoryService,
      platform: mpPlatformService,
      catalog: mpCatalogService,
      trade: mpTradeService,
      pay: mpPayService,
      aftersale: mpAftersaleService,
      finance: mpFinanceService,
      diy: mpDiyService,
      coupons: mpCouponService,
      follows: mpFollowService,
      scrm: mpScrmService,
    },
    onsite: {
      platform: onsitePlatformService,
      shops: onsiteShopService,
      releases: onsiteReleaseService,
      poster: onsitePosterService,
      customers: onsiteCustomerService,
      miniApp: miniAppService,
      catalog: onsiteCatalogService,
      staff: onsiteStaffService,
      schedule: onsiteScheduleService,
      cities: onsiteCityService,
      content: onsiteContentService,
      orders: onsiteOrderService,
      refunds: onsiteRefundService,
      reviews: onsiteReviewService,
      alerts: onsiteAlertService,
      assist: onsiteAssistService,
      notify: onsiteNotifyService,
      pay: wechatPayClient,
      marketing: onsiteMarketingService,
      wallet: onsiteWalletService,
      commission: onsiteCommissionService,
      agents: onsiteAgentService,
    },
    // 租赁管理小程序：后台管理走 Rental_，C 端与员工端走 /api/public/rental/*。
    rental: {
      orders: rentalService,
      pay: rentalPayService,
      scrm: rentalScrmService,
    },
    park: {
      sites: parkSiteService,
      approvals: parkApprovalService,
      reservations: parkReservationService,
      workOrders: parkWorkOrderService,
      resources: parkResourceService,
      activities: parkActivityService,
      orders: parkOrderService,
      pay: parkPayService,
      leases: parkLeaseService,
      ops: parkOpsService,
      notify: parkNotifyService,
      identity: parkIdentityService,
      controller: parkController,
    },
    brand: {
      platform: brandPlatformService,
      shops: brandShopService,
      goods: brandGoodsService,
      diy: brandDiyService,
      releases: brandReleaseService,
      stats: brandStatService,
      miniApp: miniAppService,
      customers: brandCustomerService,
      orders: brandOrderService,
      coupons: brandCouponService,
      pay: brandPayService,
      scrm: brandScrmService,
    },
    takeout: {
      shops: takeoutShopService,
      goods: takeoutGoodsService,
      customers: takeoutCustomerService,
      coupons: takeoutCouponService,
      pay: takeoutPayService,
      orders: takeoutOrderService,
      scrm: takeoutScrmService,
    },
    // 卡密商城小程序：管理端控制器由契约 CardShop_ 派发，C 端公开通道在 app.ts 注册；
    // 顾客态一律按 siteId + customerId 双条件过滤，pay 只做商户号解密与下单。
    cardShop: {
      sites: cardShopSiteService,
      goods: cardShopGoodsService,
      cards: cardShopCardService,
      contents: cardShopContentService,
      coupons: cardShopCouponService,
      customers: cardShopCustomerService,
      orders: cardShopOrderService,
      pay: cardShopPayService,
      releases: cardShopReleaseService,
    },
    // 快递寄件小程序：管理端控制器由契约 Kuaidi_ 派发，C 端公开通道在 app.ts 注册；
    // 报价与金额只由后端算，支付只做商户号直连解密。
    kuaidi: {
      platform: kuaidiPlatformService,
      sites: kuaidiSiteService,
      companies: kuaidiCompanyService,
      customers: kuaidiCustomerService,
      orders: kuaidiOrderService,
      pay: kuaidiPayService,
      releases: kuaidiReleaseService,
    },
    circle: {
      prisma: prismaService,
      communityService: circleCommunityService,
      userService: circleUserService,
      groupService: circleGroupService,
      postService: circlePostService,
      commentService: circleCommentService,
      interactionService: circleInteractionService,
      notificationService: circleNotificationService,
      reportService: circleReportService,
      mediaService: circleMediaService,
      aiService: circleAiService,
      activityService: circleActivityService,
      medalService: circleMedalService,
      subscribeService: circleSubscribeService,
    },
    // 跑腿小程序：管理端控制器由契约 Errand_/ErrandAdmin_ 派发，C 端与骑手通道在 app.ts 注册；
    // 金额只由后端算，支付走账号级小程序主体的商户号，AI 走统一模型网关。
    errand: {
      prisma: prismaService,
      platform: errandPlatformService,
      sites: errandSiteService,
      cities: errandCityService,
      agents: errandAgentService,
      customers: errandCustomerService,
      riders: errandRiderService,
      coupons: errandCouponService,
      wallet: errandWalletService,
      orders: errandOrderService,
      pay: errandPayService,
      ai: errandAiService,
      map: errandMapService,
      notify: errandNotifyService,
      releases: errandReleaseService,
    },
    knowledgePay: {
      service: knowledgePayService,
      member: knowledgePayMemberService,
      pay: knowledgePayPayService,
      controller: knowledgePayController,
    },
    // 数字人小程序工具：管理端控制器由契约 Dh_ 派发，C 端公开通道在 app.ts 注册；
    // oss 供 C 端素材上传直传对象存储（返回公网 URL 给供应商回调）。
    digitalHuman: {
      site: dhSiteService,
      member: dhMemberService,
      channel: dhChannelService,
      library: dhLibraryService,
      synth: dhSynthService,
      content: dhContentService,
      store: dhStoreService,
      pay: dhPayService,
      commission: dhCommissionService,
      release: dhReleaseService,
      oss: ossService,
      controller: digitalHumanController,
    },
    orgStaff: orgStaffService,
    serviceDesk: serviceDeskService,
    // AI 获客域（营销工具）：控制器由契约 moduleHandlers（Acquisition_）注册，
    // 调度器与两段插件路由由 main.ts / automation-routes 取用。
    acquisition: {
      settings: acquisitionSettingsService,
      radar: acquisitionRadarService,
      plugin: acquisitionPluginService,
      outreach: acquisitionOutreachService,
      profiles: acquisitionProfileService,
      playbooks: acquisitionPlaybookService,
      followUps: acquisitionFollowUpService,
      reception: acquisitionReceptionService,
      qc: acquisitionQcService,
      dashboard: acquisitionDashboardService,
      scheduler: acquisitionScheduler,
    },
    // 企业微信原生 SCRM 域（营销工具）：控制器由契约 moduleHandlers（Scrm_）注册，
    // 回调与员工侧边栏是根 app 上的公开路由，调度器由 main.ts 启停。
    scrm: {
      settings: scrmSettingsService,
      sync: scrmSyncService,
      contacts: scrmContactService,
      chats: scrmChatService,
      codes: scrmCodeService,
      mass: scrmMassService,
      transfers: scrmTransferService,
      sops: scrmSopService,
      compliance: scrmComplianceService,
      stats: scrmStatsService,
      materials: scrmMaterialService,
      sidebar: scrmSidebarService,
      callback: scrmCallbackService,
      scheduler: scrmScheduler,
    },
    livecode: livecodeService,
    survey: surveyService,
    quiz: quizService,
    publishReview: publishReviewService,
    okrMetrics: okrMetricsService,
    oa: oaService,
    // 统一任务中心（§我的任务）：控制器由契约 moduleHandlers（MyTask_）注册。
    taskCenter: taskCenterService,
    taskSources: taskSourceRegistry,
    taskRouter: taskRouterService,
    taskAssignment: taskAssignmentService,
    uiPreferences: uiPreferencesService,
    workflow: workflowService,
    workflowRunOperation,
    tencentQidian: tencentQidianService,
    crm: crmController,
    bi: biController,
    oss: ossService,
    ossSettings: ossSettingsService,
    systemAsset: systemAssetService,
    storage: {
      service: storageService,
      migration: storageMigrationService,
    },
    // 平台升级：控制器由契约 moduleHandlers（AdminUpgrade_）注册，runner 由任务服务拉起。
    upgrade: {
      packages: platformUpgradePackageService,
      analysis: platformUpgradeAnalysisService,
      jobs: platformUpgradeJobService,
    },
    qxySettings: qxySettingsService,
    capability: capabilityService,
    digitalAsset: contentDigitalAssetService,
    // 创意社区：service 给路由与调度器取 Key，scheduler 由 main.ts 启停。
    community: {
      service: communityService,
      awards: communityAwardService,
      scheduler: communityRunScheduler,
    },
    // 视频模版社区：控制器由 automation-routes 显式注册（复刻要透传 token），
    // 同步调度器由 main.ts 启停。
    videoTemplate: {
      service: videoTemplateService,
      scheduler: videoTemplateSyncScheduler,
    },
    // 内容生成任务调度池：DB 唯一真值，由 main.ts 启停。
    contentJob: { pool: contentJobPool },
    builtinMcp,
    // 平台治理域（§5.9/§5.10）：app.ts 拦截中间件与 governance 路由消费。
    feature: {
      toggle: featureToggleService,
      accessPolicy: accessPolicyService,
      skillReview: skillReviewService,
      skillReviewRunner,
    },
    // §5.8 横切机制：公开分享 / OIDC 回跳在根 app 上直接取用。
    mechanisms: mechanismService,
    // 项目 / 任务 / 工时域（§5.2 L2）：控制器由契约 moduleHandlers（Pj_）注册。
    project: projectService,
    // 附录 B 补齐项：公开预约 / 报价 PDF / 条款正文在根 app 上直接取用。
    gaps: {
      entitlements: entitlementService,
      appointments: appointmentService,
      mailTemplates: mailTemplateService,
      assistant: pageAssistantService,
      transcription: transcriptionService,
      quotationDoc: quotationDocumentService,
      timeAudit: timeAuditService,
      promo: promoService,
      card: cardService,
      cardTemplate: cardTemplateService,
      afterSales: afterSalesService,
      review: reviewService,
      taskSync: taskSyncService,
      terms: termsService,
      onboarding: onboardingService,
      changelog: changelogService,
      orgContext: orgContextService,
      usage: usageService,
    },
    // ERP 进销存域（§5.4 L2）：控制器由契约 moduleHandlers（Erp_）注册。
    erp: erpService,
    // 营销技能库（§5.5 L3）：控制器由契约 moduleHandlers（Mkt_）注册。
    mkt: mktService,
    // HRM 域（§5.1 L2）：档案/假勤/招聘/评估/Offer，控制器由契约 moduleHandlers 注册。
    hrm: {
      scope: hrmScopeService,
      profile: hrmProfileService,
      attendance: hrmAttendanceService,
      recruit: hrmRecruitService,
      talent: hrmTalentService,
      lifecycle: hrmLifecycleService,
    },
    // 知识库域（§10 L1）：kb 路由与后续 Agent 回流消费。
    kb: {
      space: kbSpaceService,
      source: kbSourceService,
      page: kbPageService,
      ingest: kbIngestService,
      search: kbSearchService,
      graph: kbGraphService,
      consumer: kbConsumerService,
      memory: kbMemoryService,
    },
    // 积分与计费域（供 app.ts 组装 PointsModule、account/billing 钩子、main.ts 调度器使用）。
    points: {
      settings: pointsSettingsService,
      ledger: pointsService,
      pricing: pricingService,
      billingRule: billingRuleService,
      aiEval: aiEvalService,
      pay: wechatPayClient,
      recharge: rechargeService,
      awcoin: awcoinClient,
      billing: pointsBillingService,
      crypto: accountCrypto,
    },
    // 官方服务套餐（供 app.ts 组装 ServicePackageModule）：目录购买 + 平台整合交付。
    servicePackages: {
      catalog: servicePackageService,
      fulfillment: servicePackageFulfillment,
    },
    // 模型广场：平台统一上架的模型目录 + 按量计费 + OpenAI 兼容对外网关。
    modelPlaza: {
      controller: modelPlazaController,
      upstreams: modelUpstreamService,
      catalog: modelCatalogService,
      usage: modelUsageService,
      relay: modelRelayService,
    },
    // 智能硬件：设备通道（根 app 公开路由）与机器通道/MCP（business）都从这里取服务实例。
    hardware: hardwareService,
    // 本地 Chrome 插件 RPA：设备通道在根 app（只认设备令牌），会话引擎给界面与 Agent/MCP 共用。
    rpaChrome: {
      device: rpaChromeDeviceService,
      agent: chromeAgentService,
      // 本账号私有资产台账（会话/消息/技能/录制/抽取）：设备通道与界面端点共用。
      library: rpaChromeLibraryService,
      // 计划任务（浏览器代理定时）：调度器与界面端点共用。
      schedule: rpaChromeScheduleService,
      // MCP 语义层（browser_agent_* / browser_extract / browser_skill_*）：绿灯即派任务的唯一入口。
      tools: browserAgentToolsService,
      // 模型广场目录：插件侧边栏 Agent 的「模型下拉 + 额度条」从这里取已上架模型与余额。
      catalog: modelCatalogService,
    },
    // Bot 主机：客户端通道（根 app 公开路由，只认主机令牌）与界面端点共用同一份服务实例。
    botHost: botHostService,
    // AI 调用账号：设备令牌通道（/api/public/{bot-host,awbot}/ai-call/**）按绑定取凭据。
    aiCall: aiCallAccountService,
    // 健康管理小程序：C 端公开通道与工作台控制器共用同一批领域服务。
    health: {
      publicService: healthPublicService,
      staffService: healthStaffService,
      tongueService: healthTongueService,
    },
    // 通用终端 SCRM：onsite/card/kuaidi/errand/circle/dh/kp 的关键节点打标。
    terminalScrm: terminalScrmService,
    controllers: {
      healthController,
      adminController,
      aiworkinController,
      connectionsController,
      assetController,
      capabilityController,
      contractsController,
      externalController,
      flexController,
      geoController,
      geoSiteController,
      geoSitePageController,
      geoSiteMenuController,
      geoSiteContentController,
      geoSiteTemplateController,
      seoController,
      identityController,
      invoiceController,
      ipController,
      thinkTankController,
      legalController,
      logisticsController,
      marketBoardController,
      marketingController,
      openApiController,
      overseasController,
      ossSettingsController,
      qxyController,
      servicesController,
      smartServiceController,
      supplyController,
      taxController,
      dataTableController,
      dataTableOpenController,
      dataTableFeishuController,
      rpaController,
      rpaOpenController,
      rpaChromeController,
      workbuddyController,
      botHostController,
      agentDispatchController,
      aiCallController,
      aiCallOpenController,
      leadProspectingController,
      ecomPdpController,
      domesticPdpController,
      distributionController,
      surveyController,
      quizController,
      helpController,
      bigdataQueryController,
      insightController,
      aliyunCallController,
      aliyunMailController,
      agentMemoryController,
      contentController,
      videoTemplateController,
      appDirectoryController,
      mailboxController,
      notificationController,
      wechatMpController,
      miniProgramController,
      onsiteController,
      onsiteAdminController,
      rentalController,
      parkController,
      marketplaceController,
      marketplaceAdminController,
      toolLaunchController,
      toolLaunchAdminController,
      miniGuideController,
      miniGuideAdminController,
      devGuideAdminController,
      brandController,
      brandAdminController,
      takeoutController,
      cardShopController,
      cardShopAdminController,
      kuaidiController,
      kuaidiAdminController,
      circleController,
      circleAdminController,
      errandController,
      errandAdminController,
      healthWorkbenchController,
      healthAdminController,
      knowledgePayController,
      digitalHumanController,
      snsController,
      orgStaffController,
      serviceDeskController,
      livecodeController,
      overseasNavController,
      crmController,
      biController,
      growthController,
      lowcodeController,
      okrController,
      rbacService,
      rbacController,
      partyController,
      oaController,
      taskCenterController,
      taskAssignmentController,
      uiPreferencesController,
      workflowController,
      tpController,
      questionHallController,
      imController,
      skillHubController,
      communityController,
      hrmController,
      mechanismController,
      projectController,
      erpController,
      mktController,
      kbController,
      aiController,
      aiSocialController,
      platformController,
      pointsBillingController,
      modelPlazaController,
      hardwareController,
      acquisitionController,
      scrmController,
      collabController,
      entitlementController,
      appointmentController,
      mailTemplateController,
      assistantController,
      transcriptionController,
      quotationDocumentController,
      timeAuditController,
      promoController,
      cardController,
      adminCardController,
      afterSalesController,
      reviewController,
      taskSyncController,
      termsController,
      onboardingController,
      changelogController,
      orgContextController,
      usageController,
      upgradeController,
      aiCodeController,
    },
  };
}
export type Services = ReturnType<typeof createServices>;
