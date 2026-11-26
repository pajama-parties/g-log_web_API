import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { NoticesModule } from './notices/notices.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // API/.env
    DatabaseModule, // auth_db + service_db
    AuthModule, // 전역 로그인 가드
    // 기능 모듈 (feature/* 브랜치에서 추가)
    NoticesModule, // /api/notices
    // 트레이스·로그·오류 수집. `npx @nestjs/observe link` 로 .env에 키를 넣으면 켜짐
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'web-api',
    }),
  ],
})
export class AppModule {}
