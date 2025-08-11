FROM node:20-alpine

WORKDIR /app

# aws-cli, jq, redis-cli 설치 (Secrets Manager 호출용, Redis 디버깅용)
RUN apk add --no-cache aws-cli jq redis

COPY package.json pnpm-lock.yaml ./
COPY ../../packages ./packages
COPY . .

RUN npm install -g pnpm@10.13.1
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ws-ingestor/chat-ingestor... build

WORKDIR /app/apps/ws-chat-ingestor

# entrypoint.sh 권한 설정 및 확인
RUN chmod +x entrypoint.sh && ls -la entrypoint.sh

# 환경변수는 Pod에서 주입 (SECRET_ID, REQUIRED_KEYS, AWS_REGION 등)
ENTRYPOINT ["./entrypoint.sh"]
