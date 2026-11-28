import { judgeMoisture, toWholeSecond } from './moisture.js';
import { bearerToken, generateSensorToken, hashSensorToken } from './sensor-token.js';
import { registerSensorSchema, sensorReadingsSchema } from './sensors.schemas.js';

describe('judgeMoisture', () => {
  it('건조 기준보다 낮으면 DRY, 과습 기준보다 높으면 WET', () => {
    expect(judgeMoisture(22, 35, 80)).toBe('DRY');
    expect(judgeMoisture(94, 35, 80)).toBe('WET');
    expect(judgeMoisture(66, 35, 80)).toBe('OK');
  });

  it('기준값과 같으면 아직 적정', () => {
    expect(judgeMoisture(35, 35, 80)).toBe('OK');
    expect(judgeMoisture(80, 35, 80)).toBe('OK');
  });
});

describe('toWholeSecond', () => {
  it('소수 초를 버림 (재전송 중복을 초 단위로 비교)', () => {
    expect(toWholeSecond(new Date('2026-11-25T00:00:00.999Z')).toISOString()).toBe('2026-11-25T00:00:00.000Z');
  });
});

describe('센서 토큰', () => {
  it('매번 다르고, 해시는 64자 hex로 같은 토큰이면 같음', () => {
    const a = generateSensorToken();
    const b = generateSensorToken();
    expect(a).not.toBe(b);
    expect(a.startsWith('glsk_')).toBe(true);
    expect(hashSensorToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSensorToken(a)).toBe(hashSensorToken(a));
  });

  it('Authorization 헤더에서 Bearer 토큰만 꺼냄', () => {
    expect(bearerToken('Bearer glsk_abc')).toBe('glsk_abc');
    expect(bearerToken('bearer  glsk_abc ')).toBe('glsk_abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});

describe('센서 요청 검사', () => {
  it('등록 코드는 대문자로 맞춰 받음', () => {
    expect(registerSensorSchema.parse({ code: ' k7p-3qx ', sensorId: 'GL-0012' })).toEqual({ code: 'K7P-3QX', sensorId: 'GL-0012' });
    expect(registerSensorSchema.safeParse({ code: 'K7P3QX', sensorId: 'GL-0012' }).success).toBe(false);
  });

  it('측정값: 시각은 시간대 포함 ISO, 수분 0~100, 배터리는 생략 가능', () => {
    const [r] = sensorReadingsSchema.parse([{ at: '2026-11-25T09:00:00+09:00', moisture: 66.4 }]);
    expect(r.at.toISOString()).toBe('2026-11-25T00:00:00.000Z');
    expect(sensorReadingsSchema.safeParse([{ at: '2026-11-25 09:00', moisture: 66 }]).success).toBe(false);
    expect(sensorReadingsSchema.safeParse([{ at: '2026-11-25T09:00:00Z', moisture: 101 }]).success).toBe(false);
    expect(sensorReadingsSchema.safeParse([]).success).toBe(false);
  });
});
