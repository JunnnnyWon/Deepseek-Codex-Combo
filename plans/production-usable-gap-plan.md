# Production Usable DCC Gap Plan

## TL;DR
> Summary:      Make DeepSeek-Codex-Combo usable as a real local Codex companion: packaged CLI, sandbox-first install, hook/MCP/proxy/cache runtime checks, reversible uninstall, and docs that match the implementation.
> Deliverables:
> - Node-20-compatible packaged CLI with publishable `dcc` and `deepseek-codex-combo` bins.
> - Sandbox-first installer that resolves its bundled plugin from the package root, not the caller cwd.
> - Autostart file generation with rollback/uninstall coverage and no service-manager side effects by default.
> - Codex hook payload handling from stdin plus installed-plugin hook runtime tests.
> - Hardened proxy/install argument validation, strict doctor cache diagnostics, plugin validation, release/package verification, and production smoke evidence.
> - Quickstart, endpoint, doctor, uninstall, autostart, security, and supply-chain docs aligned with real behavior.
> Effort:       Large
> Risk:         High - the current CLI imports `.ts` sources while docs/CI claim Node 20 support, and installed hook commands do not pass payload fixtures.

## Scope
### Must have
- Make the primary CLI executable under Node 20, because `README.md:19` and `.github/workflows/ci.yml:17` claim Node 20 support while `bin/dcc.mjs:73-80` and later dynamic imports load `.ts` sources.
- Resolve package usability by giving the root package a real `bin`/`files`/pack contract, because `README.md:55` and `tests/unit/docs/readme-contract.test.ts:44-46` advertise `npx deepseek-codex-combo` while `package.json:1-14` and `packages/cli/package.json:1-8` are private/no-bin.
- Keep sandbox-first setup as the default acceptance path: every install/package/proxy/Codex-profile scenario must use `--home "$(mktemp -d)"` or another explicit temp home, never implicit real `~/.codex`.
- Fix installer package-root resolution so `install` copies the bundled plugin from the installed package, not `process.cwd()`, because `packages/codex-installer/src/install.ts:243-247` currently defaults to `process.cwd()/plugins/deepseek-codex-combo`.
- Implement autostart artifact writing for `--proxy-autostart=launchd|systemd`, because `packages/codex-installer/src/autostart.ts:13-23` plans files and `packages/codex-installer/src/install.ts:221-228` lists them, but `packages/codex-installer/src/install.ts:148-195` does not write them.
- Fix hook payload handling so installed `hooks/hooks.json` commands work without test-only `--fixture` injection, because `plugins/deepseek-codex-combo/hooks/hooks.json:18-63` invokes hook subcommands without payload args while `bin/dcc.mjs:367-388` requires fixtures for payload-bearing events.
- Harden malformed inputs for install/proxy/provider URLs and missing-key flows, with exact CLI errors and no secret leakage.
- Improve `doctor` so proxy smoke uses `responsesOk` and `cacheDiagnosticsOk` fields from `packages/cli/src/doctorSmoke.ts:11-28` instead of treating the result object as truthy in `packages/cli/src/doctor.ts:176-190`.
- Preserve and expand existing MCP/runtime coverage in `tests/integration/plugin/mcp-runtime.test.ts:104-184`.
- Add package/release verification that checks copied payload checksums and an install/uninstall smoke from the package/release artifact.
- Update docs to match the chosen install path, proxy endpoint contract, strict doctor exit-code contract, autostart behavior, uninstall removal set, and live-check policy.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Must not touch a real `~/.codex`, real `CODEX_HOME`, or real `HOME` during tests, smoke scripts, or QA scenarios.
- Must not make live DeepSeek API calls in default tests, CI, package verification, or docs examples. Live checks remain opt-in behind `--live` plus `DEEPSEEK_API_KEY`.
- Must not write API keys, bearer tokens, raw prompts, raw tool schemas, raw reasoning content, home paths, private repo URLs, emails, or hostnames into evidence.
- Must not enable, load, start, or stop launchd/systemd services during install. This plan only adds service file rendering/removal and documents manual enablement as out of scope unless a later plan approves it.
- Must not introduce global install as the primary path. `npx`/local tarball/release-payload flows must work without `npm install -g`.
- Must not add native DeepSeek provider mode. `native` remains fail-closed as implemented in `packages/codex-installer/src/install.ts:198-201`.
- Must not replace existing proxy, MCP, AST-grep, hashline, LSP, Boulder, or rules-engine internals unless directly required by the usability gaps above.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Vitest, Node 20 runtime smoke, package artifact smoke, and bash-based evidence capture.
- QA policy: every task has agent-executed scenarios.
- Evidence: `evidence/task-<N>-<slug>.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: Build a Node-20-compatible packaged CLI and package-root plugin resolution
- Task 2: Implement autostart artifact writing and cleanup
- Task 3: Implement stdin hook payload handling for installed plugin hooks
- Task 4: Harden proxy/install argument validation
- Task 5: Fix doctor proxy/cache correctness and missing-key behavior

Wave 2 (after Wave 1):
- Task 6: depends [1] - Verify publishable package and release-payload installability
- Task 7: depends [1, 3] - Expand plugin validation and MCP runtime contract
- Task 8: depends [2, 4] - Strengthen installer/uninstaller edge coverage
- Task 9: depends [1, 2, 3, 4, 5, 7, 8] - Update full sandbox acceptance flow
- Task 10: depends [1, 2, 3, 4, 5, 6, 7, 8] - Update docs and docs contract tests

Wave 3 (after Wave 2):
- Task 11: depends [6, 9, 10] - Harden CI and release workflow checks
- Task 12: depends [6, 7, 8, 9, 10] - Add production smoke script and evidence ledger
- Task 13: depends [10, 11, 12] - Run security, supply-chain, and regression sweep

Critical path: Task 1 -> Task 6 -> Task 9 -> Task 12 -> Task 13

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1 | none | 6, 7, 9, 10, 11, 12 | 2, 3, 4, 5 |
| 2 | none | 8, 9, 10, 12 | 1, 3, 4, 5 |
| 3 | none | 7, 9, 10, 12 | 1, 2, 4, 5 |
| 4 | none | 8, 9, 10, 12 | 1, 2, 3, 5 |
| 5 | none | 9, 10, 12 | 1, 2, 3, 4 |
| 6 | 1 | 9, 10, 11, 12, 13 | 7, 8 |
| 7 | 1, 3 | 9, 10, 12, 13 | 6, 8 |
| 8 | 2, 4 | 9, 10, 12, 13 | 6, 7 |
| 9 | 1, 2, 3, 4, 5, 7, 8 | 11, 12, 13 | 10 |
| 10 | 1, 2, 3, 4, 5, 6, 7, 8 | 11, 12, 13 | 9 |
| 11 | 6, 9, 10 | 13 | 12 |
| 12 | 6, 7, 8, 9, 10 | 13 | 11 |
| 13 | 10, 11, 12 | final verification | none |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [ ] 1. Build a Node-20-compatible packaged CLI and package-root plugin resolution

  What to do: Add a production build path that emits `dist/bin/dcc.mjs` and `dist/bin/deepseek-codex-combo.mjs` runnable under Node 20 without importing `.ts` files. Use a deterministic bundler/build script rather than runtime TypeScript loading. Update root `package.json` so the package is packable with `bin` entries for `dcc` and `deepseek-codex-combo`, a minimal `files` allowlist, and a `build` path that produces the bins before plugin/release packaging. Update install command wiring so `createInstallPlan` receives a `sourcePluginPath` resolved from the installed package root, while `dcc package` still packages the current project cwd. Update tests to run the built bin under Node 20 using `npx -y node@20`.
  Must NOT do: Do not keep any production bin that imports `../packages/**/src/*.ts`. Do not require global installs. Do not make real-home install the default smoke path. Do not remove existing local development `node bin/dcc.mjs` support unless replaced by `pnpm dcc` pointing at the built bin after build.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [6, 7, 9, 10, 11, 12] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `plugins/deepseek-codex-combo/scripts/build-dist.mjs:60-100` - existing dist lock and copied runtime build pattern.
  - Pattern:  `packages/cli/src/releasePackage.ts:41-78` - current release payload allowlist.
  - Pattern:  `tests/integration/package/package-contents.test.ts:63-104` - current copied plugin CLI runtime smoke.
  - API/Type: `packages/codex-installer/src/install.ts:14-27` - install options include optional `sourcePluginPath`.
  - API/Type: `packages/codex-installer/src/install.ts:243-247` - current unsafe cwd-based plugin source fallback to replace.
  - API/Type: `bin/dcc.mjs:127-172` - install command must pass package-root plugin path.
  - API/Type: `bin/dcc.mjs:758-781` - package command must keep cwd-based project packaging semantics.
  - Test:     `tests/unit/scaffold/package-scripts.test.ts:5-13` - update script contract.
  - Test:     `tests/unit/scaffold/repo-layout.test.ts:5-51` - update required dist/bin paths.
  - External: `https://github.com/code-yeongyu/lazycodex/blob/0117d19e39eacffba58e90ed0870f44ed24a31dd/README.md#L43-L53` - comparable one-command `npx` install expectation.

  Acceptance criteria (agent-executable only):
  - [ ] `pnpm build` exits 0 and creates `dist/bin/dcc.mjs` plus `dist/bin/deepseek-codex-combo.mjs`.
  - [ ] `npx -y node@20 dist/bin/dcc.mjs --help` exits 0 and prints `DeepSeek-Codex-Combo CLI`.
  - [ ] `npx -y node@20 dist/bin/dcc.mjs install --dry-run --home "$(mktemp -d)" --provider-mode=proxy --no-tui` exits 0 and prints `install: dry-run`.
  - [ ] `npm pack --dry-run --json` exits 0 and the JSON includes `dist/bin/dcc.mjs`, `dist/bin/deepseek-codex-combo.mjs`, `plugins/deepseek-codex-combo/.codex-plugin/plugin.json`, `plugins/deepseek-codex-combo/hooks/hooks.json`, and `plugins/deepseek-codex-combo/.mcp.json`.
  - [ ] `rg -n "src/.*\\.ts" dist/bin plugins/deepseek-codex-combo/dist/bin` returns no matches after build.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: Node 20 packaged CLI happy path
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; npx -y node@20 dist/bin/dcc.mjs --help; h="$(mktemp -d)"; npx -y node@20 dist/bin/dcc.mjs install --dry-run --home "$h" --provider-mode=proxy --no-tui; npm pack --dry-run --json' > evidence/task-1-node20-package.txt 2>&1
    Expected: evidence contains "DeepSeek-Codex-Combo CLI", "install: dry-run", and package JSON containing "dist/bin/dcc.mjs".
    Evidence: evidence/task-1-node20-package.txt

  Scenario: Built install resolves plugin outside repo cwd
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; tmp="$(mktemp -d)"; home="$tmp/home"; (cd "$tmp" && npx -y node@20 /Users/junnnny/Desktop/Deepseek-Codex-Combo/dist/bin/dcc.mjs install --home "$home" --provider-mode=proxy --no-tui); test -f "$home/.codex/plugins/deepseek-codex-combo/.codex-plugin/plugin.json"; /Users/junnnny/Desktop/Deepseek-Codex-Combo/dist/bin/dcc.mjs uninstall --home "$home"' > evidence/task-1-package-root.txt 2>&1
    Expected: command exits 0 and copied plugin manifest exists under the temp home despite cwd being outside the repo.
    Evidence: evidence/task-1-package-root.txt
  ```

  Commit: YES | Message: `build(cli): add node20 packaged runtime` | Files: [`package.json`, `bin/dcc.mjs`, `bin/deepseek-codex-combo.mjs`, `scripts/build-cli.mjs`, `plugins/deepseek-codex-combo/scripts/build-dist.mjs`, `packages/codex-installer/src/install.ts`, `tests/unit/scaffold/package-scripts.test.ts`, `tests/unit/scaffold/repo-layout.test.ts`, `tests/integration/package/package-contents.test.ts`]

- [ ] 2. Implement autostart artifact writing and cleanup

  What to do: Extend `AutostartPlan` so it contains rendered file entries, not only paths. Render launchd plist and systemd user service files that run the installed `dist/bin/dcc.mjs proxy start` in the foreground with explicit `--home`, `--host`, and `--port`. Add install write logic, rollback snapshots, and uninstall removal coverage for both modes. Default remains `none`. CLI output must list autostart files only when requested. Unsupported platforms should not guess; launchd/systemd file generation is selected only by explicit `--proxy-autostart=launchd|systemd`.
  Must NOT do: Do not call `launchctl`, `systemctl`, or any OS service manager. Do not include `DEEPSEEK_API_KEY`, bearer tokens, or shell-specific secret paths in service files. Do not enable autostart by default.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [8, 9, 10, 12] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `packages/codex-installer/src/autostart.ts:1-23` - current autostart planning stub.
  - Pattern:  `packages/codex-installer/src/autostart.test.ts:20-27` - existing default none test.
  - Pattern:  `packages/codex-installer/src/install.ts:148-195` - installer write and rollback pattern.
  - Pattern:  `packages/codex-installer/src/install.ts:203-228` - autostart plan is already included in planned files.
  - Pattern:  `packages/codex-installer/src/uninstall.ts:32-39` - uninstall already lists launchd/systemd removal paths.
  - Test:     `packages/codex-installer/src/uninstall.test.ts:58-110` - managed file removal and idempotency pattern.
  - Test:     `tests/e2e/cli/install.test.ts` - CLI install edge test home pattern.

  Acceptance criteria (agent-executable only):
  - [ ] `pnpm vitest run packages/codex-installer/src/autostart.test.ts packages/codex-installer/src/install.test.ts packages/codex-installer/src/uninstall.test.ts` exits 0.
  - [ ] `node dist/bin/dcc.mjs install --home "$tmp" --provider-mode=proxy --proxy-autostart=launchd --no-tui` writes `$tmp/Library/LaunchAgents/com.deepseek-codex-combo.proxy.plist`.
  - [ ] `node dist/bin/dcc.mjs install --home "$tmp" --provider-mode=proxy --proxy-autostart=systemd --no-tui` writes `$tmp/.config/systemd/user/deepseek-codex-combo-proxy.service`.
  - [ ] Both autostart files contain the installed DCC runtime path and do not contain `DEEPSEEK_API_KEY`, `sk-`, or `Authorization`.
  - [ ] `node dist/bin/dcc.mjs uninstall --home "$tmp"` removes both autostart paths and remains idempotent when run twice.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Explicit autostart files are written and removed
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; home="$(mktemp -d)"; node dist/bin/dcc.mjs install --home "$home" --provider-mode=proxy --proxy-autostart=launchd --no-tui; test -f "$home/Library/LaunchAgents/com.deepseek-codex-combo.proxy.plist"; node dist/bin/dcc.mjs install --home "$home" --provider-mode=proxy --proxy-autostart=systemd --no-tui; test -f "$home/.config/systemd/user/deepseek-codex-combo-proxy.service"; ! rg -n "DEEPSEEK_API_KEY|sk-|Authorization" "$home/Library/LaunchAgents" "$home/.config/systemd/user"; node dist/bin/dcc.mjs uninstall --home "$home"; test ! -e "$home/Library/LaunchAgents/com.deepseek-codex-combo.proxy.plist"; test ! -e "$home/.config/systemd/user/deepseek-codex-combo-proxy.service"' > evidence/task-2-autostart.txt 2>&1
    Expected: command exits 0; both files are created, contain no secrets, and are removed by uninstall.
    Evidence: evidence/task-2-autostart.txt

  Scenario: Default install creates no autostart artifacts
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; home="$(mktemp -d)"; node dist/bin/dcc.mjs install --home "$home" --provider-mode=proxy --no-tui; test ! -e "$home/Library/LaunchAgents/com.deepseek-codex-combo.proxy.plist"; test ! -e "$home/.config/systemd/user/deepseek-codex-combo-proxy.service"; node dist/bin/dcc.mjs uninstall --home "$home"; node dist/bin/dcc.mjs uninstall --home "$home"' > evidence/task-2-autostart-default.txt 2>&1
    Expected: command exits 0; no autostart files are created by default; double uninstall succeeds.
    Evidence: evidence/task-2-autostart-default.txt
  ```

  Commit: YES | Message: `feat(installer): write reversible autostart artifacts` | Files: [`packages/codex-installer/src/autostart.ts`, `packages/codex-installer/src/autostart.test.ts`, `packages/codex-installer/src/install.ts`, `packages/codex-installer/src/install.test.ts`, `packages/codex-installer/src/uninstall.ts`, `packages/codex-installer/src/uninstall.test.ts`, `packages/cli/src/commandHelp.ts`, `tests/e2e/cli/install.test.ts`]

- [ ] 3. Implement stdin hook payload handling for installed plugin hooks

  What to do: Keep `--fixture` for tests and local debugging, but add stdin JSON payload loading for `user-prompt-submit`, `post-tool-use`, `stop`, and `subagent-stop` when no fixture is provided. Accept the existing fixture shape from `packages/cli/src/hooks/lifecycle.ts:31-77`. Update installed plugin hook runtime tests so they execute the exact manifest command from `hooks/hooks.json` and pass payload JSON on stdin, with no test-side `--fixture` suffix. Keep `session-start` and `post-compact` working without stdin. Ensure invalid/missing payloads return `hooks_failed: hook_fixture_invalid` and exit 1, except blocker hooks still return exit 2 for valid blocking payloads.
  Must NOT do: Do not log raw prompts, API keys, hook JSON bodies, source file content, or Boulder state beyond existing safe rendered decision lines. Do not change Codex hook event names in `hooks/hooks.json`.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [7, 9, 10, 12] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `packages/cli/src/hooks/lifecycle.ts:43-77` - fixture parser and event shape.
  - Pattern:  `packages/cli/src/hooks/lifecycle.ts:81-145` - hook handler behavior to preserve.
  - API/Type: `bin/dcc.mjs:349-405` - CLI hook dispatch currently requires fixtures.
  - Pattern:  `plugins/deepseek-codex-combo/hooks/hooks.json:1-70` - installed manifest commands with no fixture args.
  - Test:     `tests/e2e/cli/hooks.test.ts:4-69` - CLI fixture tests to keep.
  - Test:     `tests/integration/plugin/hooks-runtime.test.ts:126-178` - remove `fixtureArg` and pass stdin instead.
  - External: `https://developers.openai.com/codex/hooks` - Codex lifecycle hook payload contract.

  Acceptance criteria (agent-executable only):
  - [ ] `node dist/bin/dcc.mjs hooks user-prompt-submit < tests/fixtures/hooks/prompt-with-secret.json` exits 0 and omits `sk-secret-123`.
  - [ ] `node dist/bin/dcc.mjs hooks post-tool-use < tests/fixtures/hooks/slop-comment.json` exits 2 and prints `ai_slop_comment`.
  - [ ] `node dist/bin/dcc.mjs hooks stop < tests/fixtures/boulder/incomplete-plan.json` exits 2 and prints `missing_evidence`.
  - [ ] `printf '{bad' | node dist/bin/dcc.mjs hooks post-tool-use` exits 1 and prints `hooks_failed: hook_fixture_invalid`.
  - [ ] `pnpm vitest run tests/e2e/cli/hooks.test.ts tests/integration/plugin/hooks-runtime.test.ts` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Manifest hook commands consume stdin payloads
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; node dist/bin/dcc.mjs hooks user-prompt-submit < tests/fixtures/hooks/prompt-with-secret.json; set +e; node dist/bin/dcc.mjs hooks post-tool-use < tests/fixtures/hooks/slop-comment.json; code=$?; set -e; test "$code" -eq 2; set +e; node dist/bin/dcc.mjs hooks stop < tests/fixtures/boulder/incomplete-plan.json; stop_code=$?; set -e; test "$stop_code" -eq 2' > evidence/task-3-hooks-stdin.txt 2>&1
    Expected: user prompt exits 0, post-tool-use exits 2, stop exits 2, output has no raw secret and includes expected blocker lines.
    Evidence: evidence/task-3-hooks-stdin.txt

  Scenario: Malformed hook payload fails closed
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; set +e; printf "{bad" | node dist/bin/dcc.mjs hooks post-tool-use > evidence/task-3-hooks-malformed.txt 2>&1; code=$?; set -e; test "$code" -eq 1; rg -n "hooks_failed: hook_fixture_invalid" evidence/task-3-hooks-malformed.txt'
    Expected: exit code is 1 and evidence contains exactly `hooks_failed: hook_fixture_invalid`.
    Evidence: evidence/task-3-hooks-malformed.txt
  ```

  Commit: YES | Message: `fix(hooks): read codex hook payloads from stdin` | Files: [`bin/dcc.mjs`, `packages/cli/src/hooks/lifecycle.ts`, `tests/e2e/cli/hooks.test.ts`, `tests/integration/plugin/hooks-runtime.test.ts`, `plugins/deepseek-codex-combo/hooks/hooks.json`]

- [ ] 4. Harden proxy/install argument validation

  What to do: Add shared parsing/validation for ports, hosts, provider base URLs, and proxy auth flags. Apply it to `install --proxy-port`, `install --proxy-host`, `proxy start --port`, `proxy status --port`, `proxy stop --port`, `proxy start --host`, and `proxy start --deepseek-base-url`. Valid ports are integers 1-65535. Hosts must be non-empty strings and remote bind hosts `0.0.0.0` and `::` still require both `--allow-remote-bind` and non-empty `--token-auth`. Base URLs must parse as `http:` or `https:` URLs. Error codes must be stable: `invalid_proxy_port`, `invalid_proxy_host`, `invalid_deepseek_base_url`, and existing `remote_bind_requires_token_auth`. Redact token values in all error paths.
  Must NOT do: Do not allow `NaN`, `0`, negative, fractional, or over-65535 ports into config TOML or proxy state files. Do not loosen remote bind safety. Do not print token auth values or authorization headers.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [8, 9, 10, 12] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `bin/dcc.mjs:82-109` - current option parsing helpers.
  - Pattern:  `bin/dcc.mjs:127-172` - install handler parses `--proxy-port` with `Number(...)`.
  - Pattern:  `bin/dcc.mjs:784-955` - proxy handler parses ports/host/base URL.
  - API/Type: `packages/provider-proxy/src/bind.ts:1-49` - remote bind token guard to preserve.
  - Test:     `tests/e2e/cli/proxy-server.test.ts:4-19` - remote bind negative coverage.
  - Test:     `packages/provider-proxy/src/bind.test.ts` - bind validator test location.
  - Test:     `tests/e2e/cli/install.test.ts` - add install invalid port/host tests.

  Acceptance criteria (agent-executable only):
  - [ ] `node dist/bin/dcc.mjs install --dry-run --home "$(mktemp -d)" --proxy-port nope --provider-mode=proxy --no-tui` exits 1 and prints `invalid_proxy_port`.
  - [ ] `node dist/bin/dcc.mjs proxy start --port 70000` exits 1 and prints `invalid_proxy_port`.
  - [ ] `node dist/bin/dcc.mjs proxy status --home "$(mktemp -d)" --port 0` exits 1 and prints `invalid_proxy_port`.
  - [ ] `node dist/bin/dcc.mjs proxy start --deepseek-base-url not-a-url --port 41473` exits 1 and prints `invalid_deepseek_base_url`.
  - [ ] `node dist/bin/dcc.mjs proxy start --host 0.0.0.0 --port 47148` still exits non-zero and prints `remote_bind_requires_token_auth` without `Authorization`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Valid loopback proxy arguments still start
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; home="$(mktemp -d)"; port="$(node -e "const s=require(\"node:net\").createServer();s.listen(0,\"127.0.0.1\",()=>{const p=s.address().port;s.close(()=>console.log(p));})")"; node dist/bin/dcc.mjs proxy start --background --home "$home" --host 127.0.0.1 --port "$port" --mock-upstream tests/fixtures/proxy/text-response.json; node dist/bin/dcc.mjs proxy status --home "$home" --port "$port"; node dist/bin/dcc.mjs proxy stop --home "$home" --port "$port"' > evidence/task-4-proxy-valid.txt 2>&1
    Expected: evidence contains "proxy background: started", "proxy status: running", and "proxy stop: stopped".
    Evidence: evidence/task-4-proxy-valid.txt

  Scenario: Malformed proxy/install arguments fail closed
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; set +e; node dist/bin/dcc.mjs install --dry-run --home "$(mktemp -d)" --proxy-port nope --provider-mode=proxy --no-tui > evidence/task-4-malformed.txt 2>&1; c1=$?; node dist/bin/dcc.mjs proxy start --port 70000 >> evidence/task-4-malformed.txt 2>&1; c2=$?; node dist/bin/dcc.mjs proxy start --deepseek-base-url not-a-url --port 41473 >> evidence/task-4-malformed.txt 2>&1; c3=$?; set -e; test "$c1" -ne 0; test "$c2" -ne 0; test "$c3" -ne 0; rg -n "invalid_proxy_port|invalid_deepseek_base_url" evidence/task-4-malformed.txt; ! rg -n "Authorization|Bearer" evidence/task-4-malformed.txt'
    Expected: all malformed invocations fail non-zero, stable error codes are present, and auth material is absent.
    Evidence: evidence/task-4-malformed.txt
  ```

  Commit: YES | Message: `fix(proxy): validate bind and provider arguments` | Files: [`bin/dcc.mjs`, `packages/provider-proxy/src/bind.ts`, `packages/provider-proxy/src/bind.test.ts`, `tests/e2e/cli/proxy-server.test.ts`, `tests/e2e/cli/install.test.ts`, `packages/cli/src/commandHelp.ts`]

- [ ] 5. Fix doctor proxy/cache correctness and missing-key behavior

  What to do: Fix `runDoctor` so it checks `runProxySmoke(...).responsesOk` and `.cacheDiagnosticsOk` explicitly. Add a `cachePair` doctor option and CLI flag `--cache-pair` that, only when `--live` is also set and a proxy is running, sends two `/v1/responses` requests with the same `metadata.dcc_cache_session_id` and verifies `first_observation` then `compared`. Mock this in tests with the existing mock upstream/server path. Keep default `doctor` offline and non-live. Missing `DEEPSEEK_API_KEY` with `--live` must exit 3 and must not attempt models/chat/proxy smoke. Document exact output lines: `Cache: diagnostics ok`, `Cache: pair compared ok`, and `Proxy: responses smoke failed` or `Cache: diagnostics failed` when appropriate.
  Must NOT do: Do not make live calls without `--live`. Do not make cache-pair calls without `--cache-pair`. Do not print API keys, bearer headers, raw prompt text, output text, or raw cache prefix material.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [9, 10, 12] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - API/Type: `packages/cli/src/doctorSmoke.ts:11-28` - proxy smoke result fields to use.
  - API/Type: `packages/cli/src/doctorSmoke.ts:61-88` - current single proxy smoke request.
  - API/Type: `packages/cli/src/doctor.ts:108-110` - missing live key fail-closed behavior.
  - API/Type: `packages/cli/src/doctor.ts:176-190` - current truthy object bug to fix.
  - Pattern:  `scripts/live-cache-diagnostics.mjs:139-145` - two-request cache comparison behavior.
  - Test:     `packages/cli/src/doctor.test.ts:47-120` - unit doctor behavior.
  - Test:     `tests/e2e/cli/doctor-live.test.ts:191-248` - mocked live strict doctor path.
  - External: `https://api-docs.deepseek.com/guides/kv_cache/` - cache token field contract.

  Acceptance criteria (agent-executable only):
  - [ ] `pnpm vitest run packages/cli/src/doctor.test.ts tests/e2e/cli/doctor-live.test.ts packages/provider-proxy/src/cacheDiagnostics.test.ts` exits 0.
  - [ ] `node dist/bin/dcc.mjs doctor --home "$(mktemp -d)" --live` exits 3 with `DEEPSEEK_API_KEY required for --live` and no `Live: models ok`.
  - [ ] Mocked `doctor --live --strict --cache-pair --deepseek-base-url <mock>` exits 0 and prints `Live: models ok`, `Live: chat smoke ok`, `Proxy: responses smoke ok`, `Cache: diagnostics ok`, and `Cache: pair compared ok`.
  - [ ] A mock proxy response missing `cache_diagnostics` makes strict doctor exit 4 or 5 with `Cache: diagnostics failed`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Mocked live strict doctor verifies proxy cache pair
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; pnpm vitest run packages/cli/src/doctor.test.ts tests/e2e/cli/doctor-live.test.ts packages/provider-proxy/src/cacheDiagnostics.test.ts' > evidence/task-5-doctor-cache.txt 2>&1
    Expected: tests pass and include coverage for `--cache-pair`, `Cache: diagnostics ok`, and `Cache: pair compared ok`.
    Evidence: evidence/task-5-doctor-cache.txt

  Scenario: Live doctor without key fails closed
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; home="$(mktemp -d)"; set +e; env -u DEEPSEEK_API_KEY node dist/bin/dcc.mjs doctor --home "$home" --live > evidence/task-5-missing-key.txt 2>&1; code=$?; set -e; test "$code" -eq 3; rg -n "DEEPSEEK_API_KEY required for --live" evidence/task-5-missing-key.txt; ! rg -n "Live: models ok|sk-" evidence/task-5-missing-key.txt'
    Expected: exit code is 3, required-key message appears, no live success line or secret appears.
    Evidence: evidence/task-5-missing-key.txt
  ```

  Commit: YES | Message: `fix(doctor): verify proxy cache smoke results` | Files: [`packages/cli/src/doctor.ts`, `packages/cli/src/doctorSmoke.ts`, `packages/cli/src/doctorCommand.ts`, `packages/cli/src/doctor.test.ts`, `tests/e2e/cli/doctor-live.test.ts`, `packages/cli/src/commandHelp.ts`]

- [ ] 6. Verify publishable package and release-payload installability

  What to do: Extend `dcc package` with a checksum verification mode, using `dcc package verify --out <release-dir>` or equivalent exact syntax. Non-dry package must copy payload files, write manifests, and verify every checksum. Add tests that run `npm pack`, execute `npx --package <local .tgz> dcc --help`, install into a temp home from the local tarball, start/stop the proxy with a mock upstream, and uninstall. Keep the existing source/release payload flow from `docs/release.md:13-20`. Ensure release payload excludes tests, fixtures, `.dcc/secrets`, `.dcc/quarantine`, and accidental install markers.
  Must NOT do: Do not publish to npm. Do not require network except `npx -y node@20`/local tarball tooling already used in tests. Do not include `node_modules` outside the package files needed by the built runtime. Do not include secrets or test fixtures in release payload.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [9, 10, 11, 12, 13] | Blocked by: [1]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `packages/cli/src/releasePackage.ts:187-235` - package manifest/checksum writing.
  - Pattern:  `packages/cli/src/releaseFilters.ts:1-26` - release exclusion policy.
  - Pattern:  `bin/dcc.mjs:758-781` - package CLI command to extend with verify mode.
  - Test:     `tests/integration/package/package-contents.test.ts:106-170` - required paths and exclusion tests.
  - Test:     `tests/integration/package/release-install.test.ts:59-155` - copied release install smoke.
  - Docs:     `docs/release.md:3-22` - release packaging and checksum docs.
  - Docs:     `docs/supply-chain.md:3-17` - supply-chain verification claims.

  Acceptance criteria (agent-executable only):
  - [ ] `pnpm vitest run tests/integration/package/package-contents.test.ts tests/integration/package/release-install.test.ts` exits 0.
  - [ ] `node dist/bin/dcc.mjs package --out "$out"` exits 0 and creates `$out/files`, `$out/release-manifest.json`, and `$out/checksums.manifest.json`.
  - [ ] `node dist/bin/dcc.mjs package verify --out "$out"` exits 0 and prints `release checksums: ok`.
  - [ ] After corrupting one copied release file, `node dist/bin/dcc.mjs package verify --out "$out"` exits non-zero and prints `checksum_mismatch`.
  - [ ] `npx -y --package "$pkg" dcc install --home "$home" --provider-mode=proxy --no-tui` exits 0 and creates the installed plugin manifest under the temp home.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Local npm tarball and release payload install cleanly
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; out="$(mktemp -d)"; node dist/bin/dcc.mjs package --out "$out"; node dist/bin/dcc.mjs package verify --out "$out"; pkg_dir="$(mktemp -d)"; npm pack --pack-destination "$pkg_dir"; pkg="$(find "$pkg_dir" -name "deepseek-codex-combo-*.tgz" -print -quit)"; home="$(mktemp -d)"; npx -y --package "$pkg" dcc --help; npx -y --package "$pkg" dcc install --home "$home" --provider-mode=proxy --no-tui; test -f "$home/.codex/plugins/deepseek-codex-combo/.codex-plugin/plugin.json"; npx -y --package "$pkg" dcc uninstall --home "$home"' > evidence/task-6-package-install.txt 2>&1
    Expected: package verify passes, local tarball CLI prints help, temp-home install creates plugin manifest, and uninstall exits 0.
    Evidence: evidence/task-6-package-install.txt

  Scenario: Release checksum verification detects corruption
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; out="$(mktemp -d)"; node dist/bin/dcc.mjs package --out "$out"; printf "\ncorrupt\n" >> "$out/files/README.md"; set +e; node dist/bin/dcc.mjs package verify --out "$out" > evidence/task-6-checksum-mismatch.txt 2>&1; code=$?; set -e; test "$code" -ne 0; rg -n "checksum_mismatch" evidence/task-6-checksum-mismatch.txt'
    Expected: verification exits non-zero and reports `checksum_mismatch`.
    Evidence: evidence/task-6-checksum-mismatch.txt
  ```

  Commit: YES | Message: `feat(package): verify release payload installability` | Files: [`bin/dcc.mjs`, `packages/cli/src/releasePackage.ts`, `packages/cli/src/releasePackage.test.ts`, `tests/integration/package/package-contents.test.ts`, `tests/integration/package/release-install.test.ts`, `docs/release.md`, `docs/supply-chain.md`]

- [ ] 7. Expand plugin validation and MCP runtime contract

  What to do: Expand `dcc plugin validate --fixture <path>` so it validates `.codex-plugin/plugin.json`, `.mcp.json`, `hooks/hooks.json`, agent TOML model/provider values, skills directory presence, built `dist/bin/dcc.mjs`, and optional runtime checks. Add `--runtime` to execute `dist/bin/dcc.mjs --help`, `hooks session-start`, `lsp mcp --describe`, `ast-grep mcp --describe`, and `hashline mcp --describe` from the plugin root with `PLUGIN_ROOT` set. Validate MCP server names match `dcc-lsp`, `dcc-ast-grep`, and `dcc-hashline`, and optional install disablement still only updates user config, not the plugin manifest.
  Must NOT do: Do not mutate plugin files during validation. Do not require a real Codex install. Do not start long-running MCP servers for validation; use describe/list-tools or bounded JSON-RPC with timeouts.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [9, 10, 12, 13] | Blocked by: [1, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `bin/dcc.mjs:698-736` - current shallow plugin validation.
  - Pattern:  `plugins/deepseek-codex-combo/.codex-plugin/plugin.json:1-24` - plugin manifest schema.
  - Pattern:  `plugins/deepseek-codex-combo/.mcp.json:1-19` - bundled MCP declaration shape.
  - Pattern:  `plugins/deepseek-codex-combo/hooks/hooks.json:1-70` - hook event declaration shape.
  - Test:     `tests/integration/plugin/mcp-runtime.test.ts:9-55` - expected MCP server/tool names.
  - Test:     `tests/integration/plugin/mcp-runtime.test.ts:104-184` - installed MCP runtime behavior and fail-safe tool calls.
  - Test:     `tests/e2e/cli/plugin-validate.test.ts` - CLI negative validation cases.
  - External: `https://developers.openai.com/codex/plugins/build` - official plugin root and manifest contract.
  - External: `https://developers.openai.com/codex/mcp` - MCP declaration/enablement contract.

  Acceptance criteria (agent-executable only):
  - [ ] `node dist/bin/dcc.mjs plugin validate --fixture plugins/deepseek-codex-combo --runtime` exits 0 and prints `plugin: ok`.
  - [ ] A temp plugin missing `.mcp.json` fails with `mcp_required`.
  - [ ] A temp plugin with an agent TOML model outside `deepseek-v4-pro|deepseek-v4-flash` fails with `unknown_deepseek_model`.
  - [ ] A temp plugin whose MCP command cannot list/describe tools fails with `mcp_runtime_failed`.
  - [ ] `pnpm vitest run tests/e2e/cli/plugin-validate.test.ts tests/integration/plugin/mcp-runtime.test.ts tests/integration/plugin/hooks-runtime.test.ts` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Plugin validate checks manifest, hooks, MCP, agents, skills, and runtime
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; node dist/bin/dcc.mjs plugin validate --fixture plugins/deepseek-codex-combo --runtime' > evidence/task-7-plugin-validate.txt 2>&1
    Expected: evidence contains `plugin: ok`.
    Evidence: evidence/task-7-plugin-validate.txt

  Scenario: Missing MCP manifest fails validation
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; tmp="$(mktemp -d)"; cp -R plugins/deepseek-codex-combo "$tmp/plugin"; rm "$tmp/plugin/.mcp.json"; set +e; node dist/bin/dcc.mjs plugin validate --fixture "$tmp/plugin" > evidence/task-7-plugin-missing-mcp.txt 2>&1; code=$?; set -e; test "$code" -ne 0; rg -n "mcp_required" evidence/task-7-plugin-missing-mcp.txt'
    Expected: validation exits non-zero and reports `mcp_required`.
    Evidence: evidence/task-7-plugin-missing-mcp.txt
  ```

  Commit: YES | Message: `feat(plugin): validate bundled runtime contracts` | Files: [`bin/dcc.mjs`, `packages/cli/src/pluginValidate.ts`, `tests/e2e/cli/plugin-validate.test.ts`, `tests/integration/plugin/mcp-runtime.test.ts`, `tests/integration/plugin/hooks-runtime.test.ts`, `packages/cli/src/commandHelp.ts`]

- [ ] 8. Strengthen installer/uninstaller edge coverage

  What to do: Add tests and any missing behavior for preexisting non-empty config backup creation, malformed existing config fail-closed behavior, install rollback when plugin copy/autostart write fails, dry-run no-write behavior, plugin-only mode removing provider blocks, uninstall exact removal set, preserved `.dcc` evidence, and double-uninstall idempotency. Render CLI uninstall output with planned removals/preserved paths in dry-run, not only `managed provider block: removed`, so operators can inspect state before applying.
  Must NOT do: Do not delete user-authored profiles, agents, marketplaces, configs, or `.dcc` evidence. Do not make malformed user config worse. Do not create backups on dry-run.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [9, 10, 12, 13] | Blocked by: [2, 4]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `packages/codex-installer/src/install.ts:156-195` - current backup and rollback logic.
  - Pattern:  `packages/codex-installer/src/configToml.ts:54-59` - TOML validation error type.
  - Pattern:  `packages/codex-installer/src/uninstall.ts:32-77` - removal set and current minimal render output.
  - Test:     `packages/codex-installer/src/install.test.ts:37-145` - existing install and rollback tests.
  - Test:     `packages/codex-installer/src/uninstall.test.ts:35-110` - preservation/removal/idempotency tests.
  - Test:     `tests/e2e/cli/install.test.ts` - CLI install dry-run and native fail-closed tests.
  - Docs:     `docs/install.md:45-53` - rollback documentation.

  Acceptance criteria (agent-executable only):
  - [ ] `pnpm vitest run packages/codex-installer/src/configToml.test.ts packages/codex-installer/src/install.test.ts packages/codex-installer/src/uninstall.test.ts tests/e2e/cli/install.test.ts` exits 0.
  - [ ] Non-dry install over a non-empty temp config creates exactly one `.dcc-backup-*` file containing the original config.
  - [ ] Dry-run install over a non-empty temp config creates no `.dcc-backup-*` files and does not create plugin files.
  - [ ] Malformed existing config exits with `config_parse_error` and preserves the original malformed file bytes.
  - [ ] Double uninstall exits 0 and leaves `.dcc/evidence/keep.txt` intact.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Backup, uninstall, and idempotency preserve user state
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; home="$(mktemp -d)"; mkdir -p "$home/.codex" "$home/.dcc/evidence"; printf "%s\n" "model = \"user\"" > "$home/.codex/config.toml"; printf keep > "$home/.dcc/evidence/keep.txt"; node dist/bin/dcc.mjs install --home "$home" --provider-mode=proxy --no-tui; test "$(find "$home/.codex" -name "config.toml.dcc-backup-*" | wc -l | tr -d " ")" -eq 1; node dist/bin/dcc.mjs uninstall --home "$home"; node dist/bin/dcc.mjs uninstall --home "$home"; test -f "$home/.dcc/evidence/keep.txt"; ! rg -n "deepseek_proxy|deepseek-codex-combo" "$home/.codex/config.toml"' > evidence/task-8-installer-state.txt 2>&1
    Expected: backup exists once, double uninstall succeeds, evidence remains, managed markers are removed.
    Evidence: evidence/task-8-installer-state.txt

  Scenario: Malformed config fails closed without mutation
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; home="$(mktemp -d)"; mkdir -p "$home/.codex"; printf "%s" "[bad" > "$home/.codex/config.toml"; before="$(shasum -a 256 "$home/.codex/config.toml" | awk "{print \\$1}")"; set +e; node dist/bin/dcc.mjs install --home "$home" --provider-mode=proxy --no-tui > evidence/task-8-malformed-config.txt 2>&1; code=$?; set -e; after="$(shasum -a 256 "$home/.codex/config.toml" | awk "{print \\$1}")"; test "$code" -ne 0; test "$before" = "$after"; rg -n "config_parse_error" evidence/task-8-malformed-config.txt'
    Expected: install exits non-zero, original config hash is unchanged, and output contains `config_parse_error`.
    Evidence: evidence/task-8-malformed-config.txt
  ```

  Commit: YES | Message: `test(installer): cover backup rollback and idempotent uninstall` | Files: [`packages/codex-installer/src/install.ts`, `packages/codex-installer/src/install.test.ts`, `packages/codex-installer/src/uninstall.ts`, `packages/codex-installer/src/uninstall.test.ts`, `tests/e2e/cli/install.test.ts`, `docs/install.md`]

- [ ] 9. Update full sandbox acceptance flow

  What to do: Update acceptance tests so one sandbox-first flow exercises the built/packageable CLI, temp-home install, generated profile, copied plugin runtime, hook stdin payloads, MCP initialize/list-tools, proxy start/status/health, `/v1/responses` cache diagnostics with first/comparison behavior under a mock upstream, strict doctor with mock live base URL, proxy stop, uninstall, and post-uninstall marker checks. Keep Codex CLI invocation optional: if `codex` exists, run `CODEX_HOME="$home/.codex" HOME="$home" codex --profile deepseek-proxy --help`; if not, record `codex_unavailable` but do not fail.
  Must NOT do: Do not call live DeepSeek. Do not assume `codex` is installed. Do not use real home. Do not skip cleanup of background proxy processes.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [11, 12, 13] | Blocked by: [1, 2, 3, 4, 5, 7, 8]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `tests/e2e/acceptance/sandbox-profile.test.ts:75-165` - existing sandbox install/profile/proxy/uninstall flow.
  - Pattern:  `tests/e2e/acceptance/full-fixture-flow.test.ts:14-57` - existing offline acceptance chain.
  - Pattern:  `tests/integration/package/release-install.test.ts:85-150` - release payload install/hook/MCP/proxy/uninstall smoke.
  - Pattern:  `tests/integration/plugin/mcp-runtime.test.ts:99-184` - MCP JSON-RPC initialize/list-tools and fail-safe calls.
  - Pattern:  `scripts/live-cache-diagnostics.mjs:46-63` - repeated cache request shape.
  - API/Type: `packages/provider-proxy/src/server.ts:156-240` - `/v1/responses` behavior and cache diagnostics injection.

  Acceptance criteria (agent-executable only):
  - [ ] `pnpm vitest run tests/e2e/acceptance/sandbox-profile.test.ts tests/e2e/acceptance/full-fixture-flow.test.ts tests/integration/package/release-install.test.ts` exits 0.
  - [ ] The sandbox acceptance evidence includes `install: apply`, `provider-proxy ready` or `proxy background: started`, `cache_diagnostics`, `comparison":"first_observation`, `comparison":"compared`, `DCC: ready`, `lsp.diagnostics`, `proxy stop: stopped`, and no managed markers after uninstall.
  - [ ] If `codex` is unavailable, the test logs `codex_unavailable` and still validates the generated Codex config/profile files directly.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Full sandbox flow with packageable CLI and mock upstream
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; pnpm vitest run tests/e2e/acceptance/sandbox-profile.test.ts tests/e2e/acceptance/full-fixture-flow.test.ts tests/integration/package/release-install.test.ts' > evidence/task-9-sandbox-acceptance.txt 2>&1
    Expected: tests pass and evidence includes install, proxy, cache, hooks, MCP, stop, and uninstall checks.
    Evidence: evidence/task-9-sandbox-acceptance.txt

  Scenario: Post-uninstall sandbox has no managed markers
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; home="$(mktemp -d)"; port="$(node -e "const s=require(\"node:net\").createServer();s.listen(0,\"127.0.0.1\",()=>{const p=s.address().port;s.close(()=>console.log(p));})")"; node dist/bin/dcc.mjs install --home "$home" --provider-mode=proxy --proxy-port "$port" --no-tui; node dist/bin/dcc.mjs uninstall --home "$home"; ! rg -n "deepseek_proxy|deepseek-codex-combo" "$home/.codex/config.toml"; test ! -e "$home/.codex/plugins/deepseek-codex-combo"; test ! -e "$home/.codex/profiles/deepseek-proxy.toml"' > evidence/task-9-uninstall-clean.txt 2>&1
    Expected: command exits 0; config has no managed markers and managed plugin/profile paths are gone.
    Evidence: evidence/task-9-uninstall-clean.txt
  ```

  Commit: YES | Message: `test(acceptance): cover sandbox production flow` | Files: [`tests/e2e/acceptance/sandbox-profile.test.ts`, `tests/e2e/acceptance/full-fixture-flow.test.ts`, `tests/integration/package/release-install.test.ts`, `tests/harness/evidence.ts`]

- [ ] 10. Update docs and docs contract tests

  What to do: Update README and docs so they describe the chosen packageable `npx`/local tarball/release-payload path, sandbox-first workflow, Node 20 built runtime requirement, plugin-root install behavior, autostart file-only behavior, hook stdin payload behavior, proxy endpoint map, strict doctor/cache-pair contract, live-check opt-in policy, uninstall removal/preservation set, and package checksum verification. Add or update docs contract tests so every documented command is either tested or explicitly marked optional/live. Keep external contract links current with official Codex and DeepSeek docs.
  Must NOT do: Do not claim native provider support. Do not claim cache hits are guaranteed. Do not instruct users to paste API keys into chat, docs, tickets, screenshots, or committed files. Do not advertise `npx deepseek-codex-combo` unless Task 1 and Task 6 made local tarball/package execution pass.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [11, 12, 13] | Blocked by: [1, 2, 3, 4, 5, 6, 7, 8]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `README.md:24-58` - current install and `npx` docs.
  - Pattern:  `README.md:60-82` - current key handling.
  - Pattern:  `README.md:84-118` - current proxy/Codex use docs.
  - Pattern:  `README.md:184-193` - current uninstall docs.
  - Pattern:  `docs/install.md:17-53` - sandbox/install/rollback doc.
  - Pattern:  `docs/provider-proxy.md:1-60` - proxy/cache docs.
  - Pattern:  `docs/external-contracts.md:5-42` - Codex/DeepSeek assumptions.
  - Test:     `tests/unit/docs/readme-contract.test.ts:5-72` - README/docs contract assertions.
  - External: `https://developers.openai.com/codex/config-advanced` - user-level provider config and project config limits.
  - External: `https://developers.openai.com/codex/plugins/build` - plugin root files.
  - External: `https://developers.openai.com/codex/hooks` - hook lifecycle docs.
  - External: `https://api-docs.deepseek.com/api/list-models/` - DeepSeek model IDs.
  - External: `https://api-docs.deepseek.com/api/create-chat-completion` - DeepSeek chat/tool/thinking/cache usage contract.

  Acceptance criteria (agent-executable only):
  - [ ] `pnpm vitest run tests/unit/docs/readme-contract.test.ts tests/unit/contracts/codex-contract.test.ts tests/unit/contracts/deepseek-contract.test.ts tests/unit/contracts/live-gating.test.ts` exits 0.
  - [ ] `rg -n "native provider supported|cache hits are guaranteed|paste.*API key|live DeepSeek support verified|dcc doctor --live passed" README.md docs` returns no matches.
  - [ ] `rg -n "package verify|--cache-pair|proxy-autostart|hooks.*stdin|/v1/responses|/v1/models|/healthz|uninstall" README.md docs` finds the updated operator contract terms.
  - [ ] README and install docs show temp-home install before user-level install.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Documentation contract tests pass
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm vitest run tests/unit/docs/readme-contract.test.ts tests/unit/contracts/codex-contract.test.ts tests/unit/contracts/deepseek-contract.test.ts tests/unit/contracts/live-gating.test.ts' > evidence/task-10-doc-contract.txt 2>&1
    Expected: all docs and external contract tests pass.
    Evidence: evidence/task-10-doc-contract.txt

  Scenario: Documentation avoids unsafe claims
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; ! rg -n "native provider supported|cache hits are guaranteed|paste.*API key|live DeepSeek support verified|dcc doctor --live passed" README.md docs > evidence/task-10-doc-unsafe-claims.txt 2>&1; rg -n "package verify|--cache-pair|proxy-autostart|stdin|/v1/responses|/v1/models|/healthz" README.md docs >> evidence/task-10-doc-unsafe-claims.txt 2>&1'
    Expected: unsafe claim scan has no matches and required production contract terms are present.
    Evidence: evidence/task-10-doc-unsafe-claims.txt
  ```

  Commit: YES | Message: `docs: document sandbox-first production install` | Files: [`README.md`, `docs/install.md`, `docs/provider-proxy.md`, `docs/codex-config.md`, `docs/troubleshooting.md`, `docs/security.md`, `docs/release.md`, `docs/supply-chain.md`, `docs/external-contracts.md`, `tests/unit/docs/readme-contract.test.ts`, `tests/unit/contracts/codex-contract.test.ts`, `tests/unit/contracts/deepseek-contract.test.ts`]

- [ ] 11. Harden CI and release workflow checks

  What to do: Update GitHub Actions so CI and release run the built CLI under Node 20, package dry-run, package verify, plugin validate with runtime, install dry-runs for proxy/plugin-only, and sandbox production smoke without live DeepSeek. Add a release workflow check for local npm pack metadata and a release-payload checksum/install smoke. Keep live DeepSeek checks out of default CI; if a future secret-gated job exists, it must require manual `workflow_dispatch` input and be skipped without secrets.
  Must NOT do: Do not add paid/networked DeepSeek calls to push/pull_request CI. Do not rely on current local Node 24 behavior. Do not remove lint/typecheck/unit/integration/e2e lanes.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [13] | Blocked by: [6, 9, 10]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `.github/workflows/ci.yml:19-24` - current core CI checks.
  - Pattern:  `.github/workflows/release.yml:21-29` - current release checks.
  - Pattern:  `package.json:6-14` - root scripts to preserve/update.
  - Test:     `tests/unit/scaffold/package-scripts.test.ts:5-13` - script contract.
  - Test:     `tests/unit/scaffold/repo-layout.test.ts:5-51` - repo layout contract.
  - Docs:     `docs/supply-chain.md:3-17` - supply-chain claims to keep true.

  Acceptance criteria (agent-executable only):
  - [ ] `.github/workflows/ci.yml` still runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm test:e2e`.
  - [ ] `.github/workflows/ci.yml` or release workflow runs `npx -y node@20 dist/bin/dcc.mjs --help` after `pnpm build`.
  - [ ] `.github/workflows/release.yml` runs `node dist/bin/dcc.mjs package --out`, `node dist/bin/dcc.mjs package verify --out`, and `node dist/bin/dcc.mjs plugin validate --fixture plugins/deepseek-codex-combo --runtime`.
  - [ ] `pnpm vitest run tests/unit/scaffold/package-scripts.test.ts tests/unit/scaffold/repo-layout.test.ts` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Workflow contract tests pass
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm vitest run tests/unit/scaffold/package-scripts.test.ts tests/unit/scaffold/repo-layout.test.ts' > evidence/task-11-workflow-contract.txt 2>&1
    Expected: tests pass.
    Evidence: evidence/task-11-workflow-contract.txt

  Scenario: Workflows include built runtime and release verification checks
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; rg -n "pnpm lint|pnpm typecheck|pnpm test|pnpm test:integration|pnpm test:e2e|node@20|package verify|plugin validate" .github/workflows/ci.yml .github/workflows/release.yml' > evidence/task-11-workflow-grep.txt 2>&1
    Expected: evidence contains all required workflow commands and no live DeepSeek command in push/pull_request paths.
    Evidence: evidence/task-11-workflow-grep.txt
  ```

  Commit: YES | Message: `ci: verify built package and sandbox smoke` | Files: [`.github/workflows/ci.yml`, `.github/workflows/release.yml`, `package.json`, `tests/unit/scaffold/package-scripts.test.ts`, `tests/unit/scaffold/repo-layout.test.ts`]

- [ ] 12. Add production smoke script and evidence ledger

  What to do: Add `scripts/production-smoke.mjs` that runs offline/mocked production smoke from a clean temp home: build output presence check, package verify, local npm pack help, sandbox install, plugin validate runtime, hook stdin smoke, MCP describe/list-tools smoke, proxy background start/status/health, two `/v1/responses` calls with the same cache session id against mock upstream, strict doctor with mock base URL, proxy stop, uninstall, and post-uninstall marker scan. It must write JSON evidence to `--out`, summarize commands/statuses, redact secrets and home paths, and clean up temp dirs/processes on failure. Add a root script such as `production:smoke`.
  Must NOT do: Do not call real DeepSeek. Do not require Codex CLI. Do not leave background proxy processes running. Do not write raw prompts, auth headers, raw tool schemas, or home paths into evidence.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [13] | Blocked by: [6, 7, 8, 9, 10]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/live-cache-diagnostics.mjs:34-40` - command runner pattern.
  - Pattern:  `scripts/live-cache-diagnostics.mjs:105-167` - evidence writing and cleanup pattern.
  - Pattern:  `tests/e2e/acceptance/sandbox-profile.test.ts:75-165` - sandbox acceptance steps.
  - Pattern:  `tests/integration/package/release-install.test.ts:85-150` - release install smoke steps.
  - Pattern:  `packages/shared/src/redact.ts` - redaction helper to use from script if practical.
  - Test:     `tests/e2e/acceptance/full-fixture-flow.test.ts:14-57` - offline acceptance flow.
  - Docs:     `README.md:121-138` - command list to update with smoke script if exposed.

  Acceptance criteria (agent-executable only):
  - [ ] `node scripts/production-smoke.mjs --out evidence/task-12-production-smoke.json` exits 0.
  - [ ] Evidence JSON includes `package_verify:true`, `sandbox_install:true`, `plugin_validate:true`, `hooks:true`, `mcp:true`, `proxy:true`, `cache_pair:true`, `doctor:true`, `uninstall:true`.
  - [ ] Evidence JSON does not contain `sk-`, `Authorization`, the temp home path, raw prompt text, or raw tool schema text.
  - [ ] Failure path test with an occupied proxy port exits non-zero, writes cleanup evidence, and leaves no proxy state file.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Production smoke emits redacted evidence
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; node scripts/production-smoke.mjs --out evidence/task-12-production-smoke.json; node -e "const fs=require(\"node:fs\"); const p=JSON.parse(fs.readFileSync(\"evidence/task-12-production-smoke.json\",\"utf8\")); for (const k of [\"package_verify\",\"sandbox_install\",\"plugin_validate\",\"hooks\",\"mcp\",\"proxy\",\"cache_pair\",\"doctor\",\"uninstall\"]) if (p.assertions?.[k] !== true) throw new Error(k);"; ! rg -n "sk-|Authorization|raw prompt|tool schema" evidence/task-12-production-smoke.json' > evidence/task-12-production-smoke.txt 2>&1
    Expected: script exits 0, JSON assertions are true, and redaction scan has no matches.
    Evidence: evidence/task-12-production-smoke.json

  Scenario: Production smoke cleanup on occupied port
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; port="$(node -e "const s=require(\"node:net\").createServer();s.listen(0,\"127.0.0.1\",()=>{const p=s.address().port;console.log(p); setTimeout(()=>s.close(),5000);})")"; set +e; node scripts/production-smoke.mjs --port "$port" --out evidence/task-12-production-smoke-error.json > evidence/task-12-production-smoke-error.txt 2>&1; code=$?; set -e; test "$code" -ne 0; rg -n "proxy_port_unavailable|cleanup" evidence/task-12-production-smoke-error.txt evidence/task-12-production-smoke-error.json'
    Expected: script exits non-zero, reports port unavailability/cleanup, and does not leave a managed proxy process.
    Evidence: evidence/task-12-production-smoke-error.json
  ```

  Commit: YES | Message: `test(smoke): add production sandbox evidence script` | Files: [`scripts/production-smoke.mjs`, `package.json`, `tests/e2e/acceptance/full-fixture-flow.test.ts`, `docs/release.md`, `docs/supply-chain.md`, `README.md`]

- [ ] 13. Run security, supply-chain, and regression sweep

  What to do: Finalize source-level redaction and supply-chain guards after previous tasks. Add/adjust tests to scan built/package/release artifacts for forbidden content, verify generated evidence redaction, verify release excludes tests/fixtures/secrets, and ensure docs do not overclaim. Then run the full local regression chain. Because this workspace currently has no `.git` metadata, executor must run commit commands only inside a real git checkout; if still no git repo, write the intended commit message and changed file list to `evidence/task-13-git-unavailable.txt`.
  Must NOT do: Do not delete user files or reset the worktree. Do not include generated temp homes, release payloads, `.dcc/secrets`, or bulky evidence in a commit unless the project already tracks that exact evidence path by policy.

  Parallelization: Can parallel: NO | Wave 3 | Blocks: [final verification] | Blocked by: [10, 11, 12]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `tests/integration/security/redaction-snapshots.test.ts:4-25` - redaction snapshot test pattern.
  - Pattern:  `packages/provider-proxy/src/cacheDiagnostics.test.ts:25-214` - no raw prefix/tool content in cache diagnostics.
  - Pattern:  `tests/integration/package/package-contents.test.ts:142-170` - release artifact exclusion checks.
  - Pattern:  `tests/unit/docs/readme-contract.test.ts:37-65` - unsafe docs claim guard.
  - Pattern:  `.gitignore:1-6` - current ignored generated/secrets paths.
  - Docs:     `docs/security.md` - security docs to keep aligned.
  - Docs:     `docs/supply-chain.md:3-17` - supply-chain docs to keep aligned.

  Acceptance criteria (agent-executable only):
  - [ ] `pnpm lint` exits 0.
  - [ ] `pnpm typecheck` exits 0.
  - [ ] `pnpm test` exits 0.
  - [ ] `pnpm test:integration` exits 0.
  - [ ] `pnpm test:e2e` exits 0.
  - [ ] `node scripts/production-smoke.mjs --out evidence/task-13-production-smoke.json` exits 0.
  - [ ] `rg -n "sk-[A-Za-z0-9_-]+|Authorization: Bearer" dist plugins/deepseek-codex-combo docs README.md --glob '!plugins/deepseek-codex-combo/dist/**/node_modules/**'` finds no real secrets; only documented placeholders such as `sk-...` may remain in docs if tests explicitly whitelist them.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Full regression chain passes
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm lint; pnpm typecheck; pnpm test; pnpm test:integration; pnpm test:e2e' > evidence/task-13-regression.txt 2>&1
    Expected: all commands exit 0.
    Evidence: evidence/task-13-regression.txt

  Scenario: Built artifacts and evidence are redacted
    Tool:     bash
    Steps:    bash -lc 'set -euo pipefail; mkdir -p evidence; pnpm build; node scripts/production-smoke.mjs --out evidence/task-13-production-smoke.json; pnpm vitest run tests/integration/security/redaction-snapshots.test.ts tests/integration/package/package-contents.test.ts packages/provider-proxy/src/cacheDiagnostics.test.ts; ! rg -n "sk-task19secret|Bearer token.with.parts|Authorization: Bearer|private system prefix|secret tool schema" dist plugins/deepseek-codex-combo evidence/task-13-production-smoke.json' > evidence/task-13-redaction.txt 2>&1
    Expected: tests pass and artifact/evidence scan has no forbidden secret or raw-cache content.
    Evidence: evidence/task-13-redaction.txt
  ```

  Commit: YES | Message: `chore(release): verify production readiness sweep` | Files: [`tests/integration/security/redaction-snapshots.test.ts`, `tests/integration/package/package-contents.test.ts`, `docs/security.md`, `docs/supply-chain.md`, `.gitignore`, `evidence/task-13-regression.txt`, `evidence/task-13-redaction.txt`]

## Final verification wave (MANDATORY - after all implementation tasks)
> Runs in PARALLEL. ALL must APPROVE. Surface results to the caller and wait for an explicit "okay" before declaring complete.
- [ ] F1. Plan compliance audit - every task done, every acceptance criterion met
- [ ] F2. Code quality review - diagnostics clean, idioms match, no dead code
- [ ] F3. Real manual QA - every QA scenario executed with evidence captured
- [ ] F4. Scope fidelity - nothing extra shipped beyond Must-Have, nothing Must-NOT-Have introduced

## Commit strategy
- One logical change per commit. Conventional Commits (`<type>(<scope>): <subject>` body + footer).
- Atomic: every commit builds and passes tests on its own.
- No "WIP" / "fix typo squash later" commits on the final branch - clean up before merge.
- Reference the plan file path in the final commit footer: `Plan: plans/production-usable-gap-plan.md`.

## Success criteria
- All Must-Have shipped; all QA scenarios pass with captured evidence; F1-F4 approved; commit history clean.
