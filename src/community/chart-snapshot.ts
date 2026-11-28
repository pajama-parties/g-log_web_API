import type { ChartPeriod } from '../database/schema/enums.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;

/**
 * 글에 고정할 그래프 값 (그래프 API /pots/{potId}/readings와 같은 구간 규칙)
 * - 24H: 지금 시각이 속한 시까지 1시간 단위 24구간 평균
 * - 7D : 오늘(한국 시간)까지 하루 단위 7구간 평균
 * 값이 없던 구간은 빼고, 소수 첫째 자리로 반올림
 */
export function snapshotPoints(period: ChartPeriod, now: Date, readings: { measuredAt: Date; moisturePercent: number }[]): number[] {
  const size = period === '24H' ? HOUR_MS : DAY_MS;
  const count = period === '24H' ? 24 : 7;
  const t = now.getTime();
  const last = period === '24H' ? Math.floor(t / HOUR_MS) * HOUR_MS : Math.floor((t + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  const first = last - (count - 1) * size;

  const sums = Array.from({ length: count }, () => ({ total: 0, n: 0 }));
  for (const r of readings) {
    const i = Math.floor((r.measuredAt.getTime() - first) / size);
    if (i < 0 || i >= count) continue;
    sums[i].total += r.moisturePercent;
    sums[i].n += 1;
  }
  return sums.filter((s) => s.n > 0).map((s) => Math.round((s.total / s.n) * 10) / 10);
}

/** 그래프를 가져올 시작 시각 */
export function snapshotFrom(period: ChartPeriod, now: Date): Date {
  return period === '24H' ? new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS - 23 * HOUR_MS) : new Date(now.getTime() - 7 * DAY_MS);
}
