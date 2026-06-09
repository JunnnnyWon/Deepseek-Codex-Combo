#!/bin/zsh
set -euo pipefail

cd -- "$(dirname -- "$0")"

export DCC_SANDBOX_HOME="${DCC_SANDBOX_HOME:-$PWD/.dcc/sandbox-home}"
export DCC_PROXY_PORT="${DCC_PROXY_PORT:-41573}"
export DCC_AUTO_PROMPT="${DCC_AUTO_PROMPT:-}"
if [[ -z "${DCC_CODEX_PROFILE:-}" ]]; then
  if [[ -n "$DCC_AUTO_PROMPT" ]]; then
    export DCC_CODEX_PROFILE="deepseek-current"
  else
    export DCC_CODEX_PROFILE="deepseek-flash"
  fi
fi
export CODEX_HOME="$DCC_SANDBOX_HOME/.codex"
export DCC_STOP_PROXY_ON_EXIT="${DCC_STOP_PROXY_ON_EXIT:-1}"

mkdir -p "$DCC_SANDBOX_HOME" "$CODEX_HOME"

if [[ -z "${DEEPSEEK_API_KEY:-}" && -f "$PWD/.dcc/secrets/deepseek.env" ]]; then
  set -a
  source "$PWD/.dcc/secrets/deepseek.env"
  set +a
fi

if [[ -z "${DEEPSEEK_API_KEY:-}" ]] && command -v launchctl >/dev/null 2>&1; then
  launchctl_key="$(launchctl getenv DEEPSEEK_API_KEY || true)"
  if [[ -n "$launchctl_key" ]]; then
    export DEEPSEEK_API_KEY="$launchctl_key"
  fi
fi

if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  printf "DeepSeek API key: "
  stty -echo
  read -r DEEPSEEK_API_KEY
  stty echo
  printf "\n"
  if [[ -z "$DEEPSEEK_API_KEY" ]]; then
    echo "DEEPSEEK_API_KEY is required."
    exit 1
  fi
  export DEEPSEEK_API_KEY
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is not installed or not on PATH."
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex is not installed or not on PATH."
  exit 1
fi

echo "DCC sandbox home: $DCC_SANDBOX_HOME"
echo "DCC proxy port: $DCC_PROXY_PORT"
echo "DCC Codex profile: $DCC_CODEX_PROFILE"

proxy_should_stop=0
cleanup_proxy() {
  exit_code=$?
  trap - EXIT INT TERM
  if [[ "${DCC_STOP_PROXY_ON_EXIT:-1}" == "1" && "${proxy_should_stop:-0}" == "1" ]]; then
    node dist/bin/dcc.mjs proxy stop --home "$DCC_SANDBOX_HOME" --port "$DCC_PROXY_PORT" >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap cleanup_proxy EXIT INT TERM

pnpm install
pnpm build

node dist/bin/dcc.mjs install \
  --home "$DCC_SANDBOX_HOME" \
  --no-tui \
  --provider-mode=proxy \
  --proxy-port "$DCC_PROXY_PORT"

echo "Restarting DCC proxy to use the freshly built runtime."
node dist/bin/dcc.mjs proxy stop --home "$DCC_SANDBOX_HOME" --port "$DCC_PROXY_PORT" >/dev/null 2>&1 || true
node dist/bin/dcc.mjs proxy start \
  --home "$DCC_SANDBOX_HOME" \
  --port "$DCC_PROXY_PORT" \
  --background
proxy_should_stop=1

node dist/bin/dcc.mjs doctor --home "$DCC_SANDBOX_HOME" --strict

if [[ -n "$DCC_AUTO_PROMPT" && "$DCC_CODEX_PROFILE" == "deepseek-current" ]]; then
  node dist/bin/dcc.mjs switch auto --home "$DCC_SANDBOX_HOME" --prompt "$DCC_AUTO_PROMPT"
fi

dcc_initial_prompt="$DCC_AUTO_PROMPT"
if [[ -n "$DCC_AUTO_PROMPT" && "$DCC_CODEX_PROFILE" == "deepseek-current" ]]; then
  dcc_agent="$(awk -F'"' '/^dcc_agent = / { print $2; exit }' "$CODEX_HOME/profiles/deepseek-current.toml")"
  if [[ -n "$dcc_agent" ]]; then
    dcc_initial_prompt=$'DCC automatic agent route: delegate to '"$dcc_agent"$' first, then continue until the request is complete.\n\nUser request:\n'"$DCC_AUTO_PROMPT"
  fi
fi

HOME="$DCC_SANDBOX_HOME" CODEX_HOME="$CODEX_HOME" \
  codex --profile "$DCC_CODEX_PROFILE" debug prompt-input "Use dcc-plan" \
  | grep -q "deepseek-codex-combo:dcc-plan"

echo "DCC sandbox is ready."
echo "Inside Codex, call: deepseek-codex-combo:dcc-plan"

if [[ "${DCC_SANDBOX_SKIP_CODEX:-0}" == "1" ]]; then
  exit 0
fi

if [[ -n "$DCC_AUTO_PROMPT" ]]; then
  env HOME="$DCC_SANDBOX_HOME" CODEX_HOME="$CODEX_HOME" \
    codex --profile "$DCC_CODEX_PROFILE" "$dcc_initial_prompt"
else
  env HOME="$DCC_SANDBOX_HOME" CODEX_HOME="$CODEX_HOME" codex --profile "$DCC_CODEX_PROFILE"
fi
