import { bucketStarts, toPoints } from './buckets.js';
import { readingsQuerySchema } from './readings.schemas.js';

// 한국 시간 2026-11-25 18:30
const NOW = new Date('2026-11-25T09:30:00Z');
const at = (iso: string, moisturePercent: number) => ({ measuredAt: new Date(iso), moisturePercent });

describe('bucketStarts', () => {
  it('24h: 지금 시각이 속한 정시까지 24개, 오래된 것부터', () => {
    const starts = bucketStarts('24h', NOW);
    expect(starts).toHaveLength(24);
    expect(starts[0].toISOString()).toBe('2026-11-24T10:00:00.000Z');
    expect(starts[23].toISOString()).toBe('2026-11-25T09:00:00.000Z');
  });

  it('7d: 한국 시간 자정 기준 7일 (오늘 포함)', () => {
    const starts = bucketStarts('7d', NOW);
    expect(starts).toHaveLength(7);
    expect(starts[0].toISOString()).toBe('2026-11-18T15:00:00.000Z'); // 11/19 00:00 KST
    expect(starts[6].toISOString()).toBe('2026-11-24T15:00:00.000Z'); // 11/25 00:00 KST
  });

  it('7d: 한국 시간 새벽(UTC로는 전날)도 오늘로 계산', () => {
    const starts = bucketStarts('7d', new Date('2026-11-25T16:00:00Z')); // 11/26 01:00 KST
    expect(starts[6].toISOString()).toBe('2026-11-25T15:00:00.000Z');
  });
});

describe('toPoints', () => {
  it('구간 평균(소수 첫째 자리), 값이 없는 구간은 null', () => {
    const points = toPoints('24h', NOW, [
      at('2026-11-25T08:05:00Z', 60),
      at('2026-11-25T08:55:00Z', 61),
      at('2026-11-25T09:10:00Z', 66),
    ]);
    expect(points.at(-2)).toEqual({ at: '2026-11-25T08:00:00.000Z', value: 60.5 });
    expect(points.at(-1)).toEqual({ at: '2026-11-25T09:00:00.000Z', value: 66 });
    expect(points.at(-3)?.value).toBeNull();
  });

  it('범위 밖 값은 무시', () => {
    const points = toPoints('24h', NOW, [at('2026-11-20T00:00:00Z', 10), at('2026-11-25T11:00:00Z', 90)]);
    expect(points.every((p) => p.value === null)).toBe(true);
  });

  it('7d: 하루 평균', () => {
    const points = toPoints('7d', NOW, [at('2026-11-24T16:00:00Z', 40), at('2026-11-25T08:00:00Z', 50)]);
    expect(points.at(-1)?.value).toBe(45);
  });
});

describe('period 검사', () => {
  it('기본 24h, 그 밖의 값은 거부', () => {
    expect(readingsQuerySchema.parse({})).toEqual({ period: '24h' });
    expect(readingsQuerySchema.safeParse({ period: '30d' }).success).toBe(false);
  });
});
