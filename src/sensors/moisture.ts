import type { MoistureStatus } from '../database/schema/enums.js';

/** 경보 기준과 비교: 건조 기준보다 낮으면 DRY, 과습 기준보다 높으면 WET, 기준과 같으면 OK */
export function judgeMoisture(value: number, dryThreshold: number, wetThreshold: number): MoistureStatus {
  if (value < dryThreshold) return 'DRY';
  if (value > wetThreshold) return 'WET';
  return 'OK';
}

/** DB DATETIME은 초 단위 (MySQL은 소수 초를 반올림하므로 미리 버림) → 재전송 중복 비교도 초 단위 */
export function toWholeSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}
