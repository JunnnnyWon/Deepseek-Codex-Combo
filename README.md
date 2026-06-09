# DeepSeek-Codex-Combo

## What is DeepSeek-Codex-Combo?

DeepSeek-Codex-Combo (`dcc`) is a local Codex harness for using DeepSeek models through a Responses-compatible provider proxy, a reversible Codex installer, and a bundled Codex plugin. It ships CLI commands, skills, hooks, MCP server declarations, model routing, rules injection, LSP/AST/hashline helpers, and evidence-oriented orchestration commands.

## Inspiration

DeepSeek-Codex-Combo is inspired by the ideas and workflows explored in LazyCodex, OMO, and Reasonix. It adapts those influences into a DeepSeek-focused Codex harness with local installation, model routing, agent profiles, proxying, and evidence-driven verification.

## Why not just set the model?

Setting a model name does not handle the operational surface Codex needs:

- Responses-shaped request and stream translation for DeepSeek Chat Completions.
- User-level Codex config patching with managed blocks and reversible uninstall.
- Pro vs Flash model routing and profile switching.
- Plugin skills, hooks, agents, MCP config, rules injection, comment checking, LSP, AST-grep, and hashline tools.
- Evidence capture for `plan`, `start-work`, `loop`, and verifier workflows.

## Requirements

- Node.js 20 or newer.
- `pnpm` 10.33.0 for local development.
- Codex CLI installed for real Codex usage.
- `DEEPSEEK_API_KEY` only when you explicitly run live checks or the proxy against DeepSeek.

## Install

For local development:

```bash
pnpm install
pnpm build
node bin/dcc.mjs --help
```

For Docker-based user-install E2E testing:

```bash
pnpm test:docker:e2e
DEEPSEEK_API_KEY=sk-... pnpm test:docker:e2e:live
```

The default Docker run is mock-only and does not call DeepSeek. The live command is opt-in and may incur API cost. See `docs/docker-user-install-e2e.md` for the full scenario and evidence layout.

For a durable local release payload from this checkout:

```bash
pnpm build
node bin/dcc.mjs package --out .dcc/release-local
cd .dcc/release-local/files
node dist/bin/dcc.mjs --help
```

Command help is read-only. `install --help is safe` because it prints usage and does not write Codex config, plugin files, or backups:

```bash
node bin/dcc.mjs install --help
```

For sandbox-first Codex setup, use a temporary home so your normal Codex state is untouched:

```bash
export DCC_SANDBOX_HOME="$(mktemp -d)"
node bin/dcc.mjs install --home "$DCC_SANDBOX_HOME" --no-tui --provider-mode=proxy --proxy-port 41473
CODEX_HOME="$DCC_SANDBOX_HOME/.codex" HOME="$DCC_SANDBOX_HOME" codex --profile deepseek-proxy --help
CODEX_HOME="$DCC_SANDBOX_HOME/.codex" HOME="$DCC_SANDBOX_HOME" codex --profile deepseek-flash --help
node bin/dcc.mjs proxy start --background --home "$DCC_SANDBOX_HOME" --host 127.0.0.1 --port 41473
node bin/dcc.mjs proxy status --home "$DCC_SANDBOX_HOME" --port 41473
node bin/dcc.mjs proxy stop --home "$DCC_SANDBOX_HOME" --port 41473
node bin/dcc.mjs uninstall --home "$DCC_SANDBOX_HOME"
```

For user-level Codex setup from this checkout after the sandbox check:

```bash
node bin/dcc.mjs install --dry-run --provider-mode=proxy
node bin/dcc.mjs install --dry-run --provider-mode=plugin-only
node bin/dcc.mjs install --no-tui --provider-mode=proxy
```

For user-level setup from a local release payload, run `node dist/bin/dcc.mjs install --no-tui --provider-mode=proxy` from `.dcc/release-local/files`. `npx deepseek-codex-combo install` is the intended public-package command after the package is published; this repository does not require npm publication for local use.

## Set DEEPSEEK_API_KEY

Live DeepSeek checks are opt-in and require an environment variable. Keep the key in a local shell file instead of chat, tickets, docs, screenshots, or committed files:

```bash
secret_dir=".dcc/"'secrets'
secret_env="$secret_dir/deepseek.env"
mkdir -p "$secret_dir"
printf '%s\n' 'export DEEPSEEK_API_KEY="sk-..."' > "$secret_env"
chmod 600 "$secret_env"
source "$secret_env"
node bin/dcc.mjs doctor --live --strict
```

Without the key, `dcc doctor --live --strict` fails closed with `DEEPSEEK_API_KEY required for --live` and does not report live support as passing. A live strict doctor run intentionally calls DeepSeek for `/models` plus minimal proxy/chat checks, and when the proxy is running it also verifies that Responses output includes `cache_diagnostics`, so expect a small API charge.

If the key was exposed, rotate the key in DeepSeek, then remove local shell state:

```bash
unset DEEPSEEK_API_KEY
secret_env=".dcc/"'secrets/deepseek.env'
rm "$secret_env"
```

## Start proxy

Start the local proxy on loopback:

```bash
node bin/dcc.mjs proxy start --background --host 127.0.0.1 --port 41473
node bin/dcc.mjs proxy status --port 41473
curl -i http://127.0.0.1:41473/healthz
node bin/dcc.mjs proxy stop --port 41473
```

Use mocked fixtures for offline verification:

```bash
node bin/dcc.mjs proxy transform-fixture tests/fixtures/proxy/text-response.json
node bin/dcc.mjs proxy stream-fixture tests/fixtures/proxy/stream-response.sse
```

## Use with Codex

After install, run Codex with one of the generated profiles:

```bash
codex --profile deepseek-proxy
codex --profile deepseek-flash
```

The sandbox launcher defaults to Flash. Start the same launcher on Pro only
when you want to force the high-reasoning profile:

```bash
DCC_CODEX_PROFILE=deepseek-proxy ./run-dcc-sandbox.command
```

The installer writes DCC-managed Codex config blocks, plugin cache files, profile files, MCP server declarations, and a managed root `model_catalog_json` block that points Codex at `.codex/model-catalog.deepseek-codex-combo.json`. It does not require native DeepSeek provider support from Codex.

Validate installed hook and MCP entrypoints:

```bash
node ~/.codex/plugins/cache/deepseek-codex-combo/deepseek-codex-combo/0.1.0/dist/bin/dcc.mjs hooks session-start
node ~/.codex/plugins/cache/deepseek-codex-combo/deepseek-codex-combo/0.1.0/dist/bin/dcc.mjs lsp mcp --describe
```

## Commands

Core commands:

```bash
dcc install --provider-mode=proxy
dcc uninstall
dcc doctor
dcc doctor --live --strict
dcc proxy start
dcc proxy status
dcc proxy stop
dcc models --offline
dcc switch auto --prompt "explain this code" --dry-run
dcc switch pro --dry-run
dcc init-deep --cwd .
dcc plan "add feature" --no-edit
dcc start-work plans/example.md --dry-run
dcc loop "ship task" --max-steps 0
dcc package --dry-run --out .dcc/release
```

Developer equivalents use `node bin/dcc.mjs` from this repository.

## Model routing: Pro vs Flash

- `deepseek-v4-flash` is the default route for ordinary work, lightweight worker, search, and compatibility tasks.
- `deepseek-v4-pro` is selected automatically for planning, verification, security, ultrawork, and complex edits.
- `deepseek-proxy` starts Codex on Pro; `deepseek-flash` starts Codex on Flash.
- `dcc switch auto --prompt "..."` classifies the request, chooses the model and DCC agent, and writes `deepseek-current`.
- `dcc switch pro --dry-run` and `dcc switch flash --dry-run` show the managed profile patch before applying it.

The sandbox launcher can route an initial prompt automatically:

```bash
DCC_AUTO_PROMPT="보안 취약점과 권한 문제를 검증해줘" ./run-dcc-sandbox.command
```

With `DCC_AUTO_PROMPT`, the launcher prefixes the initial Codex request with the routed DCC agent
(`dcc-worker-flash`, `dcc-librarian-flash`, `dcc-planner-pro`, `dcc-verifier-pro`, or
`dcc-worker-pro`) so Codex delegates first and then continues the task.

## Cache diagnostics

DeepSeek context caching is server-side and best-effort. DCC does not store response caches and cache hits are not guaranteed.

Use a stable caller-owned session key when comparing repeated requests:

```json
{
  "model": "deepseek-v4-pro",
  "input": "Repeat the stable prefix exactly, then answer briefly.",
  "metadata": {
    "dcc_cache_session_id": "local-cache-check"
  }
}
```

Successful proxy responses include `cache_diagnostics` with hashes, token counts, comparison status such as `first_observation` or `compared`, and prefix-change reason enums. They must not include raw prompts, tools, authorization values, output text, or reasoning content.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Codex keeps using an OpenAI model | Check the generated `deepseek-proxy` profile and `model_provider = "deepseek_proxy"`. |
| Proxy connection refused | Run `dcc proxy status`, then start `dcc proxy start --background` and confirm loopback host and port. |
| `DEEPSEEK_API_KEY required for --live` | Source the local secret env file before live checks, or run non-live `dcc doctor`. |
| `native provider mode unsupported` | Use `--provider-mode=proxy`; native provider mode is fail-closed. |
| Tool-call continuation fails | Attach the reasoning-continuation fixture output to an issue. |
| LSP is slow or unavailable | Run `dcc lsp status <file>` and install the relevant language server. |

## Security / telemetry

- Telemetry is disabled by default.
- Evidence and logs must redact API keys, auth headers, home paths, private repository URLs, emails, and local hostnames.
- Raw prompts, source files, and chain-of-thought are not logged.
- `--codex-autonomous` only writes broader Codex autonomy settings when explicitly requested.

## Uninstall

```bash
dcc uninstall --dry-run
node bin/dcc.mjs uninstall --dry-run
node bin/dcc.mjs uninstall
rg -n 'deepseek_proxy|deepseek-codex-combo' ~/.codex/config.toml || true
```

Uninstall removes DCC-managed Codex state, including the managed `model_catalog_json` block and the generated `.codex/model-catalog.deepseek-codex-combo.json` file, while preserving user-authored content outside managed blocks. DCC-created backups use `.dcc-backup-*` names. For rollback, inspect the dry-run first, run uninstall, verify no managed config remains, and remove the local live-check secret env file when it is no longer needed.
