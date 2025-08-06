FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY ../../packages ./packages
COPY . .

RUN npm install -g pnpm@10.13.1
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ws-ingestor/chat-persistor... build

WORKDIR /app/apps/ws-chat-persistor
CMD ["node", "dist/index.js"]