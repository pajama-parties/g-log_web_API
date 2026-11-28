import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AdvicesModule } from './advices/advices.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CommunityModule } from './community/community.module.js';
import { DatabaseModule } from './database/database.module.js';
import { SensorsModule } from './sensors/sensors.module.js';
import { PotsModule } from './pots/pots.module.js';
import { ReadingsModule } from './readings/readings.module.js';
import { PotRangeModule } from './pot-range/pot-range.module.js';
import { NoticesModule } from './notices/notices.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // API/.env
    DatabaseModule, // PostgreSQL (auth, service 스키마)
    AuthModule, // 전역 로그인 가드
    // 기능 모듈 (feature/* 브랜치에서 추가)
    SensorsModule, // /api/sensors (센서 하드웨어용, 센서 토큰 인증)
    PotsModule, // /api/pots
    ReadingsModule, // /api/pots/{potId}/readings (그래프)
    PotRangeModule, // PUT /api/pots/{potId}/range (경보 기준)
    NoticesModule, // /api/notices
    AdvicesModule, // /api/advices
    CommunityModule, // /api/community/posts (+ 사진 /api/uploads/)
    // 트레이스·로그·오류 수집. `npx @nestjs/observe link` 로 .env에 키를 넣으면 켜짐
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'web-api',
    }),
  ],
})
export class AppModule {}
