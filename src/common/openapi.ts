import type { ApiResponseSchemaHost } from '@nestjs/swagger';
import { z } from 'zod';

type SchemaObject = ApiResponseSchemaHost['schema'];

/** Zod 스키마 → 스웨거 응답 스키마 (요청 본문은 @Body({ schema })로 자동 등록됨) */
export function openApiSchema(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' }) as SchemaObject;
}

/** 스웨거 규칙: 조회 응답은 한 건이어도 배열 */
export function openApiArray(schema: z.ZodType): SchemaObject {
  return openApiSchema(z.array(schema));
}

/** 오류 응답 본문 { code, message } */
export const errorSchema = z.object({
  code: z.string().meta({ example: 'POT_NOT_FOUND' }),
  message: z.string().meta({ example: '화분을 찾을 수 없습니다.' }),
});
