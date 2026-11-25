import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthenticationError,
  AuthenticationProvider,
  AuthenticationRegistry,
  JwtBearerProvider,
  JwtVerifier,
  type JwtClaims,
} from '@nestjs/authentication';
import { required } from '../config/env.js';
import type { User } from '../database/schema/entities/auth/user.entity.js';
import { ACCESS_COOKIE, readCookie } from './auth.constants.js';
import { UsersService } from './users.service.js';

/**
 * 1순위: access_token 쿠키 (브라우저. auth 서버에서 로그인하면 설정됨).
 * 만료·위조면 401 → 프런트는 auth 서버의 POST /api/auth/refresh 후 다시 요청.
 */
@Injectable()
export class JwtCookieAuth extends AuthenticationProvider<User, JwtClaims> {
  private readonly verifier: JwtVerifier;

  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    registry: AuthenticationRegistry,
  ) {
    super();
    // auth 서버가 서명할 때와 같은 키(HS256)로 검증
    this.verifier = new JwtVerifier({ key: required((k) => config.get<string>(k), 'JWT_ACCESS_SECRET') });
    registry.registerProvider(this, { order: 0 });
  }

  async authenticate(context: ExecutionContext) {
    const token = readCookie(this.header(context, 'cookie'), ACCESS_COOKIE);
    if (!token) return null; // 쿠키 없음 → 다음 방식(Bearer)으로

    let claims: JwtClaims;
    try {
      claims = await this.verifier.verify(token);
    } catch {
      throw new AuthenticationError('로그인이 만료되었습니다.', { code: 'invalid_token' });
    }
    // 매 요청마다 DB에서 사용자를 다시 읽음 → 정지·탈퇴가 바로 반영됨
    const user = claims.sub ? await this.users.findActiveUser(Number(claims.sub)) : null;
    if (!user) throw new AuthenticationError('로그인이 만료되었습니다.', { code: 'invalid_token' });
    return { user, session: claims };
  }
}

/** 2순위: Authorization: Bearer <access token> (Postman·스크립트용) */
@Injectable()
export class JwtHeaderAuth extends JwtBearerProvider<User> {
  constructor(
    private readonly users: UsersService,
    registry: AuthenticationRegistry,
  ) {
    super(); // 모듈의 accessToken 설정으로 검증
    registry.registerProvider(this, { order: 1 });
  }

  validate(claims: JwtClaims) {
    return claims.sub ? this.users.findActiveUser(Number(claims.sub)) : null;
  }
}
