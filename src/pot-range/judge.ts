import type { MoistureStatus } from '../database/schema/enums.js';

/**
 * 경보 기준과 비교: 건조 기준보다 낮으면 DRY, 과습 기준보다 높으면 WET, 기준과 같으면 OK.
 * 기본 기준 0~100이면 항상 OK (경보 없음).
 * feature/sensors 의 judgeMoisture와 같은 규칙 — 두 브랜치가 합쳐지면 하나로 정리
 */
export function judgeMoisture(value: number, dryThreshold: number, wetThreshold: number): MoistureStatus {
  if (value < dryThreshold) return 'DRY';
  if (value > wetThreshold) return 'WET';
  return 'OK';
}
