import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { errorSchema, openApiArray, openApiSchema } from '../common/openapi.js';
import type { User } from '../database/schema/entities/auth/user.entity.js';
import {
  noticeIdSchema,
  noticeResponseSchema,
  noticeSettingsSchema,
  updateNoticeSettingsSchema,
  weeklySummarySchema,
  type NoticeResponse,
  type NoticeSettings,
  type UpdateNoticeSettings,
  type WeeklySummary,
} from './notices.schemas.js';
import { NOTICE_LIST_LIMIT, NoticesService } from './notices.service.js';

const noticeIdParam = ApiParam({ name: 'noticeId', type: Number, example: 1 });
const notFound = ApiNotFoundResponse({ description: '없는 알림이거나 다른 사용자의 알림 (NOTICE_NOT_FOUND)', schema: openApiSchema(errorSchema) });

/** 알림 API. 로그인 필요 (전역 가드). 내 알림만 보이고 다룰 수 있음 */
@ApiTags('알림')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '로그인 안 됨 / access 토큰 만료 → auth 서버 POST /api/auth/refresh' })
@Controller('notices')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  @ApiOperation({
    summary: '알림 목록',
    description: `알림함과 상단 메뉴의 안 읽음 표시에 씁니다. 최신순 최대 ${NOTICE_LIST_LIMIT}개입니다.`,
  })
  @ApiOkResponse({ description: '알림 배열(최신순). 없으면 []', schema: openApiArray(noticeResponseSchema) })
  list(@CurrentUser() user: User): Promise<NoticeResponse[]> {
    return this.notices.list(user.id);
  }

  @Get('weekly')
  @ApiOperation({
    summary: '지난 7일 경보 요약',
    description: '화분마다 한 줄씩 건조·과습·오프라인 경보 횟수를 내려줍니다. 경보가 없던 화분은 0이고, 알림함에서 지운 알림도 셉니다.',
  })
  @ApiOkResponse({ description: '화분별 경보 횟수 배열(화분 등록 순)', schema: openApiArray(weeklySummarySchema) })
  weekly(@CurrentUser() user: User): Promise<WeeklySummary[]> {
    return this.notices.weekly(user.id);
  }

  @Get('settings')
  @ApiOperation({ summary: '알림 받기 설정 조회' })
  @ApiOkResponse({ description: '알림 설정(한 건짜리 배열)', schema: openApiArray(noticeSettingsSchema) })
  async settings(@CurrentUser() user: User): Promise<NoticeSettings[]> {
    return [await this.notices.settings(user.id)];
  }

  @Patch('settings')
  @ApiOperation({ summary: '알림 받기 설정 변경', description: '바꾼 항목만 보냅니다.' })
  @ApiOkResponse({ description: '변경된 전체 설정(한 건짜리 배열)', schema: openApiArray(noticeSettingsSchema) })
  @ApiBadRequestResponse({ description: 'true/false가 아님, 그 밖의 항목' })
  async updateSettings(
    @CurrentUser() user: User,
    @Body({ schema: updateNoticeSettingsSchema }) body: UpdateNoticeSettings,
  ): Promise<NoticeSettings[]> {
    return [await this.notices.updateSettings(user.id, body)];
  }

  @Post('read-all')
  @HttpCode(204)
  @ApiOperation({ summary: '모든 알림 읽음 처리' })
  @ApiNoContentResponse({ description: '모두 읽음 처리했습니다.' })
  async markAllRead(@CurrentUser() user: User): Promise<void> {
    await this.notices.markAllRead(user.id);
  }

  @Post(':noticeId/read')
  @HttpCode(204)
  @noticeIdParam
  @ApiOperation({ summary: '알림 하나 읽음 처리', description: '"읽음 처리" 버튼을 누르거나 알림을 열었을 때 호출합니다. 이미 읽은 알림이어도 204입니다.' })
  @ApiNoContentResponse({ description: '읽음 처리했습니다.' })
  @notFound
  async markRead(@CurrentUser() user: User, @Param('noticeId', { schema: noticeIdSchema }) noticeId: number): Promise<void> {
    await this.notices.markRead(user.id, noticeId);
  }

  @Delete(':noticeId')
  @HttpCode(204)
  @noticeIdParam
  @ApiOperation({ summary: '알림 삭제', description: '알림함에서 지웁니다. 지난 7일 경보 요약에는 계속 셉니다.' })
  @ApiNoContentResponse({ description: '삭제했습니다.' })
  @notFound
  async remove(@CurrentUser() user: User, @Param('noticeId', { schema: noticeIdSchema }) noticeId: number): Promise<void> {
    await this.notices.remove(user.id, noticeId);
  }
}
