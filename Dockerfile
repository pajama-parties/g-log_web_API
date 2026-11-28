# 서비스 API 이미지. 실행은 g-log_auth/docker-compose.yml 에서 함 (테이블은 auth 쪽 마이그레이션이 만듦)
# 빌드 전에 Entity 서브모듈이 받아져 있어야 함: git submodule update --init

# ── 빌드 ──
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN test -f src/database/schema/entities/index.ts || (echo 'Entity 서브모듈이 비어 있습니다. git submodule update --init 을 먼저 실행하세요.' && exit 1)
RUN npm run build

# ── 실행 ──
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
# 커뮤니티 사진 저장 폴더 (compose에서 볼륨을 붙임). node 사용자가 쓸 수 있게 미리 만듦
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
