import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { errorSchema, openApiArray, openApiSchema } from '../common/openapi.js';
import type { User } from '../database/schema/entities/auth/user.entity.js';
import { PERIODS, type Point } from './buckets.js';
import { pointSchema, potIdSchema, readingsQuerySchema, type ReadingsQuery } from './readings.schemas.js';
import { ReadingsService } from './readings.service.js';

/** 화분 그래프용 측정값. 로그인 필요 (전역 가드) */
@ApiTags('화분')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '로그인 안 됨 / access 토큰 만료 → auth 서버 POST /api/auth/refresh' })
@Controller('pots/:potId/readings')
export class ReadingsController {
  constructor(private readonly readings: ReadingsService) {}

  @Get()
  @ApiParam({ name: 'potId', type: Number, example: 1 })
  @ApiQuery({ name: 'period', enum: PERIODS, required: false, description: '기본 24h' })
  @ApiOperation({
    summary: '기간별 수분 측정값 (그래프)',
    description: [
      '대시보드·화분 상세·커뮤니티 글쓰기의 그래프에서 씁니다.',
      '- `24h`: 지금 시각이 속한 시까지 1시간 단위 24개',
      '- `7d`: 오늘(한국 시간)까지 하루 평균 7개',
      '',
      '오래된 값부터 내려주며, 센서가 값을 보내지 않은 구간은 `value: null`이라 그래프에서 끊긴 구간으로 표시합니다.',
    ].join('\n'),
  })
  @ApiOkResponse({ description: '24개 또는 7개의 (시각, 값) 배열', schema: openApiArray(pointSchema) })
  @ApiBadRequestResponse({ description: "period가 '24h'·'7d'가 아님, potId가 숫자가 아님" })
  @ApiNotFoundResponse({ description: '없는 화분이거나 다른 사용자의 화분 (POT_NOT_FOUND)', schema: openApiSchema(errorSchema) })
  list(
    @CurrentUser() user: User,
    @Param('potId', { schema: potIdSchema }) potId: number,
    @Query({ schema: readingsQuerySchema }) query: ReadingsQuery,
  ): Promise<Point[]> {
    return this.readings.points(user.id, potId, query.period);
  }
}
