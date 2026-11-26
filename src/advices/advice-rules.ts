import type { AdviceTone } from '../database/schema/enums.js';

/** 2시간 넘게 값이 없으면 오프라인 (기획서 2장) */
export const OFFLINE_AFTER_MS = 2 * 60 * 60 * 1000;
/** 이만큼 넘게 변하면 "빠르게" 마르거나 젖는 중 */
const FAST_CHANGE = 5;
/** 기준까지 이만큼 남으면 "가까워지는 중" */
const NEAR_THRESHOLD = 5;

export interface AdviceInput {
  /** 마지막 수분(%) */
  moisture: number;
  measuredAt: Date;
  /** 센서 마지막 수신. 센서가 떨어졌으면 null */
  lastSeenAt: Date | null;
  dryThreshold: number;
  wetThreshold: number;
  /** 최근 6시간 변화량(%p). 비교할 값이 없으면 null */
  change6h: number | null;
  now: Date;
}

export interface AdviceDraft {
  tone: AdviceTone;
  /** 조언 받은 시점 수분. 오프라인이면 null */
  moisture: number | null;
  text: string;
  /** 근거는 항상 실제 값으로 서버가 작성 (LLM을 붙여도 문장과 수치가 어긋나지 않게) */
  basis: string;
}

/** 새 화분 기본값 0~100 = 사용자가 기준을 아직 안 정함 */
function rangeNotSet(i: AdviceInput): boolean {
  return i.dryThreshold === 0 && i.wetThreshold === 100;
}

function changeText(change: number | null): string | null {
  if (change === null) return null;
  if (Math.abs(change) < 1) return '최근 6시간 동안 변화 없음';
  return `최근 6시간 동안 ${Math.abs(Math.round(change))}%p ${change < 0 ? '하락' : '상승'}`;
}

function hoursAgo(from: Date, now: Date): string {
  const hours = Math.floor((now.getTime() - from.getTime()) / (60 * 60 * 1000));
  return hours >= 24 ? `${Math.floor(hours / 24)}일 전` : `${hours}시간 전`;
}

const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(' · ');

/** 측정값·경보 기준·최근 변화량으로 만드는 규칙 기반 조언 (LLM이 실패했을 때도 이걸 저장) */
export function ruleBasedAdvice(i: AdviceInput): AdviceDraft {
  const lastSeen = i.lastSeenAt ?? i.measuredAt;
  if (i.lastSeenAt === null || i.now.getTime() - lastSeen.getTime() > OFFLINE_AFTER_MS) {
    return {
      tone: 'OFFLINE',
      moisture: null,
      text: '센서 연결을 먼저 확인해 주세요. 전원과 2.4GHz 와이파이 연결을 확인하고, 다시 연결되면 현재 수분에 맞는 조언을 받을 수 있어요.',
      basis: join(`마지막 수신 ${hoursAgo(lastSeen, i.now)}`, `마지막 값 ${i.moisture}%`),
    };
  }

  const change = changeText(i.change6h);
  const now = `받은 시점 수분 ${i.moisture}%`;

  if (i.moisture < i.dryThreshold) {
    const fast = i.change6h !== null && i.change6h <= -FAST_CHANGE;
    return {
      tone: 'DRY',
      moisture: i.moisture,
      text: fast
        ? '흙이 빠르게 마르고 있어요. 오늘 안에 흙 상태를 직접 확인하고, 말라 있으면 물을 주세요.'
        : '수분이 건조 기준보다 낮아요. 흙 겉면이 말랐다면 화분 밑으로 물이 빠질 만큼 충분히 주세요.',
      basis: join(now, `건조 기준 ${i.dryThreshold}%`, change),
    };
  }

  if (i.moisture > i.wetThreshold) {
    const fast = i.change6h !== null && i.change6h >= FAST_CHANGE;
    return {
      tone: 'WET',
      moisture: i.moisture,
      text: fast
        ? '수분이 빠르게 올라가고 있어요. 배수 구멍이 막히지 않았는지 확인하고 물주기를 미뤄 주세요.'
        : '수분이 적정 범위보다 높아요. 배수 상태를 확인하고 물주기를 미뤄 주세요.',
      basis: join(now, `과습 기준 ${i.wetThreshold}%`, change),
    };
  }

  if (rangeNotSet(i)) {
    return {
      tone: 'OK',
      moisture: i.moisture,
      text: '아직 경보 기준을 정하지 않았어요. 화분 상세에서 식물에 맞는 건조·과습 기준을 저장하면 더 정확한 조언을 받을 수 있어요.',
      basis: join(now, '경보 기준 미설정', change),
    };
  }

  const range = `적정 범위 ${i.dryThreshold}–${i.wetThreshold}% 안`;
  if (i.moisture - i.dryThreshold <= NEAR_THRESHOLD) {
    return {
      tone: 'OK',
      moisture: i.moisture,
      text: '아직 적정 범위지만 건조 기준에 가까워지고 있어요. 내일쯤 흙 상태를 확인해 주세요.',
      basis: join(now, range, change),
    };
  }
  if (i.wetThreshold - i.moisture <= NEAR_THRESHOLD) {
    return {
      tone: 'OK',
      moisture: i.moisture,
      text: '아직 적정 범위지만 과습 기준에 가까워요. 다음 물주기는 조금 미뤄 주세요.',
      basis: join(now, range, change),
    };
  }
  return {
    tone: 'OK',
    moisture: i.moisture,
    text: '수분 변화가 완만하게 이어지고 있어요. 지금의 물주기 간격을 유지해 주세요.',
    basis: join(now, range, change),
  };
}

/** potId 없이 요청하면 고를 화분 순서: 건조·과습 → 오프라인 → 적정 */
export const TONE_PRIORITY: Record<AdviceTone, number> = { DRY: 0, WET: 0, OFFLINE: 1, OK: 2 };
