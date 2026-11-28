import { z } from 'zod';

/** 화면에 보이는 화분 상태. 오프라인·수집 대기는 DB에 저장하지 않고 계산 */
export const POT_STATUSES = ['적정', '건조', '과습', '오프라인', '수집 대기'] as const;
export type PotStatus = (typeof POT_STATUSES)[number];

const isoDateTime = z.iso.datetime();

/** 스웨거 components.schemas.Pot (응답). GET /pots, GET /pots/{potId}, POST·PATCH 응답 공통 */
export const potResponseSchema = z
  .object({
    id: z.number().int().meta({ example: 1 }),
    name: z.string().meta({ example: '거실 몬스테라' }),
    plantType: z.string().meta({ description: "비어 있으면 '작물 미지정'", example: '몬스테라' }),
    soil: z.string().meta({ description: "비어 있으면 '흙 미지정'", example: '실내식물용 배양토' }),
    place: z.string().nullable().meta({ example: '거실 창가' }),
    sensorId: z.string().nullable().meta({ description: '연결된 센서 번호. 연결 전이면 null', example: 'GL-0012' }),
    growingDays: z.number().int().meta({ description: '키운 일수 (등록한 날이 1일째)', example: 32 }),
    value: z.number().int().nullable().meta({ description: '현재 토양 수분(%). 측정값이 없으면 null', example: 66 }),
    status: z.enum(POT_STATUSES),
    receivedAt: isoDateTime.nullable().meta({ description: '마지막 측정 시각', example: '2026-11-25T08:42:00.000Z' }),
    range: z
      .tuple([z.number().int(), z.number().int()])
      .meta({ description: '[건조 기준, 과습 기준] (%)', example: [35, 80] }),
    watering: z
      .object({
        lastAt: isoDateTime.meta({ description: '마지막으로 물 준 시각' }),
        intervalDays: z.number().int().nullable().meta({ description: '평균 물주기(일). 기록이 2번 이상일 때만', example: 8 }),
        nextAt: isoDateTime.nullable().meta({ description: '다음 물 줄 예상 시각 (lastAt + intervalDays)' }),
      })
      .nullable()
      .meta({ description: '물 준 기록이 없으면 null' }),
    visual: z.object({
      icon: z.string().meta({ example: 'plant' }),
      color: z.string().meta({ example: '#304d42' }),
      photo: z.string().nullable(),
    }),
  })
  .meta({ id: 'Pot' });
export type PotResponse = z.infer<typeof potResponseSchema>;

export const createPotResponseSchema = z.object({
  pot: potResponseSchema,
  code: z.string().meta({ description: '센서에 입력할 등록 코드', example: 'K7P-3QX' }),
  expiresIn: z.number().int().meta({ description: '남은 유효 시간(초)', example: 600 }),
});
export type CreatePotResponse = z.infer<typeof createPotResponseSchema>;

export const pairingCodeResponseSchema = createPotResponseSchema.omit({ pot: true });
export type PairingCodeResponse = z.infer<typeof pairingCodeResponseSchema>;

export const connectionResponseSchema = z.object({
  connected: z.boolean().meta({ description: '센서가 이 화분에 연결됐는지' }),
  sensorId: z.string().nullable().meta({ example: 'GL-0012' }),
});
export type ConnectionResponse = z.infer<typeof connectionResponseSchema>;

/** 앞뒤 공백 제거. 빈 문자열이나 null이면 null (= 미지정) */
const optionalText = (max: number, label: string) =>
  z
    .string({ error: `${label}은(는) 문자열이어야 합니다.` })
    .trim()
    .max(max, { error: `${label}은(는) ${max}자 이하로 입력해 주세요.` })
    .nullable()
    .transform((v) => (v ? v : null));

const potName = z
  .string({ error: '화분 이름을 입력해 주세요.' })
  .trim()
  .min(1, { error: '화분 이름을 입력해 주세요.' })
  .max(50, { error: '화분 이름은 50자 이하로 입력해 주세요.' })
  .meta({ example: '베란다 바질' });

/** POST /pots (화분 추가 1단계) */
export const createPotSchema = z
  .strictObject({
    name: potName,
    plantType: optionalText(30, '작물').optional().meta({ example: '바질' }),
    soil: optionalText(50, '흙').optional().meta({ example: '허브용 상토' }),
    place: optionalText(50, '위치').optional().meta({ example: '베란다' }),
  })
  .meta({ id: 'PotCreate' });
export type CreatePotInput = z.infer<typeof createPotSchema>;

/** PATCH /pots/{potId} — 바꾼 항목만. null 또는 ''을 보내면 '미지정'으로 비움 */
export const updatePotSchema = z
  .strictObject({
    name: potName.optional(),
    plantType: optionalText(30, '작물').optional(),
    soil: optionalText(50, '흙').optional(),
    place: optionalText(50, '위치').optional(),
  })
  .meta({ id: 'PotUpdate' });
export type UpdatePotInput = z.infer<typeof updatePotSchema>;

export const potIdSchema = z.coerce
  .number({ error: 'potId는 숫자여야 합니다.' })
  .int({ error: 'potId는 정수여야 합니다.' })
  .positive({ error: 'potId는 1 이상이어야 합니다.' });
