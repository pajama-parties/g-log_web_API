import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { Plant } from '../database/schema/entities/service/plant.entity.js';
import { judgeMoisture } from './judge.js';
import type { RangeInput } from './pot-range.schemas.js';

@Injectable()
export class PotRangeService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * 경보 기준 저장. 현재 수분값이 있으면 새 기준으로 상태(적정·건조·과습)를 바로 다시 판정.
   * 이미 저장된 측정값의 판정은 그때 기준 그대로 둠 (기록)
   */
  async save(userId: number, potId: number, range: RangeInput): Promise<RangeInput> {
    return this.db.transaction(async (em) => {
      const plant = await em.findOne(Plant, { where: { id: potId, userId }, lock: { mode: 'pessimistic_write' } });
      if (!plant) throw new NotFoundException({ code: 'POT_NOT_FOUND', message: '화분을 찾을 수 없습니다.' });

      await em.update(Plant, { id: plant.id }, {
        dryThreshold: range.lower,
        wetThreshold: range.upper,
        ...(plant.lastMoisture !== null ? { lastStatus: judgeMoisture(plant.lastMoisture, range.lower, range.upper) } : {}),
      });
      return { lower: range.lower, upper: range.upper };
    });
  }
}
