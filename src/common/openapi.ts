import type { ApiResponseSchemaHost } from '@nestjs/swagger';
import { z } from 'zod';

type SchemaObject = ApiResponseSchemaHost['schema'];
type Json = unknown;

/**
 * 스키마에 .meta({ id })를 붙이면 Zod가 `$ref: '#/definitions/Id'` + 안쪽 `definitions`로 내보내는데,
 * 스웨거 UI는 응답 스키마 안의 definitions를 찾지 못해 "Resolver error"를 띄움 → 참조를 그 자리에 풀어 넣음
 */
function inlineRefs(node: Json, defs: Record<string, Json>): Json {
  if (Array.isArray(node)) return node.map((item) => inlineRefs(item, defs));
  if (node === null || typeof node !== 'object') return node;

  const { $ref, definitions: _definitions, $defs: _defs, ...rest } = node as Record<string, Json>;
  if (typeof $ref === 'string') {
    const match = /^#\/(?:definitions|\$defs)\/(.+)$/.exec($ref);
    const target = match ? defs[decodeURIComponent(match[1])] : undefined;
    if (target !== undefined) return inlineRefs({ ...(target as object), ...rest }, defs);
  }
  return Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, inlineRefs(value, defs)]));
}

/** Zod 스키마 → 스웨거 응답 스키마 (요청 본문은 @Body({ schema })로 자동 등록됨) */
export function openApiSchema(schema: z.ZodType): SchemaObject {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' }) as Record<string, Json>;
  const defs = { ...((json.definitions ?? {}) as Record<string, Json>), ...((json.$defs ?? {}) as Record<string, Json>) };
  return inlineRefs(json, defs) as SchemaObject;
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
