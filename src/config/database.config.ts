import type { DataSourceOptions } from 'typeorm';
import { AUTH_ENTITIES } from '../database/schema/entities/auth/index.js';
import { SERVICE_ENTITIES } from '../database/schema/entities/service/index.js';
import { required, type EnvGetter } from './env.js';

/** 인증 DB 연결 이름. 서비스 DB는 기본 연결('default') */
export const AUTH_CONNECTION = 'auth';

function baseOptions(get: EnvGetter) {
  return {
    type: 'mysql' as const,
    host: required(get, 'DB_HOST'),
    port: Number(required(get, 'DB_PORT')),
    username: required(get, 'DB_USER'),
    password: required(get, 'DB_PASSWORD'),
    charset: 'utf8mb4_0900_ai_ci',
    timezone: 'Z', // DATETIME은 모두 UTC로 저장
    supportBigNumbers: true,
    bigNumberStrings: false, // BIGINT id를 number로 받음
    // 테이블은 backend 레포의 마이그레이션으로만 바꿈. 이 서버는 만들거나 고치지 않음
    synchronize: false,
    migrationsRun: false,
    logging: get('DB_LOGGING') === 'true',
  };
}

/** auth_db: 로그인한 사용자가 아직 활동 중인지 확인할 때만 읽음 */
export function authDbOptions(get: EnvGetter): DataSourceOptions {
  return { ...baseOptions(get), database: required(get, 'AUTH_DB_NAME'), entities: AUTH_ENTITIES };
}

export function serviceDbOptions(get: EnvGetter): DataSourceOptions {
  return { ...baseOptions(get), database: required(get, 'SERVICE_DB_NAME'), entities: SERVICE_ENTITIES };
}
