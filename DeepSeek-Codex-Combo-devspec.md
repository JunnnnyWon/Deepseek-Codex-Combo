# DeepSeek-Codex-Combo 개발명세서

- 문서 버전: 0.1.0
- 작성일: 2026-06-07
- 대상 런타임: OpenAI Codex CLI / Codex IDE Extension 호환 플러그인
- 목표 모델: `deepseek-v4-pro`, `deepseek-v4-flash`
- 프로젝트명: **DeepSeek-Codex-Combo**
- 기본 패키지명 제안: `deepseek-codex-combo`
- 기본 CLI명 제안: `dcc`
- 기본 Codex 플러그인명 제안: `deepseek-codex-combo`

---

## 0. Codex에게 주는 최상위 지시

이 문서는 단순히 DeepSeek 모델 이름을 Codex 설정에 넣는 작업이 아니다. 목표는 LazyCodex와 oh-my-openagent가 제공하는 **하네스 중심 개발 경험**을 DeepSeek V4 계열에 맞춰 다시 설계하는 것이다.

Codex는 구현 시 다음 원칙을 반드시 지킨다.

1. **하네스 우선**: 모델 호출보다 계획, 규칙 주입, LSP/AST 진단, 댓글 검사, 반복 실행, 증거 기반 검증이 더 중요하다.
2. **DeepSeek 직접 연결을 과신하지 말 것**: 현재 Codex의 custom provider 공식 스키마는 Responses API wire를 기준으로 한다. DeepSeek 공식 API는 OpenAI ChatCompletions 및 Anthropic 호환을 제공한다. 따라서 1차 구현은 `Codex Responses API -> DeepSeek ChatCompletions` 변환 프록시를 포함해야 한다.
3. **기존 OmO/LazyCodex의 장점 복제**: `rules`, `comment-checker`, `lsp`, `ultrawork`, `ulw-loop`, `start-work-continuation`, `project memory`, `planner`, `verified completion`, `model routing`을 DeepSeek용으로 재해석한다.
4. **GPT/Claude 전용 프롬프트 제거**: GPT/Claude family에 맞춰진 model routing, prompt profile, agent wording, quota assumptions를 DeepSeek Pro/Flash profile로 분리한다.
5. **검증 가능해야 완료**: 기능 구현 완료 조건은 테스트 통과가 아니라, 실제 파일 변경·진단·실행 결과·수동 QA evidence가 남는 것이다.
6. **설치/삭제는 idempotent**: 여러 번 설치해도 중복 설정이 생기면 안 되고, 삭제 시 사용자가 만든 설정은 보존해야 한다.
7. **비밀 정보 금지**: `DEEPSEEK_API_KEY`, Codex auth token, 로컬 파일 경로, Git remote, 프롬프트 원문을 로그/텔레메트리에 남기지 않는다.
8. **한국어/영어 모두 대응**: 사용자가 한국어로 명령하더라도 내부 명령·로그·파일 구조는 영어 식별자를 사용하고, 사용자-facing 출력은 한국어를 지원한다.

---

## 1. 문제 정의

사용자는 Codex에서 DeepSeek V4 Flash/Pro를 사용하고 싶어 한다. 하지만 단순히 `model = "deepseek-v4-pro"`처럼 모델만 바꾸는 것은 목적에 맞지 않는다. LazyCodex와 oh-my-openagent의 핵심은 모델 자체가 아니라 다음과 같은 하네스 레이어에 있다.

- 프로젝트 메모리 생성
- 규칙/컨텍스트 자동 주입
- 계획 전용 흐름
- 체크리스트 기반 실행
- 반복 루프
- LSP 진단과 코드 내비게이션
- AST 기반 검색/리라이트
- 댓글 품질 검사
- 다중 역할 에이전트
- 모델 라우팅과 비용/속도/품질 분리
- 검증 증거 기반 완료 판정

따라서 **DeepSeek-Codex-Combo**는 다음 문제를 해결해야 한다.

1. Codex가 DeepSeek 모델과 안정적으로 통신하도록 만든다.
2. DeepSeek V4 Pro/Flash의 역할을 명확히 나눠서 하네스에 통합한다.
3. LazyCodex/OmO의 Codex Light 기능을 재현하되, DeepSeek API의 thinking/tool-call 특성을 반영한다.
4. 복잡한 코드베이스에서 “계획 → 구현 → 진단 → 리뷰 → 증거 → 완료” 루프가 끊기지 않게 만든다.
5. Codex에게 이 명세서를 그대로 주면 구현을 시작할 수 있을 정도의 파일 구조, 모듈 책임, 테스트, acceptance criteria를 제공한다.

---

## 2. 참조 프로젝트 분석 요약

### 2.1 LazyCodex의 핵심 특징

LazyCodex는 Codex 안에서 복잡한 코드베이스를 다루기 위한 agent harness 배포판이다. 공개 README 기준으로 다음 기능이 중요하다.

- `npx lazycodex-ai install` 기반 설치
- Codex autonomous 설치 옵션
- `$ulw-loop`, `$ulw-plan`, `$start-work` 명령
- `/init-deep` 기반 계층형 `AGENTS.md` 생성
- `review-work`, `remove-ai-slops`, `frontend-ui-ux`, `programming`, `LSP`, `AST-grep`, `rules`, `comment-checker` skill layer
- OmO를 Codex용 agent harness로 패키징
- discipline agents, parallel execution, multi-model routing, hooks, skills, verified completion
- 모델 라우팅을 통해 빠른 작업과 고난도 작업을 다른 모델로 보내는 quota discipline

DeepSeek-Codex-Combo에서는 이 구조를 그대로 베끼기보다 다음과 같이 재구성한다.

| LazyCodex 개념 | DeepSeek-Codex-Combo 대응 |
|---|---|
| `lazycodex-ai install` | `npx deepseek-codex-combo install` 또는 `npx dcc install` |
| OmO plugin namespace `omo` | Codex plugin namespace `deepseek-codex-combo` |
| GPT/Codex model catalog | DeepSeek V4 Pro/Flash model catalog |
| `$ulw-plan` | `$dcc-plan`, alias `$ulw-plan` |
| `$start-work` | `$dcc-start-work`, alias `$start-work` |
| `$ulw-loop` | `$dcc-loop`, alias `$ulw-loop` |
| `/init-deep` | `/init-deep-dcc`, alias `/init-deep` 가능 |
| model routing: GPT mini/high/codex | model routing: V4 Flash/V4 Pro/thinking mode |
| comment-checker | 그대로 유지, DeepSeek prompt wording만 조정 |
| LSP/AST-grep | 그대로 유지 |
| rules injection | `.dcc/rules`, `.omo/rules`, `.claude/rules`, `.cursor/rules`, `.github` instructions 지원 |

### 2.2 oh-my-openagent의 핵심 특징

oh-my-openagent는 Ultimate와 Codex Light 구조를 나눈다.

- Ultimate: OpenCode 중심. 11개 discipline agents, 많은 lifecycle hooks, built-in MCP, Team Mode, hashline edit, slash commands 등 full harness.
- Light: Codex CLI plugin system에 맞춘 휴대 가능한 구성. `rules`, `comment-checker`, `lsp`, `ultrawork`, `ulw-loop`, `start-work-continuation`, `telemetry` 중심.

DeepSeek-Codex-Combo는 Codex용이므로 기본은 Light 구조를 따른다. 다만 사용자가 “하네스 엔지니어링까지”를 요구했으므로, Ultimate의 개념 중 Codex에서 구현 가능한 부분도 확장 기능으로 포함한다.

구현 범위는 다음과 같이 나눈다.

- **MVP**: Codex Light 상당 기능 + DeepSeek provider proxy + DeepSeek model routing.
- **v1**: planning/execution loop, evidence audit, LSP, rules, comment-checker, start-work continuation, durable goals.
- **v1.5**: hashline MCP, AST-grep MCP, project memory generator, parallel subagent profile.
- **v2**: Codex가 허용하는 범위 내 Team Mode-like orchestration, background task queue, multi-worktree execution.

### 2.3 Codex 공식 플러그인 구조 반영

Codex 플러그인은 다음 구조를 가져야 한다.

```text
plugin-root/
  .codex-plugin/
    plugin.json
  skills/
  hooks/
    hooks.json
  .mcp.json
  assets/
```

DeepSeek-Codex-Combo는 이 구조를 그대로 사용한다.

Codex 설치 위치와 상태 관리는 다음을 따른다.

```text
~/.codex/plugins/cache/<marketplace-name>/<plugin-name>/<version>/
~/.codex/config.toml
~/.codex/agents/
~/.agents/plugins/marketplace.json
```

Codex custom provider 설정은 user-level config에만 써야 한다. project-level `.codex/config.toml`에는 provider/auth 관련 값을 쓰면 안 된다.

### 2.4 DeepSeek V4 API 반영

DeepSeek 공식 문서 기준으로 현재 중요한 사실은 다음이다.

- `deepseek-v4-pro`, `deepseek-v4-flash`가 공식 모델명이다.
- OpenAI ChatCompletions 호환 base URL은 `https://api.deepseek.com`이다.
- Anthropic 호환 base URL은 `https://api.deepseek.com/anthropic`이다.
- `deepseek-chat`, `deepseek-reasoner`는 2026-07-24 15:59 UTC 이후 폐기 예정이다.
- V4 Pro/Flash 모두 1M context를 지원한다고 공지되어 있다.
- Thinking mode는 `thinking: { type: "enabled" }`, `reasoning_effort`로 제어한다.
- Thinking mode에서는 `temperature`, `top_p`, `presence_penalty`, `frequency_penalty`가 효과가 없다고 문서화되어 있다.
- Thinking mode + tool call에서는 `reasoning_content`를 후속 요청에 다시 전달해야 400 에러를 피할 수 있다.
- Tool Calls를 지원하며 strict mode beta는 `https://api.deepseek.com/beta`가 필요하다.

이 때문에 provider 구현은 단순 HTTP passthrough가 아니라 다음을 해야 한다.

- Codex Responses request를 DeepSeek ChatCompletions request로 변환
- DeepSeek tool call response를 Codex Responses output item으로 변환
- streaming SSE 변환
- `reasoning_content`를 user-facing 로그에 남기지 않고 tool-call continuation에는 유지
- unsupported parameter를 라우팅 profile에 따라 제거/무시
- Flash/Pro와 thinking on/off를 task category 기준으로 결정

---

## 3. 제품 정의

### 3.1 제품명

**DeepSeek-Codex-Combo**

줄임말은 **DCC**를 사용한다.

### 3.2 사용자 가치

사용자는 다음 흐름을 기대한다.

```bash
export DEEPSEEK_API_KEY="..."
npx deepseek-codex-combo install --no-tui --codex-autonomous
codex --profile deepseek-pro
```

Codex 안에서는 다음처럼 쓸 수 있어야 한다.

```text
$dcc-plan "내 레거시 Node 서버를 Fastify로 이전하는 계획 세워줘"
$dcc-start-work plans/fastify-migration.md
$dcc-loop "테스트 깨지는 부분 모두 고치고 실제 실행 증거 남겨줘"
ultrawork 이 이슈 끝까지 해결해줘. 테스트만 믿지 말고 수동 검증까지 해.
```

### 3.3 Non-goals

아래는 이 프로젝트의 목표가 아니다.

- DeepSeek 모델 자체를 학습하거나 fine-tune하기
- Codex 내부 비공개 API를 패치하기
- 사용자의 OpenAI 계정 인증을 우회하기
- DeepSeek API key를 설정 파일에 평문 저장하기
- 모든 OmO Ultimate 기능을 Codex에서 1:1 재현하기
- Claude/GPT 전용 prompts를 이름만 바꿔 재사용하기

---

## 4. 전체 아키텍처

### 4.1 계층 구조

```text
┌─────────────────────────────────────────────────────────────┐
│                         Codex CLI / IDE                      │
├─────────────────────────────────────────────────────────────┤
│ Codex Plugin: deepseek-codex-combo                           │
│  - skills                                                     │
│  - hooks                                                      │
│  - MCP server declarations                                    │
│  - model catalog                                              │
├─────────────────────────────────────────────────────────────┤
│ DCC Harness Runtime                                           │
│  - rules engine                                               │
│  - ultrawork injector                                         │
│  - durable loop / boulder state                               │
│  - comment checker bridge                                     │
│  - LSP/AST-grep MCP                                           │
│  - planner/executor/verifier prompts                          │
│  - model router                                               │
├─────────────────────────────────────────────────────────────┤
│ DCC Provider Layer                                            │
│  - Responses-compatible local proxy                           │
│  - DeepSeek ChatCompletions adapter                           │
│  - thinking/tool-call continuation manager                    │
│  - streaming transformer                                      │
├─────────────────────────────────────────────────────────────┤
│ DeepSeek API                                                  │
│  - deepseek-v4-pro                                            │
│  - deepseek-v4-flash                                          │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Repository layout

구현 레포의 권장 구조는 다음과 같다.

```text
deepseek-codex-combo/
  README.md
  LICENSE
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  .github/
    workflows/
      ci.yml
      release.yml
  docs/
    architecture.md
    install.md
    model-routing.md
    provider-proxy.md
    codex-config.md
    troubleshooting.md
    security.md
  bin/
    dcc.mjs
    deepseek-codex-combo.mjs
  packages/
    cli/
      src/
        index.ts
        commands/
          install.ts
          uninstall.ts
          doctor.ts
          proxy.ts
          initDeep.ts
          plan.ts
          startWork.ts
          loop.ts
          switchModel.ts
    codex-installer/
      src/
        configToml.ts
        marketplace.ts
        pluginCache.ts
        agents.ts
        backups.ts
        idempotency.ts
    provider-proxy/
      src/
        server.ts
        responsesToChat.ts
        chatToResponses.ts
        stream.ts
        tools.ts
        reasoningStore.ts
        errors.ts
        auth.ts
        limits.ts
    model-core/
      src/
        catalog.ts
        router.ts
        profiles.ts
        deepseek.ts
        budget.ts
        fallbacks.ts
    prompts-core/
      src/
        systemProfiles.ts
        planner.ts
        executor.ts
        verifier.ts
        reviewer.ts
        librarian.ts
        ultrawork.ts
        promptContracts.ts
    rules-engine/
      src/
        discoverRules.ts
        normalizeRules.ts
        injectRules.ts
        dedupe.ts
    boulder-state/
      src/
        schema.ts
        store.ts
        checklist.ts
        evidence.ts
        continuation.ts
    comment-checker-core/
      src/
        checker.ts
        hookAdapter.ts
    lsp-tools-mcp/
      src/
        server.ts
        manager.ts
        tools/
          diagnostics.ts
          status.ts
          gotoDefinition.ts
          findReferences.ts
          symbols.ts
          prepareRename.ts
          rename.ts
    ast-grep-mcp/
      src/
        server.ts
        search.ts
        rewrite.ts
    hashline-core/
      src/
        readWithHashes.ts
        applyHashlinePatch.ts
        staleGuard.ts
    telemetry/
      src/
        localMetrics.ts
        redaction.ts
        optIn.ts
    shared/
      src/
        fs.ts
        paths.ts
        logger.ts
        json.ts
        toml.ts
        process.ts
        platform.ts
        redact.ts
  plugins/
    deepseek-codex-combo/
      .codex-plugin/
        plugin.json
      .mcp.json
      model-catalog.deepseek.json
      hooks/
        hooks.json
        session-start.js
        user-prompt-submit.js
        post-tool-use.js
        post-compact.js
        stop.js
      skills/
        dcc-plan/
          SKILL.md
        dcc-start-work/
          SKILL.md
        dcc-loop/
          SKILL.md
        dcc-ultrawork/
          SKILL.md
        init-deep-dcc/
          SKILL.md
        review-work/
          SKILL.md
        remove-ai-slops/
          SKILL.md
        programming/
          SKILL.md
        frontend-ui-ux/
          SKILL.md
        lsp/
          SKILL.md
        ast-grep/
          SKILL.md
        rules/
          SKILL.md
        comment-checker/
          SKILL.md
      agents/
        dcc-orchestrator.toml
        dcc-planner-pro.toml
        dcc-worker-flash.toml
        dcc-worker-pro.toml
        dcc-verifier-pro.toml
        dcc-librarian-flash.toml
        dcc-reviewer-pro.toml
        dcc-security-pro.toml
      components/
        rules/
        comment-checker/
        lsp/
        ast-grep/
        hashline/
        ultrawork/
        ulw-loop/
        start-work-continuation/
        provider-proxy/
        telemetry/
      assets/
        icon.png
      package.json
  tests/
    unit/
    integration/
    fixtures/
      ts-node-app/
      python-fastapi/
      rust-cli/
      broken-monorepo/
```

### 4.3 Naming policy

사용자-facing 이름은 다음을 사용한다.

- Product: `DeepSeek-Codex-Combo`
- Short: `DCC`
- CLI: `dcc`
- NPM package: `deepseek-codex-combo`
- Codex marketplace name: `deepseek-codex-combo`
- Codex plugin id: `deepseek-codex-combo`
- Config provider id: `deepseek_proxy`
- Local proxy binary: `dcc-provider-proxy`

---

## 5. Codex 연동 전략

### 5.1 왜 프록시가 필요한가

현재 Codex custom provider는 공식 config reference상 `wire_api = "responses"`만 명시되어 있다. 반면 DeepSeek는 OpenAI ChatCompletions 및 Anthropic 호환 API를 제공한다. 즉, Codex가 곧바로 ChatCompletions provider를 허용하지 않는 환경에서는 다음 방식이 필요하다.

```text
Codex Responses API request
  -> DCC local Responses-compatible proxy
  -> DeepSeek /chat/completions
  -> DeepSeek response
  -> DCC converts back to Responses-shaped output
  -> Codex
```

따라서 구현 우선순위는 다음과 같다.

1. `proxy` mode: 항상 지원해야 하는 기본 모드.
2. `native` mode: 향후 Codex가 ChatCompletions/Anthropic wire를 custom provider로 허용하면 활성화.
3. `plugin-only` mode: 모델 provider를 건드리지 않고 rules/LSP/skills/hooks만 설치.

### 5.2 설치 모드

```bash
npx deepseek-codex-combo install --provider-mode=proxy
npx deepseek-codex-combo install --provider-mode=native
npx deepseek-codex-combo install --provider-mode=plugin-only
```

기본값은 `proxy`이다.

### 5.3 Codex config 예시: proxy mode

설치기는 user-level `~/.codex/config.toml` 또는 profile file에 다음에 준하는 설정을 쓴다.

```toml
# DCC managed block: begin
model_provider = "deepseek_proxy"
model = "deepseek-v4-pro"
model_context_window = 1000000
model_reasoning_effort = "high"

[model_providers.deepseek_proxy]
name = "DeepSeek via DCC Responses Proxy"
base_url = "http://127.0.0.1:47147/v1"
env_key = "DEEPSEEK_API_KEY"
env_key_instructions = "Set DEEPSEEK_API_KEY from https://platform.deepseek.com before using DeepSeek-Codex-Combo."
request_max_retries = 3
stream_max_retries = 3
stream_idle_timeout_ms = 600000
wire_api = "responses"
# DCC managed block: end
```

주의:

- `env_key = "DEEPSEEK_API_KEY"`는 Codex가 local proxy로 보내는 Authorization header에 사용된다.
- proxy는 이 header를 DeepSeek upstream으로 전달한다.
- proxy는 API key를 로그에 절대 기록하지 않는다.
- proxy는 기본적으로 `127.0.0.1`에만 bind한다.
- proxy port는 충돌 시 자동 탐색하고, 최종 port는 config에 반영한다.

### 5.4 Codex config 예시: future native mode

현재 공식 Codex 스키마에서 `wire_api = "chat"`이 지원되지 않으면 이 설정을 쓰면 안 된다. Codex가 향후 ChatCompletions wire를 지원하는 경우에만 다음과 같은 native profile을 생성한다.

```toml
# Only if current Codex supports ChatCompletions custom provider wire.
model_provider = "deepseek"
model = "deepseek-v4-pro"
model_context_window = 1000000

[model_providers.deepseek]
name = "DeepSeek"
base_url = "https://api.deepseek.com"
env_key = "DEEPSEEK_API_KEY"
wire_api = "chat"
stream_idle_timeout_ms = 600000
```

구현자는 install 시 Codex version/config schema를 확인하고, 지원되지 않는 native 설정을 쓰지 않는다.

---

## 6. Provider proxy 상세 명세

### 6.1 프록시 요구사항

`dcc-provider-proxy`는 OpenAI Responses API의 Codex 사용 subset을 수신하고 DeepSeek ChatCompletions로 변환한다.

필수 엔드포인트:

```text
GET  /healthz
GET  /v1/models
POST /v1/responses
```

선택 엔드포인트:

```text
POST /v1/chat/completions       # debugging passthrough
GET  /metrics                   # local only, opt-in
```

### 6.2 `/healthz`

응답 예시:

```json
{
  "ok": true,
  "service": "dcc-provider-proxy",
  "version": "0.1.0",
  "upstream": "https://api.deepseek.com",
  "models": ["deepseek-v4-pro", "deepseek-v4-flash"]
}
```

### 6.3 `/v1/models`

DeepSeek `/models`를 호출해 결과를 캐시한다. 실패 시 local catalog를 fallback으로 반환한다.

응답은 OpenAI-compatible models list로 반환한다.

```json
{
  "object": "list",
  "data": [
    { "id": "deepseek-v4-flash", "object": "model", "owned_by": "deepseek" },
    { "id": "deepseek-v4-pro", "object": "model", "owned_by": "deepseek" }
  ]
}
```

### 6.4 Responses request → ChatCompletions request 변환

Codex가 보낼 수 있는 Responses request subset을 다음처럼 변환한다.

| Responses field | DeepSeek ChatCompletions 변환 |
|---|---|
| `model` | 그대로 사용하되 alias를 canonical id로 정규화 |
| `instructions` | 첫 `system` message로 변환 |
| `input` string | `{ role: "user", content: input }` |
| `input` array | message/item type에 따라 `messages`로 flatten |
| `tools` | OpenAI Chat `tools` function schema로 변환 |
| `tool_choice` | 가능하면 그대로 전달, 불가하면 제거 |
| `stream` | DeepSeek `stream`으로 전달 |
| `temperature`, `top_p` | thinking mode가 enabled면 제거하거나 경고 로그만 남김 |
| `reasoning.effort` 또는 `reasoning_effort` | `reasoning_effort`로 변환: `low/medium/high/xhigh` → `high/max` policy 적용 |
| `metadata` | upstream으로 보내지 않음. local trace id만 사용 |
| `parallel_tool_calls` | DeepSeek 지원 여부 probe 후 전달/제거 |

### 6.5 Thinking mode 결정

라우터는 task category별로 thinking mode를 결정한다.

| Category | Model | Thinking | Effort |
|---|---|---|---|
| `quick` | `deepseek-v4-flash` | disabled | none |
| `edit-small` | `deepseek-v4-flash` | disabled | none |
| `summarize` | `deepseek-v4-flash` | disabled | none |
| `librarian` | `deepseek-v4-flash` | disabled | none |
| `standard-code` | `deepseek-v4-flash` first, Pro fallback | optional | high |
| `plan` | `deepseek-v4-pro` | enabled | high |
| `deep-refactor` | `deepseek-v4-pro` | enabled | max |
| `security` | `deepseek-v4-pro` | enabled | max |
| `verify` | `deepseek-v4-pro` | enabled | high |
| `ultrawork` | `deepseek-v4-pro` | enabled | max |

환경변수로 override 가능해야 한다.

```bash
DCC_DEFAULT_MODEL=deepseek-v4-pro
DCC_FLASH_MODEL=deepseek-v4-flash
DCC_PRO_MODEL=deepseek-v4-pro
DCC_THINKING_DEFAULT=auto
DCC_MAX_EFFORT_FOR_COMPLEX=true
```

### 6.6 reasoning_content 처리

DeepSeek thinking mode는 `reasoning_content`를 반환할 수 있다. DCC는 이를 다음처럼 처리한다.

1. 사용자에게 raw chain-of-thought를 출력하지 않는다.
2. 로그에 저장하지 않는다.
3. tool-call continuation에 필요한 경우에만 in-memory session store에 보관한다.
4. tool-call이 발생한 assistant turn 이후 후속 요청에는 DeepSeek 문서 요구사항에 맞춰 `reasoning_content`를 포함한다.
5. 세션 종료, compact, timeout 시 store를 안전하게 폐기한다.
6. crash recovery가 필요한 경우 raw reasoning이 아니라 opaque reference만 저장한다. 단, DeepSeek가 후속 요청에 원문을 요구하는 상황이 있으므로 durable loop 중에는 암호화된 임시 파일 저장 옵션을 둘 수 있다. 기본값은 비활성화한다.

### 6.7 Tool calls 변환

DeepSeek tool call response 예시:

```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_123",
      "type": "function",
      "function": {
        "name": "get_diagnostics",
        "arguments": "{\"path\":\"src/index.ts\"}"
      }
    }
  ]
}
```

Responses-shaped output item 예시:

```json
{
  "id": "resp_...",
  "object": "response",
  "status": "completed",
  "output": [
    {
      "type": "function_call",
      "call_id": "call_123",
      "name": "get_diagnostics",
      "arguments": "{\"path\":\"src/index.ts\"}"
    }
  ]
}
```

반대로 tool result는 다음처럼 변환한다.

```json
{
  "role": "tool",
  "tool_call_id": "call_123",
  "content": "...tool result..."
}
```

### 6.8 Streaming 변환

프록시는 SSE를 지원해야 한다.

DeepSeek streaming chunk를 Codex가 기대하는 Responses event로 변환한다.

최소 지원 이벤트:

```text
response.created
response.output_text.delta
response.output_text.done
response.output_item.added
response.function_call_arguments.delta
response.function_call_arguments.done
response.completed
response.failed
```

정확한 Responses event schema는 설치 시 사용 중인 Codex 버전의 요구사항에 맞춘다. 테스트에서는 Codex mock client를 사용해 event compatibility를 검증한다.

### 6.9 Error mapping

| DeepSeek/Proxy error | Codex-facing error |
|---|---|
| 401/403 | auth_error: `DEEPSEEK_API_KEY` 확인 |
| 404 model | model_not_found: `/models` probe 결과 포함 |
| 400 reasoning_content missing | adapter_error: reasoning continuation bug로 분류 |
| 429 | rate_limit_error, retry-after 반영 |
| 5xx | upstream_error, exponential backoff |
| stream idle | stream_timeout, retry 가능 시 재시도 |
| invalid tool schema | tool_schema_error, strict mode 해제 권고 |

### 6.10 Retry policy

- upstream 429/5xx: exponential backoff with jitter
- stream interruption: 최대 3회 재시도
- 동일 tool call 반복: 3회 이상이면 verifier에게 handoff
- JSON parse error: 1회 repair prompt 후 실패 처리
- 모델 hallucinated tool name: tool registry summary를 재주입하고 1회 재시도

### 6.11 Strict mode policy

DeepSeek strict tool mode는 beta endpoint가 필요하다. 기본은 strict mode를 사용하지 않는다.

옵션:

```bash
dcc proxy --strict-tools=off|auto|on
```

- `off`: 기본값
- `auto`: schema가 DeepSeek strict subset에 맞을 때만 beta endpoint 사용
- `on`: 항상 strict mode 사용. schema 부적합 시 즉시 fail

---

## 7. DeepSeek 모델 카탈로그

### 7.1 `model-catalog.deepseek.json`

```json
{
  "version": "2026-06-07.deepseek-v4",
  "provider": "deepseek",
  "default_model": "deepseek-v4-pro",
  "models": {
    "deepseek-v4-pro": {
      "display_name": "DeepSeek V4 Pro",
      "context_window": 1000000,
      "default_thinking": "enabled",
      "default_reasoning_effort": "high",
      "max_reasoning_effort": "max",
      "strengths": [
        "planning",
        "complex_refactor",
        "security_review",
        "debugging",
        "architecture",
        "verification",
        "agentic_coding"
      ],
      "avoid_for": [
        "trivial_edits",
        "bulk_summarization_when_flash_suffices"
      ]
    },
    "deepseek-v4-flash": {
      "display_name": "DeepSeek V4 Flash",
      "context_window": 1000000,
      "default_thinking": "disabled",
      "default_reasoning_effort": null,
      "strengths": [
        "fast_iteration",
        "small_edits",
        "summaries",
        "librarian_tasks",
        "lint_fix_suggestions",
        "test_failure_triage",
        "parallel_worker"
      ],
      "avoid_for": [
        "high_risk_migrations",
        "security_critical_changes",
        "final_verification"
      ]
    }
  },
  "roles": {
    "default": "deepseek-v4-pro",
    "planner": "deepseek-v4-pro",
    "verifier": "deepseek-v4-pro",
    "reviewer": "deepseek-v4-pro",
    "security": "deepseek-v4-pro",
    "worker": "deepseek-v4-flash",
    "librarian": "deepseek-v4-flash",
    "quick": "deepseek-v4-flash"
  },
  "fallbacks": {
    "deepseek-v4-flash": ["deepseek-v4-pro"],
    "deepseek-v4-pro": ["deepseek-v4-flash"]
  }
}
```

### 7.2 라우팅 카테고리

```ts
export type DccTaskCategory =
  | "quick"
  | "small-edit"
  | "summarize"
  | "librarian"
  | "standard-code"
  | "plan"
  | "deep-refactor"
  | "debug"
  | "security"
  | "review"
  | "verify"
  | "ultrawork";
```

### 7.3 라우팅 규칙

```ts
export interface RouteDecision {
  category: DccTaskCategory;
  model: "deepseek-v4-pro" | "deepseek-v4-flash";
  thinking: "enabled" | "disabled";
  reasoningEffort?: "high" | "max";
  maxTokens?: number;
  temperature?: number;
  fallback?: "deepseek-v4-pro" | "deepseek-v4-flash";
  reason: string;
}
```

라우터는 다음 입력을 본다.

- 사용자 프롬프트 키워드
- Codex command/skill name
- diff size
- file count
- test failure count
- LSP error severity
- security-sensitive file path
- migration/refactor 여부
- plan file 존재 여부
- previous failure/retry count
- user가 명시한 model override

### 7.4 라우팅 예시

| 상황 | 라우팅 |
|---|---|
| 오타 수정, import 정리 | Flash, thinking off |
| README 요약 | Flash, thinking off |
| 테스트 실패 원인 triage | Flash first, Pro fallback |
| 아키텍처 변경 계획 | Pro, thinking high |
| DB migration 포함 refactor | Pro, thinking max |
| auth/security 코드 변경 | Pro, thinking max |
| 최종 리뷰/검증 | Pro, thinking high |
| `ultrawork` | Pro, thinking max |
| 대량 검색/파일 위치 찾기 | Flash librarian |

---

## 8. Prompt harness 설계

### 8.1 DeepSeek용 prompt 원칙

GPT/Claude family prompt를 그대로 가져오지 않는다. DeepSeek용 prompt는 다음 스타일을 따른다.

- 짧은 역할 선언
- 명확한 output contract
- tool 사용 조건 명시
- evidence requirement 명시
- 반복 방지 규칙
- “모르면 모른다고 말하고 tool로 확인” 규칙
- 한국어 사용자 요청을 보존하되 코드/파일명은 원문 유지
- chain-of-thought를 출력하지 말고, 필요한 경우 concise rationale만 출력

### 8.2 공통 system profile

```text
You are DeepSeek-Codex-Combo, a Codex harness layer for complex software engineering.
You operate inside Codex. Do not guess repository facts. Inspect files and tools before editing.
Use the cheapest sufficient route, but use DeepSeek V4 Pro for planning, risky changes, and final verification.
Never claim completion without evidence.
Do not expose hidden reasoning. Provide concise rationale and concrete next actions.
```

### 8.3 Planner profile

```text
Role: DCC Planner.
Goal: produce a decision-complete implementation plan before product code changes.
Rules:
- Do not edit product code.
- Ask at most 3 blocking questions only if the plan cannot be made safely.
- Prefer making explicit assumptions over stalling.
- Output a plan file path under plans/<slug>.md.
- Every plan must include scope, non-goals, file targets, ordered tasks, acceptance criteria, verification matrix, rollback plan, and risk notes.
- Mark checkboxes atomically. A checkbox must correspond to verifiable work.
```

### 8.4 Executor profile

```text
Role: DCC Executor.
Goal: complete every unchecked item in the active plan.
Rules:
- Read the plan and current repository state before edits.
- Use LSP diagnostics before and after relevant edits.
- Keep changes minimal and behavior-preserving unless plan says otherwise.
- Update Boulder state after each atomic task.
- Record evidence for tests, lint, manual QA, and review.
- Stop only when all acceptance criteria are met or a real blocker is recorded.
```

### 8.5 Verifier profile

```text
Role: DCC Verifier.
Goal: decide whether work is genuinely complete.
Rules:
- Treat tests as necessary but not sufficient.
- Check diff, diagnostics, acceptance criteria, and evidence.
- Look for AI-looking comments, dead code, brittle mocks, skipped tests, and unverified claims.
- If incomplete, produce exact corrective tasks.
- If complete, output `DCC_VERIFICATION_COMPLETE` with evidence summary.
```

### 8.6 Librarian profile

```text
Role: DCC Librarian.
Goal: find facts in the repository quickly.
Rules:
- Use grep/glob/AST/LSP before answering.
- Do not edit files.
- Return file paths and line references.
- Prefer concise summaries.
```

---

## 9. Codex plugin manifest

### 9.1 `.codex-plugin/plugin.json`

```json
{
  "name": "deepseek-codex-combo",
  "version": "0.1.0",
  "description": "DeepSeek V4 Pro/Flash harness for Codex: provider proxy, model routing, rules, LSP, ultrawork loops, and verified completion.",
  "author": {
    "name": "DeepSeek-Codex-Combo Contributors"
  },
  "license": "MIT",
  "keywords": [
    "codex",
    "deepseek",
    "agent-harness",
    "lsp",
    "mcp",
    "ultrawork"
  ],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "hooks": "./hooks/hooks.json",
  "interface": {
    "displayName": "DeepSeek Codex Combo",
    "shortDescription": "DeepSeek V4 harness for Codex",
    "longDescription": "Use DeepSeek V4 Pro/Flash in Codex with a real harness: Responses proxy, model routing, planning, durable execution, rules, LSP, AST-grep, comment checking, and evidence-based verification.",
    "developerName": "DCC",
    "category": "Developer Tools",
    "capabilities": [
      "Hooks",
      "MCP Tools",
      "Code Intelligence",
      "Workflow",
      "Context Injection",
      "Model Routing"
    ],
    "defaultPrompt": [
      "Use DCC to plan and implement this repository change with DeepSeek Pro/Flash routing.",
      "Run dcc doctor and verify DeepSeek-Codex-Combo is configured correctly.",
      "Use dcc ultrawork to finish this task with evidence-based verification."
    ]
  }
}
```

### 9.2 `.mcp.json`

```json
{
  "mcp_servers": {
    "dcc_lsp": {
      "command": "dcc-lsp-mcp",
      "args": ["--stdio"]
    },
    "dcc_ast_grep": {
      "command": "dcc-ast-grep-mcp",
      "args": ["--stdio"]
    },
    "dcc_hashline": {
      "command": "dcc-hashline-mcp",
      "args": ["--stdio"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

MVP에서는 `dcc_lsp`만 필수다. `dcc_ast_grep`, `dcc_hashline`, `context7`은 install flag로 끌 수 있어야 한다.

```bash
dcc install --no-ast-grep --no-hashline --no-context7
```

---

## 10. Hooks 설계

### 10.1 Hook events

필수 hook events:

- `SessionStart`
- `UserPromptSubmit`
- `PostToolUse`
- `PostCompact`
- `Stop`
- `SubagentStop`

### 10.2 `hooks/hooks.json`

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/session-start.js",
            "statusMessage": "DCC: checking DeepSeek proxy, model catalog, and project rules"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/user-prompt-submit.js",
            "statusMessage": "DCC: injecting rules and workflow hints"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/post-tool-use.js",
            "statusMessage": "DCC: running post-edit diagnostics"
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/post-compact.js",
            "statusMessage": "DCC: restoring compacted context hints"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/stop.js",
            "statusMessage": "DCC: checking active plan continuation"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/stop.js --subagent",
            "statusMessage": "DCC: checking subagent continuation"
          }
        ]
      }
    ]
  }
}
```

### 10.3 `SessionStart` 책임

- DCC version 출력
- proxy health 확인
- `DEEPSEEK_API_KEY` 존재 여부 확인
- model catalog 로드
- project root 탐색
- `.dcc/` state 초기화
- rules cache 준비
- telemetry opt-in 상태 확인
- LSP server lazy start 여부 확인

출력은 짧게 유지한다.

```text
DCC ready: proxy=ok, model=deepseek-v4-pro, rules=5, lsp=lazy, telemetry=off
```

### 10.4 `UserPromptSubmit` 책임

- `ultrawork`, `ulw`, `$dcc-loop`, `$dcc-plan`, `$dcc-start-work` keyword 감지
- 필요한 workflow directive 주입
- `.dcc/rules`, `.omo/rules`, `.claude/rules`, `.cursor/rules`, `.github` instruction 파일 주입
- 중복 주입 방지
- user prompt 원문을 로그에 저장하지 않음

### 10.5 `PostToolUse` 책임

edit-like tool 이후 실행한다.

감지 대상:

- `apply_patch`
- `write`
- `edit`
- `multi_edit`
- file 생성/삭제/이동

실행 작업:

1. comment-checker
2. LSP diagnostics
3. optional AST-grep lint rules
4. Boulder state evidence hint update

blocking feedback 조건:

- syntax/type error가 새로 생김
- forbidden AI slop comment 감지
- generated file에 secret-like string 감지
- plan acceptance criteria와 반대되는 파일 삭제

### 10.6 `Stop` 책임

- `.dcc/boulder.json`에 active plan이 있는지 확인
- top-level checkbox 중 미완료 항목이 있는지 확인
- evidence 부족 항목 확인
- 완료 조건 미달이면 Codex Stop hook block JSON 반환
- 모든 항목 완료면 no-op

---

## 11. Rules engine

### 11.1 Rule source priority

DCC는 다음 rule source를 읽는다.

1. Codex native `AGENTS.md`: Codex가 기본 처리하므로 DCC가 중복 주입하지 않는다.
2. `CONTEXT.md`
3. `.dcc/rules/**/*.md`
4. `.omo/rules/**/*.md`
5. `.claude/rules/**/*.md`
6. `.cursor/rules/**/*.mdc`
7. `.github/copilot-instructions.md`
8. `.github/instructions/**/*.md`
9. project `.codex/rules/**/*.md`가 있으면 opt-in으로 지원

### 11.2 Dedupe

규칙은 normalized content hash로 dedupe한다.

```ts
interface RuleRecord {
  sourcePath: string;
  normalizedHash: string;
  scope: "global" | "project" | "directory" | "file-pattern";
  priority: number;
  content: string;
}
```

### 11.3 Context budget

DeepSeek는 1M context를 지원하더라도 rule injection을 무제한으로 늘리면 안 된다.

기본 budget:

```ts
const RULE_BUDGET = {
  sessionStart: 12000,
  userPromptSubmit: 16000,
  postCompact: 20000
};
```

우선순위:

1. 현재 작업 디렉터리에 가까운 rule
2. 수정 대상 파일 pattern과 매칭되는 rule
3. 보안/테스트/빌드 관련 rule
4. 전역 style rule
5. 오래된/중복 rule

### 11.4 Injection format

```text
<DCC_PROJECT_RULES>
Source: .dcc/rules/testing.md
Scope: project
Content:
- Every bug fix must include a regression test unless impossible.
- If impossible, record why in .dcc/evidence/.
</DCC_PROJECT_RULES>
```

---

## 12. Project memory: `/init-deep-dcc`

### 12.1 목적

복잡한 레포를 한 번에 이해시키려 하지 말고, Codex가 edit 근처에서 필요한 지침을 빠르게 찾도록 계층형 memory를 생성한다.

### 12.2 생성 파일

```text
AGENTS.md
.dcc/
  project-index.json
  rules/
    coding-style.md
    testing.md
    architecture.md
    security.md
  memory/
    root-summary.md
    package-map.md
    risk-map.md
```

선택적으로 큰 하위 디렉터리에 local `AGENTS.md`를 생성한다.

```text
packages/api/AGENTS.md
packages/web/AGENTS.md
src/legacy/AGENTS.md
```

### 12.3 분석 기준

- 파일 수
- LOC
- package/workspace boundary
- test 위치
- public API 위치
- migration/legacy marker
- ownership hints
- framework config
- build/test commands
- security-sensitive files
- generated files

### 12.4 금지사항

- product code 수정 금지
- 포맷터 실행 금지
- 불확실한 내용을 사실처럼 쓰기 금지
- 파일을 다 읽지 않고 상세 아키텍처를 단정 금지

### 12.5 출력 예시

```markdown
# AGENTS.md

## Project overview
This repository is a TypeScript monorepo using pnpm workspaces.

## Build and test
- Install: `pnpm install`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`

## Editing rules
- Do not modify generated files under `src/generated/`.
- API route changes require tests under `packages/api/tests/`.

## DCC notes
- Use `dcc_lsp.diagnostics` after TypeScript edits.
- Use `dcc_ast_grep.search` for structural refactors.
```

---

## 13. Commands and skills

### 13.1 CLI commands

```bash
dcc install
dcc uninstall
dcc doctor
dcc proxy start
dcc proxy stop
dcc proxy status
dcc init-deep
dcc plan "task"
dcc start-work [plan]
dcc loop "task"
dcc switch pro|flash|auto
dcc models
dcc rules list
dcc evidence list
```

### 13.2 Codex command aliases

Codex에서 다음 명령/skills가 보이게 한다.

| Command | 설명 |
|---|---|
| `$dcc-plan` | 계획만 생성. product code 수정 금지 |
| `$dcc-start-work` | plan checklist 실행 |
| `$dcc-loop` | 증거 기반 반복 루프 |
| `$dcc-ultrawork` | keyword 기반 full directive |
| `/init-deep-dcc` | project memory 생성 |
| `review-work` | 구현 후 다각도 리뷰 |
| `remove-ai-slops` | AI 티 나는 코드/댓글 제거 |
| `programming` | 언어별 엄격 구현 규칙 |
| `frontend-ui-ux` | UI 품질 개선 |
| `lsp` | LSP 진단/정의/참조/rename |
| `ast-grep` | 구조 검색/리라이트 |
| `rules` | 프로젝트 규칙 확인 |
| `comment-checker` | 댓글 품질 검사 |

기존 LazyCodex 사용자 전환을 위해 alias도 지원한다.

```text
$ulw-plan -> $dcc-plan
$start-work -> $dcc-start-work
$ulw-loop -> $dcc-loop
ultrawork / ulw keyword -> $dcc-ultrawork directive
```

### 13.3 `$dcc-plan` skill

`$dcc-plan "task"`는 다음을 수행한다.

1. repo scan
2. 관련 파일/규칙/LSP context 수집
3. DeepSeek V4 Pro thinking high/max로 계획 작성
4. `plans/<slug>.md` 생성
5. `.dcc/boulder.json`에 inactive plan metadata 등록
6. product code는 수정하지 않음

계획 파일 형식:

```markdown
# Plan: <title>

## Goal

## Assumptions

## Non-goals

## Files likely to change

## Execution checklist
- [ ] 1. ...
- [ ] 2. ...

## Acceptance criteria
- [ ] ...

## Verification matrix
| Check | Command/manual action | Evidence path |
|---|---|---|

## Rollback plan

## Risks
```

### 13.4 `$dcc-start-work` skill

`$dcc-start-work [plan]`는 다음을 수행한다.

1. plan path 결정
2. `.dcc/boulder.json` active session 생성
3. 체크리스트를 atomic task로 변환
4. task별 구현
5. post-edit LSP/comment-checker 실행
6. test/lint/manual QA evidence 기록
7. verifier profile로 최종 검증
8. 완료 시 `DCC_ORCHESTRATION_COMPLETE` 출력

### 13.5 `$dcc-loop` skill

`$dcc-loop "task"`는 plan 없이도 durable goal loop를 만든다.

상태 파일:

```text
.dcc/ulw-loop/<session-id>/goals.json
.dcc/ulw-loop/<session-id>/evidence.jsonl
.dcc/ulw-loop/<session-id>/notepad.md
```

명령 내부 단계:

1. create goals
2. define acceptance criteria
3. execute
4. record evidence
5. verify
6. continue or complete

### 13.6 `$dcc-ultrawork` directive

`ultrawork` 또는 `ulw` keyword를 감지하면 다음 원칙을 주입한다.

- 목표를 최소 3개의 QA scenario로 분해
- 테스트만으로 완료 선언 금지
- HTTP/tmux/browser/manual command 등 가능한 verification channel 사용
- `/tmp` 또는 `.dcc/runs/<id>/notepad.md`에 durable notepad 유지
- atomic todos 사용
- reviewer/verifier gate 통과 전 완료 금지
- cleanup 수행
- evidence 없는 상태 보고 금지

---

## 14. Boulder state / Evidence audit

### 14.1 `.dcc/boulder.json` schema

```json
{
  "version": 1,
  "activeSessionId": "dcc_20260607_120000_abcd",
  "sessions": {
    "dcc_20260607_120000_abcd": {
      "planPath": "plans/fastify-migration.md",
      "status": "active",
      "createdAt": "2026-06-07T12:00:00.000Z",
      "updatedAt": "2026-06-07T12:10:00.000Z",
      "modelProfile": "deepseek-pro",
      "tasks": [
        {
          "id": "T1",
          "title": "Add Fastify bootstrap",
          "status": "done",
          "evidence": [".dcc/evidence/dcc_.../T1-test.txt"]
        }
      ],
      "acceptance": [
        {
          "id": "A1",
          "text": "All API tests pass",
          "status": "pending",
          "evidence": []
        }
      ]
    }
  }
}
```

### 14.2 Evidence 파일

```text
.dcc/evidence/<session-id>/
  commands.jsonl
  lsp-before.json
  lsp-after.json
  test-output.txt
  lint-output.txt
  manual-qa.md
  review.md
  verifier.md
```

### 14.3 Evidence record format

```json
{
  "timestamp": "2026-06-07T12:12:00.000Z",
  "type": "command",
  "command": "pnpm test",
  "exitCode": 0,
  "summary": "All 182 tests passed",
  "artifact": ".dcc/evidence/dcc_.../test-output.txt"
}
```

---

## 15. LSP MCP

### 15.1 필수 tools

```text
lsp.status
lsp.diagnostics
lsp.goto_definition
lsp.find_references
lsp.symbols
lsp.prepare_rename
lsp.rename
```

### 15.2 언어 지원 우선순위

MVP:

- TypeScript / JavaScript
- Python

v1:

- Rust
- Go
- JSON/YAML

v1.5:

- Java/Kotlin
- C/C++

### 15.3 Diagnostics policy

Post-edit hook에서 다음 규칙을 적용한다.

- 새 `error` severity diagnostic이 생기면 blocking feedback
- 기존 error가 줄어든 경우 non-blocking summary
- warning은 기본 non-blocking
- generated/vendor directory는 제외

### 15.4 LSP startup

- lazy start
- workspace root 기준 server reuse
- timeout 10초
- 실패 시 graceful degradation
- 실패 이유는 짧게 출력

---

## 16. AST-grep MCP

### 16.1 목적

대량 refactor에서 grep보다 안전한 구조 검색/수정을 제공한다.

### 16.2 Tools

```text
ast_grep.search
ast_grep.rewrite
ast_grep.test_rule
ast_grep.list_languages
```

### 16.3 Rewrite safety

- dry-run 기본값 true
- 변경 전 match count 표시
- 100개 초과 변경은 confirmation 필요. autonomous mode에서는 plan/evidence에 기록 후 진행
- generated/vendor 제외

---

## 17. Hashline edit 확장

OmO Ultimate의 hash-anchored edit 개념을 Codex 환경에서 MCP로 재구현한다.

### 17.1 목적

line number drift와 stale context edit를 줄인다.

### 17.2 Tools

```text
hashline.read
hashline.apply_patch
hashline.verify
```

### 17.3 `hashline.read` 출력 예시

```text
L10#b1946ac9 const server = createServer(app)
L11#9fd12caa server.listen(port)
```

### 17.4 patch format

```text
@@ L10#b1946ac9
- const server = createServer(app)
+ const server = createFastifyServer(app)
```

### 17.5 Safety

- hash mismatch면 patch 거부
- context refresh 제안
- apply_patch fallback 가능

---

## 18. Comment checker

### 18.1 목적

AI가 남기기 쉬운 불필요한 설명형 주석을 막는다.

### 18.2 차단 예시

- `// This function handles...`처럼 코드가 이미 말하는 내용을 반복
- `// TODO: implement later`인데 실제 plan에 없는 TODO
- `// Added by AI`류 흔적
- 과도한 섹션 배너
- 테스트 우회를 합리화하는 주석

### 18.3 허용 예시

- 복잡한 알고리즘의 why 설명
- 보안상 중요한 caveat
- public API 문서 주석
- generated file marker
- legal/license header

### 18.4 Hook behavior

- blocking feedback는 exit code 2
- binary missing이면 non-blocking warning
- 삭제만 있는 diff는 skip

---

## 19. Installer 명세

### 19.1 CLI

```bash
dcc install [options]
```

옵션:

```text
--no-tui
--codex-autonomous
--no-codex-autonomous
--provider-mode=proxy|native|plugin-only
--default-model=pro|flash|auto|none
--profile=deepseek-pro|deepseek-flash|deepseek-auto
--proxy-port=47147
--proxy-host=127.0.0.1
--api-key-env=DEEPSEEK_API_KEY
--no-context7
--no-ast-grep
--no-hashline
--disable-telemetry
--enable-telemetry
--dry-run
--yes
```

### 19.2 설치 단계

1. Node/Codex 존재 확인
2. `~/.codex` 생성 여부 확인
3. package build 또는 prebuilt artifact 확인
4. plugin cache에 복사
5. local marketplace snapshot 작성
6. `~/.codex/config.toml`에 marketplace/plugin enable block 작성
7. provider profile 작성
8. agent TOML을 `~/.codex/agents`에 복사
9. CLI binaries를 `~/.local/bin` 또는 npm bin path에 연결
10. proxy service launch 방법 안내
11. `dcc doctor` 실행

### 19.3 Idempotency

모든 managed block에는 marker를 넣는다.

```toml
# >>> DCC managed: provider deepseek_proxy
...
# <<< DCC managed: provider deepseek_proxy
```

재설치 시 marker 내부만 교체한다.

사용자 설정은 marker 밖에 있으면 건드리지 않는다.

### 19.4 Backup

config 수정 전 백업:

```text
~/.codex/config.toml.dcc-backup-20260607-120000
```

### 19.5 Uninstall

```bash
dcc uninstall
```

삭제 대상:

- DCC plugin cache
- DCC marketplace snapshot
- DCC managed config blocks
- DCC managed agent TOMLs
- DCC symlinks
- DCC proxy launch agent/systemd user unit if installed

보존 대상:

- user-created `.dcc/` project state
- user plans
- evidence files
- non-DCC Codex config
- `DEEPSEEK_API_KEY` env 설정

---

## 20. Proxy 실행 방식

### 20.1 기본 실행

```bash
dcc proxy start
```

### 20.2 자동 실행 옵션

설치 시 선택:

```bash
dcc install --proxy-autostart=launchd    # macOS
dcc install --proxy-autostart=systemd    # Linux
dcc install --proxy-autostart=none
```

기본은 `none`이다. 사용자가 명시하지 않으면 Codex hook `SessionStart`에서 proxy가 꺼져 있을 때 짧은 안내만 한다.

### 20.3 macOS launchd

```text
~/Library/LaunchAgents/com.dcc.provider-proxy.plist
```

### 20.4 Linux systemd user

```text
~/.config/systemd/user/dcc-provider-proxy.service
```

### 20.5 로그 위치

```text
~/.local/share/deepseek-codex-combo/logs/proxy.log
```

로그는 redaction 필터를 거친다.

---

## 21. Agent TOML profiles

### 21.1 `dcc-planner-pro.toml`

```toml
name = "dcc-planner-pro"
description = "DeepSeek V4 Pro planner for decision-complete implementation plans."
model = "deepseek-v4-pro"
model_provider = "deepseek_proxy"
reasoning_effort = "high"

[instructions]
file = "agents/dcc-planner-pro.md"
```

### 21.2 `dcc-worker-flash.toml`

```toml
name = "dcc-worker-flash"
description = "Fast DeepSeek V4 Flash worker for small edits, summarization, and repository lookup."
model = "deepseek-v4-flash"
model_provider = "deepseek_proxy"

[instructions]
file = "agents/dcc-worker-flash.md"
```

### 21.3 `dcc-verifier-pro.toml`

```toml
name = "dcc-verifier-pro"
description = "DeepSeek V4 Pro verifier that checks evidence, diagnostics, tests, and acceptance criteria."
model = "deepseek-v4-pro"
model_provider = "deepseek_proxy"
reasoning_effort = "high"

[instructions]
file = "agents/dcc-verifier-pro.md"
```

---

## 22. Telemetry / local metrics

### 22.1 기본 정책

Telemetry는 기본 비활성화한다.

```bash
DCC_TELEMETRY=0
```

사용자가 명시적으로 켠 경우에만 anonymous local/product metric을 전송한다.

```bash
dcc install --enable-telemetry
```

### 22.2 절대 수집 금지

- prompt text
- completion text
- source code
- file paths
- API keys
- git remotes
- hostnames 원문
- usernames/emails
- stack trace 원문

### 22.3 허용 가능 정보

- DCC version
- OS family
- Node version major
- Codex version
- install mode
- feature flags
- anonymous daily active hash

---

## 23. Security requirements

### 23.1 API key

- `DEEPSEEK_API_KEY`는 환경변수로만 받는다.
- config에 직접 쓰지 않는다.
- proxy logs에서 Authorization header는 `[REDACTED]` 처리한다.
- doctor 출력에도 key prefix를 표시하지 않는다.

### 23.2 Local proxy

- 기본 bind는 `127.0.0.1`.
- `0.0.0.0` bind는 `--allow-remote-bind` 없이는 금지.
- remote bind 시 경고와 token auth 필수.

### 23.3 Shell execution

DCC는 Codex sandbox/approval 정책을 존중한다.

`--codex-autonomous`는 다음 설정을 할 수 있지만, 사용자가 명시한 경우에만 적용한다.

```toml
approval_policy = "never"
sandbox_mode = "danger-full-access"
network_access = "enabled"
```

### 23.4 Supply chain

- postinstall script 최소화
- install 시 실행되는 binary 목록 출력
- checksum manifest 제공
- GitHub Actions release artifact 서명 권장

---

## 24. Doctor 명세

### 24.1 명령

```bash
dcc doctor
```

### 24.2 검사 항목

```text
[ ] Node version >= 20
[ ] Codex CLI found
[ ] ~/.codex/config.toml readable
[ ] DCC plugin installed
[ ] DCC plugin enabled
[ ] DeepSeek API key env exists
[ ] Proxy running
[ ] Proxy /healthz ok
[ ] /v1/models includes deepseek-v4-pro and deepseek-v4-flash
[ ] Smoke chat completion ok
[ ] Streaming smoke ok
[ ] Tool-call smoke ok
[ ] LSP MCP starts
[ ] Rules injection dry-run ok
[ ] Comment checker available
```

### 24.3 출력 예시

```text
DCC Doctor
✓ Codex config: /Users/me/.codex/config.toml
✓ Plugin enabled: deepseek-codex-combo
✓ Proxy: http://127.0.0.1:47147/v1
✓ Models: deepseek-v4-pro, deepseek-v4-flash
✓ Smoke: chat completion ok
! LSP: TypeScript server not found; install typescript for TS diagnostics

Result: usable with warnings
```

### 24.4 Exit code

| Code | 의미 |
|---|---|
| 0 | OK |
| 1 | warnings only if `--strict` |
| 2 | missing required dependency |
| 3 | auth failure |
| 4 | proxy failure |
| 5 | model smoke failure |

---

## 25. 테스트 계획

### 25.1 Unit tests

- TOML managed block 삽입/교체/삭제
- marketplace JSON 생성
- plugin cache path 계산
- model catalog validation
- route decision snapshots
- prompt contract snapshots
- Responses → Chat 변환
- Chat → Responses 변환
- streaming chunk 변환
- DeepSeek reasoning_content store
- tool call schema 변환
- redaction
- rules discovery/dedupe
- boulder checklist parser
- evidence writer
- comment checker parser

### 25.2 Integration tests

- `dcc install --dry-run`
- 임시 HOME에서 실제 install/uninstall
- 중복 install 시 config 중복 없음
- plugin manifest validation
- hooks command smoke
- proxy with mocked DeepSeek server
- `/v1/models` fallback
- tool-call roundtrip
- stream interruption retry
- LSP fake workspace diagnostics
- comment-checker blocking exit
- Stop hook continuation

### 25.3 E2E fixture tests

Fixture repos:

```text
tests/fixtures/ts-node-app
tests/fixtures/python-fastapi
tests/fixtures/rust-cli
tests/fixtures/broken-monorepo
```

E2E scenarios:

1. quick typo fix routes to Flash.
2. complex refactor routes to Pro thinking max.
3. `$dcc-plan` creates plan only and no product code diff.
4. `$dcc-start-work` completes checklist and writes evidence.
5. LSP error blocks completion.
6. comment-checker blocks AI slop comment.
7. proxy handles tool call continuation with reasoning_content.
8. uninstall removes only DCC managed config.

### 25.4 Acceptance tests

프로젝트 완료 조건:

- `pnpm test` 통과
- `pnpm lint` 통과
- `pnpm typecheck` 통과
- `dcc install --dry-run` 통과
- temp HOME install/uninstall idempotency test 통과
- mocked DeepSeek smoke chat/tool/stream 통과
- 실제 `DEEPSEEK_API_KEY`가 있는 환경에서는 `dcc doctor --live` 통과
- secret redaction snapshot 통과
- README install guide 검증

---

## 26. 구현 마일스톤

### M0: Scaffold

- monorepo 생성
- package manager 결정: `pnpm` 권장
- TypeScript strict 설정
- CLI entry 생성
- plugin skeleton 생성
- CI 생성

완료 조건:

```bash
pnpm install
pnpm build
pnpm test
node bin/dcc.mjs --help
```

### M1: Provider proxy

- `/healthz`
- `/v1/models`
- `/v1/responses` non-stream
- request/response transform
- auth forwarding
- redaction
- mocked tests

완료 조건:

```bash
dcc proxy start
curl http://127.0.0.1:47147/healthz
pnpm test provider-proxy
```

### M2: Codex installer

- plugin cache copy
- config TOML patch
- marketplace snapshot
- agent TOML install
- uninstall
- dry-run

완료 조건:

```bash
dcc install --dry-run
dcc install --provider-mode=proxy --no-tui --no-codex-autonomous
dcc uninstall
```

### M3: Hooks + rules + comment-checker

- SessionStart
- UserPromptSubmit
- PostToolUse
- rules discovery
- comment checker
- compact restoration

완료 조건:

- hook payload fixture tests 통과
- rules 중복 주입 없음
- edit-like operation 후 checker 실행

### M4: LSP MCP

- MCP server skeleton
- diagnostics
- status
- symbols
- goto definition
- rename
- post-edit blocking feedback

완료 조건:

- TS fixture에서 diagnostics 반환
- Python fixture에서 diagnostics 반환 또는 graceful warning

### M5: Planning/execution loop

- `$dcc-plan`
- `$dcc-start-work`
- `.dcc/boulder.json`
- Stop continuation
- evidence audit
- verifier profile

완료 조건:

- plan 생성 시 product code diff 없음
- start-work 후 checklist/evidence 업데이트
- 미완료 plan에서 Stop hook continuation 발생

### M6: DeepSeek model routing

- route classifier
- Pro/Flash profile
- thinking mode policy
- fallback policy
- prompt contracts

완료 조건:

- routing snapshot tests
- quick task Flash
- planning task Pro
- failed Flash task Pro fallback

### M7: Project memory / init-deep

- repo scanner
- root AGENTS.md generator
- directory AGENTS.md generator
- `.dcc/memory` files
- safe no-product-code-edit policy

완료 조건:

- fixture repo에서 AGENTS.md 생성
- rerun 시 idempotent update
- product files untouched

### M8: Docs/release

- README
- install docs
- troubleshooting
- architecture docs
- security docs
- changelog
- release artifact

---

## 27. 세부 구현 기준

### 27.1 TypeScript 기준

- `strict: true`
- ESM 우선
- Node 20+ 지원
- 외부 dependency 최소화
- CLI arg parser는 `commander` 또는 `yargs` 중 하나
- TOML parser는 round-trip 보존 가능한 라이브러리 우선
- logger는 redaction middleware 필수

### 27.2 Logging

```ts
logger.info("proxy_start", {
  host,
  port,
  upstream: redactUrl(upstream),
});
```

금지:

```ts
console.log(req.headers.authorization);
console.log(prompt);
console.log(filePathWithUserHome);
```

### 27.3 Config patching

TOML patcher는 comments와 unknown fields를 보존해야 한다. 가장 안전한 방식은 marker block string patching이다.

```ts
insertOrReplaceManagedBlock(file, "DCC provider deepseek_proxy", block)
removeManagedBlock(file, "DCC provider deepseek_proxy")
```

### 27.4 Cross-platform

지원:

- macOS
- Linux
- Windows Git Bash 환경은 v1에서 best-effort

경로 처리:

- `os.homedir()`
- `XDG_DATA_HOME`
- `APPDATA` fallback
- symlink 실패 시 wrapper script 생성

---

## 28. 사용자 문서 요구사항

README에는 최소 다음 섹션이 있어야 한다.

1. What is DeepSeek-Codex-Combo?
2. Why not just set the model?
3. Requirements
4. Install
5. Set `DEEPSEEK_API_KEY`
6. Start proxy
7. Use with Codex
8. Commands
9. Model routing: Pro vs Flash
10. Troubleshooting
11. Security / telemetry
12. Uninstall

### 28.1 README install 예시

```bash
export DEEPSEEK_API_KEY="sk-..."
npx deepseek-codex-combo install --no-tui --provider-mode=proxy
npx deepseek-codex-combo doctor
npx deepseek-codex-combo proxy start
codex --profile deepseek-pro
```

### 28.2 Troubleshooting 예시

| 증상 | 해결 |
|---|---|
| Codex가 OpenAI 모델을 계속 사용 | `~/.codex/config.toml` profile 확인 |
| proxy connection refused | `dcc proxy start` 실행 |
| 401 auth error | `DEEPSEEK_API_KEY` 확인 |
| model not found | `dcc models --live` 실행 |
| tool call 400 | reasoning_content continuation bug, issue 템플릿 첨부 |
| LSP 느림 | `dcc lsp restart` 또는 해당 언어 server 설치 |

---

## 29. Codex에게 바로 줄 구현 프롬프트

아래 프롬프트를 Codex에게 이 명세서와 함께 전달한다.

```text
You are implementing DeepSeek-Codex-Combo from the attached development specification.

Do not reduce this to a simple model config change. Build the harness.

Implementation order:
1. Scaffold the TypeScript monorepo and CLI.
2. Implement the Responses-compatible local proxy that translates Codex Responses requests to DeepSeek ChatCompletions.
3. Implement install/uninstall with idempotent Codex config patching.
4. Add the Codex plugin skeleton with skills, hooks, MCP config, and model catalog.
5. Implement rules injection, comment-checker, and LSP MCP.
6. Implement dcc-plan, dcc-start-work, dcc-loop, Boulder state, and evidence audit.
7. Implement DeepSeek Pro/Flash routing and prompt profiles.
8. Add tests at every layer.

Constraints:
- Never log API keys, prompts, source files, or raw chain-of-thought.
- Do not write unsupported Codex native provider settings. If Codex only supports Responses wire, use the proxy.
- Keep installer idempotent and reversible.
- Do not edit product code in planning/init-deep commands.
- Completion requires evidence, not just passing tests.

Start by creating a short implementation plan, then implement M0 and M1 first.
```

---

## 30. 주요 리스크와 대응

### 30.1 Codex Responses event schema 변화

리스크: Codex가 기대하는 Responses streaming event가 바뀔 수 있다.

대응:

- Codex version probe
- compatibility tests
- proxy transform 모듈을 schema version별로 분리

### 30.2 DeepSeek thinking/tool-call continuation

리스크: `reasoning_content` 누락 시 tool-call 후속 요청에서 400이 날 수 있다.

대응:

- reasoning store 구현
- tool-call integration test
- crash 시 안전 fail

### 30.3 Native provider 오인

리스크: Codex custom provider에 `wire_api = "chat"` 같은 unsupported 설정을 써서 사용자 환경이 깨짐.

대응:

- 기본 proxy mode
- native mode는 schema probe 성공 시에만 허용
- doctor에서 unsupported config 감지

### 30.4 하네스 과복잡화

리스크: MVP가 너무 커져서 작동 가능한 결과가 늦어짐.

대응:

- M1 proxy + M2 installer를 먼저 끝냄
- LSP/AST/hashline은 feature flag
- Team Mode는 v2로 미룸

### 30.5 Telemetry 불신

리스크: 사용자가 prompt/code 유출을 우려함.

대응:

- telemetry 기본 off
- 켜도 anonymous metadata만
- redaction tests 필수

---

## 31. Definition of Done

DeepSeek-Codex-Combo v1 완료 조건은 다음이다.

- [ ] `dcc install --provider-mode=proxy`가 macOS/Linux에서 동작한다.
- [ ] `dcc uninstall`이 DCC managed state만 제거한다.
- [ ] `dcc doctor`가 provider/proxy/model/plugin/LSP 상태를 점검한다.
- [ ] Codex에서 `deepseek-v4-pro`로 기본 요청을 처리할 수 있다.
- [ ] Codex에서 `deepseek-v4-flash` route가 작동한다.
- [ ] streaming 응답이 작동한다.
- [ ] tool call roundtrip이 작동한다.
- [ ] thinking mode tool-call continuation이 깨지지 않는다.
- [ ] `rules` injection이 중복 없이 작동한다.
- [ ] comment-checker가 edit-like operation 뒤 작동한다.
- [ ] LSP diagnostics가 MCP와 hook에서 작동한다.
- [ ] `$dcc-plan`은 product code를 수정하지 않고 plan을 만든다.
- [ ] `$dcc-start-work`는 checklist/evidence를 업데이트한다.
- [ ] Stop hook이 미완료 plan을 이어가도록 막는다.
- [ ] `DCC_VERIFICATION_COMPLETE`는 evidence가 있을 때만 출력된다.
- [ ] README와 troubleshooting이 실제 명령 기준으로 맞다.
- [ ] 테스트, lint, typecheck가 CI에서 통과한다.

---

## 32. 참고 출처 메모

이 명세서는 다음 공개 문서/레포 구조를 기준으로 작성했다.

- LazyCodex repository: `https://github.com/code-yeongyu/lazycodex`
- oh-my-openagent repository: `https://github.com/code-yeongyu/oh-my-openagent`
- oh-my-openagent Codex package: `packages/omo-codex`
- LazyCodex Codex plugin bundle: `plugins/omo`
- OpenAI Codex plugin docs: `https://developers.openai.com/codex/plugins/build`
- OpenAI Codex config docs: `https://developers.openai.com/codex/config-basic`, `https://developers.openai.com/codex/config-reference`
- OpenAI Codex MCP docs: `https://developers.openai.com/codex/mcp`
- DeepSeek API docs: `https://api-docs.deepseek.com/`
- DeepSeek V4 release note: `https://api-docs.deepseek.com/news/news260424`

---

## 33. 최종 구현 방향 요약

DeepSeek-Codex-Combo의 핵심은 다음 한 줄로 요약된다.

> Codex에는 Responses-compatible local proxy로 DeepSeek V4 Pro/Flash를 안정적으로 붙이고, 그 위에 LazyCodex/OmO식 rules·LSP·planning·execution·verification 하네스를 DeepSeek 모델 특성에 맞춰 다시 쌓는다.

MVP에서 반드시 성공시킬 것은 “모델 호출”이 아니라 다음이다.

```text
설치 가능 → DeepSeek 연결 가능 → 라우팅 가능 → 계획 가능 → 실행 가능 → 진단 가능 → 증거 기반 검증 가능 → 삭제 가능
```
