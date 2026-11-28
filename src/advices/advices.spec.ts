import { ruleBasedAdvice, type AdviceInput } from './advice-rules.js';
import { createAdviceSchema, feedbackSchema } from './advices.schemas.js';

const NOW = new Date('2026-11-25T09:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);

function input(overrides: Partial<AdviceInput> = {}): AdviceInput {
  return {
    moisture: 66,
    measuredAt: minutesAgo(10),
    lastSeenAt: minutesAgo(10),
    dryThreshold: 35,
    wetThreshold: 80,
    change6h: -2,
    now: NOW,
    ...overrides,
  };
}

describe('ruleBasedAdvice', () => {
  it('건조: 빠르게 마르면 오늘 확인하라고, 근거에 기준·변화량', () => {
    const a = ruleBasedAdvice(input({ moisture: 22, change6h: -6 }));
    expect(a.tone).toBe('DRY');
    expect(a.moisture).toBe(22);
    expect(a.text).toContain('빠르게 마르고');
    expect(a.basis).toBe('받은 시점 수분 22% · 건조 기준 35% · 최근 6시간 동안 6%p 하락');
  });

  it('과습: 근거에 과습 기준', () => {
    const a = ruleBasedAdvice(input({ moisture: 94, change6h: 1 }));
    expect(a.tone).toBe('WET');
    expect(a.basis).toBe('받은 시점 수분 94% · 과습 기준 80% · 최근 6시간 동안 1%p 상승');
  });

  it('적정: 범위 안이면 지금 간격 유지', () => {
    const a = ruleBasedAdvice(input({ change6h: 0.4 }));
    expect(a.tone).toBe('OK');
    expect(a.text).toContain('유지');
    expect(a.basis).toBe('받은 시점 수분 66% · 적정 범위 35–80% 안 · 최근 6시간 동안 변화 없음');
  });

  it('적정이지만 건조 기준에 가까우면 미리 알림', () => {
    expect(ruleBasedAdvice(input({ moisture: 38 })).text).toContain('건조 기준에 가까워지고');
  });

  it('기준이 기본값(0~100)이면 기준부터 정하라고', () => {
    const a = ruleBasedAdvice(input({ moisture: 5, dryThreshold: 0, wetThreshold: 100 }));
    expect(a.tone).toBe('OK');
    expect(a.text).toContain('경보 기준을 정하지 않았어요');
    expect(a.basis).toContain('경보 기준 미설정');
  });

  it('2시간 넘게 값이 없거나 센서가 없으면 오프라인 (수분은 null)', () => {
    const a = ruleBasedAdvice(input({ moisture: 47, lastSeenAt: minutesAgo(3 * 60 + 5) }));
    expect(a).toMatchObject({ tone: 'OFFLINE', moisture: null, basis: '마지막 수신 3시간 전 · 마지막 값 47%' });
    expect(ruleBasedAdvice(input({ lastSeenAt: null })).tone).toBe('OFFLINE');
  });

  it('변화량을 모르면 근거에서 뺌', () => {
    expect(ruleBasedAdvice(input({ moisture: 22, change6h: null })).basis).toBe('받은 시점 수분 22% · 건조 기준 35%');
  });
});

describe('조언 요청 검사', () => {
  it('potId는 생략·null 가능', () => {
    expect(createAdviceSchema.parse({})).toEqual({});
    expect(createAdviceSchema.parse({ potId: null })).toEqual({ potId: null });
    expect(createAdviceSchema.safeParse({ potId: 'a' }).success).toBe(false);
  });

  it('평가: helpful은 꼭 보내야 하고 true/false/null만', () => {
    expect(feedbackSchema.parse({ helpful: null })).toEqual({ helpful: null });
    expect(feedbackSchema.safeParse({}).success).toBe(false);
    expect(feedbackSchema.safeParse({ helpful: 'yes' }).success).toBe(false);
  });
});
