import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThan, type EntityManager } from 'typeorm';
import { DevicePairingCode } from '../database/schema/entities/service/device-pairing-code.entity.js';
import { Device } from '../database/schema/entities/service/device.entity.js';
import { Plant } from '../database/schema/entities/service/plant.entity.js';
import { Watering } from '../database/schema/entities/service/watering.entity.js';
import { generatePairingCode, PAIRING_CODE_TTL_SEC } from './pairing-code.js';
import { toPotResponse } from './pot-view.js';
import type {
  ConnectionResponse,
  CreatePotInput,
  CreatePotResponse,
  PairingCodeResponse,
  PotResponse,
  UpdatePotInput,
} from './pots.schemas.js';

/** 물주기 계산에 쓰는 기록 기간 */
const WATERING_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

export function potNotFound() {
  return new NotFoundException({ code: 'POT_NOT_FOUND', message: '화분을 찾을 수 없습니다.' });
}

@Injectable()
export class PotsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** 내 화분 전체 (등록 순). 삭제한 화분은 빠짐 */
  async list(userId: number): Promise<PotResponse[]> {
    const plants = await this.db.getRepository(Plant).find({ where: { userId }, order: { id: 'ASC' } });
    return this.toResponses(this.db.manager, plants);
  }

  /** 내 화분 한 건. 다른 사람 화분이거나 없으면 404 (있는지 여부를 숨김) */
  async get(userId: number, potId: number): Promise<PotResponse> {
    const plant = await this.findOwned(this.db.manager, userId, potId);
    const [pot] = await this.toResponses(this.db.manager, [plant]);
    return pot;
  }

  /** 화분 추가 + 센서 등록 코드 발급 (10분 유효) */
  async create(userId: number, input: CreatePotInput): Promise<CreatePotResponse> {
    return this.db.transaction(async (em) => {
      const plant = await em.save(
        em.create(Plant, {
          userId,
          name: input.name,
          plantType: input.plantType ?? null,
          soil: input.soil ?? null,
          place: input.place ?? null,
        }),
      );
      const code = await this.issuePairingCode(em, userId, plant.id);
      // 기본값(기준·아이콘·생성일)은 DB가 채우므로 다시 읽음
      const saved = await em.findOneByOrFail(Plant, { id: plant.id });
      const [pot] = await this.toResponses(em, [saved]);
      return { pot, code, expiresIn: PAIRING_CODE_TTL_SEC };
    });
  }

  /** 이름·작물·흙·위치 수정. 보낸 항목만 바꿈 */
  async update(userId: number, potId: number, input: UpdatePotInput): Promise<PotResponse> {
    const plant = await this.findOwned(this.db.manager, userId, potId);
    const changes: Partial<Plant> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.plantType !== undefined) changes.plantType = input.plantType;
    if (input.soil !== undefined) changes.soil = input.soil;
    if (input.place !== undefined) changes.place = input.place;
    if (Object.keys(changes).length > 0) {
      await this.db.getRepository(Plant).update({ id: plant.id }, changes);
    }
    return this.get(userId, potId);
  }

  /**
   * 화분 삭제 (소프트 삭제) + 센서 연결 해제.
   * 측정값·물 준 기록은 남겨 둠(커뮤니티 글 그래프 등). 센서는 내 소유로 남아 다른 화분에 다시 연결할 수 있음.
   */
  async remove(userId: number, potId: number): Promise<void> {
    await this.db.transaction(async (em) => {
      const plant = await this.findOwned(em, userId, potId);
      await em.update(Device, { plantId: plant.id }, { plantId: null });
      await em.delete(DevicePairingCode, { plantId: plant.id, usedAt: IsNull() });
      await em.softDelete(Plant, { id: plant.id });
    });
  }

  /** 화분 추가 2단계: 센서가 연결됐는지 (앱이 주기적으로 확인) */
  async connection(userId: number, potId: number): Promise<ConnectionResponse> {
    const plant = await this.findOwned(this.db.manager, userId, potId);
    const device = await this.db.getRepository(Device).findOne({ where: { plantId: plant.id } });
    return { connected: device !== null, sensorId: device?.serialNumber ?? null };
  }

  /** 등록 코드 다시 받기 (10분이 지났거나 센서를 바꿀 때). 아직 안 쓴 이전 코드는 무효 */
  async reissuePairingCode(userId: number, potId: number): Promise<PairingCodeResponse> {
    return this.db.transaction(async (em) => {
      const plant = await this.findOwned(em, userId, potId);
      await em.delete(DevicePairingCode, { plantId: plant.id, usedAt: IsNull() });
      const code = await this.issuePairingCode(em, userId, plant.id);
      return { code, expiresIn: PAIRING_CODE_TTL_SEC };
    });
  }

  private async findOwned(em: EntityManager, userId: number, potId: number): Promise<Plant> {
    const plant = await em.findOne(Plant, { where: { id: potId, userId } });
    if (!plant) throw potNotFound();
    return plant;
  }

  /** 아직 유효한 코드와 겹치지 않게 발급 */
  private async issuePairingCode(em: EntityManager, userId: number, plantId: number): Promise<string> {
    const now = new Date();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generatePairingCode();
      const taken = await em.exists(DevicePairingCode, { where: { code, usedAt: IsNull(), expiresAt: MoreThan(now) } });
      if (taken) continue;
      await em.insert(DevicePairingCode, {
        plantId,
        userId,
        code,
        expiresAt: new Date(now.getTime() + PAIRING_CODE_TTL_SEC * 1000),
      });
      return code;
    }
    throw new Error('센서 등록 코드를 만들지 못했습니다. 다시 시도해 주세요.');
  }

  /** 화분 여러 개를 응답 형식으로. 센서·물 준 기록은 한 번에 읽음 */
  private async toResponses(em: EntityManager, plants: Plant[]): Promise<PotResponse[]> {
    if (plants.length === 0) return [];
    const ids = plants.map((p) => p.id);
    const now = new Date();
    const [devices, waterings] = await Promise.all([
      em.find(Device, { where: { plantId: In(ids) } }),
      em.find(Watering, {
        select: { plantId: true, wateredAt: true },
        where: { plantId: In(ids), wateredAt: MoreThan(new Date(now.getTime() - WATERING_LOOKBACK_MS)) },
        order: { wateredAt: 'DESC' },
      }),
    ]);

    const deviceByPlant = new Map(devices.map((d) => [d.plantId, d]));
    const wateredAtByPlant = new Map<number, Date[]>();
    for (const w of waterings) {
      const list = wateredAtByPlant.get(w.plantId) ?? [];
      list.push(w.wateredAt);
      wateredAtByPlant.set(w.plantId, list);
    }
    return plants.map((p) => toPotResponse(p, deviceByPlant.get(p.id), wateredAtByPlant.get(p.id) ?? [], now));
  }
}
