# Plugin Hook Declaration Fallback

Checked: 2026-06-07

`plugin-creator` validation currently rejects the manifest-level `hooks` field, so `deepseek-codex-combo` keeps hook declarations in the companion file `plugins/deepseek-codex-combo/hooks/hooks.json` and omits `hooks` from `.codex-plugin/plugin.json`.

The hook file remains mandatory. Package validation must fail with `hooks_required` when the companion file is missing.
