import { judgeMoisture } from './judge.js';
import { rangeSchema } from './pot-range.schemas.js';

describe('rangeSchema', () => {
  it('0~100 정수, 건조 < 과습', () => {
    expect(rangeSchema.parse({ lower: 35, upper: 80 })).toEqual({ lower: 35, upper: 80 });
    expect(rangeSchema.parse({ lower: 0, upper: 100 })).toEqual({ lower: 0, upper: 100 });
  });

  it('범위 밖, 소수, 순서가 뒤집힌 값, 같은 값은 거부', () => {
    expect(rangeSchema.safeParse({ lower: -1, upper: 80 }).success).toBe(false);
    expect(rangeSchema.safeParse({ lower: 35, upper: 101 }).success).toBe(false);
    expect(rangeSchema.safeParse({ lower: 35.5, upper: 80 }).success).toBe(false);
    expect(rangeSchema.safeParse({ lower: 80, upper: 35 }).success).toBe(false);
    expect(rangeSchema.safeParse({ lower: 50, upper: 50 }).success).toBe(false);
  });

  it('둘 다 필요하고, 그 밖의 항목은 거부', () => {
    expect(rangeSchema.safeParse({ lower: 35 }).success).toBe(false);
    expect(rangeSchema.safeParse({ lower: 35, upper: 80, icon: 'x' }).success).toBe(false);
  });
});

describe('judgeMoisture', () => {
  it('기본 기준 0~100이면 어떤 값이든 적정 (경보 없음)', () => {
    for (const v of [0, 1, 50, 99, 100]) expect(judgeMoisture(v, 0, 100)).toBe('OK');
  });

  it('사용자 기준으로 건조·과습 판정', () => {
    expect(judgeMoisture(22, 35, 80)).toBe('DRY');
    expect(judgeMoisture(94, 35, 80)).toBe('WET');
    expect(judgeMoisture(35, 35, 80)).toBe('OK');
  });
});
