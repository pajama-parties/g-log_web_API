import type { Notification } from '../database/schema/entities/service/notification.entity.js';
import { toNoticeResponse, weeklySummary } from './notice-view.js';
import { updateNoticeSettingsSchema } from './notices.schemas.js';

describe('toNoticeResponse', () => {
  const base = {
    id: 3,
    userId: 7,
    plantId: 2,
    tone: 'DRY',
    title: '수분이 건조 기준 아래로 내려갔어요',
    body: null,
    isRead: false,
    readAt: null,
    createdAt: new Date('2026-11-25T08:48:00Z'),
    deletedAt: null,
  } as Notification;

  it('코드값을 화면 문구로, 시각은 ISO, unread = !isRead', () => {
    expect(toNoticeResponse(base, '베란다 바질')).toEqual({
      id: 3,
      tone: '건조',
      pot: '베란다 바질',
      potId: 2,
      title: '수분이 건조 기준 아래로 내려갔어요',
      body: null,
      at: '2026-11-25T08:48:00.000Z',
      unread: true,
    });
  });

  it('안내 알림은 화분이 없음', () => {
    expect(toNoticeResponse({ ...base, tone: 'INFO', plantId: null, isRead: true } as Notification, null)).toMatchObject({
      tone: '안내',
      pot: null,
      potId: null,
      unread: false,
    });
  });
});

describe('weeklySummary', () => {
  const plants = [
    { id: 1, name: '거실 몬스테라' },
    { id: 2, name: '베란다 바질' },
  ];

  it('화분마다 한 줄, 경보 없는 화분은 0', () => {
    const alerts = [
      { plantId: 2, tone: 'DRY' },
      { plantId: 2, tone: 'DRY' },
      { plantId: 2, tone: 'OFFLINE' },
    ] as Notification[];
    expect(weeklySummary(plants, alerts)).toEqual([
      { potId: 1, pot: '거실 몬스테라', dry: 0, wet: 0, offline: 0 },
      { potId: 2, pot: '베란다 바질', dry: 2, wet: 0, offline: 1 },
    ]);
  });

  it('삭제한 화분·안내 알림은 셈하지 않음', () => {
    const alerts = [
      { plantId: 99, tone: 'WET' },
      { plantId: null, tone: 'DRY' },
    ] as Notification[];
    expect(weeklySummary(plants, alerts).every((r) => r.dry + r.wet + r.offline === 0)).toBe(true);
  });
});

describe('updateNoticeSettingsSchema', () => {
  it('바꾼 항목만, boolean만, 정해진 키만', () => {
    expect(updateNoticeSettingsSchema.parse({ dry: false })).toEqual({ dry: false });
    expect(updateNoticeSettingsSchema.safeParse({ dry: 'no' }).success).toBe(false);
    expect(updateNoticeSettingsSchema.safeParse({ kakao: true }).success).toBe(false);
  });
});
