# Model Routing

`deepseek-v4-flash` is the default for ordinary work, lightweight worker, and lookup tasks. `deepseek-v4-pro` is selected for planning, verification, security, ultrawork, and high-reasoning tasks.

Useful commands:

```bash
node bin/dcc.mjs models --offline
node bin/dcc.mjs switch auto --prompt "explain this code" --dry-run
node bin/dcc.mjs switch pro --dry-run
node bin/dcc.mjs switch flash --dry-run
```

The generated `deepseek-flash` Codex profile uses `model_provider = "deepseek_proxy"` and is the default sandbox launcher profile. The generated `deepseek-proxy` profile uses the same provider and selects `deepseek-v4-pro` when you want to force Pro.

`switch auto` classifies the prompt, chooses the DCC agent, and writes `.codex/profiles/deepseek-current.toml`:

- Pro: `plan`, `ultrawork`, `verify`, `security`, and `deep-refactor`.
- Flash: `quick`, `summarize`, `librarian`, and ordinary `standard-code`.
- Agents: `dcc-planner-pro`, `dcc-verifier-pro`, `dcc-worker-pro`, `dcc-worker-flash`, or `dcc-librarian-flash`.

Use `deepseek-current` after applying an automatic route:

```bash
node bin/dcc.mjs switch auto --prompt "보안 취약점 검증해줘"
codex --profile deepseek-current
```

After install, use the generated profile directly:

```bash
codex --profile deepseek-proxy
codex --profile deepseek-flash
```
