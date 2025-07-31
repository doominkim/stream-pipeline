# WS Ingestor Monorepo

WebSocket 기반 MSA(Microservice Architecture) 인제스터 모노레포입니다.

## 프로젝트 구조

```
ws-ingestor/
├── apps/
│   ├── ws-chat-ingestor/     # 채팅 메시지 인제스터 서비스
│   └── ws-audio-ingestor/    # 오디오 메시지 인제스터 서비스
├── packages/
│   ├── common/               # 공통 타입 및 인터페이스
│   └── util/                 # 유틸리티 함수들
├── package.json
└── README.md
```

## 서비스 설명

### ws-chat-ingestor

- 포트: 3001
- 기능: 채팅 메시지 수신 및 브로드캐스팅
- WebSocket 연결 관리
- 실시간 채팅 메시지 처리

### ws-audio-ingestor

- 포트: 3002
- 기능: 오디오 메시지 수신 및 브로드캐스팅
- WebSocket 연결 관리
- 실시간 오디오 스트림 처리

## 패키지 설명

### @ws-ingestor/common

- 공통 타입 정의 (WebSocketMessage, ChatMessage, AudioMessage 등)
- 상수 정의 (MESSAGE_TYPES, DEFAULT_PORTS)
- 인터페이스 정의

### @ws-ingestor/util

- 로깅 유틸리티 (Winston 기반)
- 메시지 검증 및 파싱 함수
- 세션 ID 생성
- 헬스체크 유틸리티

## 설치 및 실행

### 의존성 설치

```bash
pnpm install
```

### 개발 모드 실행

```bash
# 모든 서비스 실행
pnpm dev

# 개별 서비스 실행
pnpm --filter @ws-ingestor/chat-ingestor dev
pnpm --filter @ws-ingestor/audio-ingestor dev
```

### 빌드

```bash
# 모든 패키지 빌드
pnpm build

# 개별 패키지 빌드
pnpm --filter @ws-ingestor/chat-ingestor build
pnpm --filter @ws-ingestor/audio-ingestor build
```

### 프로덕션 실행

```bash
# 빌드 후 실행
pnpm build
pnpm --filter @ws-ingestor/chat-ingestor start
pnpm --filter @ws-ingestor/audio-ingestor start
```

## API 엔드포인트

### 헬스체크

- `GET /health` - 서비스 상태 확인

### WebSocket 연결

- `ws://localhost:3001` - 채팅 인제스터
- `ws://localhost:3002` - 오디오 인제스터

## 메시지 형식

### 채팅 메시지

```json
{
  "type": "chat",
  "payload": {
    "message": "안녕하세요!",
    "userId": "user123",
    "roomId": "room456"
  },
  "timestamp": 1640995200000
}
```

### 오디오 메시지

```json
{
  "type": "audio",
  "payload": {
    "audioData": "<base64-encoded-audio>",
    "userId": "user123",
    "roomId": "room456",
    "format": "wav"
  },
  "timestamp": 1640995200000
}
```

## 개발 가이드

### 새 서비스 추가

1. `apps/` 디렉토리에 새 서비스 폴더 생성
2. `package.json` 설정 (workspace 의존성 포함)
3. `tsconfig.json` 설정
4. 소스 코드 작성

### 새 패키지 추가

1. `packages/` 디렉토리에 새 패키지 폴더 생성
2. `package.json` 설정
3. `tsconfig.json` 설정
4. 공통 코드 작성

## 기술 스택

- **언어**: TypeScript
- **패키지 매니저**: pnpm
- **WebSocket**: ws
- **HTTP 서버**: Express
- **로깅**: Winston
- **검증**: Zod
- **모노레포**: pnpm workspaces
