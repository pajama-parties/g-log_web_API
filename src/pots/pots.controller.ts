import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
  connectionResponseSchema,
  createPotResponseSchema,
  createPotSchema,
  pairingCodeResponseSchema,
  potIdSchema,
  potResponseSchema,
  updatePotSchema,
  type ConnectionResponse,
  type CreatePotInput,
  type CreatePotResponse,
  type PairingCodeResponse,
  type PotResponse,
  type UpdatePotInput,
} from './pots.schemas.js';
import { PotsService } from './pots.service.js';

const potIdParam = ApiParam({ name: 'potId', type: Number, example: 1 });
const notFound = ApiNotFoundResponse({ description: '없는 화분이거나 다른 사용자의 화분 (POT_NOT_FOUND)', schema: openApiSchema(errorSchema) });

/** 화분 API. 로그인 필요 (전역 가드). 내 화분만 보이고 다룰 수 있음 */
@ApiTags('화분')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '로그인 안 됨 / access 토큰 만료 → auth 서버 POST /api/auth/refresh' })
@Controller('pots')
export class PotsController {
  constructor(private readonly pots: PotsService) {}

  @Get()
  @ApiOperation({
    summary: '내 화분 목록',
    description: '대시보드·내 식물·화분 상세에서 씁니다 (/pots/managed를 통합). 그래프 값은 측정값 API(/pots/{potId}/readings)에서 받습니다.',
  })
  @ApiOkResponse({ description: '화분 배열(등록 순). 화분이 없으면 []', schema: openApiArray(potResponseSchema) })
  list(@CurrentUser() user: User): Promise<PotResponse[]> {
    return this.pots.list(user.id);
  }

  @Post()
  @ApiOperation({
    summary: '화분 추가',
    description: [
      '화분 추가 1단계(이름·작물·흙 입력) 후 호출합니다. 응답의 `code`를 센서에 입력하면 연결됩니다.',
      '등록 코드는 10분(600초) 동안 유효하고, 센서가 연결되기 전까지 화분 상태는 `수집 대기`입니다.',
    ].join('\n\n'),
  })
  @ApiCreatedResponse({ description: '만든 화분과 센서 등록 코드(한 건짜리 배열)', schema: openApiArray(createPotResponseSchema) })
  @ApiBadRequestResponse({ description: '이름 1~50자, 작물 30자·흙 50자·위치 50자 이하, 그 밖의 항목은 거부' })
  async create(@CurrentUser() user: User, @Body({ schema: createPotSchema }) body: CreatePotInput): Promise<CreatePotResponse[]> {
    return [await this.pots.create(user.id, body)];
  }

  @Get(':potId')
  @potIdParam
  @ApiOperation({ summary: '화분 한 건', description: '화분 상세 화면. 목록 항목과 같은 형식입니다.' })
  @ApiOkResponse({ description: '화분(한 건짜리 배열)', schema: openApiArray(potResponseSchema) })
  @notFound
  async get(@CurrentUser() user: User, @Param('potId', { schema: potIdSchema }) potId: number): Promise<PotResponse[]> {
    return [await this.pots.get(user.id, potId)];
  }

  @Patch(':potId')
  @potIdParam
  @ApiOperation({ summary: '화분 정보 수정', description: '이름·작물·흙·위치. 바꾼 항목만 보냅니다. 작물·흙·위치에 null이나 ""를 보내면 미지정으로 비웁니다.' })
  @ApiOkResponse({ description: '수정된 화분(한 건짜리 배열)', schema: openApiArray(potResponseSchema) })
  @ApiBadRequestResponse({ description: '글자 수 초과, 빈 이름, 그 밖의 항목' })
  @notFound
  async update(
    @CurrentUser() user: User,
    @Param('potId', { schema: potIdSchema }) potId: number,
    @Body({ schema: updatePotSchema }) body: UpdatePotInput,
  ): Promise<PotResponse[]> {
    return [await this.pots.update(user.id, potId, body)];
  }

  @Get(':potId/connection')
  @potIdParam
  @ApiOperation({
    summary: '센서 연결 여부 확인',
    description: '화분 추가 2단계에서 센서가 `POST /sensors/register`로 연결됐는지 몇 초마다 확인합니다.',
  })
  @ApiOkResponse({ description: '연결 상태(한 건짜리 배열)', schema: openApiArray(connectionResponseSchema) })
  @notFound
  async connection(@CurrentUser() user: User, @Param('potId', { schema: potIdSchema }) potId: number): Promise<ConnectionResponse[]> {
    return [await this.pots.connection(user.id, potId)];
  }

  @Post(':potId/pairing-code')
  @potIdParam
  @ApiOperation({
    summary: '센서 등록 코드 다시 받기',
    description: '코드가 만료(10분)됐거나 "센서 다시 연결"을 할 때 씁니다. 아직 쓰지 않은 이전 코드는 더 이상 쓸 수 없습니다.',
  })
  @ApiCreatedResponse({ description: '새 등록 코드(한 건짜리 배열)', schema: openApiArray(pairingCodeResponseSchema) })
  @notFound
  async reissuePairingCode(
    @CurrentUser() user: User,
    @Param('potId', { schema: potIdSchema }) potId: number,
  ): Promise<PairingCodeResponse[]> {
    return [await this.pots.reissuePairingCode(user.id, potId)];
  }

  @Delete(':potId')
  @HttpCode(204)
  @potIdParam
  @ApiOperation({ summary: '화분 삭제', description: '화분을 삭제하고 센서 연결을 해제합니다. 센서는 다른 화분에 다시 연결할 수 있습니다.' })
  @ApiNoContentResponse({ description: '삭제했습니다.' })
  @notFound
  async remove(@CurrentUser() user: User, @Param('potId', { schema: potIdSchema }) potId: number): Promise<void> {
    await this.pots.remove(user.id, potId);
  }
}
