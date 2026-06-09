# Docker User Install E2E Plan

## Objective

Docker 안에서 Deepseek-Codex-Combo를 "처음 설치하는 실제 사용자"처럼 설치하고 사용하는 E2E 테스트 체계를 만든다. 기본 검증은 API 비용이 들지 않는 mock upstream으로 실행하고, 실제 DeepSeek API 호출은 `DEEPSEEK_API_KEY`가 있을 때만 별도 opt-in 명령으로 실행한다.

## Decisions

- Docker E2E는 host의 `HOME`, `CODEX_HOME`, `~/.codex`를 절대 사용하지 않는다.
- Docker 이미지는 Codex CLI를 반드시 포함한다. Codex CLI가 없으면 Docker E2E는 skip이 아니라 실패한다.
- 기본 Docker E2E는 릴리스 payload 설치 경로만 검증한다. checkout 직접 설치는 기존 비-Docker 테스트 범위로 둔다.
- 기본 Docker E2E는 mock DeepSeek-compatible upstream을 사용한다. live DeepSeek 검증은 별도 명령과 명시적 env gate로 분리한다.
- `run-dcc-sandbox.command`는 Docker 기본 E2E에서 `DCC_SANDBOX_SKIP_CODEX=1`로 실행해 interactive hang을 방지한다.
- Docker E2E는 최소 acceptance matrix만 검증한다: build, package, install, Codex profile, default Flash, auto routing, proxy lifecycle, hooks, MCP describe, uninstall cleanup.

## Scope

IN:
- Docker preflight and isolated Linux user environment
- Dockerfile and host runner script
- Release payload install scenario
- Codex CLI profile smoke for `deepseek-flash`, `deepseek-proxy`, `deepseek-current`
- Automatic Pro/Flash and agent routing smoke
- Mock proxy lifecycle and direct `/v1/responses` smoke
- Hook and MCP entrypoint smoke
- Uninstall cleanup assertions
- Optional live DeepSeek scenario gated by env
- Usage documentation

OUT:
- Publishing Docker images to a registry
- Making Docker E2E mandatory in normal `pnpm test`
- Exhaustively testing every skill, MCP tool, or prompt route
- Storing or baking API keys into images

## TODOs

- [x] Add Docker E2E preflight, image, host runner, and container scenario scripts.
- [x] Add release-install, Codex profile, routing, proxy, hooks/MCP, and uninstall assertions to the container scenario.
- [x] Add Docker E2E package scripts, Vitest wrapper, Docker ignore rules, and user documentation.
- [x] Run local and Docker verification, record start-work evidence, and update completion state.

## Files To Create Or Update

- `docker/user-install.Dockerfile`
- `.dockerignore`
- `scripts/docker-user-install-e2e.mjs`
- `tests/e2e/docker/user-install.test.ts`
- `docs/docker-user-install-e2e.md`
- `package.json`
- `README.md`

## Implementation Tasks

### Task 1: Docker Preflight And Isolation Contract

Owner: test infrastructure.

Actions:
- Add a preflight phase in `scripts/docker-user-install-e2e.mjs`.
- Check `docker version` and `docker buildx version` before building.
- Create an evidence directory under `.dcc/evidence/docker-user-install/<timestamp>/`.
- Record the effective host repo path, Docker version, and test mode (`mock` or `live`) into `preflight.json`.
- Hard-fail if the host environment variable `CODEX_HOME` would be mounted into the container.

Required implementation details:
- The runner must pass only the repo checkout into the container.
- Use container-local paths:
  - repo: `/work/Deepseek-Codex-Combo`
  - user home: `/home/dcc-user`
  - Codex home: `/home/dcc-user/.codex`
  - sandbox home: `/home/dcc-user/dcc-sandbox`
- Do not mount `/Users/junnnny/.codex` or any host home subdirectory.

Happy-path QA:
- `pnpm test:docker:e2e -- --preflight-only` writes `preflight.json`.
- `preflight.json` contains Docker version and no host `CODEX_HOME`.

Failure QA:
- Temporarily run the script with an explicit forbidden mount option in a unit-level test and assert it fails before `docker run`.
- Run with Docker unavailable in a mocked child-process test and assert the error says Docker is required.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/preflight.json`
- `.dcc/evidence/docker-user-install/<timestamp>/preflight.log`

### Task 2: Fresh User Docker Image

Owner: Docker test image.

Actions:
- Create `docker/user-install.Dockerfile`.
- Base it on `node:24-bookworm-slim`.
- Enable pnpm through Corepack and pin `pnpm@10.33.0`.
- Install minimal OS dependencies required by Codex CLI and repository tests: `git`, `ca-certificates`, `curl`, and shell utilities already expected by scripts.
- Install Codex CLI inside the image with an explicit version argument:
  - `ARG CODEX_CLI_VERSION=0.130.0`
  - `npm install -g @openai/codex@${CODEX_CLI_VERSION}`
- Create a non-root user `dcc-user`.
- Set `HOME=/home/dcc-user` and `CODEX_HOME=/home/dcc-user/.codex`.

Required implementation details:
- Codex CLI must be mandatory in this image. `codex --version` failure fails the Docker build or entrypoint smoke.
- API keys must not be accepted as Docker build args.
- Add `.dockerignore` so `node_modules`, `.dcc/sandbox-home`, `.dcc/evidence`, `.git`, and local caches are not copied into build context.

Happy-path QA:
- `docker build -f docker/user-install.Dockerfile --build-arg CODEX_CLI_VERSION=0.130.0 .` succeeds.
- `docker run --rm <image> codex --version` exits 0.
- `docker run --rm <image> pnpm --version` prints `10.33.0`.

Failure QA:
- Build with an invalid `CODEX_CLI_VERSION` and assert the build fails.
- Run as `dcc-user` and assert `id -u` is not 0.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/docker-build.log`
- `.dcc/evidence/docker-user-install/<timestamp>/image-smoke.log`

### Task 3: Host Runner Script

Owner: E2E orchestration.

Actions:
- Create `scripts/docker-user-install-e2e.mjs`.
- Support modes:
  - default mock mode: `node scripts/docker-user-install-e2e.mjs`
  - live mode: `node scripts/docker-user-install-e2e.mjs --live`
  - preflight only: `node scripts/docker-user-install-e2e.mjs --preflight-only`
- Build the Docker image with a deterministic tag such as `dcc-user-install-e2e:<repo-hash-or-timestamp>`.
- Run the container with:
  - repo mounted read/write at `/work/Deepseek-Codex-Combo`
  - working directory `/work/Deepseek-Codex-Combo`
  - `HOME=/home/dcc-user`
  - `CODEX_HOME=/home/dcc-user/.codex`
  - no host home mounts
- Stream container output to terminal and tee it into evidence logs.
- Always attempt cleanup after failure: stop proxy if pid files exist, remove temp container, and write `summary.json`.

Required implementation details:
- The runner must redact `DEEPSEEK_API_KEY` from all logs.
- The runner must pass `DEEPSEEK_API_KEY` only with `docker run -e DEEPSEEK_API_KEY` in `--live` mode.
- Default mock mode must explicitly unset `DEEPSEEK_API_KEY` inside the container.

Happy-path QA:
- `node scripts/docker-user-install-e2e.mjs --preflight-only` exits 0.
- `node scripts/docker-user-install-e2e.mjs` exits 0 and creates `summary.json` with `"status":"passed"`.

Failure QA:
- Inject a failing container command through a test-only flag and assert `summary.json` records failure and cleanup status.
- In live mode without `DEEPSEEK_API_KEY`, assert the runner exits before Docker run with a clear message.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/container.log`
- `.dcc/evidence/docker-user-install/<timestamp>/summary.json`

### Task 4: Container Scenario Script

Owner: user-scenario implementation.

Actions:
- The host runner must execute `scripts/docker-user-install-scenario.mjs` as the single deterministic container scenario command.
- Use a Node scenario script because the repo already uses Node-based scripts for release/build logic.
- The scenario script must perform the same sequence a user would:
  1. `pnpm install`
  2. `pnpm build`
  3. Build release payload
  4. Install from release payload into isolated home
  5. Use Codex profiles
  6. Use route switching
  7. Start/stop proxy
  8. Run hook/MCP smoke
  9. Uninstall

Required implementation details:
- Use a unique proxy port discovered inside the container, not a hard-coded host port.
- Write a mock upstream response fixture into a temp path inside `/home/dcc-user`, rather than depending on test fixtures being packaged.
- Every command assertion must capture stdout, stderr, exit code, and elapsed time into evidence.

Happy-path QA:
- The scenario completes in mock mode with no API key.
- All evidence files are owned by the host user after Docker exits, or the runner copies them out with corrected ownership.

Failure QA:
- Break the mock upstream path and assert proxy start or request smoke fails with a named step.
- Break the isolated home path and assert install fails before Codex launch.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/steps/*.json`
- `.dcc/evidence/docker-user-install/<timestamp>/mock-upstream.json`

### Task 5: Release Payload Install Scenario

Owner: package install flow.

Actions:
- In the container scenario, build the release payload using the existing release/package command used by repository tests.
- Install from the built payload, not from source internals:
  - package output: `.dcc/release-docker/files`
  - install command: `node .dcc/release-docker/files/dist/bin/dcc.mjs install --home "$DCC_USER_HOME" --no-tui --provider-mode=proxy --proxy-port "$DCC_PROXY_PORT"`
- Assert generated files exist under `$DCC_USER_HOME/.codex`:
  - `config.toml`
  - `profiles/deepseek-flash.toml`
  - `profiles/deepseek-proxy.toml`
  - `profiles/deepseek-current.toml`
  - `agents/dcc-planner-pro.toml`
  - `agents/dcc-worker-pro.toml`

Required implementation details:
- The scenario must not use `bin/dcc.mjs` after the release payload is built, except for building the payload itself.
- The install step must run as the non-root Docker user.
- Save rendered config output into evidence and assert it contains:
  - `[profiles.deepseek-flash]`
  - `[profiles.deepseek-proxy]`
  - `[profiles.deepseek-current]`
  - `model = "deepseek-v4-flash"` for the default Flash profile

Happy-path QA:
- Fresh isolated home install succeeds.
- Re-running install in the same isolated home is idempotent and does not duplicate managed blocks.

Failure QA:
- Delete the release payload CLI path and assert the scenario fails at the package/install step with a precise message.
- Corrupt an existing isolated `config.toml` managed block in a test fixture and assert install reports the config problem instead of silently producing invalid TOML.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/steps/package.json`
- `.dcc/evidence/docker-user-install/<timestamp>/steps/install.json`
- `.dcc/evidence/docker-user-install/<timestamp>/rendered-config.toml`

### Task 6: Codex Profile And Default Flash Smoke

Owner: user-facing Codex launch surface.

Actions:
- From inside the container after install, run:
  - `HOME="$DCC_USER_HOME" CODEX_HOME="$DCC_USER_HOME/.codex" codex --profile deepseek-flash --help`
  - `HOME="$DCC_USER_HOME" CODEX_HOME="$DCC_USER_HOME/.codex" codex --profile deepseek-proxy --help`
  - `HOME="$DCC_USER_HOME" CODEX_HOME="$DCC_USER_HOME/.codex" codex --profile deepseek-current --help`
- Run `run-dcc-sandbox.command` in Docker with:
  - `DCC_SANDBOX_HOME="$DCC_USER_HOME/dcc-sandbox"`
  - `DCC_PROXY_PORT="$DCC_PROXY_PORT"`
  - `DCC_SANDBOX_SKIP_CODEX=1`
- Assert sandbox launcher output says the default profile is `deepseek-flash`.

Required implementation details:
- Codex CLI absence is a hard failure, not a skip.
- Do not launch interactive Codex in the default Docker E2E.
- If Codex CLI emits model metadata warnings, capture them but do not fail solely on warning text unless the command exits non-zero.

Happy-path QA:
- All three `codex --profile ... --help` commands exit 0.
- Sandbox launcher exits after setup without hanging.
- Launcher evidence shows default Flash behavior.

Failure QA:
- Run with a deliberately missing `profiles/deepseek-current.toml` and assert the `deepseek-current` command fails at the profile smoke step.
- Run without `DCC_SANDBOX_SKIP_CODEX=1` in a mocked test and assert the runner refuses interactive mode unless an explicit `--interactive` flag is provided.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/steps/codex-profile-flash.json`
- `.dcc/evidence/docker-user-install/<timestamp>/steps/codex-profile-proxy.json`
- `.dcc/evidence/docker-user-install/<timestamp>/steps/codex-profile-current.json`
- `.dcc/evidence/docker-user-install/<timestamp>/steps/sandbox-launcher.json`

### Task 7: Automatic Routing Matrix

Owner: routing behavior.

Actions:
- In the installed release payload, run route switching through the installed CLI:
  - lightweight prompt: `node "$DCC_CLI" switch auto --home "$DCC_USER_HOME" --prompt "간단히 현재 폴더 구조를 요약해줘"`
  - high-risk prompt: `node "$DCC_CLI" switch auto --home "$DCC_USER_HOME" --prompt "보안 취약점과 배포 위험을 검증해줘"`
  - planning prompt: `node "$DCC_CLI" switch auto --home "$DCC_USER_HOME" --prompt "Docker E2E 테스트 계획을 세워줘"`
- Assert expected routes:
  - lightweight prompt -> `model = "deepseek-v4-flash"` and librarian/quick Flash agent route
  - high-risk prompt -> `model = "deepseek-v4-pro"` and verifier Pro agent route
  - planning prompt -> `model = "deepseek-v4-pro"` and planner Pro agent route
- After each route, run:
  - `HOME="$DCC_USER_HOME" CODEX_HOME="$DCC_USER_HOME/.codex" codex --profile deepseek-current debug prompt-input "<same prompt>"`

Required implementation details:
- The Docker E2E should cover only these three route categories to avoid scope creep.
- The assertion should parse TOML or structured CLI output, not rely only on loose substring matching.
- Save the current profile after each route into evidence.

Happy-path QA:
- All three route prompts produce the expected model and agent.
- `codex --profile deepseek-current debug prompt-input` exits 0 after each route.

Failure QA:
- Modify a test fixture to route a high-risk prompt to Flash and assert the matrix fails.
- Delete the current profile file and assert route switching recreates it successfully from the selected route.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/steps/route-lightweight.json`
- `.dcc/evidence/docker-user-install/<timestamp>/steps/route-risk.json`
- `.dcc/evidence/docker-user-install/<timestamp>/steps/route-plan.json`
- `.dcc/evidence/docker-user-install/<timestamp>/deepseek-current-after-*.toml`

### Task 8: Proxy Lifecycle And Mock Response Smoke

Owner: provider proxy behavior.

Actions:
- Write a mock upstream fixture inside the container:
  - path: `$DCC_USER_HOME/mock-upstream-response.json`
  - response must include a deterministic text payload such as `docker mock response ok`.
- Start the installed proxy:
  - `node "$DCC_CLI" proxy start --background --home "$DCC_USER_HOME" --host 127.0.0.1 --port "$DCC_PROXY_PORT" --mock-upstream "$DCC_USER_HOME/mock-upstream-response.json"`
- Run:
  - `node "$DCC_CLI" proxy status --home "$DCC_USER_HOME" --port "$DCC_PROXY_PORT"`
  - `curl http://127.0.0.1:$DCC_PROXY_PORT/v1/responses ...`
- Stop the proxy:
  - `node "$DCC_CLI" proxy stop --home "$DCC_USER_HOME" --port "$DCC_PROXY_PORT"`
- Assert final status is stopped.

Required implementation details:
- Always stop the proxy in a `finally` cleanup path.
- Assert the response body contains the deterministic mock text.
- Do not require `DEEPSEEK_API_KEY` for mock mode.

Happy-path QA:
- Proxy starts, status reports running, `/v1/responses` returns mock text, proxy stops, status reports stopped.

Failure QA:
- Start a proxy on an occupied port and assert the scenario chooses a fresh port or fails with a named port error.
- Remove the mock fixture and assert proxy smoke fails before any live API attempt.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/steps/proxy-start.json`
- `.dcc/evidence/docker-user-install/<timestamp>/steps/proxy-response.json`
- `.dcc/evidence/docker-user-install/<timestamp>/steps/proxy-stop.json`

### Task 9: Hooks, MCP, And Plugin Surface Smoke

Owner: installed integration surface.

Actions:
- Use the installed release CLI to run minimal user-visible entrypoints:
  - `node "$DCC_CLI" hooks session-start --home "$DCC_USER_HOME"`
  - `node "$DCC_CLI" hooks user-prompt-submit --home "$DCC_USER_HOME" --json '{"prompt":"보안 위험을 검토해줘"}'`
  - `node "$DCC_CLI" lsp mcp --describe`
  - `node "$DCC_CLI" ast-grep mcp --describe`
  - `node "$DCC_CLI" hashline --help`
- Assert the session-start hook reports the default Flash model.
- Assert the user-prompt-submit hook reports the expected Pro route for the security prompt.
- Assert MCP describe commands return command metadata without starting long-running servers.

Required implementation details:
- Use describe/help modes only for MCP servers in Docker E2E.
- Do not test every MCP tool operation in this user-install scenario.
- Save hook output separately from general container logs.

Happy-path QA:
- All hook and describe commands exit 0.
- Hook output agrees with the route matrix.

Failure QA:
- Temporarily remove the installed plugin directory in a negative scenario and assert the hook or MCP smoke fails with a missing plugin/install surface error.
- Pass invalid JSON to `hooks user-prompt-submit` and assert it fails with a JSON parse error, not a silent success.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/steps/hook-session-start.json`
- `.dcc/evidence/docker-user-install/<timestamp>/steps/hook-user-prompt-submit.json`
- `.dcc/evidence/docker-user-install/<timestamp>/steps/mcp-describe.json`

### Task 10: Uninstall And Cleanup Assertions

Owner: lifecycle cleanup.

Actions:
- Run uninstall from the installed release CLI:
  - `node "$DCC_CLI" uninstall --home "$DCC_USER_HOME"`
- Assert config cleanup:
  - no `deepseek_proxy`
  - no `deepseek-codex-combo`
  - no `deepseek-current`
  - no `deepseek-flash`
  - no `deepseek-proxy`
- Assert generated files are removed:
  - `$DCC_USER_HOME/.codex/profiles/deepseek-flash.toml`
  - `$DCC_USER_HOME/.codex/profiles/deepseek-proxy.toml`
  - `$DCC_USER_HOME/.codex/profiles/deepseek-current.toml`
  - DCC-managed plugin cache path
- Assert proxy is stopped after uninstall.

Required implementation details:
- If user-owned non-DCC config exists in `config.toml`, uninstall must preserve it.
- Test this by writing a sentinel unmanaged config block before install or before uninstall.
- The Docker E2E should fail if uninstall leaves malformed TOML.

Happy-path QA:
- Uninstall exits 0.
- DCC-managed blocks and generated files are gone.
- Unmanaged sentinel config remains.

Failure QA:
- Keep proxy running before uninstall and assert cleanup stops it or reports a clear residual process failure.
- Add malformed unmanaged TOML before uninstall in a negative test and assert the failure is explicit.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/steps/uninstall.json`
- `.dcc/evidence/docker-user-install/<timestamp>/config-after-uninstall.toml`
- `.dcc/evidence/docker-user-install/<timestamp>/cleanup-summary.json`

### Task 11: Vitest Wrapper And Package Scripts

Owner: developer ergonomics.

Actions:
- Create `tests/e2e/docker/user-install.test.ts`.
- The Vitest test should call `scripts/docker-user-install-e2e.mjs` and use a generous timeout.
- Add package scripts:
  - `"test:docker:e2e": "node scripts/docker-user-install-e2e.mjs"`
  - `"test:docker:e2e:live": "node scripts/docker-user-install-e2e.mjs --live"`
  - `"test:docker:e2e:vitest": "vitest run tests/e2e/docker/user-install.test.ts"`
- Keep Docker E2E out of normal `pnpm test` unless explicitly requested later.

Required implementation details:
- If Docker is unavailable, direct script mode should fail clearly.
- The Vitest wrapper may skip Docker-unavailable environments only when the test process has `DCC_DOCKER_E2E_OPTIONAL=1`; the direct `pnpm test:docker:e2e` command must not skip.
- Set test timeout to at least 10 minutes because Docker build plus package install can be slow.

Happy-path QA:
- `pnpm test:docker:e2e` runs the direct script.
- `pnpm test:docker:e2e:vitest` runs the wrapper and reports one passing Docker scenario when Docker is available.

Failure QA:
- Mock Docker absence in a unit helper test and assert the direct command error is actionable.
- Confirm `pnpm test` does not invoke Docker.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/vitest-wrapper.log`
- Package script diff in `package.json`

### Task 12: Optional Live DeepSeek Scenario

Owner: live provider validation.

Actions:
- Implement `--live` mode in the Docker runner.
- Require `DEEPSEEK_API_KEY` in the host environment before Docker starts.
- Pass the key into Docker only as a runtime environment variable:
  - `docker run -e DEEPSEEK_API_KEY`
- In live mode, run the same install/profile/routing checks, then start proxy without `--mock-upstream`.
- Send one minimal `/v1/responses` request through the DCC proxy.
- Stop proxy immediately after the response.

Required implementation details:
- Never pass the key as Docker build arg.
- Redact the key from command traces, logs, `summary.json`, and failed command payloads.
- Live mode must print a clear API-cost warning before execution.
- If the provider returns an authentication/rate-limit/network error, record it as a live provider failure with response status and redacted body.

Happy-path QA:
- `DEEPSEEK_API_KEY=... pnpm test:docker:e2e:live` completes one real proxy response.
- Evidence confirms the live scenario did not use mock upstream.

Failure QA:
- Run live mode without `DEEPSEEK_API_KEY` and assert it exits before Docker build/run.
- Run with a fake key and assert the error is classified as provider auth failure.

Evidence:
- `.dcc/evidence/docker-user-install/<timestamp>/steps/live-proxy-response.json`
- `.dcc/evidence/docker-user-install/<timestamp>/live-summary.json`

### Task 13: User Documentation

Owner: docs.

Actions:
- Create `docs/docker-user-install-e2e.md`.
- Update `README.md` with a short Docker test section that links to the full doc.
- Document the two user commands:
  - mock/default: `pnpm test:docker:e2e`
  - live/paid opt-in: `DEEPSEEK_API_KEY=... pnpm test:docker:e2e:live`
- Explain what the Docker test proves:
  - fresh install
  - isolated Codex home
  - default Flash profile
  - automatic Pro/Flash routing
  - proxy lifecycle
  - uninstall cleanup
- Explain what it intentionally does not prove:
  - every possible Codex interactive workflow
  - every MCP tool operation
  - registry-ready Docker image publishing

Required implementation details:
- Include troubleshooting for:
  - Docker not running
  - Codex CLI install failure in image build
  - `DEEPSEEK_API_KEY` missing in live mode
  - proxy port collision
  - Apple Silicon platform differences, handled by documenting `--platform linux/amd64` retry only when the default platform build fails

Happy-path QA:
- A user can follow `docs/docker-user-install-e2e.md` from a fresh clone and run mock E2E.
- README gives the short command without duplicating every detail.

Failure QA:
- Intentionally omit `DEEPSEEK_API_KEY` and confirm docs match the observed live-mode error.
- Run docs command with Docker stopped and confirm docs match the preflight error.

Evidence:
- `docs/docker-user-install-e2e.md`
- README Docker section

## Final Verification Wave

1. Run local non-Docker gates:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm build`
   - `pnpm test`
2. Run Docker mock E2E:
   - `pnpm test:docker:e2e`
3. Run Docker live E2E only when the user explicitly opts in:
   - `DEEPSEEK_API_KEY=... pnpm test:docker:e2e:live`
4. Confirm host safety:
   - No writes to host `~/.codex`
   - No API key appears in logs, image history, or generated evidence files
   - Docker container exits with proxy stopped

## Acceptance Criteria

- A fresh Docker container can install the packaged DCC runtime without host Codex config.
- The default user-facing profile is `deepseek-flash`.
- `deepseek-current` can be switched by prompt routing without manual user model selection.
- Pro routes are selected for high-risk or verification prompts; Flash routes are selected for lightweight prompts.
- Proxy starts, answers a mock `/v1/responses` request, and stops.
- Hooks and MCP smoke commands execute from the installed payload.
- Uninstall removes DCC-managed provider/plugin/profile blocks and generated profile files from the isolated container home.
- Live DeepSeek testing is available but never runs accidentally.
