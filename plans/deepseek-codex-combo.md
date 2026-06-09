# DeepSeek-Codex-Combo Implementation Plan

## TL;DR
> **Summary**: Build a greenfield TypeScript monorepo that ships a Codex plugin, `dcc` CLI, Responses-compatible DeepSeek proxy, Pro/Flash router, rules/hooks/MCP harness, Boulder evidence loop, docs, and release checks from `DeepSeek-Codex-Combo-devspec.md`.
> **Deliverables**:
> - `dcc` CLI and npm package `deepseek-codex-combo`
> - Codex plugin bundle `plugins/deepseek-codex-combo`
> - Local Responses-compatible proxy for DeepSeek ChatCompletions
> - Rules, hooks, comment-checker, LSP, AST-grep, hashline, planner/start-work/loop, evidence audit, and `/init-deep-dcc`
> - Automated tests, fixture E2E checks, docs, release packaging, and redaction/security gates
> **Effort**: XL
> **Parallel**: YES - 4 waves
> **Critical Path**: Task 1 -> Task 4 -> Task 6 -> Task 9 -> Task 12 -> Task 16 -> Final Verification

## Context
### Original Request
User request: "디렉토리 안의 개발명세서를 확인하고 플랜을 세워."

### Interview Summary
No follow-up interview was needed. The user explicitly requested a plan from the development spec, and all critical choices were discoverable from the spec, current Codex manual, local OMO plugin precedent, and planning review.

### Research Findings
- Repository state: greenfield/spec-only before planner artifacts; no source tree, package manifest, tests, git metadata, project `AGENTS.md`, or `graphify-out/GRAPH_REPORT.md`.
- Primary spec: `DeepSeek-Codex-Combo-devspec.md` defines the product, architecture, repo layout, plugin structure, proxy contract, routing, hooks, rules, memory, MCP tooling, installer, testing plan, milestones, and DoD.
- Current Codex manual confirms custom providers use user-level `model_providers.<id>`; `wire_api = "responses"` is the supported custom provider wire. Project `.codex/config.toml` cannot override provider/auth keys.
- Current Codex manual confirms enabled plugins can bundle hooks and MCP config; hook events and matcher semantics match the spec's hook design.
- Local OMO precedent confirms a real installed plugin can carry `.codex-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`, skills, component CLIs, and hook status-message tests.
- DeepSeek docs are an implementation-time external dependency; model/API details must be re-verified in Task 2 before code relies on them.

### Metis Review (gaps addressed)
- Added exact manifest validation gate using `plugin-creator` validator plus a packaging regression test.
- Defined the Responses proxy compatibility subset, streaming events, retry limits, and reasoning continuation rules.
- Resolved install modes: `proxy` and `plugin-only` are v1; `native` is probe-gated and must fail closed until Codex supports non-Responses custom provider wire.
- Replaced vague evidence paths with `.dcc/evidence/<session-id>/...`.
- Split comment-checker, LSP, AST-grep, and hashline into separate tasks.
- Added doctor exit codes, autostart defaults, backup markers, concurrency limits, live-test gating, and security acceptance criteria.

### Decisions Applied
- Package manager: `pnpm` workspaces.
- Runtime: Node 20+ ESM.
- HTTP proxy: Hono with `@hono/node-server`; upstream HTTP/SSE via `undici`.
- CLI parser: `commander`.
- Validation: Zod at external boundaries; internal domain IDs use branded string types.
- Testing: Vitest for unit/integration/E2E fixture tests, Biome for lint/format, `tsc --noEmit` for typecheck.
- TOML strategy: marker-block string patching for managed Codex config plus TOML parse-after-write validation.
- Plugin manifest: default to the spec and OMO shape with `hooks` in `.codex-plugin/plugin.json`; prove it early. If the validator rejects `hooks`, change only the declaration mechanism and keep bundled hooks mandatory.

## Work Objectives
### Core Objective
Implement DeepSeek-Codex-Combo v1 as a Codex-compatible DeepSeek V4 harness, not a simple model-name config change.

### Deliverables
- Greenfield TypeScript monorepo matching spec section 4.2.
- Local DeepSeek provider proxy exposing `GET /healthz`, `GET /v1/models`, and `POST /v1/responses`.
- Idempotent installer/uninstaller/doctor with safe user-level Codex config patching.
- Codex plugin bundle with skills, hooks, MCP declarations, agents, model catalog, and assets.
- DeepSeek Pro/Flash model catalog and deterministic routing.
- Rules engine, comment checker, LSP MCP, AST-grep MCP, hashline tools.
- Boulder state, evidence audit, `$dcc-plan`, `$dcc-start-work`, `$dcc-loop`, and Stop continuation.
- `/init-deep-dcc` project memory generator.
- Docs, troubleshooting, security guidance, CI, release packaging, and acceptance evidence.

### Definition of Done (verifiable conditions with commands)
- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:e2e`
- `node bin/dcc.mjs --help`
- `node bin/dcc.mjs install --dry-run --home "$TMP_HOME" --provider-mode=proxy`
- `node bin/dcc.mjs install --dry-run --home "$TMP_HOME" --provider-mode=plugin-only`
- `node bin/dcc.mjs install --dry-run --home "$TMP_HOME" --provider-mode=native` exits fail-closed unless probe says supported.
- `node bin/dcc.mjs doctor --home "$TMP_HOME"` returns the expected exit code for each fixture state.
- Proxy HTTP smoke tests pass against a mocked DeepSeek server for non-stream, stream, tool-call, and reasoning-continuation fixtures.
- Live DeepSeek smoke runs only when `DEEPSEEK_API_KEY` is present and `--live` is explicitly passed.
- All manual QA artifacts are recorded under `.dcc/evidence/<session-id>/`.

### Must Have
- TDD for every production change: failing test first, then implementation.
- Redaction tests for API keys, Authorization headers, prompts, source text, file paths, git remotes, hostnames, emails, and raw reasoning content.
- User-level provider/auth config only; no provider/auth keys in project `.codex/config.toml`.
- Default proxy bind `127.0.0.1`; `0.0.0.0` requires `--allow-remote-bind` plus token auth.
- Default telemetry off.
- Default proxy autostart `none`; launchd/systemd only when explicitly requested.
- No unsupported native provider config unless current-Codex probe validates it.
- No raw `reasoning_content` in logs, telemetry, durable evidence, or user-facing output.

### Must NOT Have
- No Codex core patching.
- No DeepSeek API key persisted in config files.
- No live API call in default CI.
- No Jest, ESLint, Prettier, Express, bare production `fetch`, `any`, `@ts-ignore`, non-null assertions, or default exports in new TypeScript code.
- No product-code mutation from `$dcc-plan` or `/init-deep-dcc`.
- No silent hook removal if manifest validation rejects the `hooks` key.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed during implementation.
- Test decision: TDD with Vitest + fixture E2E; every production task starts with named failing tests.
- QA policy: every task has one happy path and one failure/edge scenario through a real channel: `tmux` for CLI, `curl -i` for HTTP, or shell-driven fixture E2E where the real surface is CLI/data.
- Evidence root: `.dcc/evidence/<session-id>/`.
- Live API policy: mocked DeepSeek tests are mandatory; `dcc doctor --live` is optional and skipped with recorded evidence when `DEEPSEEK_API_KEY` is absent.
- Compatibility policy: current Codex and DeepSeek docs are rechecked in Task 2; results are committed to docs and test fixtures, not held only in chat.

## Execution Strategy
### Parallel Execution Waves
Wave 1: Tasks 1-5 establish scaffold, external contract snapshot, shared primitives, plugin skeleton validation, and tests/fixtures.
Wave 2: Tasks 6-10 build the proxy, routing, installer/config manager, doctor, and proxy lifecycle.
Wave 3: Tasks 11-15 build rules/hooks/comment-checker, LSP, AST-grep/hashline, prompt profiles, plugin skills/agents.
Wave 4: Tasks 16-19 build Boulder/evidence, planner/executor loops, project memory, docs/release/security hardening.

### Dependency Matrix
| Task | Blocks | Blocked By |
|---|---|---|
| 1 Scaffold monorepo | 2,3,4,5,all package tasks | none |
| 2 External contract snapshot | 6,7,8,9,10,19 | 1 |
| 3 Shared primitives | 6,7,8,9,10,11,16 | 1 |
| 4 Plugin skeleton validation | 9,12,15 | 1,2 |
| 5 Test/CI/fixtures | all implementation tasks | 1 |
| 6 Responses transform core | 7,8 | 2,3,5 |
| 7 Streaming/tool/reasoning adapter | 8,10 | 2,3,5,6 |
| 8 Proxy server lifecycle | 9,10,19 | 3,5,6,7 |
| 9 Installer/config manager | 10,12,15,19 | 2,3,4,5,8 |
| 10 Doctor/models/proxy commands | 19 | 3,5,8,9 |
| 11 Rules engine | 12,15,17 | 3,5 |
| 12 Hooks/comment-checker | 16,17 | 4,5,9,11 |
| 13 LSP MCP | 12,17 | 3,5 |
| 14 AST-grep/hashline MCP | 17 | 3,5 |
| 15 Prompt profiles/skills/agents | 17 | 4,5,9,11 |
| 16 Boulder/evidence/Stop gate | 17,19 | 3,5,12 |
| 17 Plan/start-work/loop | 18,19 | 11,12,13,14,15,16 |
| 18 init-deep-dcc | 19 | 11,13,17 |
| 19 Docs/release/security | final verification | all prior tasks |

## TODOs
- [x] 1. Scaffold the TypeScript monorepo, root toolchain, and CI shell

  **What to do**: Create the full repo skeleton from spec section 4.2: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.github/workflows/ci.yml`, `bin/dcc.mjs`, `bin/deepseek-codex-combo.mjs`, `packages/*`, `plugins/deepseek-codex-combo/*`, and `tests/{unit,integration,e2e,fixtures}`. Root scripts must include `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `build`, and `dcc`.
  **Must NOT do**: Do not implement feature logic beyond minimal command stubs and package exports needed for failing tests.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2-19 | Blocked By: none

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:232` - required repository layout.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:2060` - M0 scaffold completion commands.
  - TypeScript rules: `/Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/skills/programming/references/typescript/README.md`
  - Local pattern: `/Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/package.json` - plugin aggregate package scripts.

  **Tests to write first**:
  - `tests/unit/scaffold/repo-layout.test.ts::repo_layout_matches_spec`
  - `tests/unit/scaffold/package-scripts.test.ts::root_scripts_match_contract`
  - `tests/e2e/cli/help.test.ts::dcc_help_lists_core_commands`

  **Acceptance Criteria**:
  - [ ] `pnpm install` exits 0.
  - [ ] `pnpm lint` exits 0.
  - [ ] `pnpm typecheck` exits 0.
  - [ ] `pnpm test tests/unit/scaffold` exits 0.
  - [ ] `node bin/dcc.mjs --help` prints all CLI commands listed in spec section 13.1.

  **QA Scenarios**:
  ```
  Scenario: CLI help happy path
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t1 'node bin/dcc.mjs --help; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t1 -S -200
    Expected: output contains "install", "uninstall", "doctor", "proxy", "init-deep", "plan", "start-work", "loop", "switch", "models", "rules", "evidence", and "EXIT:0".
    Evidence: .dcc/evidence/<session-id>/task-1-cli-help.txt

  Scenario: Unknown command fails cleanly
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t1-error 'node bin/dcc.mjs does-not-exist; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t1-error -S -200
    Expected: output contains "unknown command" or commander equivalent and a non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-1-unknown-command.txt
  ```

  **Commit**: YES | Message: `chore(scaffold): create strict monorepo shell` | Files: root config, `bin/`, `packages/*/package.json`, `plugins/deepseek-codex-combo/`, `tests/`

- [x] 2. Snapshot current external contracts and lock compatibility assumptions

  **What to do**: Add a docs/test fixture package that records the current OpenAI Codex plugin/config/hooks/MCP contract and DeepSeek API contract used by the implementation. Create `docs/external-contracts.md`, `tests/fixtures/contracts/codex-manual-snapshot.md`, and `tests/fixtures/contracts/deepseek-api-contract.json`. The snapshot task must verify custom providers are Responses-wire, project config cannot set provider/auth, plugin-bundled hooks exist, DeepSeek base URL is `https://api.deepseek.com`, V4 Pro/Flash model IDs exist, thinking/tool-call/streaming contracts are captured, and live API calls are not required.
  **Must NOT do**: Do not hardcode secrets, live API responses, or paid-call results into fixtures.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6,7,8,9,10,19 | Blocked By: 1

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:132` - DeepSeek API assumptions.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:453` - proxy requirement.
  - Codex docs: `https://developers.openai.com/codex/config-advanced`
  - Codex docs: `https://developers.openai.com/codex/plugins/build`
  - Codex docs: `https://developers.openai.com/codex/hooks`
  - Codex docs: `https://developers.openai.com/codex/mcp`
  - DeepSeek docs: `https://api-docs.deepseek.com/`

  **Tests to write first**:
  - `tests/unit/contracts/codex-contract.test.ts::custom_provider_wire_is_responses`
  - `tests/unit/contracts/deepseek-contract.test.ts::deepseek_v4_contract_contains_required_models`
  - `tests/unit/contracts/live-gating.test.ts::live_checks_require_explicit_live_flag`

  **Acceptance Criteria**:
  - [ ] `pnpm test tests/unit/contracts` exits 0.
  - [ ] `docs/external-contracts.md` lists the exact Codex and DeepSeek source URLs and date checked.
  - [ ] No fixture includes `sk-`, `Authorization`, prompt text, or local absolute user paths.

  **QA Scenarios**:
  ```
  Scenario: Contract snapshot dry run
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t2 'node bin/dcc.mjs contracts verify --offline; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t2 -S -200
    Expected: output contains "Codex contract: ok", "DeepSeek contract: ok", "live: skipped", and "EXIT:0".
    Evidence: .dcc/evidence/<session-id>/task-2-contracts-offline.txt

  Scenario: Live contract check without explicit flag is blocked
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t2-error 'DEEPSEEK_API_KEY=test node bin/dcc.mjs contracts verify; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t2-error -S -200
    Expected: output says live checks require "--live" and exits non-zero without making network calls.
    Evidence: .dcc/evidence/<session-id>/task-2-live-gate.txt
  ```

  **Commit**: YES | Message: `test(contracts): capture codex and deepseek compatibility assumptions` | Files: `docs/external-contracts.md`, `tests/fixtures/contracts/`, contract tests, contract CLI stub

- [x] 3. Implement shared primitives, strict typing, redaction, and state-safe utilities

  **What to do**: Build `packages/shared` with path resolution, safe fs operations, JSON helpers, marker-block patching, TOML parse-after-write validation, process runner, platform detection, typed errors, branded IDs, logger, redaction, bounded in-memory stores, and test temp-home utilities. Use Zod for parsing external JSON/TOML/env/CLI boundaries.
  **Must NOT do**: Do not use full TOML rewrite for user config; only replace marked DCC blocks.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6-17 | Blocked By: 1

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:2201` - TypeScript standards.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:2229` - marker-block config patching.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1893` - security requirements.
  - TypeScript rules: `/Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/skills/programming/references/typescript/tsconfig-strict.md`

  **Tests to write first**:
  - `packages/shared/src/redact.test.ts::redacts_secret_path_prompt_and_auth_values`
  - `packages/shared/src/managed-block.test.ts::replaces_only_named_dcc_block`
  - `packages/shared/src/bounded-store.test.ts::evicts_expired_entries_by_session`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/shared` exits 0.
  - [ ] `pnpm typecheck --filter @dcc/shared` exits 0.
  - [ ] Redaction snapshots contain `[REDACTED]` and no raw API key, prompt, source text, git remote, hostname, username/email, or absolute home path.

  **QA Scenarios**:
  ```
  Scenario: Redaction CLI dry run
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t3 'node bin/dcc.mjs debug redact --sample-secret sk-test --sample-path "$HOME/private.ts"; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t3 -S -200
    Expected: output contains "[REDACTED]" and does not contain "sk-test" or the full home path; EXIT:0.
    Evidence: .dcc/evidence/<session-id>/task-3-redaction.txt

  Scenario: Broken TOML block is rejected
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t3-error 'node bin/dcc.mjs debug patch-config --fixture tests/fixtures/config/broken-managed-block.toml; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t3-error -S -200
    Expected: output contains "config_parse_error" and non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-3-broken-toml.txt
  ```

  **Commit**: YES | Message: `feat(shared): add safe config and redaction primitives` | Files: `packages/shared/`, shared tests, debug command fixtures

- [x] 4. Create plugin skeleton and validate manifest/hook declaration strategy

  **What to do**: Create `plugins/deepseek-codex-combo/.codex-plugin/plugin.json`, `.mcp.json`, `hooks/hooks.json`, placeholder skills, agents, model catalog path, assets placeholder, and packaging tests. Default manifest must include `skills`, `mcpServers`, and `hooks` exactly as spec/OMO precedent. Add validator command:
  `python3 /Users/junnnny/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/deepseek-codex-combo`
  If this validator or current Codex packaging rejects `hooks`, move only the declaration mechanism to the supported default/companion hook location and update tests/docs; bundled hooks remain mandatory.
  **Must NOT do**: Do not delete hook support to satisfy validation.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 9,12,15 | Blocked By: 1,2

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:959` - plugin manifest.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1039` - hooks design.
  - Local pattern: `/Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/.codex-plugin/plugin.json`
  - Local pattern: `/Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/hooks/hooks.json`
  - Decision note: `.omo/drafts/decisions.md`

  **Tests to write first**:
  - `tests/unit/plugin/manifest.test.ts::plugin_manifest_matches_spec_and_omo_shape`
  - `tests/integration/plugin/validate-plugin.test.ts::plugin_creator_validator_accepts_or_fallback_is_documented`
  - `tests/unit/plugin/hooks-manifest.test.ts::hook_events_match_spec`

  **Acceptance Criteria**:
  - [ ] Plugin validator command exits 0, or fallback declaration mechanism is implemented and documented with a failing/passing regression test.
  - [ ] `plugins/deepseek-codex-combo/hooks/hooks.json` contains SessionStart, UserPromptSubmit, PostToolUse, PostCompact, Stop, and SubagentStop.
  - [ ] Packaging tests assert skills/MCP/hooks/assets files exist.

  **QA Scenarios**:
  ```
  Scenario: Plugin manifest validation
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t4 'python3 /Users/junnnny/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/deepseek-codex-combo; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t4 -S -200
    Expected: validator success with EXIT:0, or documented fallback test output naming the accepted hook declaration path.
    Evidence: .dcc/evidence/<session-id>/task-4-plugin-validator.txt

  Scenario: Missing hooks file fails package check
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t4-error 'node bin/dcc.mjs plugin validate --fixture tests/fixtures/plugin/missing-hooks; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t4-error -S -200
    Expected: output contains "hooks_required" and non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-4-missing-hooks.txt
  ```

  **Commit**: YES | Message: `feat(plugin): add codex plugin skeleton and validation gate` | Files: `plugins/deepseek-codex-combo/`, plugin tests, decision docs

- [x] 5. Build test harness, fixtures, and CI gates

  **What to do**: Add Vitest config, fixture builders, temp HOME/CODEX_HOME helpers, mocked DeepSeek server, mock Codex Responses client, fixture repos `ts-node-app`, `python-fastapi`, `rust-cli`, `broken-monorepo`, CI workflow, and evidence capture helpers. CI must run lint, typecheck, unit, integration, and E2E fixture tests without live DeepSeek calls.
  **Must NOT do**: Do not require Bun, Jest, Docker, or live API keys in default CI.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: all implementation tasks | Blocked By: 1

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1984` - test plan.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:2020` - E2E fixtures.
  - Local pattern: `/Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/test/*.test.mjs`

  **Tests to write first**:
  - `tests/unit/test-harness/temp-home.test.ts::temp_home_is_isolated`
  - `tests/integration/mock-deepseek/server.test.ts::mock_server_serves_chat_stream_and_tool_fixtures`
  - `tests/e2e/fixtures/fixture-health.test.ts::all_fixture_repos_have_expected_commands`

  **Acceptance Criteria**:
  - [ ] `pnpm test` exits 0 with scaffold/stub implementation.
  - [ ] `pnpm test:integration` exits 0 without network.
  - [ ] `pnpm test:e2e` exits 0 without network.
  - [ ] `.github/workflows/ci.yml` runs install, lint, typecheck, test, integration, and e2e.

  **QA Scenarios**:
  ```
  Scenario: Mock DeepSeek fixture server starts
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t5 'node tests/fixtures/mock-deepseek/server.mjs --once /healthz; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t5 -S -200
    Expected: output contains "mock-deepseek ready" and "EXIT:0".
    Evidence: .dcc/evidence/<session-id>/task-5-mock-server.txt

  Scenario: Fixture missing package metadata is reported
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t5-error 'node bin/dcc.mjs fixtures verify tests/fixtures/broken-empty; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t5-error -S -200
    Expected: output contains "fixture_invalid" and non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-5-invalid-fixture.txt
  ```

  **Commit**: YES | Message: `test(fixtures): add isolated harness and ci gates` | Files: `vitest.config.ts`, `tests/`, `.github/workflows/ci.yml`

- [x] 6. Implement Responses request/response transform core

  **What to do**: Implement `packages/provider-proxy/src/responsesToChat.ts` and `chatToResponses.ts`. Supported request subset: `model`, `instructions`, `input` string/array, `tools`, `tool_choice`, `stream`, `temperature`, `top_p`, `reasoning`, `reasoning_effort`, `metadata`, and `parallel_tool_calls`. Unsupported fields must be parsed, classified, and either dropped with local warning or rejected with typed errors. Response output must produce Responses-shaped final objects for text, tool calls, failed status, and incomplete status.
  **Must NOT do**: Do not pass `metadata`, raw prompts, or internal trace IDs upstream unless explicitly allowed by the spec.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 7,8 | Blocked By: 2,3,5

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:586` - Responses to Chat conversion table.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:642` - tool-call conversion.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:712` - error mapping.
  - Contract fixture: `tests/fixtures/contracts/deepseek-api-contract.json`

  **Tests to write first**:
  - `packages/provider-proxy/src/responsesToChat.test.ts::converts_string_input_to_user_message`
  - `packages/provider-proxy/src/responsesToChat.test.ts::drops_thinking_ignored_sampling_params`
  - `packages/provider-proxy/src/chatToResponses.test.ts::converts_tool_call_to_function_call_item`
  - `packages/provider-proxy/src/errors.test.ts::maps_upstream_errors_to_codex_errors`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/provider-proxy -- --run responsesToChat chatToResponses errors` exits 0.
  - [ ] Transform tests cover happy path, tool call, bad tool schema, unknown model, 401, 429, 5xx, and unsupported parameter handling.
  - [ ] No transform test snapshots include prompts or API keys.

  **QA Scenarios**:
  ```
  Scenario: Non-stream transform round trip
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t6 'node bin/dcc.mjs proxy transform-fixture tests/fixtures/proxy/text-response.json; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t6 -S -200
    Expected: output contains "response.completed", "output_text", and "EXIT:0".
    Evidence: .dcc/evidence/<session-id>/task-6-transform-roundtrip.txt

  Scenario: Invalid tool schema fails before upstream
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t6-error 'node bin/dcc.mjs proxy transform-fixture tests/fixtures/proxy/invalid-tool-schema.json; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t6-error -S -200
    Expected: output contains "tool_schema_error" and non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-6-invalid-tool-schema.txt
  ```

  **Commit**: YES | Message: `feat(proxy): translate responses and chat payloads` | Files: `packages/provider-proxy/src/responsesToChat.ts`, `chatToResponses.ts`, tests, fixtures

- [x] 7. Implement streaming, tool-call continuation, reasoning store, and retry policy

  **What to do**: Implement SSE streaming transforms for the minimum event contract: `response.created`, `response.output_item.added`, `response.output_text.delta`, `response.output_text.done`, `response.function_call_arguments.delta`, `response.function_call_arguments.done`, `response.completed`, and `response.failed`. Add a session-scoped in-memory reasoning store with TTL, LRU eviction, per-session isolation, and cleanup on Stop/compact/session end. Encrypted temp persistence is feature-flagged and disabled by default. Retry policy: 429/5xx exponential backoff with jitter up to configured max, stream interruption up to 3 retries, JSON repair one attempt, repeated identical tool call 3 times triggers verifier handoff.
  **Must NOT do**: Do not write raw `reasoning_content` to logs, evidence, telemetry, or normal state files.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8,10 | Blocked By: 2,3,5,6

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:631` - `reasoning_content` handling.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:691` - streaming events.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:724` - retry policy.
  - DeepSeek docs: `https://api-docs.deepseek.com/`

  **Tests to write first**:
  - `packages/provider-proxy/src/stream.test.ts::maps_deepseek_sse_to_responses_events`
  - `packages/provider-proxy/src/reasoningStore.test.ts::stores_reasoning_only_in_memory_per_session`
  - `packages/provider-proxy/src/retry.test.ts::retries_429_with_jitter_and_caps_attempts`
  - `packages/provider-proxy/src/tools.test.ts::continues_tool_call_with_reasoning_content`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/provider-proxy -- --run stream reasoningStore retry tools` exits 0.
  - [ ] Concurrency test proves two simultaneous sessions cannot read each other's reasoning content.
  - [ ] Redaction test proves reasoning content is absent from evidence/log output.
  - [ ] Stream fixture output exactly matches the documented minimum event order.

  **QA Scenarios**:
  ```
  Scenario: Streaming fixture emits Responses events
    Tool: HTTP call
    Steps: start mock DeepSeek and proxy; curl -i -N -H 'Authorization: Bearer test' -H 'Content-Type: application/json' --data @tests/fixtures/proxy/stream-request.json http://127.0.0.1:47147/v1/responses
    Expected: HTTP/1.1 200 and body contains response.created, response.output_text.delta, response.completed in order.
    Evidence: .dcc/evidence/<session-id>/task-7-stream-curl.txt

  Scenario: Missing reasoning continuation maps to adapter error
    Tool: HTTP call
    Steps: start mock DeepSeek fixture that returns 400 reasoning_content missing; curl -i with tests/fixtures/proxy/tool-continuation-missing.json to /v1/responses
    Expected: status is 400 or 502 per adapter policy and body contains "adapter_error" and "reasoning continuation".
    Evidence: .dcc/evidence/<session-id>/task-7-reasoning-error-curl.txt
  ```

  **Commit**: YES | Message: `feat(proxy): support streaming tools and reasoning continuation` | Files: `packages/provider-proxy/src/stream.ts`, `tools.ts`, `reasoningStore.ts`, `retry.ts`, tests, fixtures

- [x] 8. Build the local proxy server, auth, metrics, and lifecycle foundation

  **What to do**: Implement Hono server in `packages/provider-proxy/src/server.ts` with `GET /healthz`, `GET /v1/models`, `POST /v1/responses`, optional debug `POST /v1/chat/completions`, and opt-in `GET /metrics`. Add auth forwarding from Codex Authorization header to DeepSeek, model-list caching with local fallback, host/port selection, default bind `127.0.0.1`, remote bind refusal unless `--allow-remote-bind` plus token auth, graceful shutdown, concurrency caps, request body limits, and redacted structured logs.
  **Must NOT do**: Do not bind to `0.0.0.0` by default or log request/response prompt bodies.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9,10,19 | Blocked By: 3,5,6,7

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:537` - proxy endpoints.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:556` - `/healthz`.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:570` - `/v1/models`.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1902` - local proxy security.

  **Tests to write first**:
  - `packages/provider-proxy/src/server.test.ts::healthz_returns_version_and_models`
  - `packages/provider-proxy/src/server.test.ts::models_falls_back_to_local_catalog`
  - `packages/provider-proxy/src/auth.test.ts::authorization_header_is_forwarded_and_redacted`
  - `packages/provider-proxy/src/bind.test.ts::remote_bind_requires_flag_and_token`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/provider-proxy -- --run server auth bind` exits 0.
  - [ ] `node bin/dcc.mjs proxy start --mock-upstream tests/fixtures/mock-deepseek --port 47147` starts on `127.0.0.1`.
  - [ ] `curl -i http://127.0.0.1:47147/healthz` returns 200 and JSON service `dcc-provider-proxy`.
  - [ ] `curl -i http://127.0.0.1:47147/v1/models` returns both V4 model IDs via mock/fallback.

  **QA Scenarios**:
  ```
  Scenario: Proxy health and models
    Tool: HTTP call
    Steps: node bin/dcc.mjs proxy start --mock-upstream tests/fixtures/mock-deepseek --port 47147; curl -i http://127.0.0.1:47147/healthz; curl -i http://127.0.0.1:47147/v1/models
    Expected: both responses are HTTP 200; health body contains "dcc-provider-proxy"; models body includes deepseek-v4-pro and deepseek-v4-flash.
    Evidence: .dcc/evidence/<session-id>/task-8-health-models.txt

  Scenario: Remote bind rejected without token auth
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t8-error 'node bin/dcc.mjs proxy start --host 0.0.0.0 --port 47148; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t8-error -S -200
    Expected: output contains "remote_bind_requires_token_auth" and non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-8-remote-bind-refused.txt
  ```

  **Commit**: YES | Message: `feat(proxy): expose local responses-compatible server` | Files: `packages/provider-proxy/src/server.ts`, `auth.ts`, `limits.ts`, tests

- [x] 9. Implement installer, config patching, marketplace, profiles, autostart, and uninstall

  **What to do**: Implement `packages/codex-installer` and CLI commands for `install`, `uninstall`, and dry-run. Use user-level Codex config only. Managed block markers:
  `# >>> DCC managed: provider deepseek_proxy` and `# <<< DCC managed: provider deepseek_proxy`.
  Backups use `~/.codex/config.toml.dcc-backup-YYYYMMDD-HHMMSS`. Install must copy plugin cache, create marketplace metadata, install agent TOMLs, create profile files, handle `--provider-mode=proxy|plugin-only|native`, and support `--proxy-autostart=none|launchd|systemd`. Defaults: provider mode `proxy`, autostart `none`, telemetry disabled. `native` must fail closed unless current-Codex probe proves non-Responses custom provider support; `plugin-only` must install hooks/skills/MCP without provider config.
  **Must NOT do**: Do not modify marker-external user config, store API keys, or enable autonomous sandbox settings unless the user explicitly passes `--codex-autonomous`.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 10,12,15,19 | Blocked By: 2,3,4,5,8

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:472` - install modes.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:482` - proxy config example.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1681` - installer CLI/options.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1722` - idempotency markers.
  - Codex docs: `https://developers.openai.com/codex/config-advanced`

  **Tests to write first**:
  - `packages/codex-installer/src/configToml.test.ts::insert_replace_remove_managed_provider_block`
  - `packages/codex-installer/src/install.test.ts::proxy_install_writes_only_user_config`
  - `packages/codex-installer/src/install.test.ts::plugin_only_install_omits_provider_block`
  - `packages/codex-installer/src/install.test.ts::native_mode_fails_closed_without_probe`
  - `packages/codex-installer/src/uninstall.test.ts::uninstall_preserves_user_files_and_evidence`
  - `packages/codex-installer/src/autostart.test.ts::default_autostart_creates_no_launch_artifacts`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/codex-installer` exits 0.
  - [ ] `node bin/dcc.mjs install --dry-run --home "$TMP_HOME" --provider-mode=proxy` prints planned files and config diff without writing outside `$TMP_HOME`.
  - [ ] Repeating install twice produces one provider block and one plugin entry.
  - [ ] Repeating uninstall twice exits 0 and preserves user-created `.dcc/`, plans, evidence, and marker-external config.
  - [ ] `native` mode documents unsupported status and exits with a typed unsupported-mode code unless probe succeeds.

  **QA Scenarios**:
  ```
  Scenario: Idempotent proxy dry-run install
    Tool: tmux
    Steps: TMP_HOME=$(mktemp -d); tmux new-session -d -s dcc-qa-t9 "node bin/dcc.mjs install --dry-run --home '$TMP_HOME' --provider-mode=proxy --no-tui --no-codex-autonomous; node bin/dcc.mjs install --dry-run --home '$TMP_HOME' --provider-mode=proxy --no-tui --no-codex-autonomous; echo EXIT:$?"; tmux capture-pane -pt dcc-qa-t9 -S -400
    Expected: output contains one DCC managed provider block in the rendered diff and EXIT:0.
    Evidence: .dcc/evidence/<session-id>/task-9-install-idempotent.txt

  Scenario: Native mode fails closed
    Tool: tmux
    Steps: TMP_HOME=$(mktemp -d); tmux new-session -d -s dcc-qa-t9-error "node bin/dcc.mjs install --dry-run --home '$TMP_HOME' --provider-mode=native; echo EXIT:$?"; tmux capture-pane -pt dcc-qa-t9-error -S -200
    Expected: output contains "native provider mode unsupported" and non-zero EXIT unless probe fixture says supported.
    Evidence: .dcc/evidence/<session-id>/task-9-native-fail-closed.txt
  ```

  **Commit**: YES | Message: `feat(installer): add idempotent codex install modes` | Files: `packages/codex-installer/`, CLI install/uninstall commands, tests

- [x] 10. Implement model catalog, routing, doctor, proxy lifecycle, and models commands

  **What to do**: Implement `packages/model-core` with `model-catalog.deepseek.json`, task categories, route decisions, Pro/Flash fallbacks, thinking policy, retry escalation, and env overrides. Implement `dcc models`, `dcc switch`, `dcc proxy start|stop|status`, and `dcc doctor`. Doctor checks Node >=20, Codex CLI, config readability, plugin installed/enabled, `DEEPSEEK_API_KEY`, proxy health, `/v1/models`, smoke chat, streaming, tool-call, LSP, rules dry-run, comment-checker. Exit codes: 0 OK, 1 warnings in strict mode, 2 missing dependency, 3 auth failure, 4 proxy failure, 5 model smoke failure.
  **Must NOT do**: Do not print API key prefixes or make live upstream calls unless `--live` is explicit and env key exists.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 19 | Blocked By: 3,5,8,9

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:748` - model catalog.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:816` - routing categories.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1931` - doctor checks and exit codes.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1769` - proxy lifecycle.

  **Tests to write first**:
  - `packages/model-core/src/router.test.ts::quick_task_routes_to_flash`
  - `packages/model-core/src/router.test.ts::security_task_routes_to_pro_max`
  - `packages/cli/src/doctor.test.ts::doctor_returns_exit_4_when_proxy_down`
  - `packages/cli/src/doctor.test.ts::doctor_live_requires_key_and_flag`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/model-core packages/cli -- --run router doctor` exits 0.
  - [ ] `node bin/dcc.mjs models --offline` lists Pro/Flash from local catalog.
  - [ ] `node bin/dcc.mjs doctor --home "$TMP_HOME"` returns expected fixture exit codes 0-5.
  - [ ] `node bin/dcc.mjs switch pro --dry-run --home "$TMP_HOME"` renders the correct config/profile patch.

  **QA Scenarios**:
  ```
  Scenario: Offline models and doctor warnings
    Tool: tmux
    Steps: TMP_HOME=$(mktemp -d); tmux new-session -d -s dcc-qa-t10 "node bin/dcc.mjs models --offline; node bin/dcc.mjs doctor --home '$TMP_HOME'; echo EXIT:$?"; tmux capture-pane -pt dcc-qa-t10 -S -300
    Expected: models include deepseek-v4-pro and deepseek-v4-flash; doctor reports missing install/proxy without exposing secrets.
    Evidence: .dcc/evidence/<session-id>/task-10-doctor-offline.txt

  Scenario: Doctor auth failure code
    Tool: tmux
    Steps: TMP_HOME=$(mktemp -d); tmux new-session -d -s dcc-qa-t10-error "node bin/dcc.mjs doctor --home '$TMP_HOME' --fixture auth-failure; echo EXIT:$?"; tmux capture-pane -pt dcc-qa-t10-error -S -200
    Expected: output contains "auth failure" and "EXIT:3".
    Evidence: .dcc/evidence/<session-id>/task-10-doctor-auth-failure.txt
  ```

  **Commit**: YES | Message: `feat(cli): add routing catalog doctor and proxy commands` | Files: `packages/model-core/`, `packages/cli/`, catalog JSON, tests

- [x] 11. Implement rules engine and project instruction injection

  **What to do**: Implement `packages/rules-engine` for rule source discovery, normalized hashing, dedupe, priority, context budget, injection formatting, transcript filtering, dynamic target matching, and `.dcc/rules` support. Rule source priority must follow spec section 11 and must not duplicate Codex-native `AGENTS.md` handling.
  **Must NOT do**: Do not inject duplicate rules or exceed the configured context budget silently.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 12,15,17 | Blocked By: 3,5

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1189` - rules engine.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1219` - context budget.
  - Local pattern: `/Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/components/rules/src/codex-hook.ts`

  **Tests to write first**:
  - `packages/rules-engine/src/discoverRules.test.ts::discovers_sources_in_priority_order`
  - `packages/rules-engine/src/dedupe.test.ts::dedupes_by_normalized_content_hash`
  - `packages/rules-engine/src/injectRules.test.ts::formats_dcc_project_rules_block_with_budget`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/rules-engine` exits 0.
  - [ ] Fixture with duplicate `.dcc`, `.omo`, `.claude`, `.cursor`, and `.github` rules injects one normalized copy.
  - [ ] Oversized rule fixture emits a deterministic truncation/budget diagnostic.

  **QA Scenarios**:
  ```
  Scenario: Rules dry-run injects deduped block
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t11 'node bin/dcc.mjs rules list --cwd tests/fixtures/rules/duplicate-sources --dry-run; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t11 -S -300
    Expected: output contains one DCC_PROJECT_RULES block per normalized rule and EXIT:0.
    Evidence: .dcc/evidence/<session-id>/task-11-rules-dry-run.txt

  Scenario: Rule budget overflow reports skipped source
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t11-error 'node bin/dcc.mjs rules list --cwd tests/fixtures/rules/oversized --budget 200; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t11-error -S -200
    Expected: output contains "rule_budget_exceeded" and the skipped source path redacted/display-safe.
    Evidence: .dcc/evidence/<session-id>/task-11-rule-budget.txt
  ```

  **Commit**: YES | Message: `feat(rules): add deduped project rule injection` | Files: `packages/rules-engine/`, rules CLI/tests

- [x] 12. Implement lifecycle hooks and comment-checker integration

  **What to do**: Implement hook CLIs for SessionStart, UserPromptSubmit, PostToolUse, PostCompact, Stop, and SubagentStop. SessionStart checks version, proxy health, env key presence, catalog, root, `.dcc` state, rules cache, telemetry, and LSP lazy status. UserPromptSubmit detects workflow keywords and injects directives/rules without logging prompts. PostToolUse runs comment-checker, LSP diagnostics, optional AST-grep, and Boulder evidence hints on edit-like tools. Stop/SubagentStop delegate to continuation checks. Comment-checker must block AI-slop comments with exit code 2 and warn non-blocking if binary missing.
  **Must NOT do**: Do not log user prompt text from UserPromptSubmit.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 16,17 | Blocked By: 4,5,9,11,13

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1039` - hooks design.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1649` - comment checker.
  - Local pattern: `/Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/hooks/hooks.json`
  - Local pattern: `/Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/test/hook-status-message.test.mjs`

  **Tests to write first**:
  - `packages/cli/src/hooks/session-start.test.ts::session_start_outputs_short_status`
  - `packages/cli/src/hooks/user-prompt-submit.test.ts::ultrawork_keyword_injects_directive_without_logging_prompt`
  - `packages/comment-checker-core/src/checker.test.ts::blocks_ai_slop_comment`
  - `packages/cli/src/hooks/post-tool-use.test.ts::edit_like_tool_runs_checker_and_lsp`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/comment-checker-core packages/cli -- --run hook checker` exits 0.
  - [ ] Hook manifest commands point to built dist/CLI paths and include status messages.
  - [ ] Comment checker exit code 2 blocks slop comment fixture.
  - [ ] UserPromptSubmit fixture snapshot contains no raw prompt text.

  **QA Scenarios**:
  ```
  Scenario: PostToolUse blocks AI-slop comment
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t12 'node bin/dcc.mjs hooks post-tool-use --fixture tests/fixtures/hooks/slop-comment.json; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t12 -S -200
    Expected: output contains "Checking Comments", "ai_slop_comment", and "EXIT:2".
    Evidence: .dcc/evidence/<session-id>/task-12-comment-block.txt

  Scenario: UserPromptSubmit does not echo prompt
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t12-error 'node bin/dcc.mjs hooks user-prompt-submit --fixture tests/fixtures/hooks/prompt-with-secret.json; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t12-error -S -200
    Expected: output contains workflow directive summary, not the fixture prompt or secret.
    Evidence: .dcc/evidence/<session-id>/task-12-prompt-redaction.txt
  ```

  **Commit**: YES | Message: `feat(hooks): wire lifecycle checks and comment blocking` | Files: hook CLIs, comment checker, hook tests, `hooks/hooks.json`

- [x] 13. Implement LSP MCP server and diagnostics policy

  **What to do**: Implement `packages/lsp-tools-mcp` with tools `lsp.status`, `lsp.diagnostics`, `lsp.goto_definition`, `lsp.find_references`, `lsp.symbols`, `lsp.prepare_rename`, and `lsp.rename`. MVP support: TypeScript/JavaScript and Python; Rust/Go/JSON/YAML are v1 follow-up in same package if cheap, otherwise documented as planned. Lazy start servers, reuse by workspace root, timeout after 10 seconds, gracefully degrade on missing language server. Post-edit policy blocks new error diagnostics and summarizes warnings.
  **Must NOT do**: Do not hang hook execution when language servers are unavailable.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 12,17 | Blocked By: 3,5

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1535` - LSP MCP tools.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1567` - diagnostics policy.
  - Local pattern: `/Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/components/lsp/src/cli.ts`

  **Tests to write first**:
  - `packages/lsp-tools-mcp/src/diagnostics.test.ts::typescript_fixture_returns_diagnostics`
  - `packages/lsp-tools-mcp/src/status.test.ts::missing_server_returns_graceful_warning`
  - `packages/lsp-tools-mcp/src/rename.test.ts::prepare_rename_blocks_unsafe_position`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/lsp-tools-mcp` exits 0.
  - [ ] `node bin/dcc.mjs lsp diagnostics tests/fixtures/ts-node-app/src/index.ts` returns JSON diagnostics.
  - [ ] Missing Python server fixture exits 0 with warning, not crash.
  - [ ] PostToolUse fixture blocks newly introduced TypeScript error.

  **QA Scenarios**:
  ```
  Scenario: TypeScript diagnostics through CLI/MCP adapter
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t13 'node bin/dcc.mjs lsp diagnostics tests/fixtures/ts-node-app/src/index.ts; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t13 -S -200
    Expected: JSON output includes diagnostics array and EXIT:0.
    Evidence: .dcc/evidence/<session-id>/task-13-ts-diagnostics.txt

  Scenario: Missing server degrades gracefully
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t13-error 'DCC_LSP_DISABLE_PYTHON=1 node bin/dcc.mjs lsp diagnostics tests/fixtures/python-fastapi/app.py; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t13-error -S -200
    Expected: output contains "lsp_unavailable" warning and EXIT:0.
    Evidence: .dcc/evidence/<session-id>/task-13-lsp-unavailable.txt
  ```

  **Commit**: YES | Message: `feat(lsp): add diagnostics mcp server` | Files: `packages/lsp-tools-mcp/`, LSP tests, MCP config

- [x] 14. Implement AST-grep MCP and hashline edit support

  **What to do**: Implement `packages/ast-grep-mcp` with structural search, rewrite, rule testing, language listing, dry-run default, generated/vendor exclusion, and confirmation requirement above 100 changes. Implement `packages/hashline-core` with `hashline.read`, `hashline.apply_patch`, and `hashline.verify`; patches must reject hash mismatch and suggest refresh. Wire both as optional MCP servers controlled by install flags `--no-ast-grep` and `--no-hashline`.
  **Must NOT do**: Do not default structural rewrite to destructive apply mode.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 17 | Blocked By: 3,5

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1586` - AST-grep MCP.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1610` - hashline edit.
  - Codex docs: `https://developers.openai.com/codex/mcp`

  **Tests to write first**:
  - `packages/ast-grep-mcp/src/search.test.ts::finds_typescript_function_by_ast_pattern`
  - `packages/ast-grep-mcp/src/rewrite.test.ts::rewrite_dry_run_is_default`
  - `packages/hashline-core/src/readWithHashes.test.ts::emits_stable_line_hashes`
  - `packages/hashline-core/src/applyHashlinePatch.test.ts::rejects_stale_hash`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/ast-grep-mcp packages/hashline-core` exits 0.
  - [ ] `node bin/dcc.mjs ast-grep search --lang typescript --pattern 'console.log($MSG)' tests/fixtures/ts-node-app` returns matches.
  - [ ] Hashline stale patch fixture fails with `hash_mismatch`.
  - [ ] Installer flags can disable each optional MCP server.

  **QA Scenarios**:
  ```
  Scenario: AST-grep dry-run rewrite
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t14 'node bin/dcc.mjs ast-grep rewrite --lang typescript --pattern \"console.log($MSG)\" --rewrite \"logger.info($MSG)\" tests/fixtures/ts-node-app --dry-run; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t14 -S -200
    Expected: output contains match count, "dry-run", and EXIT:0; fixture files unchanged.
    Evidence: .dcc/evidence/<session-id>/task-14-ast-grep-dry-run.txt

  Scenario: Hashline stale patch rejected
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t14-error 'node bin/dcc.mjs hashline apply --fixture tests/fixtures/hashline/stale.patch; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t14-error -S -200
    Expected: output contains "hash_mismatch" and non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-14-hash-mismatch.txt
  ```

  **Commit**: YES | Message: `feat(mcp): add ast-grep and hashline tools` | Files: `packages/ast-grep-mcp/`, `packages/hashline-core/`, MCP config/tests

- [x] 15. Implement DeepSeek prompt profiles, skills, agents, aliases, and model-routing contracts

  **What to do**: Implement `packages/prompts-core` and plugin `skills/`/`agents/` for DCC planner, executor, verifier, librarian, ultrawork, start-work, loop, init-deep, review-work, remove-ai-slops, programming, frontend-ui-ux, lsp, ast-grep, rules, and comment-checker. Prompts must be DeepSeek-specific, concise, evidence-oriented, bilingual user-facing where needed, and free of GPT/Claude quota assumptions. Alias `$ulw-plan`, `$start-work`, `$ulw-loop`, `ultrawork`, and `ulw` to DCC equivalents.
  **Must NOT do**: Do not expose hidden reasoning or copy GPT/Claude wording that assumes another model family.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 17 | Blocked By: 4,5,9,11

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:879` - prompt harness.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1331` - commands and skills.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1811` - agent TOML profiles.
  - Local pattern: `/Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/skills/ulw-plan/SKILL.md`

  **Tests to write first**:
  - `packages/prompts-core/src/promptContracts.test.ts::planner_profile_forbids_product_code_edits`
  - `packages/prompts-core/src/promptContracts.test.ts::verifier_requires_evidence_before_complete`
  - `tests/unit/plugin/skills.test.ts::all_alias_skills_exist_and_route_to_dcc`
  - `tests/unit/plugin/agents.test.ts::agent_tomls_use_deepseek_proxy_models`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/prompts-core tests/unit/plugin/skills.test.ts tests/unit/plugin/agents.test.ts` exits 0.
  - [ ] All SKILL.md files have valid frontmatter, no TODO placeholders, and correct alias behavior.
  - [ ] Agent TOMLs use `deepseek_proxy` and only `deepseek-v4-pro` / `deepseek-v4-flash`.

  **QA Scenarios**:
  ```
  Scenario: dcc-plan skill renders planner contract
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t15 'node bin/dcc.mjs skills inspect dcc-plan; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t15 -S -200
    Expected: output contains "planner", "Do not edit product code", "plans/<slug>.md", and EXIT:0.
    Evidence: .dcc/evidence/<session-id>/task-15-skill-inspect.txt

  Scenario: Agent profile rejects unknown model slug
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t15-error 'node bin/dcc.mjs plugin validate --fixture tests/fixtures/plugin/bad-agent-model; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t15-error -S -200
    Expected: output contains "unknown_deepseek_model" and non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-15-bad-agent-model.txt
  ```

  **Commit**: YES | Message: `feat(prompts): add deepseek harness skills and agents` | Files: `packages/prompts-core/`, plugin skills/agents, tests

- [x] 16. Implement Boulder state, evidence audit, and Stop continuation gate

  **What to do**: Implement `packages/boulder-state` with `.dcc/boulder.json`, `.dcc/evidence/<session-id>/`, session schema, active session handling, atomic checklist updates, evidence records, command capture, final verification state, Stop/SubagentStop continuation blocking, and concurrent session locking. Only one active session per project by default; concurrent starts require explicit `--session-id` and must use isolated evidence directories.
  **Must NOT do**: Do not mark complete without evidence references for every acceptance item.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: 17,19 | Blocked By: 3,5,12

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1470` - Boulder state/evidence.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1506` - evidence files.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1179` - Stop hook responsibility.

  **Tests to write first**:
  - `packages/boulder-state/src/schema.test.ts::parses_active_session_schema`
  - `packages/boulder-state/src/evidence.test.ts::writes_redacted_command_record`
  - `packages/boulder-state/src/continuation.test.ts::stop_blocks_incomplete_plan`
  - `packages/boulder-state/src/lock.test.ts::second_active_session_requires_explicit_id`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/boulder-state` exits 0.
  - [ ] Stop hook fixture with missing evidence returns block JSON.
  - [ ] Stop hook fixture with complete evidence returns no-op.
  - [ ] Evidence command record includes command, exit code, summary, artifact path, and redacted output.

  **QA Scenarios**:
  ```
  Scenario: Stop blocks incomplete active plan
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t16 'node bin/dcc.mjs hooks stop --fixture tests/fixtures/boulder/incomplete-plan.json; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t16 -S -200
    Expected: output contains hook block JSON and missing evidence item; EXIT indicates blocking per hook contract.
    Evidence: .dcc/evidence/<session-id>/task-16-stop-block.txt

  Scenario: Concurrent session rejected without explicit id
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t16-error 'node bin/dcc.mjs evidence start --plan plans/a.md; node bin/dcc.mjs evidence start --plan plans/b.md; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t16-error -S -200
    Expected: second start contains "active_session_exists" and non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-16-concurrent-session.txt
  ```

  **Commit**: YES | Message: `feat(evidence): add boulder state and stop gate` | Files: `packages/boulder-state/`, hook integration/tests

- [x] 17. Implement `$dcc-plan`, `$dcc-start-work`, `$dcc-loop`, and orchestration evidence

  **What to do**: Implement command/skill flows for planning, start-work, and durable loop. `$dcc-plan` must scan repo, collect rules/LSP context, create `plans/<slug>.md`, register inactive metadata, and never modify product code. `$dcc-start-work` must activate a plan, convert checklist items to atomic tasks, drive implementation with evidence requirements, run post-edit diagnostics/checkers, and require verifier output. `$dcc-loop` must create `.dcc/ulw-loop/<session-id>/{goals.json,evidence.jsonl,notepad.md}` and iterate until criteria complete or blocked. Completion requires `DCC_ORCHESTRATION_COMPLETE` / `DCC_VERIFICATION_COMPLETE` only with evidence.
  **Must NOT do**: Do not mark plan items done solely from green tests.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: 18,19 | Blocked By: 11,12,13,14,15,16

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1381` - `$dcc-plan`.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1421` - `$dcc-start-work`.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1434` - `$dcc-loop`.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1455` - ultrawork directive.

  **Tests to write first**:
  - `packages/cli/src/plan.test.ts::dcc_plan_creates_plan_without_product_diff`
  - `packages/cli/src/startWork.test.ts::start_work_updates_checklist_and_evidence`
  - `packages/cli/src/loop.test.ts::loop_creates_durable_goal_files`
  - `packages/cli/src/verifier.test.ts::verification_complete_requires_evidence`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/cli -- --run plan startWork loop verifier` exits 0.
  - [ ] Fixture `$dcc-plan` produces plan file and zero product-code diff.
  - [ ] Fixture `$dcc-start-work` writes evidence before checking off task.
  - [ ] Fixture `$dcc-loop` creates goal/evidence/notepad files and resumes from state.

  **QA Scenarios**:
  ```
  Scenario: Plan-only flow creates plan and no product diff
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t17 'node bin/dcc.mjs plan "add health endpoint" --cwd tests/fixtures/ts-node-app --no-edit; git -C tests/fixtures/ts-node-app diff --exit-code; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t17 -S -300
    Expected: output contains "plans/" and git diff exits cleanly; EXIT:0.
    Evidence: .dcc/evidence/<session-id>/task-17-plan-only.txt

  Scenario: Start-work refuses plan with no QA scenarios
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t17-error 'node bin/dcc.mjs start-work tests/fixtures/plans/no-qa.md --dry-run; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t17-error -S -200
    Expected: output contains "missing_qa_scenario" and non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-17-missing-qa.txt
  ```

  **Commit**: YES | Message: `feat(loop): add plan start-work and durable loop commands` | Files: `packages/cli/`, `packages/boulder-state/`, plugin skills/tests

- [x] 18. Implement `/init-deep-dcc` project memory generator

  **What to do**: Implement repo scanner and generator for `AGENTS.md`, `.dcc/project-index.json`, `.dcc/rules/{coding-style,testing,architecture,security}.md`, `.dcc/memory/{root-summary,package-map,risk-map}.md`, and optional nested AGENTS files for large subdirectories. Scanner must count files/LOC/package boundaries/tests/public API/migrations/security files/generated files and make uncertainty explicit. Reruns must be idempotent and preserve user edits outside managed sections.
  **Must NOT do**: Do not modify product code or run formatters.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: 19 | Blocked By: 11,13,17

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1255` - project memory.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1286` - analysis criteria.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1300` - forbidden behavior.

  **Tests to write first**:
  - `packages/cli/src/initDeep.test.ts::init_deep_creates_expected_memory_files`
  - `packages/cli/src/initDeep.test.ts::init_deep_rerun_is_idempotent`
  - `packages/cli/src/initDeep.test.ts::init_deep_preserves_user_edited_sections`
  - `packages/cli/src/initDeep.test.ts::init_deep_does_not_touch_product_files`

  **Acceptance Criteria**:
  - [ ] `pnpm test packages/cli -- --run initDeep` exits 0.
  - [ ] `node bin/dcc.mjs init-deep --cwd tests/fixtures/ts-node-app --dry-run` previews all generated files.
  - [ ] Rerun fixture changes only DCC managed sections.
  - [ ] Product source file checksums remain unchanged.

  **QA Scenarios**:
  ```
  Scenario: init-deep dry-run previews memory
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t18 'node bin/dcc.mjs init-deep --cwd tests/fixtures/ts-node-app --dry-run; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t18 -S -300
    Expected: output lists AGENTS.md, .dcc/project-index.json, .dcc/rules, .dcc/memory, and EXIT:0.
    Evidence: .dcc/evidence/<session-id>/task-18-init-deep-dry-run.txt

  Scenario: init-deep refuses generated/vendor-only repo
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t18-error 'node bin/dcc.mjs init-deep --cwd tests/fixtures/generated-only --dry-run; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t18-error -S -200
    Expected: output contains "insufficient_source_context" and non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-18-generated-only.txt
  ```

  **Commit**: YES | Message: `feat(memory): add init-deep-dcc generator` | Files: init-deep scanner/generator/tests, plugin skill

- [x] 19. Complete docs, security hardening, release packaging, and acceptance suite

  **What to do**: Write README and docs required by spec section 28: what DCC is, why not just set model, requirements, install, `DEEPSEEK_API_KEY`, proxy start, Codex usage, commands, Pro vs Flash routing, troubleshooting, security/telemetry, uninstall. Add `docs/{architecture,install,model-routing,provider-proxy,codex-config,troubleshooting,security}.md`, changelog, release workflow, packaging checks, checksum manifest, supply-chain notes, and final acceptance suite. Docs must match actual commands. Release artifact must include CLI bins, package files, plugin bundle, skills, hooks, MCP config, agents, assets, and docs.
  **Must NOT do**: Do not claim live DeepSeek support was verified unless `dcc doctor --live` actually ran with `DEEPSEEK_API_KEY`.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: Final Verification | Blocked By: 1-18

  **References**:
  - Spec: `DeepSeek-Codex-Combo-devspec.md:2255` - docs requirements.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1920` - supply chain.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:1984` - acceptance tests.
  - Spec: `DeepSeek-Codex-Combo-devspec.md:2380` - Definition of Done.

  **Tests to write first**:
  - `tests/unit/docs/readme-contract.test.ts::readme_contains_required_sections`
  - `tests/integration/package/package-contents.test.ts::release_artifact_contains_plugin_and_bins`
  - `tests/integration/security/redaction-snapshots.test.ts::acceptance_logs_contain_no_secrets`
  - `tests/e2e/acceptance/full-fixture-flow.test.ts::fixture_plan_start_work_loop_records_evidence`

  **Acceptance Criteria**:
  - [ ] `pnpm lint` exits 0.
  - [ ] `pnpm typecheck` exits 0.
  - [ ] `pnpm test` exits 0.
  - [ ] `pnpm test:integration` exits 0.
  - [ ] `pnpm test:e2e` exits 0.
  - [ ] `node bin/dcc.mjs install --dry-run --provider-mode=proxy` passes.
  - [ ] `node bin/dcc.mjs install --dry-run --provider-mode=plugin-only` passes.
  - [ ] Mocked smoke chat/tool/stream tests pass.
  - [ ] Secret redaction snapshot passes.
  - [ ] README install guide command snippets are exercised by docs tests.

  **QA Scenarios**:
  ```
  Scenario: Full fixture acceptance without live API
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t19 'pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t19 -S -1000
    Expected: all commands exit 0 and output contains final EXIT:0.
    Evidence: .dcc/evidence/<session-id>/task-19-full-suite.txt

  Scenario: Live doctor is skipped safely without API key
    Tool: tmux
    Steps: tmux new-session -d -s dcc-qa-t19-error 'unset DEEPSEEK_API_KEY; node bin/dcc.mjs doctor --live; echo EXIT:$?'; tmux capture-pane -pt dcc-qa-t19-error -S -200
    Expected: output contains "DEEPSEEK_API_KEY required for --live" and no network smoke is attempted; non-zero EXIT.
    Evidence: .dcc/evidence/<session-id>/task-19-live-without-key.txt
  ```

  **Commit**: YES | Message: `docs(release): document and package verified dcc v1` | Files: docs, README, release workflow, packaging tests, acceptance tests

## Final Verification Wave (MANDATORY - after ALL implementation tasks)
> ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing implementation.
- [ ] F1. Plan Compliance Audit
  - Verify every plan task has a corresponding commit/diff section, tests, QA evidence, and acceptance results.
  - Command: `node bin/dcc.mjs evidence audit --plan plans/deepseek-codex-combo.md --strict`
  - Evidence: `.dcc/evidence/<session-id>/final-plan-compliance.txt`
- [ ] F2. Code Quality Review
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`.
  - Run TypeScript no-excuse audit from OMO programming skill if available.
  - Evidence: `.dcc/evidence/<session-id>/final-quality-gates.txt`
- [ ] F3. Real Manual QA
  - Start mock DeepSeek, start proxy, run `curl -i /healthz`, `/v1/models`, non-stream `/v1/responses`, stream `/v1/responses`, install dry-runs, doctor fixture, and plan/start-work/loop fixture.
  - Evidence: `.dcc/evidence/<session-id>/final-manual-qa.md`
- [ ] F4. Scope Fidelity Check
  - Verify no Codex core patching, no persisted secrets, no provider/auth writes in project `.codex/config.toml`, no product-code edit from plan/init-deep commands, and no live API claim without live evidence.
  - Evidence: `.dcc/evidence/<session-id>/final-scope-fidelity.txt`
- [ ] F5. Security/Redaction Review
  - Search logs/evidence/docs/package output for `DEEPSEEK_API_KEY`, `Authorization`, `sk-`, raw prompt fixtures, raw reasoning fixtures, local absolute user paths, emails, and git remotes.
  - Evidence: `.dcc/evidence/<session-id>/final-security-redaction.txt`
- [ ] F6. Reviewer Gate
  - Submit diff, evidence ledger, and plan compliance summary to a final reviewer. All findings must be fixed and verification rerun before completion.
  - Evidence: `.dcc/evidence/<session-id>/final-reviewer-approval.md`

## Commit Strategy
- Use atomic Conventional Commits: `chore`, `feat`, `fix`, `test`, `docs`, `build`, `ci`, `refactor`.
- Do not auto-commit unless the user explicitly authorizes commits in the implementation session.
- If commits are authorized, each commit must pass its task's tests before moving on.
- Final commit footer for implementation commits: `Plan: plans/deepseek-codex-combo.md`.
- Keep live API evidence out of commits unless it is redacted and intentionally documented.

## Success Criteria
- The final repository implements the full spec-defined v1 path with proxy mode and plugin-only mode.
- Native mode is safely probe-gated and cannot write unsupported Codex config.
- Installation and uninstallation are idempotent and reversible.
- Codex plugin bundle validates under current tooling or records the supported fallback hook declaration mechanism.
- Proxy handles text, streaming, tool calls, reasoning continuation, retries, error mapping, auth forwarding, and redaction.
- Model routing uses only `deepseek-v4-pro` and `deepseek-v4-flash` with deterministic Pro/Flash decisions and fallbacks.
- Rules, hooks, comment-checker, LSP, AST-grep, hashline, Boulder, evidence, and project memory are all tested against fixtures.
- Docs match the actual CLI and do not require source reading for install/troubleshooting.
- Default CI passes without network or live API key.
