import { Body, Controller, Param, Put } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
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
import { potIdSchema, rangeSchema, type RangeInput } from './pot-range.schemas.js';
import { PotRangeService } from './pot-range.service.js';

/** 화분 경보 기준. 로그인 필요 (전역 가드) */
@ApiTags('화분')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '로그인 안 됨 / access 토큰 만료 → auth 서버 POST /api/auth/refresh' })
@Controller('pots/:potId/range')
export class PotRangeController {
  constructor(private readonly range: PotRangeService) {}

  @Put()
  @ApiParam({ name: 'potId', type: Number, example: 1 })
  @ApiOperation({
    summary: '화분 적정 범위(경보 기준) 저장',
    description: [
      '화분 상세의 "기준 저장" 버튼입니다. 수분이 `lower`보다 낮으면 건조, `upper`보다 높으면 과습으로 판정합니다.',
      '새 화분의 기본값은 0~100(경보 없음)이라, 사용자가 식물에 맞게 정해야 경보가 동작합니다. 화면의 추천값은 건조 35%, 과습 80%입니다.',
      '저장하면 현재 수분값으로 화분 상태를 바로 다시 판정합니다.',
    ].join('\n\n'),
  })
  @ApiOkResponse({ description: '저장된 기준(한 건짜리 배열)', schema: openApiArray(rangeSchema) })
  @ApiBadRequestResponse({ description: '0~100 정수가 아님, 건조 기준 ≥ 과습 기준, 그 밖의 항목' })
  @ApiNotFoundResponse({ description: '없는 화분이거나 다른 사용자의 화분 (POT_NOT_FOUND)', schema: openApiSchema(errorSchema) })
  async save(
    @CurrentUser() user: User,
    @Param('potId', { schema: potIdSchema }) potId: number,
    @Body({ schema: rangeSchema }) body: RangeInput,
  ): Promise<RangeInput[]> {
    return [await this.range.save(user.id, potId, body)];
  }
}
