import type { Device } from '../database/schema/entities/service/device.entity.js';
import type { Plant } from '../database/schema/entities/service/plant.entity.js';
import { generatePairingCode } from './pairing-code.js';
import { growingDays, potStatus, toPotResponse, wateringSummary } from './pot-view.js';
import { createPotSchema, updatePotSchema } from './pots.schemas.js';

const NOW = new Date('2026-11-25T09:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function plant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: 1,
    userId: 7,
    name: '거실 몬스테라',
    plantType: null,
    soil: null,
    place: null,
    dryThreshold: 35,
    wetThreshold: 80,
    icon: 'plant',
    color: '#304d42',
    photoUrl: null,
    lastMoisture: 66,
    lastStatus: 'OK',
    lastMeasuredAt: ago(18 * 60 * 1000),
    createdAt: ago(31 * DAY),
    deletedAt: null,
    ...overrides,
  } as Plant;
}

const device = (lastSeenAt: Date | null) => ({ serialNumber: 'GL-0012', lastSeenAt }) as Device;

describe('potStatus', () => {
  it('센서가 없으면 수집 대기', () => {
    expect(potStatus(plant(), undefined, NOW)).toBe('수집 대기');
  });

  it('센서는 있지만 측정값이 아직 없으면 수집 대기', () => {
    expect(potStatus(plant({ lastStatus: null, lastMeasuredAt: null }), device(null), NOW)).toBe('수집 대기');
  });

  it('최근 값이면 마지막 판정을 한글로', () => {
    expect(potStatus(plant({ lastStatus: 'DRY' }), device(ago(HOUR)), NOW)).toBe('건조');
    expect(potStatus(plant({ lastStatus: 'WET' }), device(ago(HOUR)), NOW)).toBe('과습');
    expect(potStatus(plant(), device(ago(HOUR)), NOW)).toBe('적정');
  });

  it('2시간 넘게 조용하면 오프라인 (딱 2시간은 아직 온라인)', () => {
    expect(potStatus(plant(), device(ago(2 * HOUR)), NOW)).toBe('적정');
    expect(potStatus(plant(), device(ago(2 * HOUR + 1)), NOW)).toBe('오프라인');
  });
});

describe('wateringSummary', () => {
  it('기록이 없으면 null', () => {
    expect(wateringSummary([])).toBeNull();
  });

  it('한 번뿐이면 간격·다음 예상은 null', () => {
    expect(wateringSummary([ago(5 * DAY)])).toEqual({ lastAt: ago(5 * DAY).toISOString(), intervalDays: null, nextAt: null });
  });

  it('평균 간격으로 다음 물 줄 날을 계산', () => {
    const result = wateringSummary([ago(5 * DAY), ago(13 * DAY), ago(21 * DAY)]);
    expect(result).toEqual({ lastAt: ago(5 * DAY).toISOString(), intervalDays: 8, nextAt: new Date(NOW.getTime() + 3 * DAY).toISOString() });
  });
});

describe('toPotResponse', () => {
  it('미지정 값과 기준을 화면 형식으로', () => {
    const pot = toPotResponse(plant(), undefined, [], NOW);
    expect(pot).toMatchObject({
      plantType: '작물 미지정',
      soil: '흙 미지정',
      sensorId: null,
      status: '수집 대기',
      range: [35, 80],
      watering: null,
      growingDays: 32,
      visual: { icon: 'plant', color: '#304d42', photo: null },
    });
  });

  it('growingDays: 등록한 날이 1일째', () => {
    expect(growingDays(NOW, NOW)).toBe(1);
  });
});

describe('화분 요청 검사', () => {
  it('이름은 앞뒤 공백을 지우고 비어 있으면 거부', () => {
    expect(createPotSchema.safeParse({ name: '  바질 ' }).data).toEqual({ name: '바질' });
    expect(createPotSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('작물·흙에 빈 문자열이나 null을 보내면 미지정(null)', () => {
    expect(updatePotSchema.parse({ plantType: '', soil: null })).toEqual({ plantType: null, soil: null });
  });

  it('정해지지 않은 항목은 거부 (기준·소유자를 이 API로 못 바꿈)', () => {
    expect(updatePotSchema.safeParse({ userId: 2 }).success).toBe(false);
    expect(createPotSchema.safeParse({ name: '바질', dryThreshold: 10 }).success).toBe(false);
  });
});

describe('generatePairingCode', () => {
  it('K7P-3QX 형식, 헷갈리는 글자 없음', () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePairingCode()).toMatch(/^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/);
    }
  });
});
