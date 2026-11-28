import { StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ACCESS_COOKIE } from './auth/auth.constants.js';
import { SENSOR_TOKEN_AUTH } from './sensors/sensors.controller.js';

/** main.ts와 e2e 테스트가 같은 설정을 쓰도록 모아 둠 */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  // @Body({ schema: zod스키마 }) 검사. 실패하면 400 + message 배열
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  // API 문서: http://127.0.0.1:3001/api/docs (JSON: /api/docs-json)
  const config = new DocumentBuilder()
    .setTitle('g-log 서비스 API')
    .setDescription(
      [
        '화분·센서·알림·조언·커뮤니티 API. 코드에서 자동 생성되므로 항상 실제 동작과 같습니다.',
        '',
        '- 센서 API(`/sensors/*`)는 로그인 대신 등록 코드 / 센서 토큰(`Authorization: Bearer glsk_...`)으로 인증합니다.',
        '- 로그인은 auth 서버(:3000)가 합니다. 이 페이지에서 시험하려면 먼저 http://127.0.0.1:3000/api/docs 에서 로그인하세요. 같은 호스트(127.0.0.1)면 `access_token` 쿠키가 여기에도 붙습니다. (localhost와 127.0.0.1은 다른 호스트로 취급되니 섞지 마세요.)',
        '- API가 401이면 auth 서버의 `POST /api/auth/refresh` → 원래 요청 재시도 → 또 401이면 로그인 화면.',
        '- 조회 응답은 한 건이어도 배열입니다.',
        '- 시각은 ISO 8601 문자열(UTC)입니다. "18분 전 수신" 같은 표시 문구는 프런트에서 만듭니다.',
        '- 오류 응답은 `{ "code": "POT_NOT_FOUND", "message": "..." }` 형식입니다. 요청 값 검사 실패(400)는 `message`가 배열입니다.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addCookieAuth(ACCESS_COOKIE)
    .addBearerAuth()
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: '센서 토큰 (POST /sensors/register 응답의 token)' }, SENSOR_TOKEN_AUTH)
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config));
}
