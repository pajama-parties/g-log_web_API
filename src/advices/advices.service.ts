import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, In, Not, IsNull } from 'typeorm';
import { Advice } from '../database/schema/entities/service/advice.entity.js';
import { Device } from '../database/schema/entities/service/device.entity.js';
import { Plant } from '../database/schema/entities/service/plant.entity.js';
import { SensorReading } from '../database/schema/entities/service/sensor-reading.entity.js';
import { ruleBasedAdvice, TONE_PRIORITY, type AdviceDraft } from './advice-rules.js';
import { ADVICE_TONE_LABELS, type AdviceResponse, type CreateAdviceInput } from './advices.schemas.js';

/** 조언 기록에 보여 줄 최대 개수 (최신순) */
export const ADVICE_LIST_LIMIT = 100;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
/** 6시간 변화량을 계산하려면 최소 이만큼 전 값이 있어야 함 */
const MIN_CHANGE_SPAN_MS = 3 * 60 * 60 * 1000;

type MeasuredPlant = Plant & { lastMoisture: number; lastMeasuredAt: Date };

function toResponse(a: Advice, potName: string): AdviceResponse {
  return {
    id: a.id,
    pot: potName,
    potId: a.plantId,
    tone: ADVICE_TONE_LABELS[a.tone],
    value: a.moisture,
    text: a.content,
    basis: a.basis,
    at: a.createdAt.toISOString(),
    helpful: a.helpful,
  };
}

@Injectable()
export class AdvicesService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** 내 조언 최신순. 화분을 삭제했어도 이름을 그대로 보여 줌 */
  async list(userId: number): Promise<AdviceResponse[]> {
    const advices = await this.db.getRepository(Advice).find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: ADVICE_LIST_LIMIT,
    });
    if (advices.length === 0) return [];
    const plants = await this.db.getRepository(Plant).find({
      select: { id: true, name: true },
      where: { id: In([...new Set(advices.map((a) => a.plantId))]) },
      withDeleted: true,
    });
    const names = new Map(plants.map((p) => [p.id, p.name]));
    return advices.map((a) => toResponse(a, names.get(a.plantId) ?? ''));
  }

  /**
   * 최근 측정값으로 새 조언 생성.
   * TODO(LLM 연동): 문장(text)만 LLM으로 만들고, 실패하면 지금의 규칙 기반 문장을 그대로 저장. basis는 계속 서버가 작성
   */
  async create(userId: number, input: CreateAdviceInput): Promise<AdviceResponse> {
    const now = new Date();
    const candidates = await this.measuredPlants(userId, input.potId ?? null);
    const devices = await this.db.getRepository(Device).find({ where: { plantId: In(candidates.map((p) => p.id)) } });
    const lastSeen = new Map(devices.map((d) => [d.plantId, d.lastSeenAt]));

    // 화분마다 초안을 만들고 가장 급한 화분을 고름 (같으면 최근에 측정한 화분)
    const drafts = await Promise.all(
      candidates.map(async (plant) => ({ plant, draft: await this.draftFor(plant, lastSeen.get(plant.id) ?? null, now) })),
    );
    drafts.sort(
      (a, b) =>
        TONE_PRIORITY[a.draft.tone] - TONE_PRIORITY[b.draft.tone] || b.plant.lastMeasuredAt.getTime() - a.plant.lastMeasuredAt.getTime(),
    );
    const { plant, draft } = drafts[0];

    const saved = await this.db.getRepository(Advice).save(
      this.db.getRepository(Advice).create({
        userId,
        plantId: plant.id,
        tone: draft.tone,
        moisture: draft.moisture,
        content: draft.text,
        basis: draft.basis,
      }),
    );
    const reloaded = await this.db.getRepository(Advice).findOneByOrFail({ id: saved.id });
    return toResponse(reloaded, plant.name);
  }

  /** 평가 저장. null이면 평가 취소 */
  async feedback(userId: number, adviceId: number, helpful: boolean | null): Promise<void> {
    const result = await this.db
      .getRepository(Advice)
      .update({ id: adviceId, userId }, { helpful, feedbackAt: helpful === null ? null : new Date() });
    if (!result.affected) throw new NotFoundException({ code: 'ADVICE_NOT_FOUND', message: '조언을 찾을 수 없습니다.' });
  }

  /** 조언을 만들 수 있는(측정값이 있는) 내 화분. potId를 주면 그 화분만 */
  private async measuredPlants(userId: number, potId: number | null): Promise<MeasuredPlant[]> {
    if (potId !== null) {
      const plant = await this.db.getRepository(Plant).findOne({ where: { id: potId, userId } });
      if (!plant) throw new NotFoundException({ code: 'POT_NOT_FOUND', message: '화분을 찾을 수 없습니다.' });
      if (plant.lastMoisture === null || plant.lastMeasuredAt === null) {
        throw new ConflictException({ code: 'NO_MEASUREMENT', message: '아직 측정값이 없어 조언을 만들 수 없어요. 센서를 연결하고 첫 측정값을 기다려 주세요.' });
      }
      return [plant as MeasuredPlant];
    }
    const plants = await this.db.getRepository(Plant).find({
      where: { userId, lastMoisture: Not(IsNull()), lastMeasuredAt: Not(IsNull()) },
    });
    if (plants.length === 0) {
      throw new ConflictException({ code: 'NO_MEASUREMENT', message: '측정값이 있는 화분이 없어 조언을 만들 수 없어요. 센서를 연결하고 첫 측정값을 기다려 주세요.' });
    }
    return plants as MeasuredPlant[];
  }

  private async draftFor(plant: MeasuredPlant, lastSeenAt: Date | null, now: Date): Promise<AdviceDraft> {
    // 마지막 측정 시점 기준 6시간 안의 가장 오래된 값과 비교
    const oldest = await this.db.getRepository(SensorReading).findOne({
      select: { moisturePercent: true, measuredAt: true },
      where: { plantId: plant.id, measuredAt: Between(new Date(plant.lastMeasuredAt.getTime() - SIX_HOURS_MS), plant.lastMeasuredAt) },
      order: { measuredAt: 'ASC' },
    });
    const change6h =
      oldest && plant.lastMeasuredAt.getTime() - oldest.measuredAt.getTime() >= MIN_CHANGE_SPAN_MS
        ? plant.lastMoisture - oldest.moisturePercent
        : null;
    return ruleBasedAdvice({
      moisture: plant.lastMoisture,
      measuredAt: plant.lastMeasuredAt,
      lastSeenAt,
      dryThreshold: plant.dryThreshold,
      wetThreshold: plant.wetThreshold,
      change6h,
      now,
    });
  }
}
