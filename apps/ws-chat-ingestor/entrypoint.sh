#!/usr/bin/env sh
set -euo pipefail

# 개발 환경 vs EKS 환경 구분
if [ -f "/app/fyc-secrets.dev.json" ]; then
  # 개발 테스트 환경: 로컬 JSON 파일 사용
  SECRET_PATH="/app/fyc-secrets.dev.json"
  echo "Using development secrets file: $SECRET_PATH"
else
  # EKS 환경: Secret Store CSI 마운트 경로 사용
  : "${SECRET_PATH:=/mnt/secrets-store/fyc-secret-prod}"
  echo "Using EKS secrets path: $SECRET_PATH"
fi

[ -f "$SECRET_PATH" ] || { echo "secret file not found: $SECRET_PATH" >&2; exit 1; }

# JSON → ENV: 키 정규화(대문자, 비허용문자→_, 선두 숫자 방지), 값은 @sh로 이스케이프
SANITIZE='def sanitize: ascii_upcase | gsub("[^A-Za-z0-9_]"; "_") | sub("^[^A-Za-z_]"; "_");
to_entries | map({orig:.key, key:(.key|sanitize), val:.value})'

EXPORT_LINES="$(jq -r "$SANITIZE | .[] | \"export \(.key)=\(.val|@sh)\" " "$SECRET_PATH")"
# shellcheck disable=SC2086
eval "$EXPORT_LINES"

# 키 매핑 로그(값은 출력 안 함)
jq -r "$SANITIZE | map(select(.orig != .key)) | .[] | \"[mapped] \\(.orig) -> \\(.key)\"" "$SECRET_PATH" >&2 || true


# 앱 실행
exec node dist/index.js
