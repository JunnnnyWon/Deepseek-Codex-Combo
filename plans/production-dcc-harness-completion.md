# Production DCC Harness Completion

## TL;DR
> **Summary**: Finish DeepSeek-Codex-Combo as a production-local Codex harness that can be used like LazyCodex/OmO plus Reasonix: safe install/uninstall, executable plugin hooks/MCP, real DeepSeek proxy, live diagnostics, and sandbox-to-release acceptance.
> **Deliverables**:
> - Side-effect-free CLI help and safer command parsing.
> - Reversible installer/uninstaller with managed-file inventory, rollback, and sandbox-first validation.
> - Real DeepSeek upstream provider for `/v1/responses` and explicit behavior for `/v1/chat/completions`.
> - Working `dist/bin/dcc.mjs` plugin runtime for hooks and MCP servers.
> - Live-gated `doctor --live`, cache diagnostics, reasoning policy, proxy lifecycle, and release artifact acceptance.
> - Documentation and security guidance for real use without damaging the original `~/.codex`.
> **Effort**: XL
> **Parallel**: YES - 5 waves
> **Critical Path**: Task 1 -> Task 2 + Task 3 -> Task 4 + Task 5 -> Task 9 + Task 12 -> Final Verification

## Context
### Original Request
User asked: "이걸 내가 실제 lazycodex, ohmyopenagent, reasonix 처럼 쓰고싶어. 그걸 위해 완성해야해."

### Interview Summary
- Default target is a production-local v1: installable into a sandbox HOME, executable as a copied plugin bundle, and then safe enough for real `~/.codex` use.
- No unsupported Codex native provider assumptions. Default provider mode remains local Responses-compatible proxy.
- Live DeepSeek API use is allowed only for small smoke tests gated by `DEEPSEEK_API_KEY`; no high-volume benchmarking.
- Original `~/.codex` must be protected by sandbox-first QA, backups, redaction, and reversible uninstall.
- The previous live probe already proved the API key path works: `/models` returned `deepseek-v4-flash` and `deepseek-v4-pro`; thinking-disabled chat returned `DCC_SMOKE_OK`; repeated stable-prefix calls produced cache hit/miss; `normalizeDeepSeekUsage` handled live usage.

### Metis Review (gaps addressed)
- Scope ambiguity resolved by making v1 require all first-use surfaces: install, proxy start, real DeepSeek request, plugin hook/MCP execution, cache diagnostics, uninstall, and release package acceptance.
- Runtime boundary fixed: plugin commands must run from `plugins/deepseek-codex-combo/dist/bin/dcc.mjs` after packaging, not from source-tree-only paths.
- Proxy blocker fixed: add a real DeepSeek HTTPS provider because current `proxy start` only wires `--mock-upstream`.
- Installer safety fixed: subcommand help must be side-effect free; uninstall must remove all managed files and config blocks; apply path must be rollback-safe.
- Reasonix compatibility fixed: v1 must explicitly handle thinking/reasoning policy and must not round-trip or leak `reasoning_content`.
- Live QA bounded: one `/models`, one non-stream chat, one stable-prefix cache pair, and optionally one live proxy call.

## Work Objectives
### Core Objective
Make this repository usable as a real local Codex harness: install it into a clean Codex home, start the proxy, route Codex-shaped Responses requests to DeepSeek, run plugin hooks/MCP commands from the installed plugin bundle, observe cache/reasoning behavior, and uninstall without damaging user state.

### Deliverables
- `bin/dcc.mjs` command parser and subcommand help safety.
- `packages/codex-installer` managed inventory, rollback, uninstall, sandbox guards, and tests.
- `packages/provider-proxy` real DeepSeek upstream provider, live model provider, explicit chat completions behavior, stream support, and retry/error policy.
- `packages/cli` enhanced doctor, proxy lifecycle, release/package install acceptance, and live smoke commands.
- `plugins/deepseek-codex-combo/dist/bin/dcc.mjs` build output and package runtime contract.
- Hook/MCP/plugin E2E tests from a copied plugin root.
- Docs for sandbox test, real install, live test, key handling, rollback, and cache diagnostics.

### Definition of Done
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `node /Users/junnnny/.codex/plugins/cache/sisyphuslabs/omo/0.1.0/skills/programming/scripts/typescript/check-no-excuse-rules.ts .`
- `node bin/dcc.mjs install --help` and every top-level command `--help` exit 0 and write no files.
- Sandbox install -> real proxy start -> `/healthz` -> `/v1/responses` mock -> uninstall leaves no DCC-managed files.
- Gated live smoke with `.dcc/secrets/deepseek.env`: `/models`, one thinking-disabled chat, one cache repeat pair, and one DCC proxy `/v1/responses` call pass without leaking the key.
- Release package can be copied to a temp HOME and run plugin hook/MCP commands through `dist/bin/dcc.mjs`.

### Must Have
- Side-effect-free `--help` for `dcc <command> --help` and known subcommands.
- Real upstream provider for `https://api.deepseek.com/chat/completions`.
- Upstream model provider for `https://api.deepseek.com/models` with local fallback.
- `DEEPSEEK_API_KEY` read only from environment; never written to config, logs, evidence, or release artifacts.
- `thinking: { type: "disabled" }` default for compatibility unless reasoning mode is explicitly requested.
- Existing cache usage and prefix diagnostics preserved and connected to real proxy responses.
- Installed plugin hook and MCP commands run from `${PLUGIN_ROOT}/dist/bin/dcc.mjs`.
- Uninstall removes only DCC-managed files/blocks and preserves user-authored config plus `.dcc/evidence`.
- All live tests are opt-in and bounded.

### Must NOT Have
- No direct mutation of the real `~/.codex` during normal tests.
- No unsupported native provider mode.
- No raw prompt, source text, authorization header, API key, or raw `reasoning_content` in logs/evidence.
- No paid benchmark loops or unbounded live calls.
- No plugin manifest pointing to files absent from the release artifact.
- No source-tree-only dependency for installed plugin execution.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: TDD with Vitest for implementation tasks; every behavior change starts with a failing test or reproduction.
- QA policy: Every task has agent-executed happy and failure scenarios.
- Evidence: save outputs under `evidence/production-dcc/task-{N}-{slug}.txt`.
- Live policy: use `.dcc/secrets/deepseek.env` only when present; skip live tasks with a clear `live_skipped_no_secret` artifact otherwise.

## Execution Strategy
### Parallel Execution Waves
Wave 1: Task 1 command safety, Task 2 managed inventory/uninstall, Task 3 dist runtime build contract.
Wave 2: Task 4 real upstream provider, Task 5 proxy lifecycle, Task 6 doctor live checks, Task 7 reasoning policy.
Wave 3: Task 8 live streaming and chat completions endpoint policy, Task 9 plugin hooks/MCP E2E, Task 10 rules/LSP/AST/hashline installed smoke.
Wave 4: Task 11 sandbox Codex profile acceptance, Task 12 release package install acceptance, Task 13 docs/security/runbooks.
Wave 5: Task 14 end-to-end live cache diagnostics, Task 15 cleanup hardening and regression sweep.

### Dependency Matrix
- Task 1 blocks Tasks 2, 5, 6, 11, 12.
- Task 2 blocks Tasks 11, 12, 15.
- Task 3 blocks Tasks 9, 10, 12.
- Task 4 blocks Tasks 5, 6, 8, 11, 14.
- Task 5 blocks Tasks 6, 11, 14.
- Task 6 blocks Tasks 11, 14.
- Task 7 blocks Tasks 8, 11, 14.
- Task 8 blocks Task 14.
- Task 9 blocks Tasks 10, 12.
- Task 10 blocks Task 12.
- Task 11 blocks Task 15.
- Task 12 blocks Task 15.
- Task 13 can run after Tasks 1-7 contracts are stable.
- Task 14 blocks Final Verification.
- Task 15 blocks Final Verification.

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: References + Acceptance Criteria + QA Scenarios.

- [x] 1. Make CLI Help And Parsing Side-Effect Safe

  **What to do**: Refactor `bin/dcc.mjs` command routing so `dcc --help`, `dcc <command> --help`, and supported subcommand help all print usage and exit 0 before any command side effects. Add a small shared command parser helper inside `bin/dcc.mjs` or a new `packages/cli/src/commandHelp.ts` if file size requires splitting. Cover at least `install`, `uninstall`, `doctor`, `proxy`, `package`, `hooks`, `lsp`, `ast-grep`, `hashline`, `start-work`, `loop`, and `init-deep`. Invalid commands must still exit 1. Invalid flags must still exit nonzero after help has been handled.

  **Must NOT do**: Do not run install/uninstall/package/proxy code paths for any `--help` invocation. Do not mutate files in help tests.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Tasks 2, 5, 6, 11, 12 | Blocked By: none

  **References**:
  - Pattern: `bin/dcc.mjs:61` - only top-level help is currently handled.
  - Risk: `bin/dcc.mjs:99` - `install --help` currently enters install path.
  - Test pattern: `tests/e2e/cli/help.test.ts:1` - existing CLI help test style.
  - Regression incident: accidental `install --help` mutated real `~/.codex`; add this as a named regression test.

  **Acceptance Criteria**:
  - [ ] `pnpm test -- tests/e2e/cli/help.test.ts tests/e2e/cli/install.test.ts -- --run "help|install_help|uninstall_help"` passes.
  - [ ] `node bin/dcc.mjs install --help` exits 0 and does not create `.codex/config.toml` in a temp HOME.
  - [ ] `node bin/dcc.mjs uninstall --help` exits 0 and does not modify an existing temp config.
  - [ ] `node bin/dcc.mjs proxy start --help` exits 0 and does not bind a port.

  **QA Scenarios**:
  ```text
  Scenario: Install help is side-effect free
    Tool: bash
    Steps: HOME=$(mktemp -d); node bin/dcc.mjs install --help --home "$HOME"; find "$HOME" -maxdepth 3 -type f
    Expected: exit 0, usage text present, no files under "$HOME".
    Evidence: evidence/production-dcc/task-1-install-help.txt

  Scenario: Proxy start help does not bind
    Tool: bash
    Steps: node bin/dcc.mjs proxy start --help; curl -fsS http://127.0.0.1:41473/healthz
    Expected: help exits 0; curl fails because no proxy was started.
    Evidence: evidence/production-dcc/task-1-proxy-help.txt
  ```

  **Commit**: YES | Message: `fix(cli): make subcommand help side-effect free` | Files: `bin/dcc.mjs`, `packages/cli/src/*` if split, `tests/e2e/cli/help.test.ts`

- [x] 2. Make Install And Uninstall Fully Reversible

  **What to do**: Extend installer to maintain an explicit managed inventory: provider config block, plugin MCP block, plugin cache path, marketplace file, agent files, profile files, and autostart files. Implement rollback for partial install failures. Implement uninstall apply so it removes all managed files/directories and config blocks, but preserves `.dcc/evidence` and non-DCC user files. Add idempotency tests for install twice, uninstall twice, and install->uninstall->install. Keep `--home` sandbox support mandatory.

  **Must NOT do**: Do not delete files not created by DCC. Do not remove user-authored Codex config outside DCC managed markers.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Tasks 11, 12, 15 | Blocked By: Task 1 for final CLI QA

  **References**:
  - Current install writes: `packages/codex-installer/src/install.ts:112` - config, plugin cache, marketplace, agent, profile writes.
  - Current uninstall gap: `packages/codex-installer/src/uninstall.ts:32` - `plannedRemovals` exists but apply path only writes config.
  - Config block pattern: `packages/codex-installer/src/configToml.ts`.
  - Tests: `packages/codex-installer/src/install.test.ts`, `packages/codex-installer/src/uninstall.test.ts`, `tests/e2e/cli/install.test.ts`.

  **Acceptance Criteria**:
  - [ ] Install writes only paths under the provided `--home`.
  - [ ] Uninstall removes plugin cache, marketplace file, generated DCC agents/profiles, provider block, plugin MCP block, and autostart files.
  - [ ] Uninstall preserves `.dcc/evidence` and unrelated `.codex` files.
  - [ ] Partial install failure rolls back files created during that attempt.
  - [ ] `pnpm test -- packages/codex-installer tests/e2e/cli/install.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Sandbox install then uninstall leaves no DCC managed files
    Tool: bash
    Steps: HOME=$(mktemp -d); node bin/dcc.mjs install --home "$HOME" --provider-mode=proxy --no-tui; node bin/dcc.mjs uninstall --home "$HOME"; rg -n "DCC managed|deepseek_proxy|deepseek-codex-combo" "$HOME/.codex" || true
    Expected: no DCC markers or files remain except preserved .dcc evidence.
    Evidence: evidence/production-dcc/task-2-uninstall-clean.txt

  Scenario: User files are preserved
    Tool: bash
    Steps: create "$HOME/.codex/profiles/user.toml" and "$HOME/.dcc/evidence/keep.txt"; install and uninstall.
    Expected: user.toml and keep.txt still exist; DCC files are gone.
    Evidence: evidence/production-dcc/task-2-preserve-user-files.txt
  ```

  **Commit**: YES | Message: `fix(installer): make uninstall fully reversible` | Files: `packages/codex-installer/src/*`, `tests/e2e/cli/install.test.ts`

- [x] 3. Add Executable Dist Runtime For Plugin Hooks And MCP

  **What to do**: Add a build/package step that creates `plugins/deepseek-codex-combo/dist/bin/dcc.mjs` and any runtime files it imports. Use a deterministic Node-compatible bundle or copy strategy that works from a copied plugin root without relying on the source checkout. Update `pnpm build` and `node bin/dcc.mjs package` so the release artifact includes this runtime. Add smoke tests that run `node <temp-plugin-root>/dist/bin/dcc.mjs --help`, `hooks session-start`, `lsp mcp` list-tools handshake or minimal JSON-RPC initialize, `ast-grep mcp`, and `hashline mcp`.

  **Must NOT do**: Do not leave plugin manifests pointing at absent files. Do not require TypeScript loader support in installed plugin runtime unless bundled and tested.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Tasks 9, 10, 12 | Blocked By: none

  **References**:
  - Plugin hook commands: `plugins/deepseek-codex-combo/hooks/hooks.json:1` - all hooks call `dist/bin/dcc.mjs`.
  - MCP commands: `plugins/deepseek-codex-combo/.mcp.json:1` - all MCP servers call `dist/bin/dcc.mjs`.
  - Current package build no-op: `plugins/deepseek-codex-combo/package.json:1`.
  - Release packaging source-only contract: `packages/cli/src/releasePackage.ts:39`.
  - OmO reference: `oh-my-openagent` package smoke verifies real `dist/cli.js` hook and MCP entrypoints.

  **Acceptance Criteria**:
  - [ ] `pnpm build` creates `plugins/deepseek-codex-combo/dist/bin/dcc.mjs`.
  - [ ] The dist CLI runs from a copied temp plugin root with no source-tree path assumptions.
  - [ ] Release manifest includes dist runtime files and checksums.
  - [ ] `pnpm test -- tests/integration/package/package-contents.test.ts tests/unit/plugin/hooks-manifest.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Copied plugin root runs dist CLI
    Tool: bash
    Steps: pnpm build; TMP=$(mktemp -d); cp -R plugins/deepseek-codex-combo "$TMP/plugin"; node "$TMP/plugin/dist/bin/dcc.mjs" --help
    Expected: exits 0 and prints DCC usage.
    Evidence: evidence/production-dcc/task-3-dist-cli.txt

  Scenario: Packaged hook command executes
    Tool: bash
    Steps: run copied `dist/bin/dcc.mjs hooks session-start`.
    Expected: output contains "DCC: ready" and no source checkout path is required.
    Evidence: evidence/production-dcc/task-3-hook-runtime.txt
  ```

  **Commit**: YES | Message: `feat(plugin): ship executable dist runtime` | Files: `package.json`, `plugins/deepseek-codex-combo/package.json`, `packages/cli/src/releasePackage.ts`, build scripts/tests

- [x] 4. Implement Real DeepSeek Chat Completion Provider

  **What to do**: Add `packages/provider-proxy/src/deepseekProvider.ts` with `createDeepSeekChatCompletionProvider(options)` and `createDeepSeekModelListProvider(options)`. Use `fetch` only behind a provider boundary with `AbortSignal.timeout`, explicit content-type, Authorization forwarding from `ProxyRequestContext`, JSON parsing through Zod, redacted typed errors, and bounded retries for 429/5xx using existing retry policy. Default base URL is `https://api.deepseek.com`; default chat path is `/chat/completions`; default models path is `/models`. Wire `bin/dcc.mjs proxy start` so absence of `--mock-upstream` uses the real provider.

  **Must NOT do**: Do not log or persist API keys. Do not call live DeepSeek in normal unit/CI tests. Do not bypass existing Responses-to-Chat conversion.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Tasks 5, 6, 8, 11, 14 | Blocked By: none

  **References**:
  - Current provider injection: `packages/provider-proxy/src/server.ts:30`.
  - Current missing provider failure: `packages/provider-proxy/src/server.ts:150`.
  - Mock pattern: `packages/provider-proxy/src/mockUpstream.ts`.
  - Error mapping: `packages/provider-proxy/src/errors.ts`.
  - Retry policy: `packages/provider-proxy/src/retry.ts`.
  - External DeepSeek contract: `docs/external-contracts.md:32`.

  **Acceptance Criteria**:
  - [ ] Mock HTTP server test proves provider posts to `/chat/completions` with redacted Authorization handling.
  - [ ] 401/403 maps to auth failure without key leakage.
  - [ ] 429/5xx retries are bounded and observable.
  - [ ] `proxy start` without `--mock-upstream` no longer returns `upstream_required` when `DEEPSEEK_API_KEY` is supplied.
  - [ ] `pnpm test -- packages/provider-proxy/src/deepseekProvider.test.ts packages/provider-proxy/src/server.test.ts tests/e2e/cli/proxy-live.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Real provider against local mock server
    Tool: bash
    Steps: Start a local HTTP mock that asserts Authorization header is present and returns a DeepSeek chat completion; run proxy /v1/responses through real provider base URL override.
    Expected: response.completed with normalized usage and no key in stdout/stderr.
    Evidence: evidence/production-dcc/task-4-provider-mock.txt

  Scenario: Auth failure is redacted
    Tool: bash
    Steps: Mock upstream returns 401 body containing no key; call /v1/responses with Bearer sk-test-secret.
    Expected: non-2xx mapped error contains auth failure and does not contain sk-test-secret.
    Evidence: evidence/production-dcc/task-4-auth-redaction.txt
  ```

  **Commit**: YES | Message: `feat(proxy): add real deepseek upstream provider` | Files: `packages/provider-proxy/src/deepseekProvider.ts`, tests, `bin/dcc.mjs`

- [x] 5. Implement Managed Proxy Lifecycle

  **What to do**: Replace placeholder `proxy status` and `proxy stop` with a managed local process record under `.dcc/proxy/<home-hash-or-port>.json` or the sandbox HOME equivalent. `proxy start` should support foreground mode for tests and background mode for real use; status should check PID plus `/healthz`; stop should terminate only the recorded DCC process. Keep loopback default and remote bind refusal. Add port conflict detection and clear error messages.

  **Must NOT do**: Do not kill arbitrary node processes. Do not bind remote hosts without `--allow-remote-bind` and token auth.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Tasks 6, 11, 14 | Blocked By: Tasks 1, 4

  **References**:
  - Placeholder status/stop: `bin/dcc.mjs:767`.
  - Server start: `packages/provider-proxy/src/server.ts:225`.
  - Bind safety: `packages/provider-proxy/src/bind.ts`.
  - Existing proxy tests: `packages/provider-proxy/src/bind.test.ts`, `packages/provider-proxy/src/server.test.ts`.

  **Acceptance Criteria**:
  - [ ] `dcc proxy start --background --home <sandbox>` writes a PID/state file and returns.
  - [ ] `dcc proxy status --home <sandbox>` reports running and health URL.
  - [ ] `dcc proxy stop --home <sandbox>` stops that PID and removes or marks state.
  - [ ] Port conflict exits nonzero with no stale state file.
  - [ ] `pnpm test -- tests/e2e/cli/proxy-lifecycle.test.ts packages/provider-proxy/src/bind.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Background proxy lifecycle
    Tool: bash
    Steps: HOME=$(mktemp -d); node bin/dcc.mjs proxy start --home "$HOME" --background --port 41476 --mock-upstream tests/fixtures/proxy/text-response.json; node bin/dcc.mjs proxy status --home "$HOME"; curl -fsS http://127.0.0.1:41476/healthz; node bin/dcc.mjs proxy stop --home "$HOME"
    Expected: status running before stop, health 200, status stopped after stop.
    Evidence: evidence/production-dcc/task-5-proxy-lifecycle.txt

  Scenario: Stop refuses unknown process
    Tool: bash
    Steps: create fake state with nonexistent PID; run proxy stop.
    Expected: reports stale state cleaned, no unrelated process killed.
    Evidence: evidence/production-dcc/task-5-stale-pid.txt
  ```

  **Commit**: YES | Message: `feat(cli): manage local proxy lifecycle` | Files: `bin/dcc.mjs`, `packages/cli/src/proxyLifecycle.ts`, tests

- [x] 6. Upgrade Doctor Into A Real Readiness Gate

  **What to do**: Make `doctor` verify Node, user config, DCC plugin install, profile/provider block, proxy status, `/healthz`, `/v1/models`, MCP command executability, hook command executability, and optional live DeepSeek checks. `doctor --live` must perform bounded `/models` and one thinking-disabled chat completion using `DEEPSEEK_API_KEY`, plus proxy `/v1/responses` when proxy is running. Output must be concise and redacted.

  **Must NOT do**: Do not claim live success from key presence only. Do not print API keys, prompt text from fixtures, home paths, or raw reasoning.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Tasks 11, 14 | Blocked By: Tasks 1, 4, 5

  **References**:
  - Current doctor only checks key presence: `packages/cli/src/doctor.ts:44`.
  - Existing tests: `packages/cli/src/doctor.test.ts`.
  - Security docs: `docs/security.md`.
  - Prior live evidence: `/models` and `DCC_SMOKE_OK` worked with thinking disabled.

  **Acceptance Criteria**:
  - [ ] `doctor --live` without key exits 3 and says key required.
  - [ ] `doctor --live` with key calls real `/models` and one minimal chat.
  - [ ] `doctor --strict` exits nonzero for missing plugin dist runtime or proxy down.
  - [ ] All doctor output is redacted.
  - [ ] `pnpm test -- packages/cli/src/doctor.test.ts tests/e2e/cli/doctor-live.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Live doctor bounded smoke
    Tool: bash
    Steps: source .dcc/secrets/deepseek.env; node bin/dcc.mjs doctor --home "$SANDBOX" --live
    Expected: exits 0 only if DeepSeek /models, minimal chat, config, and proxy checks pass; no key in output.
    Evidence: evidence/production-dcc/task-6-live-doctor.txt

  Scenario: Missing key fails closed
    Tool: bash
    Steps: env -u DEEPSEEK_API_KEY node bin/dcc.mjs doctor --home "$SANDBOX" --live
    Expected: exit 3; contains DEEPSEEK_API_KEY required; no success lines.
    Evidence: evidence/production-dcc/task-6-live-doctor-no-key.txt
  ```

  **Commit**: YES | Message: `feat(doctor): verify live deepseek readiness` | Files: `packages/cli/src/doctor.ts`, `bin/dcc.mjs`, tests

- [x] 7. Define And Enforce DeepSeek Thinking/Reasoning Policy

  **What to do**: Add an explicit policy in `responsesToChat` and provider options: default `thinking: { type: "disabled" }` for Codex compatibility and short smoke calls; allow opt-in reasoning for configured categories or request metadata. Ensure `reasoning_content` is never logged, never included in durable evidence, and not round-tripped unless tool continuation requires it and tests prove DeepSeek accepts the exact continuation shape. Add errors for unsupported reasoning/tool states.

  **Must NOT do**: Do not silently upload prior raw `reasoning_content` in normal history. Do not expose hidden reasoning in response text or logs.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Tasks 8, 11, 14 | Blocked By: Task 4

  **References**:
  - Current reasoning store: `packages/provider-proxy/src/reasoningStore.ts`.
  - Tool continuation helper: `packages/provider-proxy/src/tools.ts`.
  - Stream parser redaction: `packages/provider-proxy/src/stream.ts`.
  - External Reasonix reference: DeepSeek Reasonix tests guard against re-sending `reasoning_content` and cache inflation.

  **Acceptance Criteria**:
  - [ ] Default transformed DeepSeek requests include thinking disabled or equivalent policy for supported models.
  - [ ] Opt-in reasoning stores opaque references only.
  - [ ] Tool continuation tests cover accepted and expired reference paths.
  - [ ] Redaction tests prove no `reasoning_content` in logs/evidence/CLI output.
  - [ ] `pnpm test -- packages/provider-proxy/src/responsesToChat.test.ts packages/provider-proxy/src/reasoningStore.test.ts packages/provider-proxy/src/tools.test.ts packages/provider-proxy/src/stream.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Default smoke returns content, not reasoning-only output
    Tool: bash
    Steps: source .dcc/secrets/deepseek.env; send minimal request through real provider with default policy.
    Expected: content contains DCC_SMOKE_OK and no reasoning_content is emitted.
    Evidence: evidence/production-dcc/task-7-thinking-disabled.txt

  Scenario: Expired reasoning reference fails safely
    Tool: bash
    Steps: run targeted tool continuation expired-reference test.
    Expected: typed adapter error without raw reasoning text.
    Evidence: evidence/production-dcc/task-7-reasoning-expired.txt
  ```

  **Commit**: YES | Message: `feat(proxy): enforce deepseek reasoning policy` | Files: `packages/provider-proxy/src/*`, tests

- [x] 8. Implement Streaming And Chat-Completions Endpoint Policy For Real Upstream

  **What to do**: Decide and implement explicit behavior for `POST /v1/chat/completions`: either route it to DeepSeek real upstream with auth and redaction, or return `501 unsupported_endpoint` with docs. For `/v1/responses` streaming, support DeepSeek SSE when `stream: true` by forwarding stream chunks through existing `mapDeepSeekSseToResponsesEvents`, including `response.usage` chunks. Keep non-stream default stable.

  **Must NOT do**: Do not leave `/v1/chat/completions` as an echo endpoint. Do not leak `reasoning_content` through streamed events.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: Task 14 | Blocked By: Tasks 4, 7

  **References**:
  - Echo endpoint gap: `packages/provider-proxy/src/server.ts:208`.
  - Stream transform: `packages/provider-proxy/src/stream.ts`.
  - Stream tests: `packages/provider-proxy/src/stream.test.ts`.
  - Fixture CLI: `packages/provider-proxy/src/fixtureTransform.ts`.

  **Acceptance Criteria**:
  - [ ] `/v1/chat/completions` no longer echoes request bodies.
  - [ ] `/v1/responses` stream mode emits valid Responses SSE events from a mock upstream SSE stream.
  - [ ] Stream usage chunk is emitted before `response.completed`.
  - [ ] Reasoning content is absent from stream output.
  - [ ] `pnpm test -- packages/provider-proxy/src/server-stream.test.ts packages/provider-proxy/src/stream.test.ts tests/e2e/cli/proxy-stream.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Chat completions endpoint is explicit
    Tool: curl
    Steps: Start proxy and POST /v1/chat/completions with a sentinel body.
    Expected: either real upstream-shaped response or 501 unsupported; never echoes sentinel body.
    Evidence: evidence/production-dcc/task-8-chat-completions-policy.txt

  Scenario: Responses streaming through proxy
    Tool: curl
    Steps: Start proxy with mock SSE upstream; POST /v1/responses stream true.
    Expected: SSE contains response.created, deltas, response.usage when present, response.completed.
    Evidence: evidence/production-dcc/task-8-responses-stream.txt
  ```

  **Commit**: YES | Message: `feat(proxy): support explicit live stream behavior` | Files: `packages/provider-proxy/src/server.ts`, stream/provider tests

- [x] 9. Verify Installed Plugin Hooks Execute From Packaged Runtime

  **What to do**: Add integration tests that install into a temp HOME from the built plugin bundle, then execute commands exactly as Codex hook manifest declares them. Validate `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `PostCompact`, `Stop`, and `SubagentStop`. Use fixture JSON payloads and assert exit codes, status messages, redaction, and continuation blocking.

  **Must NOT do**: Do not test only source-tree `bin/dcc.mjs`. Do not bypass `plugins/deepseek-codex-combo/hooks/hooks.json`.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: Tasks 10, 12 | Blocked By: Task 3

  **References**:
  - Hook manifest: `plugins/deepseek-codex-combo/hooks/hooks.json`.
  - Hook CLI implementation: `packages/cli/src/hooks/lifecycle.ts`.
  - Existing hook E2E: `tests/e2e/cli/hooks.test.ts`.
  - OmO reference: hook status tests verify registered hook command strings and status messages.

  **Acceptance Criteria**:
  - [ ] Each manifest hook command runs from copied plugin root.
  - [ ] PostToolUse blocks slop comment and LSP error.
  - [ ] UserPromptSubmit injects workflow directive without echoing prompt.
  - [ ] Stop/SubagentStop block incomplete Boulder state and approve complete state.
  - [ ] `pnpm test -- tests/integration/plugin/hooks-runtime.test.ts tests/e2e/cli/hooks.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Hook manifest commands execute from installed plugin
    Tool: bash
    Steps: build plugin dist; copy plugin to temp HOME; parse hooks.json; run every command with matching fixture.
    Expected: expected exit codes and no missing dist/bin errors.
    Evidence: evidence/production-dcc/task-9-hooks-runtime.txt

  Scenario: Stop continuation blocks missing evidence
    Tool: bash
    Steps: run installed stop hook with incomplete Boulder fixture.
    Expected: exit 2 and JSON reason missing_evidence.
    Evidence: evidence/production-dcc/task-9-stop-continuation.txt
  ```

  **Commit**: YES | Message: `test(plugin): verify installed hook runtime` | Files: plugin runtime tests, hook fixtures if needed

- [x] 10. Verify Installed MCP Servers And Local Tooling

  **What to do**: Add installed-runtime tests for `dcc-lsp`, `dcc-ast-grep`, and `dcc-hashline` MCP commands from `plugins/deepseek-codex-combo/.mcp.json`. For each server, perform a minimal JSON-RPC initialize/list-tools or equivalent protocol smoke. Verify optional MCP flags install/omit declarations correctly. Include LSP unavailable fallback and AST-grep/hashline safety checks.

  **Must NOT do**: Do not require globally installed language servers for the smoke; missing server must be graceful.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: Task 12 | Blocked By: Tasks 3, 9

  **References**:
  - MCP manifest: `plugins/deepseek-codex-combo/.mcp.json`.
  - LSP MCP server: `packages/lsp-tools-mcp/src/mcp.ts`.
  - AST-grep MCP: `packages/ast-grep-mcp/src/mcp.ts`.
  - Hashline MCP: `packages/hashline-core/src/mcp.ts`.
  - Existing tests: `packages/lsp-tools-mcp/src/mcp.test.ts`, `packages/ast-grep-mcp/src/search.test.ts`, `packages/hashline-core/src/readWithHashes.test.ts`.

  **Acceptance Criteria**:
  - [ ] Installed `dcc-lsp` lists required tools.
  - [ ] Installed `dcc-ast-grep` dry-run rewrite does not modify files by default.
  - [ ] Installed `dcc-hashline` rejects stale hashes.
  - [ ] Install flags `--no-ast-grep` and `--no-hashline` omit optional MCP declarations.
  - [ ] `pnpm test -- tests/integration/plugin/mcp-runtime.test.ts packages/lsp-tools-mcp packages/ast-grep-mcp packages/hashline-core` passes.

  **QA Scenarios**:
  ```text
  Scenario: MCP list-tools from installed plugin root
    Tool: bash
    Steps: run JSON-RPC initialize/tools/list against each manifest command.
    Expected: required tool names are present and process exits cleanly.
    Evidence: evidence/production-dcc/task-10-mcp-list-tools.txt

  Scenario: Optional MCP omitted
    Tool: bash
    Steps: install --home "$HOME" --provider-mode=plugin-only --no-ast-grep --no-hashline; inspect generated config.
    Expected: dcc-lsp only; no ast-grep/hashline entries.
    Evidence: evidence/production-dcc/task-10-optional-mcp.txt
  ```

  **Commit**: YES | Message: `test(plugin): verify installed mcp runtime` | Files: MCP runtime tests, installer config tests

- [x] 11. Add Sandbox Codex Profile Acceptance

  **What to do**: Create an acceptance harness that uses a temp HOME, installs DCC, starts proxy, verifies generated `deepseek-proxy` profile, and if the Codex CLI is available, runs a non-mutating Codex command with `CODEX_HOME` or equivalent sandbox pointing at the temp home. If Codex CLI cannot safely be sandboxed, record a skip artifact with exact reason and still validate config/profile files structurally.

  **Must NOT do**: Do not run against the real `~/.codex`. Do not require GUI Codex Desktop for CI.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: Task 15 | Blocked By: Tasks 2, 4, 5, 6, 7

  **References**:
  - Install docs: `docs/install.md`.
  - Profile creation: `packages/codex-installer/src/install.ts:94`.
  - Switch profile: `packages/cli/src/switch.ts`.
  - Acceptance fixture: `tests/e2e/acceptance/full-fixture-flow.test.ts`.

  **Acceptance Criteria**:
  - [ ] Temp HOME install generates valid config, profile, plugin cache, marketplace, and agent files.
  - [ ] Generated profile uses `model_provider = "deepseek_proxy"` and proxy base URL.
  - [ ] Proxy health and one `/v1/responses` request pass from sandbox.
  - [ ] Codex CLI sandbox smoke passes or produces a documented skip artifact.
  - [ ] Uninstall returns sandbox to clean state.

  **QA Scenarios**:
  ```text
  Scenario: Sandbox first-use flow
    Tool: bash
    Steps: HOME=$(mktemp -d); install; proxy start; healthz; responses smoke; proxy stop; uninstall.
    Expected: all steps pass and no DCC files remain after uninstall.
    Evidence: evidence/production-dcc/task-11-sandbox-first-use.txt

  Scenario: Codex CLI profile smoke
    Tool: bash
    Steps: CODEX_HOME="$HOME/.codex" codex --profile deepseek-proxy --help or safest available non-mutating command.
    Expected: exits 0 or records codex_unavailable/codex_sandbox_unsupported.
    Evidence: evidence/production-dcc/task-11-codex-profile.txt
  ```

  **Commit**: YES | Message: `test(acceptance): add sandbox codex profile flow` | Files: `tests/e2e/acceptance/*`, docs

- [x] 12. Make Release Artifact Installable And Self-Testing

  **What to do**: Update `dcc package` so the produced artifact includes all runtime files needed for install from package output, not the source checkout. Add `dcc package --verify-install --out <dir>` or tests that copy `release/files` to a temp package root, run its `bin/dcc.mjs install --home <temp>`, execute hook/MCP smoke, start proxy with mock upstream, and uninstall. Include checksum verification.

  **Must NOT do**: Do not let release tests pass if `dist/bin/dcc.mjs` is absent. Do not rely on files outside release output.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: Task 15 | Blocked By: Tasks 3, 9, 10

  **References**:
  - Release package code: `packages/cli/src/releasePackage.ts`.
  - Current package test: `tests/integration/package/package-contents.test.ts`.
  - Release docs: `docs/release.md`, `docs/supply-chain.md`.

  **Acceptance Criteria**:
  - [ ] Release manifest includes runtime dist files.
  - [ ] Checksums match copied release files.
  - [ ] Install from release output works in temp HOME.
  - [ ] Hook/MCP commands from installed release output work.
  - [ ] `pnpm test -- tests/integration/package tests/e2e/acceptance/full-fixture-flow.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Release artifact install smoke
    Tool: bash
    Steps: node bin/dcc.mjs package --out "$OUT"; cd "$OUT/files"; node bin/dcc.mjs install --home "$HOME" --provider-mode=proxy --no-tui.
    Expected: install succeeds from release files only.
    Evidence: evidence/production-dcc/task-12-release-install.txt

  Scenario: Release checksum verification
    Tool: bash
    Steps: run checksum verifier over release manifest.
    Expected: every listed file hash matches.
    Evidence: evidence/production-dcc/task-12-release-checksums.txt
  ```

  **Commit**: YES | Message: `feat(release): verify installable package artifact` | Files: `packages/cli/src/releasePackage.ts`, release tests, docs

- [x] 13. Update Real-Use Documentation And Security Runbooks

  **What to do**: Update README and docs with exact production-local workflows: sandbox install, secret env file, live doctor, proxy start/status/stop, Codex profile use, hook/MCP validation, cache diagnostics, uninstall, rollback, and API key rotation. Document that `install --help` is safe after Task 1. Document live call budget and how to remove `.dcc/secrets/deepseek.env`. Keep troubleshooting aligned with actual commands.

  **Must NOT do**: Do not claim native provider support. Do not instruct users to paste API keys into chat. Do not claim cache hits are guaranteed.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: Final Verification | Blocked By: Tasks 1-7 contracts

  **References**:
  - README current usage: `README.md`.
  - Provider proxy docs: `docs/provider-proxy.md`.
  - Security docs: `docs/security.md`.
  - External contracts: `docs/external-contracts.md`.
  - Troubleshooting: `docs/troubleshooting.md`.

  **Acceptance Criteria**:
  - [ ] Docs include sandbox-first workflow and real install workflow.
  - [ ] Docs include API key handling and rotation warning.
  - [ ] Docs include live cache diagnostics example with best-effort caveat.
  - [ ] Docs include uninstall/rollback verification commands.
  - [ ] `pnpm test -- tests/unit/docs/readme-contract.test.ts tests/unit/contracts/deepseek-contract.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Docs contain real-use workflow
    Tool: bash
    Steps: rg -n "sandbox|DEEPSEEK_API_KEY|doctor --live|proxy start|uninstall|cache_diagnostics" README.md docs
    Expected: required phrases are present.
    Evidence: evidence/production-dcc/task-13-docs-workflow.txt

  Scenario: Docs forbid unsafe key handling
    Tool: bash
    Steps: rg -n "paste.*API key|native provider supported|cache hits are guaranteed" README.md docs || true
    Expected: no unsafe claims.
    Evidence: evidence/production-dcc/task-13-docs-safety.txt
  ```

  **Commit**: YES | Message: `docs: document production local dcc workflow` | Files: `README.md`, `docs/*`, docs tests

- [x] 14. Connect Live Reasonix-Style Cache Diagnostics End To End

  **What to do**: Add a gated live QA command or test helper that starts the real proxy, sends two identical stable-prefix `/v1/responses` requests with `metadata.dcc_cache_session_id`, and asserts response usage plus `cache_diagnostics` shape. The test must pass even when DeepSeek cache hit is 0 by recording best-effort behavior, but when hit is positive it must assert hit/miss normalization. Always assert no raw prompt/tool/auth/reasoning leakage.

  **Must NOT do**: Do not require guaranteed cache hits. Do not run live by default without `.dcc/secrets/deepseek.env`.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: Final Verification | Blocked By: Tasks 4, 5, 6, 7, 8

  **References**:
  - Cache usage parser: `packages/provider-proxy/src/cacheUsage.ts`.
  - Cache diagnostics: `packages/provider-proxy/src/cacheDiagnostics.ts`.
  - Server response wiring: `packages/provider-proxy/src/server.ts:170`.
  - Plan evidence from previous live probe: repeated stable prefix produced `cache_hit=1280` and `cache_miss=94`.
  - Reasonix reference: stable prefix and planner/executor separation preserve DeepSeek automatic prefix cache.

  **Acceptance Criteria**:
  - [ ] Live proxy response includes `usage` and `cache_diagnostics`.
  - [ ] First request with a session key reports `first_observation`.
  - [ ] Second request reports `compared`.
  - [ ] If DeepSeek returns cache fields, DCC normalized usage matches them.
  - [ ] Evidence contains no API key, Authorization, raw long prefix, or `reasoning_content`.

  **QA Scenarios**:
  ```text
  Scenario: Live stable-prefix cache pair through DCC proxy
    Tool: bash/curl
    Steps: source .dcc/secrets/deepseek.env; start proxy real upstream; POST stable prefix twice with same dcc_cache_session_id.
    Expected: both HTTP 200; first comparison first_observation; second comparison compared; usage fields present.
    Evidence: evidence/production-dcc/task-14-live-cache-pair.txt

  Scenario: Live evidence redaction scan
    Tool: bash
    Steps: rg -n "sk-[A-Za-z0-9_-]+|Authorization|Stable cache prefix sentence|reasoning_content" evidence/production-dcc/task-14-live-cache-pair.txt || true
    Expected: no matches.
    Evidence: evidence/production-dcc/task-14-live-redaction.txt
  ```

  **Commit**: YES | Message: `test(proxy): verify live cache diagnostics` | Files: live-gated tests/helpers, docs

- [x] 15. Final Cleanup Hardening And Regression Sweep

  **What to do**: Add a final hardening pass that scans for source-tree-only paths, stale quarantine files, secret leakage, oversized files, missing cleanup, and release/runtime mismatch. Ensure `.dcc/secrets` is gitignored or otherwise excluded. Ensure accidental install quarantine is not shipped. Close any lingering proxy processes. Run all verification gates and record cleanup receipts.

  **Must NOT do**: Do not delete user evidence unless it is explicitly generated temp test data. Do not modify real `~/.codex`.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: Final Verification | Blocked By: Tasks 2, 11, 12

  **References**:
  - `.gitignore`.
  - Release package includes paths from `packages/cli/src/releasePackage.ts`.
  - Security docs: `docs/security.md`.
  - Previous accidental install quarantine path: `.dcc/quarantine/codex-accidental-install-20260607-221850`.

  **Acceptance Criteria**:
  - [ ] Secret files are not included in git/release scans.
  - [ ] No release artifact contains `.dcc/secrets`, `.dcc/quarantine`, API keys, Authorization, raw prompt fixtures, or local home paths.
  - [ ] No managed proxy process remains after tests.
  - [ ] All changed TypeScript source files are under 250 pure LOC or explicitly split.
  - [ ] `pnpm test && pnpm typecheck && pnpm lint && node .../check-no-excuse-rules.ts .` pass.

  **QA Scenarios**:
  ```text
  Scenario: Secret and quarantine exclusion
    Tool: bash
    Steps: node bin/dcc.mjs package --out "$OUT"; rg -n "deepseek.env|codex-accidental-install|sk-[A-Za-z0-9_-]+|Authorization" "$OUT" || true
    Expected: no matches.
    Evidence: evidence/production-dcc/task-15-release-redaction.txt

  Scenario: No leftover proxy process
    Tool: bash
    Steps: run final proxy status for all sandbox homes and lsof -i on DCC test ports.
    Expected: all stopped; no listeners on test ports.
    Evidence: evidence/production-dcc/task-15-cleanup.txt
  ```

  **Commit**: YES | Message: `chore: harden production dcc release gates` | Files: tests, docs, `.gitignore`, release config

## Final Verification Wave
> ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. Plan Compliance Audit
  - Verify all LazyCodex-like install/profile/CLI, OmO-like hooks/skills/MCP/workflow, and Reasonix-like provider/reasoning/cache objectives are covered.
  - Verify no unsupported native provider path, no unbounded live calls, and no raw secrets/reasoning leakage.
  - Evidence: `evidence/production-dcc/f1-plan-compliance.txt`

- [x] F2. Code Quality Review
  - Run `pnpm typecheck`.
  - Run `pnpm lint`.
  - Run no-excuse TypeScript audit.
  - Inspect files over 250 pure LOC and split touched oversized files.
  - Evidence: `evidence/production-dcc/f2-code-quality.txt`

- [x] F3. Real Manual QA
  - Run sandbox install/proxy/response/uninstall.
  - Run installed plugin hook and MCP runtime smoke from copied plugin root.
  - Run release artifact install smoke.
  - Run gated live DeepSeek smoke if `.dcc/secrets/deepseek.env` exists.
  - Evidence: `evidence/production-dcc/f3-manual-qa.txt`

- [x] F4. Scope Fidelity Check
  - Run `pnpm test`.
  - Run `rg -n "deepseek_proxy|dist/bin/dcc.mjs|DEEPSEEK_API_KEY|reasoning_content|cache_diagnostics|prompt_cache_hit_tokens|DCC managed" README.md docs bin packages plugins tests`.
  - Confirm results match intended public/runtime surfaces and do not expose secrets.
  - Evidence: `evidence/production-dcc/f4-scope-fidelity.txt`

## Commit Strategy
- This workspace currently has no `.git` directory. If execution remains in this workspace, do not run `git commit`; record changed files and evidence only.
- If moved to a git-enabled copy, commit in functional slices:
  1. `fix(cli): make subcommand help side-effect free`
  2. `fix(installer): make dcc install reversible`
  3. `feat(plugin): ship executable runtime bundle`
  4. `feat(proxy): connect real deepseek upstream`
  5. `feat(doctor): add live readiness checks`
  6. `test(acceptance): verify production local harness`
  7. `docs: document production local workflow`

## Success Criteria
- User can install into a sandbox HOME, start DCC proxy, make a real DeepSeek-backed Responses request, inspect cache diagnostics, run installed plugin hooks/MCP commands, and uninstall cleanly.
- Release artifact contains every runtime file it declares and can be installed without source-tree access.
- Original `~/.codex` is never touched during automated QA unless the user explicitly opts into real install.
- DCC behaves like a practical LazyCodex/OmO/Reasonix-style local harness rather than a fixture-only scaffold.
