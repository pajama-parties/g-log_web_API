import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AUTH_CONNECTION } from '../config/database.config.js';
import { User } from '../database/schema/entities/auth/user.entity.js';

@Injectable()
export class UsersService {
  constructor(@InjectDataSource(AUTH_CONNECTION) private readonly authDb: DataSource) {}

  /** 정지·탈퇴한 계정은 null → 토큰이 아직 유효해도 401 */
  findActiveUser(id: number): Promise<User | null> {
    if (!Number.isSafeInteger(id)) return Promise.resolve(null);
    return this.authDb.getRepository(User).findOne({ where: { id, status: 'ACTIVE' } });
  }
}
