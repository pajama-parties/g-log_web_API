import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUTH_CONNECTION, authDbOptions, serviceDbOptions } from '../config/database.config.js';

/**
 * DB 연결 두 개 (backend와 같은 MySQL)
 * - 'auth'    → auth_db    : @InjectDataSource(AUTH_CONNECTION)
 * - 'default' → service_db : @InjectDataSource()
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      name: AUTH_CONNECTION, // forRootAsync에서는 useFactory 바깥에도 name이 있어야 함
      inject: [ConfigService],
      useFactory: (config: ConfigService) => authDbOptions((key) => config.get<string>(key)),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => serviceDbOptions((key) => config.get<string>(key)),
    }),
  ],
})
export class DatabaseModule {}
