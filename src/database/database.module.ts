import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dbOptions } from '../config/database.config.js';

/** PostgreSQL 연결 하나 (backend와 같은 DB, auth·service 스키마 모두): @InjectDataSource() */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => dbOptions((key) => config.get<string>(key)),
    }),
  ],
})
export class DatabaseModule {}
