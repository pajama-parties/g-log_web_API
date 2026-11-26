import { z } from 'zod';
import type { AdviceTone } from '../database/schema/enums.js';

/** DB 코드값 → 화면 문구 (명세 Advice.tone) */
export const ADVICE_TONE_LABELS = { DRY: '건조', WET: '과습', OK: '적정', OFFLINE: '오프라인' } as const satisfies Record<AdviceTone, string>;

export const adviceResponseSchema = z
  .object({
    id: z.number().int().meta({ example: 1 }),
    pot: z.string().meta({ example: '베란다 바질' }),
    potId: z.number().int().meta({ example: 2 }),
    tone: z.enum(['건조', '과습', '적정', '오프라인']),
    value: z.number().int().nullable().meta({ description: '조언을 받은 시점의 수분(%). 오프라인이면 null', example: 22 }),
    text: z.string().meta({ example: '흙이 빠르게 마르고 있어요. 오늘 안에 흙 상태를 직접 확인하고, 말라 있으면 물을 주세요.' }),
    basis: z.string().nullable().meta({ description: '조언 근거 (서버가 실제 값으로 작성)', example: '받은 시점 수분 22% · 건조 기준 35% · 최근 6시간 동안 6%p 하락' }),
    at: z.iso.datetime().meta({ description: '조언 시각. "오늘 오전 9:20", "오늘/어제/이번 주" 묶음은 프런트에서 만듦' }),
    helpful: z.boolean().nullable().meta({ description: 'true: 도움이 됐어요, false: 아쉬워요, null: 평가 안 함' }),
  })
  .meta({ id: 'Advice' });
export type AdviceResponse = z.infer<typeof adviceResponseSchema>;

/** POST /advices — potId를 비우면 서버가 화분을 고름 (건조·과습 → 오프라인 → 적정) */
export const createAdviceSchema = z
  .strictObject({
    potId: z
      .number({ error: 'potId는 숫자여야 합니다.' })
      .int({ error: 'potId는 정수여야 합니다.' })
      .positive({ error: 'potId는 1 이상이어야 합니다.' })
      .nullable()
      .optional()
      .meta({ example: 2 }),
  })
  .meta({ id: 'AdviceCreate' });
export type CreateAdviceInput = z.infer<typeof createAdviceSchema>;

/** PUT /advices/{adviceId}/feedback — helpful은 꼭 보냄 (null = 평가 취소) */
export const feedbackSchema = z
  .strictObject({
    helpful: z.boolean({ error: 'helpful은 true, false, null 중 하나입니다.' }).nullable(),
  })
  .meta({ id: 'AdviceFeedback' });
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const adviceIdSchema = z.coerce
  .number({ error: 'adviceId는 숫자여야 합니다.' })
  .int({ error: 'adviceId는 정수여야 합니다.' })
  .positive({ error: 'adviceId는 1 이상이어야 합니다.' });
