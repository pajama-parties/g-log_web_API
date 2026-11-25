import type { Device } from '../database/schema/entities/service/device.entity.js';
import type { Plant } from '../database/schema/entities/service/plant.entity.js';
import type { MoistureStatus } from '../database/schema/enums.js';
import type { PotResponse, PotStatus } from './pots.schemas.js';

/** 2시간 넘게 값이 없으면 오프라인 (기획서 2장, backend MeService와 같은 기준) */
export const OFFLINE_AFTER_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 평균 물주기는 최근 이만큼의 간격으로 계산 */
const WATERING_SAMPLE = 5;

const STATUS_LABELS: Record<MoistureStatus, PotStatus> = { OK: '적정', DRY: '건조', WET: '과습' };

/**
 * 화면 상태
 * - 센서 연결 전이거나 아직 측정값이 없으면 '수집 대기'
 * - 센서가 2시간 넘게 조용하면 '오프라인'
 * - 그 밖에는 마지막 판정(적정·건조·과습)
 */
export function potStatus(plant: Plant, device: Device | undefined, now: Date): PotStatus {
  if (!device || plant.lastStatus === null || plant.lastMeasuredAt === null) return '수집 대기';
  const lastSeen = device.lastSeenAt ?? plant.lastMeasuredAt;
  if (now.getTime() - lastSeen.getTime() > OFFLINE_AFTER_MS) return '오프라인';
  return STATUS_LABELS[plant.lastStatus];
}

/** 물 준 시각 목록(최신순) → 마지막·평균 간격·다음 예상 */
export function wateringSummary(wateredAtDesc: Date[]): PotResponse['watering'] {
  const [last] = wateredAtDesc;
  if (!last) return null;
  const recent = wateredAtDesc.slice(0, WATERING_SAMPLE + 1);
  if (recent.length < 2) return { lastAt: last.toISOString(), intervalDays: null, nextAt: null };

  const spanMs = recent[0].getTime() - recent[recent.length - 1].getTime();
  const intervalDays = Math.max(1, Math.round(spanMs / (recent.length - 1) / DAY_MS));
  return {
    lastAt: last.toISOString(),
    intervalDays,
    nextAt: new Date(last.getTime() + intervalDays * DAY_MS).toISOString(),
  };
}

/** 등록한 날이 1일째 */
export function growingDays(createdAt: Date, now: Date): number {
  return Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS) + 1;
}

export function toPotResponse(plant: Plant, device: Device | undefined, wateredAtDesc: Date[], now: Date): PotResponse {
  return {
    id: plant.id,
    name: plant.name,
    plantType: plant.plantType ?? '작물 미지정',
    soil: plant.soil ?? '흙 미지정',
    place: plant.place,
    sensorId: device?.serialNumber ?? null,
    growingDays: growingDays(plant.createdAt, now),
    value: plant.lastMoisture,
    status: potStatus(plant, device, now),
    receivedAt: plant.lastMeasuredAt?.toISOString() ?? null,
    range: [plant.dryThreshold, plant.wetThreshold],
    watering: wateringSummary(wateredAtDesc),
    visual: { icon: plant.icon, color: plant.color, photo: plant.photoUrl },
  };
}
