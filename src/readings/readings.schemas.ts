import { z } from 'zod';
import { PERIODS } from './buckets.js';

export const readingsQuerySchema = z.object({
  period: z
    .enum(PERIODS, { error: "period는 '24h' 또는 '7d'입니다." })
    .default('24h')
    .meta({ description: '24h: 시간별 24개 / 7d: 일별(한국 시간) 평균 7개' }),
});
export type ReadingsQuery = z.infer<typeof readingsQuerySchema>;

export const potIdSchema = z.coerce
  .number({ error: 'potId는 숫자여야 합니다.' })
  .int({ error: 'potId는 정수여야 합니다.' })
  .positive({ error: 'potId는 1 이상이어야 합니다.' });

export const pointSchema = z
  .object({
    at: z.iso.datetime().meta({ description: '구간 시작 시각', example: '2026-11-25T00:00:00.000Z' }),
    value: z.number().nullable().meta({ description: '구간 평균 수분(%). 센서가 값을 보내지 않은 구간은 null', example: 66.0 }),
  })
  .meta({ id: 'ReadingPoint' });
