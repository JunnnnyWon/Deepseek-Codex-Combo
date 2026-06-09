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
node bin/dcc.mjs sandbox run
node bin/dcc.mjs sandbox status
node bin/dcc.mjs sandbox path
```

The sandbox command defaults to `.dcc/sandbox-home` under the current checkout and launches Codex
with isolated `HOME` and `CODEX_HOME`, so the user's normal `~/.codex` is not modified. It starts
the proxy before Codex launches and stops it when Codex exits.

Offline sandbox smoke:

```bash
node bin/dcc.mjs sandbox run --mock-upstream tests/fixtures/proxy/text-response.json --skip-codex
```

Sandbox cleanup:

```bash
node bin/dcc.mjs sandbox reset --force
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

The repository sandbox launcher delegates to the official sandbox command. It uses Pro by default;
to launch the same sandbox directly on Flash:

```bash
DCC_CODEX_PROFILE=deepseek-flash ./run-dcc-sandbox.command
```

To let DCC choose Pro or Flash from the initial prompt, use `--auto-prompt` or `DCC_AUTO_PROMPT`.
The launcher writes and uses the `deepseek-current` profile and then starts Codex:

```bash
node bin/dcc.mjs sandbox run --auto-prompt "이 코드 구조를 간단히 요약해줘"
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
