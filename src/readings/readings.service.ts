import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual } from 'typeorm';
import { Plant } from '../database/schema/entities/service/plant.entity.js';
import { SensorReading } from '../database/schema/entities/service/sensor-reading.entity.js';
import { bucketStarts, toPoints, type Period, type Point } from './buckets.js';

@Injectable()
export class ReadingsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** 화분의 기간별 수분 그래프 값. 다른 사람 화분이거나 없으면 404 */
  async points(userId: number, potId: number, period: Period): Promise<Point[]> {
    const exists = await this.db.getRepository(Plant).exists({ where: { id: potId, userId } });
    if (!exists) throw new NotFoundException({ code: 'POT_NOT_FOUND', message: '화분을 찾을 수 없습니다.' });

    const now = new Date();
    const [from] = bucketStarts(period, now);
    const measurements = await this.db.getRepository(SensorReading).find({
      select: { measuredAt: true, moisturePercent: true },
      where: { plantId: potId, measuredAt: MoreThanOrEqual(from) },
      order: { measuredAt: 'ASC' },
    });
    return toPoints(period, now, measurements);
  }
}
