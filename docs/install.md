# Install

Development install:

```bash
pnpm install
pnpm build
node bin/dcc.mjs --help
```

Local release payload:

```bash
pnpm build
node bin/dcc.mjs package --out .dcc/release-local
cd .dcc/release-local/files
node dist/bin/dcc.mjs --help
```

Command help is read-only. `install --help is safe`; it does not write Codex config, plugin bundles, backups, or profile files:

```bash
node bin/dcc.mjs install --help
```

Sandbox-first install:

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

User-level dry runs:

```bash
node bin/dcc.mjs install --dry-run --provider-mode=proxy
node bin/dcc.mjs install --dry-run --provider-mode=plugin-only
```

User-level install after sandbox validation:

```bash
node bin/dcc.mjs install --dry-run --provider-mode=proxy
node bin/dcc.mjs install --no-tui --provider-mode=proxy
codex --profile deepseek-proxy
codex --profile deepseek-flash
```

The repository sandbox launcher uses Flash by default. To launch the same
sandbox directly on Pro:

```bash
DCC_CODEX_PROFILE=deepseek-proxy ./run-dcc-sandbox.command
```

To let DCC choose Pro or Flash from the initial prompt, use `DCC_AUTO_PROMPT`.
The launcher writes and uses the `deepseek-current` profile, prefixes the initial request with
the routed DCC agent, and then starts Codex:

```bash
DCC_AUTO_PROMPT="이 코드 구조를 간단히 요약해줘" ./run-dcc-sandbox.command
```

Run `node dist/bin/dcc.mjs install --no-tui --provider-mode=proxy` from `.dcc/release-local/files` when installing from a local release payload. `npx deepseek-codex-combo install` is reserved for a future published npm package.

Proxy mode writes a DeepSeek proxy provider block plus the managed root `model_catalog_json` block that points to `.codex/model-catalog.deepseek-codex-combo.json`. Plugin-only mode installs plugin and MCP declarations without a provider block. Native provider mode is intentionally fail-closed until Codex support is proven by contract tests.

Rollback:

```bash
node bin/dcc.mjs uninstall --dry-run
node bin/dcc.mjs uninstall
rg -n 'deepseek_proxy|deepseek-codex-combo' ~/.codex/config.toml || true
```

DCC backups are named `.dcc-backup-*` and user-authored content outside managed blocks is preserved. Uninstall removes the managed `model_catalog_json` block and the generated model-catalog file.
