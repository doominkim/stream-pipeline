# ws-chat-ingestor

채팅 데이터 WebSocket 인제스터 서비스입니다.

## 주요 역할

- 채팅 메시지 실시간 수집 및 SQS로 적재
- 공통 유틸리티/타입 패키지와 연동

## 실행 방법

```bash
pnpm --filter @ws-ingestor/chat-ingestor dev
```

자세한 설정 및 환경 변수는 `env.example` 파일을 참고하세요.
