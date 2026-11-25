const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** 일별 구간은 한국 시간 자정 기준 */
const KST_OFFSET_MS = 9 * HOUR_MS;

export const PERIODS = ['24h', '7d'] as const;
export type Period = (typeof PERIODS)[number];

export interface Measurement {
  measuredAt: Date;
  moisturePercent: number;
}

export interface Point {
  at: string;
  value: number | null;
}

/**
 * 그래프 구간 시작 시각들 (오래된 것부터)
 * - 24h: 지금 시각이 속한 시(정각)까지 1시간 단위 24개
 * - 7d : 오늘(한국 시간)까지 하루 단위 7개
 */
export function bucketStarts(period: Period, now: Date): Date[] {
  const t = now.getTime();
  if (period === '24h') {
    const current = Math.floor(t / HOUR_MS) * HOUR_MS;
    return Array.from({ length: 24 }, (_, i) => new Date(current - (23 - i) * HOUR_MS));
  }
  const today = Math.floor((t + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  return Array.from({ length: 7 }, (_, i) => new Date(today - (6 - i) * DAY_MS));
}

export function bucketSizeMs(period: Period): number {
  return period === '24h' ? HOUR_MS : DAY_MS;
}

/** 구간마다 평균(소수 첫째 자리). 값이 없는 구간은 null → 그래프에서 끊긴 구간 */
export function toPoints(period: Period, now: Date, measurements: Measurement[]): Point[] {
  const starts = bucketStarts(period, now);
  const size = bucketSizeMs(period);
  const first = starts[0].getTime();
  const sums = starts.map(() => ({ total: 0, count: 0 }));

  for (const m of measurements) {
    const index = Math.floor((m.measuredAt.getTime() - first) / size);
    if (index < 0 || index >= sums.length) continue;
    sums[index].total += m.moisturePercent;
    sums[index].count += 1;
  }

  return starts.map((start, i) => ({
    at: start.toISOString(),
    value: sums[i].count > 0 ? Math.round((sums[i].total / sums[i].count) * 10) / 10 : null,
  }));
}
