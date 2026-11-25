import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { required } from '../config/env.js';
import type { User } from '../database/schema/entities/auth/user.entity.js';
import { JwtCookieAuth, JwtHeaderAuth } from './jwt-auth.providers.js';
import { UsersService } from './users.service.js';

// @CurrentUser() 에서 쓰는 사용자 타입
declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: User;
  }
}

/**
 * 로그인은 auth 서버(backend)가 하고, 이 서버는 access 토큰을 검증만 함.
 * 전역 가드가 모든 API를 로그인 필요로 막고, 열어 둘 곳만 @Public().
 */
@Module({
  imports: [
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        accessToken: { key: required((k) => config.get<string>(k), 'JWT_ACCESS_SECRET') },
        refreshToken: false, // 토큰 발급·갱신은 auth 서버 담당
      }),
    }),
  ],
  providers: [UsersService, JwtCookieAuth, JwtHeaderAuth],
})
export class AuthModule {}
