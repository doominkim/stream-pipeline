# ws-chat-persistor

SQS에서 채팅 데이터를 소비하여 후처리/적재하는 워커 서비스입니다.

## 주요 역할

- SQS 큐에서 채팅 메시지 수신
- 후처리(예: DB 적재, 로그 등)
- 공통 유틸리티/타입 패키지와 연동

## 실행 방법

```bash
pnpm --filter @ws-ingestor/chat-persistor dev
```

자세한 설정 및 환경 변수는 `env.example` 파일을 참고하세요.
