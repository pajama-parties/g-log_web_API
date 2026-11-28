import { randomInt } from 'node:crypto';

/** 센서 등록 코드 유효 시간 (기획서: 10분) */
export const PAIRING_CODE_TTL_SEC = 600;

/** 헷갈리는 글자(0/O, 1/I/L) 제외 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function chunk(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** 'K7P-3QX' 형식 (device_pairing_codes.code CHAR(7)) */
export function generatePairingCode(): string {
  return `${chunk(3)}-${chunk(3)}`;
}
