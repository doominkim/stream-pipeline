#!/bin/bash
set -e

echo "=== ws-chat-ingestor entrypoint.sh 시작 ==="

# 1. 시크릿 파일 경로 결정
if [ -f "/app/fyc-secrets.dev.json" ]; then
    SECRET_FILE="/app/fyc-secrets.dev.json"
    echo "개발 환경: $SECRET_FILE 사용"
elif [ -f "/mnt/secrets-store/fyc-secret-prod" ]; then
    SECRET_FILE="/mnt/secrets-store/fyc-secret-prod"
    echo "EKS 환경: $SECRET_FILE 사용"
else
    echo "ERROR: 시크릿 파일을 찾을 수 없습니다"
    echo "확인된 경로:"
    ls -la /app/ 2>/dev/null || echo "/app/ 없음"
    ls -la /mnt/secrets-store/ 2>/dev/null || echo "/mnt/secrets-store/ 없음"
    exit 1
fi

# 2. 시크릿 파일 내용 확인
echo "시크릿 파일 내용:"
cat "$SECRET_FILE"

# 3. 환경변수 설정
echo "환경변수 설정 중..."
while IFS='=' read -r key value; do
    # 빈 줄과 주석 제외
    if [[ -n "$key" && ! "$key" =~ ^# ]]; then
        export "$key"="$value"
        echo "설정됨: $key"
    fi
done < "$SECRET_FILE"

# 4. 필수 환경변수 확인
echo "필수 환경변수 확인:"
required_vars=("KINESIS_STREAM_NAME" "AWS_REGION" "REDIS_HOST" "DB_HOST")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "ERROR: 필수 환경변수 $var가 설정되지 않았습니다"
        exit 1
    else
        echo "✓ $var=${!var}"
    fi
done

# 5. 앱 실행
echo "=== ws-chat-ingestor 앱 시작 ==="
exec node dist/index.js
