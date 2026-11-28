import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from '../database/schema/entities/index.js';
import { required, type EnvGetter } from './env.js';

/**
 * PostgreSQL DB 하나에 스키마 두 개 (backend와 같은 DB).
 * - auth: 로그인한 사용자가 아직 활동 중인지 확인, 센서 토큰 저장·확인
 * - service: 화분·센서·알림·조언·커뮤니티
 * 한 연결이라 두 스키마의 변경을 트랜잭션 하나로 묶을 수 있음
 */
export function dbOptions(get: EnvGetter): DataSourceOptions {
  return {
    type: 'postgres',
    host: required(get, 'DB_HOST'),
    port: Number(required(get, 'DB_PORT')),
    username: required(get, 'DB_USER'),
    password: required(get, 'DB_PASSWORD'),
    database: required(get, 'DB_NAME'),
    // BIGINT id를 number로 받음 (기본은 문자열)
    parseInt8: true,
    entities: ENTITIES,
    // 테이블은 backend 레포의 마이그레이션으로만 바꿈. 이 서버는 만들거나 고치지 않음
    synchronize: false,
    migrationsRun: false,
    logging: get('DB_LOGGING') === 'true',
  };
}
