#!/bin/zsh
set -euo pipefail

PPT_PORT="${PPT_PORT_OVERRIDE:?PPT_PORT_OVERRIDE is required}"
PPT_URL="${PPT_URL_OVERRIDE:?PPT_URL_OVERRIDE is required}"
PPT_HEALTH_URL="${PPT_HEALTH_URL_OVERRIDE:?PPT_HEALTH_URL_OVERRIDE is required}"
PPT_SERVER_SCRIPT="${PPT_SERVER_SCRIPT_OVERRIDE:?PPT_SERVER_SCRIPT_OVERRIDE is required}"
PPT_EXPECTED_APP_VERSION="${PPT_EXPECTED_APP_VERSION_OVERRIDE:?PPT_EXPECTED_APP_VERSION_OVERRIDE is required}"
PPT_LOG="${PPT_LOG_OVERRIDE:?PPT_LOG_OVERRIDE is required}"
PPT_TIMEOUT_SECONDS="${PPT_TIMEOUT_SECONDS_OVERRIDE:-5}"
PPT_POLL_INTERVAL_SECONDS="${PPT_POLL_INTERVAL_SECONDS_OVERRIDE:-1}"
OPEN_CMD="${OPEN_CMD_OVERRIDE:-/usr/bin/true}"
PPT_SERVER_PID=""

say() {
  print -r -- "$*"
}

print_log_tail() {
  say "PPT 服务日志位置：${PPT_LOG}"
  say "以下是日志最后 80 行："
  /usr/bin/tail -n 80 "$PPT_LOG" 2>/dev/null || true
}

health_body() {
  /usr/bin/curl -fsS --connect-timeout 1 --max-time 2 "$PPT_HEALTH_URL" 2>/dev/null || true
}

ppt_healthy() {
  local body
  body="$(health_body)"
  [[ "$body" == *'"status":"ok"'* \
    && "$body" == *'"app_version":"'"$PPT_EXPECTED_APP_VERSION"'"'* \
    && "$body" == *'"pipeline":"result-first"'* \
    && "$body" == *'"response_contract_version":2'* ]]
}

print_health_mismatch() {
  local body actual_version actual_pipeline actual_contract
  body="$(health_body)"
  actual_version="$(print -r -- "$body" | /usr/bin/sed -nE 's/.*"app_version"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p')"
  actual_pipeline="$(print -r -- "$body" | /usr/bin/sed -nE 's/.*"pipeline"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p')"
  actual_contract="$(print -r -- "$body" | /usr/bin/sed -nE 's/.*"response_contract_version"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p')"
  [[ "$actual_version" == "$PPT_EXPECTED_APP_VERSION" ]] || say "PPT 运行时版本不匹配：期望 ${PPT_EXPECTED_APP_VERSION}，实际 ${actual_version:-缺失}。"
  [[ "$actual_pipeline" == "result-first" ]] || say "PPT pipeline 不匹配：期望 result-first，实际 ${actual_pipeline:-缺失}。"
  [[ "$actual_contract" == "2" ]] || say "PPT 响应契约不匹配：期望 2，实际 ${actual_contract:-缺失}。"
}

cleanup() {
  if [[ -n "$PPT_SERVER_PID" ]] && /bin/kill -0 "$PPT_SERVER_PID" 2>/dev/null; then
    /bin/kill -TERM "$PPT_SERVER_PID" 2>/dev/null || true
    wait "$PPT_SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

/bin/mkdir -p "${PPT_LOG:h}"
PORT="$PPT_PORT" node "$PPT_SERVER_SCRIPT" >> "$PPT_LOG" 2>&1 &
PPT_SERVER_PID="$!"

elapsed=0
while (( elapsed < PPT_TIMEOUT_SECONDS )); do
  if ppt_healthy; then
    "$OPEN_CMD" "$PPT_URL" >/dev/null 2>&1 || say "无法自动打开浏览器，请手动访问：${PPT_URL}"
    say "PPT 工具已自动打开：${PPT_URL}"
    exit 0
  fi
  if ! /bin/kill -0 "$PPT_SERVER_PID" 2>/dev/null; then
    if wait "$PPT_SERVER_PID"; then
      exit_status=0
    else
      exit_status=$?
    fi
    say "PPT 服务进程已提前退出，退出状态：${exit_status}。"
    print_log_tail
    exit 1
  fi
  /bin/sleep "$PPT_POLL_INTERVAL_SECONDS"
  elapsed=$((elapsed + PPT_POLL_INTERVAL_SECONDS))
done

say "PPT 服务等待 ${PPT_TIMEOUT_SECONDS} 秒后超时。"
print_health_mismatch
print_log_tail
exit 1
