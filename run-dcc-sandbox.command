#!/bin/zsh
set -euo pipefail

cd -- "$(dirname -- "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is not installed or not on PATH."
  exit 1
fi

pnpm install
pnpm build

sandbox_args=()
if [[ "${DCC_SANDBOX_SKIP_CODEX:-0}" == "1" ]]; then
  sandbox_args+=(--skip-codex)
fi

node dist/bin/dcc.mjs sandbox run "${sandbox_args[@]}" "$@"
