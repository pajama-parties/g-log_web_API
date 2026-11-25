import { z } from 'zod';

/** POST /sensors/register */
export const registerSensorSchema = z
  .strictObject({
    code: z
      .string({ error: '등록 코드를 입력해 주세요.' })
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/, { error: '등록 코드 형식은 K7P-3QX 입니다.' })
      .meta({ example: 'K7P-3QX' }),
    sensorId: z
      .string({ error: '센서 번호를 입력해 주세요.' })
      .trim()
      .regex(/^[A-Za-z0-9-]{1,50}$/, { error: '센서 번호는 영문·숫자·하이픈 50자 이하입니다.' })
      .meta({ description: '센서 본체에 적힌 번호', example: 'GL-0012' }),
    firmwareVersion: z.string().trim().max(20).optional().meta({ example: '1.0.0' }),
  })
  .meta({ id: 'SensorRegister' });
export type RegisterSensorInput = z.infer<typeof registerSensorSchema>;

export const registerSensorResponseSchema = z.object({
  token: z.string().meta({
    description: '센서 토큰. 이때 한 번만 내려주므로 센서 저장소에 보관하고, 측정값을 보낼 때 `Authorization: Bearer {token}`으로 씁니다.',
    example: 'glsk_3q2p...',
  }),
  sensorId: z.string().meta({ example: 'GL-0012' }),
  potId: z.number().int().meta({ example: 1 }),
  reportIntervalSec: z.number().int().meta({ description: '측정값을 보낼 간격(초)', example: 3600 }),
});
export type RegisterSensorResponse = z.infer<typeof registerSensorResponseSchema>;

/** 측정값 한 건 */
const readingSchema = z.strictObject({
  at: z.iso
    .datetime({ offset: true, error: 'at은 ISO 8601 시각이어야 합니다. 예: 2026-11-25T09:00:00+09:00' })
    .transform((v) => new Date(v))
    .meta({ description: '측정 시각 (NTP로 맞춘 시계 기준)', example: '2026-11-25T09:00:00+09:00' }),
  moisture: z
    .number({ error: 'moisture는 숫자여야 합니다.' })
    .min(0, { error: 'moisture는 0~100입니다.' })
    .max(100, { error: 'moisture는 0~100입니다.' })
    .meta({ description: '토양 수분(%). 저장할 때 정수로 반올림', example: 66.0 }),
  battery: z
    .number({ error: 'battery는 숫자여야 합니다.' })
    .int({ error: 'battery는 정수여야 합니다.' })
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .meta({ description: '배터리 잔량(%)', example: 82 }),
});

/** POST /sensors/readings — 전송에 실패해서 보관한 값이 있으면 함께 보냄 */
export const sensorReadingsSchema = z
  .array(readingSchema)
  .min(1, { error: '측정값을 1개 이상 보내 주세요.' })
  .max(500, { error: '한 번에 500개까지 보낼 수 있습니다.' })
  .meta({ id: 'SensorReadings' });
export type SensorReadingsInput = z.infer<typeof sensorReadingsSchema>;

export const sensorReadingsResponseSchema = z.object({
  saved: z.number().int().meta({ description: '저장한 개수', example: 1 }),
  skipped: z.number().int().meta({ description: '이미 받은 값(재전송)이거나 시각이 맞지 않아 버린 개수', example: 0 }),
  reportIntervalSec: z.number().int().meta({ description: '다음 전송까지 기다릴 시간(초). 서버가 바꿀 수 있음', example: 3600 }),
});
export type SensorReadingsResponse = z.infer<typeof sensorReadingsResponseSchema>;
