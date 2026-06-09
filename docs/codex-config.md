# Codex Config

The installer writes DCC-managed sections under the user's Codex home, including the root `model_catalog_json` entry that points at `.codex/model-catalog.deepseek-codex-combo.json`. Managed blocks are idempotent and uninstall removes only DCC-owned state.

Proxy dry run:

```bash
node bin/dcc.mjs install --dry-run --provider-mode=proxy
```

Plugin-only dry run:

```bash
node bin/dcc.mjs install --dry-run --provider-mode=plugin-only
```

Autonomous Codex settings are never written unless `--codex-autonomous` is passed explicitly.
