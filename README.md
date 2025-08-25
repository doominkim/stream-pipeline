# ws-ingestor 모노레포

이 저장소는 다양한 WebSocket 기반 데이터 인제스터 및 관련 유틸리티를 통합 관리하는 모노레포입니다.

## 프로젝트 구조 및 역할

- **apps/ws-audio-ingestor**: 오디오 데이터 WebSocket 인제스터 서비스
- **apps/ws-chat-ingestor**: 채팅 데이터 WebSocket 인제스터 서비스 (SQS로 채팅 적재)
- **apps/ws-media-ingestor**: SQS에서 채팅 데이터를 소비하여 후처리/적재하는 워커 서비스
- **packages/common**: 공통 타입, 상수 등 도메인 모델 정의
- **packages/util**: 데이터베이스, SQS 등 공통 유틸리티 함수 및 클래스 제공

각 앱/패키지별 상세 사용법 및 엔드포인트 설명은 각 디렉토리의 README.md를 참고하세요.
