import { z } from 'zod';

const percent = (label: string) =>
  z
    .number({ error: `${label}은(는) 숫자여야 합니다.` })
    .int({ error: `${label}은(는) 정수여야 합니다.` })
    .min(0, { error: `${label}은(는) 0~100입니다.` })
    .max(100, { error: `${label}은(는) 0~100입니다.` });

/**
 * PUT /pots/{potId}/range 요청·응답 (명세 components.schemas.Range).
 * 기본값은 0~100(경보 없음). 사용자가 식물에 맞게 정함 (화면 추천값: 건조 35%, 과습 80%)
 */
export const rangeSchema = z
  .strictObject({
    lower: percent('건조 기준(lower)').meta({ description: '건조 기준(%). 이보다 낮으면 건조', example: 35 }),
    upper: percent('과습 기준(upper)').meta({ description: '과습 기준(%). 이보다 높으면 과습', example: 80 }),
  })
  .refine((r) => r.lower < r.upper, { error: '건조 기준은 과습 기준보다 낮아야 합니다.', path: ['lower'] })
  .meta({ id: 'Range' });
export type RangeInput = z.infer<typeof rangeSchema>;

export const potIdSchema = z.coerce
  .number({ error: 'potId는 숫자여야 합니다.' })
  .int({ error: 'potId는 정수여야 합니다.' })
  .positive({ error: 'potId는 1 이상이어야 합니다.' });
