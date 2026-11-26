import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** multer(메모리 저장)가 넘겨주는 파일 중 쓰는 값만 */
export interface UploadedPhoto {
  buffer: Buffer;
  size: number;
}

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** 사진을 내려주는 주소. 운영에서 리버스 프록시가 /api만 서비스 API로 보내므로 /api 아래에 둠 */
export const UPLOADS_URL_PREFIX = '/api/uploads';

/** 업로드 폴더 (UPLOAD_DIR, 기본: 서버를 실행한 폴더의 uploads/) */
export function uploadRoot(get: (key: string) => string | undefined): string {
  return resolve(get('UPLOAD_DIR') || 'uploads');
}

/** 파일 앞부분으로 실제 형식 확인 (확장자·Content-Type은 믿지 않음) */
export function sniffImage(buf: Buffer): 'jpg' | 'png' | 'gif' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.subarray(0, 6).toString('latin1'))) return 'gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/** 서버 로컬 폴더에 사진 저장 (나중에 S3 등으로 바꾸려면 이 클래스만 교체) */
@Injectable()
export class PhotoStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = uploadRoot((k) => config.get<string>(k));
  }

  /** 저장하고 공개 주소를 돌려줌. 이미지가 아니면 400 */
  async save(folder: 'posts', photo: UploadedPhoto): Promise<string> {
    const ext = sniffImage(photo.buffer);
    if (!ext) {
      throw new BadRequestException({ code: 'INVALID_PHOTO', message: '사진은 jpg, png, gif, webp 파일만 올릴 수 있습니다.' });
    }
    const name = `${randomUUID()}.${ext}`;
    await mkdir(join(this.root, folder), { recursive: true });
    await writeFile(join(this.root, folder, name), photo.buffer);
    return `${UPLOADS_URL_PREFIX}/${folder}/${name}`;
  }

  /** 글 저장이 실패했을 때 올린 사진 정리 */
  async remove(url: string): Promise<void> {
    if (!url.startsWith(`${UPLOADS_URL_PREFIX}/`)) return;
    const relative = url.slice(UPLOADS_URL_PREFIX.length + 1);
    if (relative.includes('..')) return;
    await rm(join(this.root, relative), { force: true });
  }
}
