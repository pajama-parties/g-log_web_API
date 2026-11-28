import { createHash, randomBytes } from 'node:crypto';

/** 센서 토큰 앞에 붙는 표시 (로그·설정에서 사용자 토큰과 구분) */
const PREFIX = 'glsk_';

/** 센서 등록 때 한 번만 내려주는 토큰. 원본은 센서만 갖고, 서버에는 해시만 저장 */
export function generateSensorToken(): string {
  return PREFIX + randomBytes(32).toString('base64url');
}

/** auth.device_credentials.api_key_hash (SHA-256 hex, 64자) */
export function hashSensorToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 'Bearer xxx' → 'xxx'. 형식이 다르면 null */
export function bearerToken(header: string | undefined): string | null {
  const match = header ? /^Bearer\s+(\S+)$/i.exec(header.trim()) : null;
  return match ? match[1] : null;
}
