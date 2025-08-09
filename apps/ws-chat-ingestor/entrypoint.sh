#!/bin/sh
set -e

echo "=== ws-chat-ingestor entrypoint.sh 시작 ==="

# EKS 환경: Secret Store CSI 마운트 경로 사용
SECRET_FILE="/mnt/secrets-store/fyc-secret-prod"

# 시크릿 파일 존재 확인
if [ ! -f "$SECRET_FILE" ]; then
    echo "ERROR: 시크릿 파일을 찾을 수 없습니다: $SECRET_FILE"
    echo "확인된 경로:"
    ls -la /mnt/secrets-store/ 2>/dev/null || echo "/mnt/secrets-store/ 없음"
    exit 1
fi

# JSON 환경변수 설정
echo "JSON 파싱 시작..."
eval "$(jq -r 'to_entries[] | "export \(.key)=\(.value | @text)"' "$SECRET_FILE")"

# 앱 실행
echo "=== ws-chat-ingestor 앱 시작 ==="
exec node dist/index.js
