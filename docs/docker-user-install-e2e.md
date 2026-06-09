# Docker User Install E2E

This check runs DeepSeek-Codex-Combo inside a fresh Docker Linux user environment. It is intended to answer one question: can a real user install the release payload, launch the generated Codex profiles, route Pro/Flash automatically, use the proxy, and uninstall cleanly without touching the host Codex home?

## Default Mock Run

```bash
pnpm test:docker:e2e
```

The default run does not require `DEEPSEEK_API_KEY` and does not call DeepSeek. It builds a Docker image with Node, pnpm, Codex CLI, and the current checkout, then runs the installed release payload with a mock upstream response.

It verifies:

- isolated container `HOME=/home/dcc-user`
- isolated container `CODEX_HOME=/home/dcc-user/.codex`
- npm tarball install with `npm install -g`
- bare `dcc` defaulting to isolated `dcc sandbox run`
- `dcc auth login`, `dcc auth status`, and saved local key discovery
- release payload install from `.dcc/release-docker/files`
- `deepseek-flash`, `deepseek-proxy`, and `deepseek-current` Codex profile smoke
- default Flash sandbox launcher behavior
- automatic route switching for all bundled agents:
  - `dcc-librarian-flash`
  - `dcc-worker-flash`
  - `dcc-verifier-pro`
  - `dcc-planner-pro`
  - `dcc-worker-pro`
- proxy start, mock `/v1/responses`, status, and stop
- hook, LSP MCP, AST-grep MCP, and hashline smoke commands
- uninstall cleanup with user-owned config preserved

Evidence is written under:

```text
.dcc/evidence/docker-user-install/<timestamp>/
```

## Live DeepSeek Run

```bash
DEEPSEEK_API_KEY=sk-... pnpm test:docker:e2e:live
```

Live mode is opt-in and may incur API cost. It sends real `/v1/responses` calls for both `deepseek-v4-flash` and `deepseek-v4-pro`. The key is passed only at `docker run` time and is redacted from runner logs and JSON evidence. The key is never passed as a Docker build argument.

If the key is missing, live mode exits before `docker build` or `docker run` with:

```text
DEEPSEEK_API_KEY is required for live Docker E2E
```

## Vitest Wrapper

```bash
pnpm test:docker:e2e:vitest
```

The wrapper runs the same preflight assertions through Vitest. It is separate from `pnpm test`, so normal local tests do not build Docker images.

## Troubleshooting

- Docker is not running: start Docker Desktop or the Docker daemon, then rerun `pnpm test:docker:e2e`.
- Codex CLI install fails during image build: set `CODEX_CLI_VERSION` to a known compatible version, for example `CODEX_CLI_VERSION=0.130.0 pnpm test:docker:e2e`.
- Proxy port collision: the scenario asks the container OS for a free loopback port. If a collision still appears in evidence, rerun the command and inspect `steps/proxy-start.json`.
- Apple Silicon build issue: retry with Docker Desktop running normally first. If Docker reports a platform-specific base image failure, rerun with a Docker build platform override after adding it to the runner command.

## Non-Goals

This test does not prove every interactive Codex workflow, every MCP tool operation, or registry-ready Docker image publishing. It is a user-install E2E smoke for the release payload and the primary DCC runtime surfaces.
