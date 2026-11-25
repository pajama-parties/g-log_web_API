import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { errorSchema, openApiArray, openApiSchema } from '../common/openapi.js';
import {
  registerSensorResponseSchema,
  registerSensorSchema,
  sensorReadingsResponseSchema,
  sensorReadingsSchema,
  type RegisterSensorInput,
  type RegisterSensorResponse,
  type SensorReadingsInput,
  type SensorReadingsResponse,
} from './sensors.schemas.js';
import { SensorsService } from './sensors.service.js';

export const SENSOR_TOKEN_AUTH = 'sensorToken';
const error = (description: string) => ({ description, schema: openApiSchema(errorSchema) });

/**
 * 센서(하드웨어)가 부르는 API. 사용자 로그인 대신 등록 코드 / 센서 토큰으로 인증하므로 @Public()
 * (전역 로그인 가드의 Bearer 검사가 센서 토큰을 JWT로 착각하지 않게)
 */
@ApiTags('센서')
@Public()
@Controller('sensors')
export class SensorsController {
  constructor(private readonly sensors: SensorsService) {}

  @Post('register')
  @ApiSecurity({})
  @ApiOperation({
    summary: '센서 등록',
    description: [
      '센서가 Wi-Fi에 연결된 뒤, 사용자가 입력한 등록 코드와 센서 번호를 보내 화분과 연결합니다.',
      '응답의 `token`은 이때 한 번만 내려주므로 센서 저장소에 보관하세요. 같은 센서를 다시 등록하면 새 토큰이 발급되고 이전 토큰은 쓸 수 없습니다.',
      '앱은 `GET /pots/{potId}/connection`으로 연결됐는지 확인합니다.',
    ].join('\n\n'),
  })
  @ApiCreatedResponse({ description: '연결 완료(한 건짜리 배열)', schema: openApiArray(registerSensorResponseSchema) })
  @ApiBadRequestResponse({ description: '코드·센서 번호 형식 오류' })
  @ApiNotFoundResponse(error('없는 등록 코드 (PAIRING_CODE_NOT_FOUND)'))
  @ApiGoneResponse(error('만료(10분)·이미 사용한 코드, 또는 코드를 받은 화분이 삭제됨 (PAIRING_CODE_EXPIRED)'))
  @ApiConflictResponse(error('다른 사용자가 쓰고 있는 센서 (SENSOR_IN_USE)'))
  async register(@Body({ schema: registerSensorSchema }) body: RegisterSensorInput): Promise<RegisterSensorResponse[]> {
    return [await this.sensors.register(body)];
  }

  @Post('readings')
  @HttpCode(200)
  @ApiBearerAuth(SENSOR_TOKEN_AUTH)
  @ApiOperation({
    summary: '측정값 보내기',
    description: [
      '센서가 한 시간마다 호출합니다. 헤더: `Authorization: Bearer {센서 토큰}`',
      '전송에 실패해서 보관한 값이 있으면 배열에 함께 보냅니다. 이미 받은 시각의 값은 건너뛰므로 같은 값을 다시 보내도 안전합니다.',
      '서버는 화분의 경보 기준으로 적정·건조·과습을 판정해 저장합니다.',
    ].join('\n\n'),
  })
  @ApiOkResponse({ description: '저장 결과(한 건짜리 배열)', schema: openApiArray(sensorReadingsResponseSchema) })
  @ApiBadRequestResponse({ description: '배열이 아니거나 1~500개를 벗어남, at·moisture·battery 형식 오류' })
  @ApiUnauthorizedResponse(error('센서 토큰이 없거나 폐기됨 (INVALID_SENSOR_TOKEN) → 다시 등록'))
  @ApiConflictResponse(error('화분에서 연결 해제된 센서 (SENSOR_NOT_CONNECTED) → 다시 등록'))
  async readings(
    @Headers('authorization') authorization: string | undefined,
    @Body({ schema: sensorReadingsSchema }) body: SensorReadingsInput,
  ): Promise<SensorReadingsResponse[]> {
    const deviceId = await this.sensors.authenticate(authorization);
    return [await this.sensors.ingest(deviceId, body)];
  }
}
