# Stream-Pipeline

실시간 WebSocket 데이터 수집 및 처리를 위한 MSA(Microservice Architecture) 모노레포

## 🏗️ 아키텍처

### Monorepo 구조
```
stream-pipeline/
├── apps/                    # 마이크로서비스 애플리케이션
│   ├── ws-chat-ingestor/    # 채팅 데이터 수집 서비스
│   └── ws-media-ingestor/   # 미디어 스트림 수집 서비스
├── packages/                # 공통 라이브러리
│   ├── common/             # 공통 타입 및 상수
│   └── util/               # 유틸리티 함수 및 서비스
└── pnpm-workspace.yaml     # PNPM 워크스페이스 설정
```

## 🚀 기술 스택

### 핵심 기술
- **런타임**: Node.js + TypeScript 5.0
- **패키지 매니저**: PNPM (워크스페이스 지원)
- **웹 프레임워크**: Express.js
- **WebSocket**: ws 라이브러리

### 데이터 저장 & 스트리밍
- **데이터베이스**: PostgreSQL
- **캐싱**: Redis (IoRedis)
- **스트리밍**: AWS Kinesis
- **메시징**: AWS SQS

### 모니터링 & 로깅
- **로깅**: Winston (구조화된 JSON 로깅)
- **스케줄링**: node-cron
- **유효성 검사**: Zod

### 외부 서비스 통합
- **치지직**: chzzk-z 라이브러리를 통한 실시간 채팅 수집
- **미디어 스트리밍**: streamlink를 통한 실시간 스트림 캡처
- **클라우드**: AWS SDK (Kinesis, SQS)

## 📦 서비스 구성

### 1. WS Chat Ingestor (`apps/ws-chat-ingestor`)
실시간 채팅 메시지 수집 및 처리 서비스
- **포트**: 3010
- **기능**: 치지직 실시간 채팅 수집, 배치 처리, Kinesis 스트리밍
- **의존성**: PostgreSQL, Redis, AWS Kinesis

### 2. WS Media Ingestor (`apps/ws-media-ingestor`)
실시간 미디어 스트림 수집 및 처리 서비스
- **포트**: 3002
- **기능**: 스트림 캡처, 오디오/비디오 분리, 파일 관리
- **의존성**: streamlink, ffmpeg

### 3. Common Package (`packages/common`)
공통 타입 정의 및 상수 관리
- **타입**: Channel 인터페이스, 포트 설정
- **검증**: Zod 스키마

### 4. Util Package (`packages/util`)
공통 유틸리티 및 서비스
- **로깅**: Winston 설정
- **데이터베이스**: PostgreSQL 연결 관리
- **클라우드**: AWS 서비스 래퍼

## 🔧 주요 기능

### 실시간 데이터 수집
- WebSocket 기반 실시간 채팅 메시지 수집
- 실시간 스트림 캡처 및 미디어 파일 생성
- 멀티채널 동시 처리

### 데이터 처리 파이프라인
- 배치 처리를 통한 데이터베이스 최적화
- AWS Kinesis를 통한 실시간 스트리밍
- Redis 캐싱으로 성능 최적화

### 확장성 & 안정성
- MSA 아키텍처로 서비스 독립성 보장
- Graceful shutdown 지원
- Health check 엔드포인트 제공
- 에러 핸들링 및 재시도 로직

### 모니터링 & 운영
- 구조화된 로깅 (JSON 형태)
- Cron job을 통한 스케줄 작업
- 프로세스 관리 및 리소스 모니터링

## 🚦 실행 방법

### 개발 환경
```bash
# 전체 서비스 개발 모드
pnpm run dev

# 개별 서비스 실행
pnpm run dev:chat    # 채팅 인제스터
pnpm run dev:media   # 미디어 인제스터
```

### 빌드
```bash
# 전체 빌드
pnpm run build

# 개별 빌드
pnpm run build:chat
pnpm run build:media
```

## 📋 환경 설정
각 서비스별로 환경변수 설정 필요:
- 데이터베이스 연결 정보
- AWS 자격 증명
- Redis 연결 정보
- 외부 서비스 API 키

---

## 💼 프로젝트 개요 (이력서용)

**실시간 WebSocket 데이터 수집 MSA 시스템**
TypeScript/Node.js 기반의 모노레포 프로젝트로, 실시간 채팅 및 미디어 스트림을 수집·처리하는 마이크로서비스 아키텍처 구현. PNPM 워크스페이스를 활용한 효율적인 의존성 관리, PostgreSQL/Redis를 통한 데이터 계층 설계, AWS Kinesis/SQS를 활용한 실시간 스트리밍 파이프라인 구축. Winston 기반 구조화 로깅, Graceful shutdown, Health check 등 운영 환경 최적화 기능 포함.