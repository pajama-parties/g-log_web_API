import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { User } from '../database/schema/entities/auth/user.entity.js';

@Injectable()
export class UsersService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** 정지·탈퇴한 계정은 null → 토큰이 아직 유효해도 401 */
  findActiveUser(id: number): Promise<User | null> {
    if (!Number.isSafeInteger(id)) return Promise.resolve(null);
    return this.db.getRepository(User).findOne({ where: { id, status: 'ACTIVE' } });
  }
}
