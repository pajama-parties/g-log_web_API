import { ConflictException, GoneException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { DeviceCredential } from '../database/schema/entities/auth/device-credential.entity.js';
import { DevicePairingCode } from '../database/schema/entities/service/device-pairing-code.entity.js';
import { Device } from '../database/schema/entities/service/device.entity.js';
import { Plant } from '../database/schema/entities/service/plant.entity.js';
import { SensorReading } from '../database/schema/entities/service/sensor-reading.entity.js';
import { judgeMoisture, toWholeSecond } from './moisture.js';
import { bearerToken, generateSensorToken, hashSensorToken } from './sensor-token.js';
import type {
  RegisterSensorInput,
  RegisterSensorResponse,
  SensorReadingsInput,
  SensorReadingsResponse,
} from './sensors.schemas.js';

/** 기획서: 한 시간마다 측정값 전송 */
export const DEFAULT_REPORT_INTERVAL_SEC = 3600;
/** 센서 시계가 조금 빠를 수 있으니 이만큼 미래까지는 받음 */
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
/** 보관했다 보내는 값도 이보다 오래되면 버림 */
const MAX_BACKFILL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SensorsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * 센서 등록: 등록 코드로 화분과 연결하고 센서 토큰 발급.
   * - 같은 사용자의 센서를 다시 등록하면 새 화분으로 옮기고 토큰을 새로 발급(이전 토큰은 무효)
   * - 그 화분에 다른 센서가 붙어 있었으면 그 센서는 연결 해제
   */
  async register(input: RegisterSensorInput): Promise<RegisterSensorResponse> {
    const token = generateSensorToken();
    const now = new Date();

    return this.db.transaction(async (em) => {
      // 같은 코드를 동시에 쓰는 요청이 있으면 하나만 통과
      const pairing = await em.findOne(DevicePairingCode, {
        where: { code: input.code },
        order: { id: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pairing) {
        throw new NotFoundException({ code: 'PAIRING_CODE_NOT_FOUND', message: '등록 코드를 찾을 수 없습니다. 코드를 다시 확인해 주세요.' });
      }
      if (pairing.usedAt || pairing.expiresAt.getTime() <= now.getTime()) {
        throw new GoneException({ code: 'PAIRING_CODE_EXPIRED', message: '등록 코드가 만료되었거나 이미 사용되었습니다. 앱에서 코드를 다시 받아 주세요.' });
      }
      const plant = await em.findOne(Plant, { where: { id: pairing.plantId, userId: pairing.userId } });
      if (!plant) {
        throw new GoneException({ code: 'PAIRING_CODE_EXPIRED', message: '코드를 받은 화분이 삭제되었습니다.' });
      }

      let device = await em.findOne(Device, { where: { serialNumber: input.sensorId }, lock: { mode: 'pessimistic_write' } });
      if (device && device.userId !== null && device.userId !== pairing.userId) {
        throw new ConflictException({ code: 'SENSOR_IN_USE', message: '다른 사용자가 쓰고 있는 센서입니다. 이전 사용자가 화분을 삭제해야 등록할 수 있습니다.' });
      }

      // 화분 1 : 센서 1 (devices.plant_id UNIQUE) → 이 화분의 기존 센서부터 떼어 냄
      await em.update(Device, device ? { plantId: plant.id, id: Not(device.id) } : { plantId: plant.id }, { plantId: null });

      device ??= em.create(Device, { serialNumber: input.sensorId, reportIntervalSec: DEFAULT_REPORT_INTERVAL_SEC });
      device.userId = pairing.userId;
      device.plantId = plant.id;
      device.registeredAt = now;
      if (input.firmwareVersion) device.firmwareVersion = input.firmwareVersion;
      device = await em.save(device);

      pairing.usedAt = now;
      pairing.deviceId = device.id;
      await em.save(pairing);

      // 센서 토큰(auth 스키마)도 같은 트랜잭션: 하나라도 실패하면 등록 전체를 되돌림
      await em
        .getRepository(DeviceCredential)
        .upsert({ deviceId: device.id, apiKeyHash: hashSensorToken(token), issuedAt: now, revokedAt: null }, ['deviceId']);

      return { token, sensorId: device.serialNumber, potId: plant.id, reportIntervalSec: device.reportIntervalSec };
    });
  }

  /** Authorization: Bearer {센서 토큰} → 센서 id. 없거나 폐기된 토큰이면 401 */
  async authenticate(authorization: string | undefined): Promise<number> {
    const token = bearerToken(authorization);
    const credential = token
      ? await this.db.getRepository(DeviceCredential).findOne({ where: { apiKeyHash: hashSensorToken(token), revokedAt: IsNull() } })
      : null;
    if (!credential) {
      throw new UnauthorizedException({ code: 'INVALID_SENSOR_TOKEN', message: '센서 토큰이 없거나 올바르지 않습니다. 센서를 다시 등록해 주세요.' });
    }
    return credential.deviceId;
  }

  /**
   * 측정값 저장.
   * - 연결된 화분의 경보 기준으로 OK/DRY/WET 판정해서 함께 저장
   * - 이미 받은 시각(재전송)이나 너무 미래·과거 값은 건너뜀 → 센서는 같은 값을 다시 보내도 안전
   * - 화분의 현재 수분·상태 캐시와 센서의 마지막 수신 시각을 갱신
   * TODO(2차 작업): 기준을 벗어나면 알림 생성 + 카카오톡 메시지
   */
  async ingest(deviceId: number, readings: SensorReadingsInput): Promise<SensorReadingsResponse> {
    const now = new Date();
    return this.db.transaction(async (em) => {
      const device = await em.findOne(Device, { where: { id: deviceId } });
      const plant = device?.plantId ? await em.findOne(Plant, { where: { id: device.plantId } }) : null;
      if (!device || !plant) {
        throw new ConflictException({ code: 'SENSOR_NOT_CONNECTED', message: '화분에 연결되지 않은 센서입니다. 센서를 다시 등록해 주세요.' });
      }

      // 시각 범위 확인 + 같은 요청 안의 중복 제거 (초 단위)
      const byTime = new Map<number, SensorReadingsInput[number]>();
      for (const r of readings) {
        const at = toWholeSecond(r.at).getTime();
        if (at > now.getTime() + MAX_CLOCK_SKEW_MS || at < now.getTime() - MAX_BACKFILL_MS) continue;
        byTime.set(at, r);
      }
      // 이미 저장된 시각 제외 (전송 실패 후 재전송)
      if (byTime.size > 0) {
        const existing = await em.find(SensorReading, {
          select: { measuredAt: true },
          where: { deviceId, measuredAt: In([...byTime.keys()].map((t) => new Date(t))) },
        });
        for (const e of existing) byTime.delete(e.measuredAt.getTime());
      }

      const rows = [...byTime.entries()]
        .sort(([a], [b]) => a - b)
        .map(([at, r]) => {
          const moisture = Math.round(r.moisture);
          return {
            deviceId,
            plantId: plant.id,
            moisturePercent: moisture,
            status: judgeMoisture(moisture, plant.dryThreshold, plant.wetThreshold),
            batteryLevel: r.battery ?? null,
            measuredAt: new Date(at),
          };
        });
      if (rows.length > 0) await em.insert(SensorReading, rows);

      // 센서: 값이 왔으면(버린 값뿐이어도) 살아 있는 것
      const latestBattery = [...rows].reverse().find((r) => r.batteryLevel !== null)?.batteryLevel;
      await em.update(Device, { id: deviceId }, { lastSeenAt: now, ...(latestBattery != null ? { batteryLevel: latestBattery } : {}) });

      // 화분 캐시: 지금 가진 값보다 새로운 측정값일 때만
      const latest = rows.at(-1);
      if (latest && (!plant.lastMeasuredAt || latest.measuredAt > plant.lastMeasuredAt)) {
        await em.update(Plant, { id: plant.id }, {
          lastMoisture: latest.moisturePercent,
          lastStatus: latest.status,
          lastMeasuredAt: latest.measuredAt,
        });
      }

      return { saved: rows.length, skipped: readings.length - rows.length, reportIntervalSec: device.reportIntervalSec };
    });
  }
}
