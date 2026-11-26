import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
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
  adviceIdSchema,
  adviceResponseSchema,
  createAdviceSchema,
  feedbackSchema,
  type AdviceResponse,
  type CreateAdviceInput,
  type FeedbackInput,
} from './advices.schemas.js';
import { ADVICE_LIST_LIMIT, AdvicesService } from './advices.service.js';

const error = (description: string) => ({ description, schema: openApiSchema(errorSchema) });

/** 조언 API. 로그인 필요 (전역 가드). 내 조언만 보이고 다룰 수 있음 */
@ApiTags('조언')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '로그인 안 됨 / access 토큰 만료 → auth 서버 POST /api/auth/refresh' })
@Controller('advices')
export class AdvicesController {
  constructor(private readonly advices: AdvicesService) {}

  @Get()
  @ApiOperation({ summary: '조언 기록 목록', description: `최신순 최대 ${ADVICE_LIST_LIMIT}개입니다.` })
  @ApiOkResponse({ description: '조언 배열(최신순). 없으면 []', schema: openApiArray(adviceResponseSchema) })
  list(@CurrentUser() user: User): Promise<AdviceResponse[]> {
    return this.advices.list(user.id);
  }

  @Post()
  @ApiOperation({
    summary: '새 조언 요청',
    description: [
      '가장 최근 측정값, 경보 기준, 최근 6시간 변화량으로 조언을 만듭니다.',
      '`potId`를 비우면 서버가 가장 급한 화분을 고릅니다 (건조·과습 → 오프라인 → 적정, 같으면 최근에 측정한 화분).',
      '지금은 규칙 기반 조언이고, 근거(`basis`)는 항상 서버가 실제 값으로 작성합니다.',
    ].join('\n\n'),
  })
  @ApiCreatedResponse({ description: '만들어진 조언(한 건짜리 배열)', schema: openApiArray(adviceResponseSchema) })
  @ApiBadRequestResponse({ description: 'potId가 정수가 아님, 그 밖의 항목' })
  @ApiNotFoundResponse(error('없는 화분이거나 다른 사용자의 화분 (POT_NOT_FOUND)'))
  @ApiConflictResponse(error('측정값이 아직 없음 (NO_MEASUREMENT)'))
  async create(@CurrentUser() user: User, @Body({ schema: createAdviceSchema }) body: CreateAdviceInput): Promise<AdviceResponse[]> {
    return [await this.advices.create(user.id, body)];
  }

  @Put(':adviceId/feedback')
  @HttpCode(204)
  @ApiParam({ name: 'adviceId', type: Number, example: 1 })
  @ApiOperation({ summary: '조언 평가 저장', description: 'true는 "도움이 됐어요", false는 "아쉬워요", null은 평가 취소입니다.' })
  @ApiNoContentResponse({ description: '저장했습니다.' })
  @ApiBadRequestResponse({ description: 'helpful이 없거나 true/false/null이 아님' })
  @ApiNotFoundResponse(error('없는 조언이거나 다른 사용자의 조언 (ADVICE_NOT_FOUND)'))
  async feedback(
    @CurrentUser() user: User,
    @Param('adviceId', { schema: adviceIdSchema }) adviceId: number,
    @Body({ schema: feedbackSchema }) body: FeedbackInput,
  ): Promise<void> {
    await this.advices.feedback(user.id, adviceId, body.helpful);
  }
}
