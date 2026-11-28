import { z } from 'zod';
import type { NoticeTone } from '../database/schema/enums.js';

/** DB 코드값 → 화면 문구 (명세 Tone) */
export const TONE_LABELS = {
  DRY: '건조',
  WET: '과습',
  OK: '적정',
  OFFLINE: '오프라인',
  ADVICE: '조언',
  INFO: '안내',
} as const satisfies Record<NoticeTone, string>;

export const noticeResponseSchema = z
  .object({
    id: z.number().int().meta({ example: 1 }),
    tone: z.enum(Object.values(TONE_LABELS) as [string, ...string[]]),
    pot: z.string().nullable().meta({ description: '화분 이름. 안내 알림은 null', example: '베란다 바질' }),
    potId: z.number().int().nullable().meta({ description: '화분 상세로 이동할 때 사용 (이름이 같은 화분이 있어도 정확함)', example: 2 }),
    title: z.string().meta({ example: '수분이 건조 기준 아래로 내려갔어요' }),
    body: z.string().nullable(),
    at: z.iso.datetime().meta({ description: '알림 시각. "12분 전", "오늘/어제/이번 주" 묶음은 프런트에서 만듦', example: '2026-11-25T08:48:00.000Z' }),
    unread: z.boolean(),
  })
  .meta({ id: 'Notice' });
export type NoticeResponse = z.infer<typeof noticeResponseSchema>;

export const weeklySummarySchema = z
  .object({
    potId: z.number().int().meta({ example: 2 }),
    pot: z.string().meta({ example: '베란다 바질' }),
    dry: z.number().int().meta({ description: '건조 경보 횟수', example: 4 }),
    wet: z.number().int().meta({ description: '과습 경보 횟수', example: 0 }),
    offline: z.number().int().meta({ description: '오프라인 경보 횟수', example: 0 }),
  })
  .meta({ id: 'WeeklySummary' });
export type WeeklySummary = z.infer<typeof weeklySummarySchema>;

const settingFlags = {
  dry: z.boolean({ error: 'dry는 true/false여야 합니다.' }).meta({ description: '건조 경보' }),
  wet: z.boolean({ error: 'wet는 true/false여야 합니다.' }).meta({ description: '과습 경보' }),
  offline: z.boolean({ error: 'offline은 true/false여야 합니다.' }).meta({ description: '센서 연결 끊김(2시간 넘게 값이 없을 때)' }),
  advice: z.boolean({ error: 'advice는 true/false여야 합니다.' }).meta({ description: '새 조언' }),
};

export const noticeSettingsSchema = z.object(settingFlags).meta({ id: 'NoticeSettings' });
export type NoticeSettings = z.infer<typeof noticeSettingsSchema>;

/** PATCH — 바꾼 항목만. 그 밖의 키는 400 */
export const updateNoticeSettingsSchema = z
  .strictObject({
    dry: settingFlags.dry.optional(),
    wet: settingFlags.wet.optional(),
    offline: settingFlags.offline.optional(),
    advice: settingFlags.advice.optional(),
  })
  .meta({ id: 'NoticeSettingsUpdate' });
export type UpdateNoticeSettings = z.infer<typeof updateNoticeSettingsSchema>;

export const noticeIdSchema = z.coerce
  .number({ error: 'noticeId는 숫자여야 합니다.' })
  .int({ error: 'noticeId는 정수여야 합니다.' })
  .positive({ error: 'noticeId는 1 이상이어야 합니다.' });
