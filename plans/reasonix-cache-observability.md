# Reasonix-Style Cache Observability For Provider Proxy

## TL;DR
> **Summary**: Apply only the low-risk Reasonix cache observability pieces to `packages/provider-proxy`: normalize DeepSeek cache usage, compute prefix-shape hashes, and report system/tools/rewrite change reasons when an explicit safe session key is available.
> **Deliverables**:
> - Normalized token/cache usage parser for DeepSeek non-streaming and streaming shapes.
> - Additive `usage` and `cache_diagnostics` fields on provider-proxy responses/logs.
> - Prefix-shape diagnostics module with hashes for system messages, tools, and diagnostic rewrite version.
> - Bounded in-memory previous-shape tracker keyed only by explicit safe session id/header.
> - Provider-proxy tests, fixture coverage, and docs.
> **Effort**: Medium
> **Parallel**: YES - 3 implementation waves
> **Critical Path**: Task 1 + Task 2 -> Task 3 + Task 4 -> Task 5 -> Final Verification

## Context
### Original Request
User asked: "1~3번만 적용하는 계획 세워"

The "1~3" scope refers to:
1. Parse and surface DeepSeek cache usage (`prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`).
2. Add provider-proxy prefix shape diagnostics.
3. Detect/report cache-prefix change reasons for system, tools, and rewrite version.

### Interview Summary
- No further user decisions are needed.
- Default test strategy: TDD with existing Vitest infrastructure.
- Default scope boundary: provider-proxy only.
- Default response/log surface: additive fields only; do not change outbound DeepSeek request semantics.

### Metis Review (gaps addressed)
- Change reasons require a previous-shape baseline. This plan adds a bounded in-memory tracker keyed only by explicit safe session metadata/header.
- If no safe session key exists, diagnostics must show the current shape but comparison is `unavailable`.
- Diagnostics must never contain raw prompts, tool descriptions, tool schemas, tool arguments, output text, authorization values, or reasoning content.
- Canonicalization is for hashing only; the actual outgoing `tools` array and messages must remain unchanged.
- Streaming usage is scoped to `stream.ts` parsing/fixture tests only; do not implement a new streaming server pathway.

## Work Objectives
### Core Objective
Make Deepseek-Codex-Combo expose and explain DeepSeek context-cache behavior at the provider-proxy boundary without creating a local response cache or changing model/tool behavior.

### Deliverables
- `packages/provider-proxy/src/cacheUsage.ts`
- `packages/provider-proxy/src/cacheUsage.test.ts`
- `packages/provider-proxy/src/cacheDiagnostics.ts`
- `packages/provider-proxy/src/cacheDiagnostics.test.ts`
- Updates to `packages/provider-proxy/src/types.ts`
- Updates to `packages/provider-proxy/src/chatToResponses.ts` and tests
- Updates to `packages/provider-proxy/src/stream.ts` and tests
- Updates to `packages/provider-proxy/src/server.ts` and tests
- Updates to `packages/provider-proxy/src/index.ts`
- Updates to `packages/provider-proxy/package.json` if importing `@dcc/shared`
- Fixture and docs updates under `tests/fixtures/proxy/`, `docs/provider-proxy.md`, and `docs/external-contracts.md`

### Definition of Done
- `pnpm test -- packages/provider-proxy/src/cacheUsage.test.ts packages/provider-proxy/src/cacheDiagnostics.test.ts packages/provider-proxy/src/chatToResponses.test.ts packages/provider-proxy/src/stream.test.ts packages/provider-proxy/src/server.test.ts`
- `pnpm test -- tests/e2e/cli/proxy-transform.test.ts tests/e2e/cli/proxy-stream.test.ts`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- No serialized test output contains `hidden-chain`, `reasoning_content`, `Authorization`, `sk-`, fixture prompt text, or raw tool schema descriptions in diagnostics/log assertions.

### Must Have
- Normalize DeepSeek top-level `usage.prompt_cache_hit_tokens` and `usage.prompt_cache_miss_tokens`.
- Support nested `usage.prompt_tokens_details.cached_tokens` as a fallback and derive miss tokens as `prompt_tokens - cached_tokens` when miss is absent.
- Preserve `completion_tokens_details.reasoning_tokens` when present.
- Add `CACHE_DIAGNOSTIC_REWRITE_VERSION = 1`.
- Hash system messages and tools without exposing raw content.
- Compare current vs previous shape only when a safe session key exists.
- Reasons enum is exactly `system`, `tools`, `rewrite`.
- Actual upstream request `messages`, `tools`, `reasoning_content` behavior, and tool order remain unchanged.
- Malformed or partial `usage` must never fail an otherwise valid response; normalize absent/invalid numeric fields to `0` and omit usage only when the entire usage object is absent/null.
- Previous-shape tracker must update only after `chatCompletionProvider` returns successfully; failed upstream/proxy requests must not advance the comparison baseline.

### Must NOT Have
- No local response/body cache.
- No DeepSeek live network test in default verification.
- No paid API call.
- No prompt/session memory management.
- No tool schema reordering on the outgoing request.
- No `reasoning_content` contract change.
- No raw prompt, raw tool schema, raw tool description, raw arguments, output text, authorization, or reasoning content in logs/diagnostics.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: TDD with Vitest.
- QA policy: Every task has agent-executed happy and failure/edge scenarios.
- Evidence: save command output to `evidence/task-{N}-{slug}.txt` during execution.

## Execution Strategy
### Parallel Execution Waves
Wave 1: Task 1 and Task 2 can run in parallel.
Wave 2: Task 3 and Task 4 can run in parallel after Wave 1.
Wave 3: Task 5 and Task 6 after Wave 2.
Final Wave: F1-F4 after all tasks.

### Dependency Matrix
- Task 1: no blockers.
- Task 2: no blockers.
- Task 3: blocked by Task 1.
- Task 4: blocked by Task 1 and Task 2.
- Task 5: blocked by Task 3 and Task 4.
- Task 6: blocked by Task 3 and Task 4.
- Final Verification: blocked by all tasks.

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: References + Acceptance Criteria + QA Scenarios.

- [x] 1. Add Normalized Cache Usage Parser

  **What to do**: Create `packages/provider-proxy/src/cacheUsage.ts` and `packages/provider-proxy/src/cacheUsage.test.ts`. Define `NormalizedUsage` with exactly:
  - `prompt_tokens: number`
  - `completion_tokens: number`
  - `total_tokens: number`
  - `prompt_cache_hit_tokens: number`
  - `prompt_cache_miss_tokens: number`
  - `reasoning_tokens: number`

  Add `normalizeDeepSeekUsage(input: unknown): NormalizedUsage | undefined`. It must return `undefined` for missing/null usage. It must accept DeepSeek top-level cache fields and fallback to `prompt_tokens_details.cached_tokens`. If `prompt_cache_miss_tokens` is absent or zero and cached tokens are positive, derive miss as `Math.max(prompt_tokens - prompt_cache_hit_tokens, 0)`. Treat absent token fields as `0`; do not throw for partial historical DeepSeek usage examples.

  Numeric parsing rule: use `z.coerce.number().int().nonnegative().catch(0)` or equivalent local helper so malformed numeric fields normalize to `0` instead of breaking response conversion.

  **Must NOT do**: Do not parse or store prompt text. Do not add local caching. Do not include pricing logic.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Task 3, Task 4 | Blocked By: none

  **References**:
  - Pattern: `packages/provider-proxy/src/types.ts:86` - current DeepSeek completion schema has no usage.
  - Pattern: `packages/provider-proxy/src/chatToResponses.ts:68` - completion conversion currently parses the whole object here.
  - External: [Reasonix usage normalization](https://github.com/esengine/deepseek-reasonix/blob/fc7a17994a63afde423e86120cae87582dc265c2/internal/provider/openai/openai.go#L384-L408) - mirror hit/miss normalization and miss derivation.
  - External: [DeepSeek Chat Completion usage fields](https://api-docs.deepseek.com/api/create-chat-completion) - `prompt_tokens` equals hit plus miss when cache fields are present.

  **Acceptance Criteria**:
  - [ ] `cacheUsage.test.ts` covers DeepSeek top-level hit/miss fields.
  - [ ] `cacheUsage.test.ts` covers nested `prompt_tokens_details.cached_tokens` fallback.
  - [ ] `cacheUsage.test.ts` covers miss derivation from `prompt_tokens - cached_tokens`.
  - [ ] `cacheUsage.test.ts` covers missing/null usage returning `undefined`.
  - [ ] `cacheUsage.test.ts` covers `completion_tokens_details.reasoning_tokens`.
  - [ ] `pnpm test -- packages/provider-proxy/src/cacheUsage.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: DeepSeek usage with explicit cache fields
    Tool: bash
    Steps: Run `pnpm test -- packages/provider-proxy/src/cacheUsage.test.ts -t normalizes_deepseek_cache_usage`
    Expected: Normalized usage has hit=900, miss=100, prompt=1000, completion=50, total=1050.
    Evidence: evidence/task-1-cache-usage.txt

  Scenario: Historical or nested usage shape
    Tool: bash
    Steps: Run `pnpm test -- packages/provider-proxy/src/cacheUsage.test.ts -t derives_cache_miss_from_nested_cached_tokens`
    Expected: Normalized usage has hit from `prompt_tokens_details.cached_tokens` and miss derived without throwing.
    Evidence: evidence/task-1-cache-usage-edge.txt
  ```

  **Commit**: NO | Message: `feat(provider-proxy): normalize deepseek cache usage` | Files: `packages/provider-proxy/src/cacheUsage.ts`, `packages/provider-proxy/src/cacheUsage.test.ts`

- [x] 2. Add Prefix Shape Hash And Comparison Module

  **What to do**: Create `packages/provider-proxy/src/cacheDiagnostics.ts` and `packages/provider-proxy/src/cacheDiagnostics.test.ts`. Define:
  - `export const CACHE_DIAGNOSTIC_REWRITE_VERSION = 1`
  - `CachePrefixShape`
  - `CacheDiagnostics`
  - `captureCachePrefixShape(chatRequest: DeepSeekChatRequest): CachePrefixShape`
  - `compareCachePrefixShapes(previous, current, usage): CacheDiagnostics`

  `CacheDiagnostics` must contain exactly:
  - `comparison: "unavailable" | "first_observation" | "compared"`
  - `prefix_hash: string`
  - `system_hash: string`
  - `tools_hash: string`
  - `rewrite_version: number`
  - `tool_schema_tokens: number`
  - `prefix_changed: boolean`
  - `prefix_change_reasons: readonly ("system" | "tools" | "rewrite")[]`
  - `prompt_cache_hit_tokens: number`
  - `prompt_cache_miss_tokens: number`

  `captureCachePrefixShape` must:
  - collect all `chatRequest.messages` where `role === "system"` in existing order;
  - hash system message content using SHA-256 shortened to 16 hex characters;
  - hash tools with stable object-key ordering while preserving array order;
  - produce `prefix_hash` from `{ system_messages, tools, rewrite_version }`;
  - estimate `tool_schema_tokens` as `Math.floor(stableToolJson.length / 4)` with `0` for empty tools.

  `compareCachePrefixShapes` must:
  - set `prefix_changed` false for first observation or no previous shape;
  - add reason `system` if `system_hash` differs;
  - add reason `tools` if `tools_hash` differs;
  - add reason `rewrite` if `rewrite_version` differs;
  - include cache hit/miss from normalized usage when provided.

  **Must NOT do**: Do not sort the outgoing `tools` array. Do not log or return raw system text/tool schema. Do not hash authorization headers, output text, user messages, or reasoning content.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Task 4 | Blocked By: none

  **References**:
  - Pattern: `packages/provider-proxy/src/responsesToChat.ts:129` - system instructions become DeepSeek system messages.
  - Pattern: `packages/provider-proxy/src/responsesToChat.ts:195` - tool schemas are created before the chat request is returned.
  - External: [Reasonix PrefixShape](https://github.com/esengine/deepseek-reasonix/blob/fc7a17994a63afde423e86120cae87582dc265c2/internal/agent/cache_shape.go#L13-L93) - source pattern for shape capture and compare.
  - External: [Reasonix cache-first instruction](https://github.com/esengine/deepseek-reasonix/blob/fc7a17994a63afde423e86120cae87582dc265c2/REASONIX.md#L14-L16) - stable prefix is the design target.

  **Acceptance Criteria**:
  - [ ] Same system/tools shape produces identical hashes across repeated calls.
  - [ ] Object key ordering differences inside a tool schema do not change `tools_hash`.
  - [ ] Tool array order differences do change `tools_hash`, because DCC does not reorder outbound tools.
  - [ ] System message content change yields reason `system`.
  - [ ] Tool schema change yields reason `tools`.
  - [ ] Rewrite version change yields reason `rewrite`.
  - [ ] Serialized diagnostics contain only hashes, numbers, booleans, comparison status, and reason enums.
  - [ ] `pnpm test -- packages/provider-proxy/src/cacheDiagnostics.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Stable prefix shape
    Tool: bash
    Steps: Run `pnpm test -- packages/provider-proxy/src/cacheDiagnostics.test.ts -t captures_stable_prefix_shape`
    Expected: Repeated capture returns the same hashes and no raw system/tool strings appear in serialized diagnostics.
    Evidence: evidence/task-2-cache-shape.txt

  Scenario: Prefix changed by tool schema
    Tool: bash
    Steps: Run `pnpm test -- packages/provider-proxy/src/cacheDiagnostics.test.ts -t reports_tool_change_reason`
    Expected: Comparison reports `prefix_changed=true` and reasons exactly `["tools"]`.
    Evidence: evidence/task-2-cache-shape-tool-change.txt
  ```

  **Commit**: NO | Message: `feat(provider-proxy): add cache prefix diagnostics` | Files: `packages/provider-proxy/src/cacheDiagnostics.ts`, `packages/provider-proxy/src/cacheDiagnostics.test.ts`

- [x] 3. Surface Normalized Usage In Responses And Stream Events

  **What to do**: Update `packages/provider-proxy/src/types.ts`, `packages/provider-proxy/src/chatToResponses.ts`, `packages/provider-proxy/src/chatToResponses.test.ts`, `packages/provider-proxy/src/stream.ts`, and `packages/provider-proxy/src/stream.test.ts`.

  Non-streaming response shape:
  - Add optional `usage?: NormalizedUsage` to `ResponsesObject`.
  - Extend `deepSeekChatCompletionSchema` with optional `usage`.
  - `convertChatCompletionToResponses` must call `normalizeDeepSeekUsage` and include `usage` only when present.

  Streaming event shape:
  - Extend stream chunk parsing to accept `usage` and empty `choices`.
  - Add event union member `{ type: "response.usage"; response_id: string; usage: NormalizedUsage }`.
  - Emit `response.usage` before `response.completed` when a stream usage chunk exists.
  - Existing stream fixtures without usage must keep the exact current event sequence.

  **Must NOT do**: Do not implement server-side streaming proxy behavior. Do not expose reasoning text. Do not make usage mandatory.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Task 5, Task 6 | Blocked By: Task 1

  **References**:
  - Pattern: `packages/provider-proxy/src/chatToResponses.ts:20` - `ResponsesObject` currently lacks usage.
  - Pattern: `packages/provider-proxy/src/chatToResponses.test.ts:5` - existing conversion test style.
  - Pattern: `packages/provider-proxy/src/stream.ts:46` - current stream chunk schema requires non-empty choices and lacks usage.
  - Pattern: `packages/provider-proxy/src/stream.ts:195` - completed event is currently appended at the end.
  - External: [DeepSeek streaming usage docs](https://api-docs.deepseek.com/api/create-chat-completion) - `stream_options.include_usage` emits a usage chunk before `[DONE]`.

  **Acceptance Criteria**:
  - [ ] Non-stream conversion includes normalized `usage` when DeepSeek completion has `usage`.
  - [ ] Non-stream conversion omits `usage` when DeepSeek completion has no `usage`.
  - [ ] Stream parser emits `response.usage` for a usage chunk with empty `choices`.
  - [ ] Existing stream tests without usage still pass unchanged.
  - [ ] `formatResponsesSse` serializes `response.usage`.
  - [ ] `pnpm test -- packages/provider-proxy/src/chatToResponses.test.ts packages/provider-proxy/src/stream.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Non-stream completion surfaces cache usage
    Tool: bash
    Steps: Run `pnpm test -- packages/provider-proxy/src/chatToResponses.test.ts -t includes_cache_usage`
    Expected: Response contains normalized prompt/cache/reasoning token counts.
    Evidence: evidence/task-3-response-usage.txt

  Scenario: Stream usage chunk
    Tool: bash
    Steps: Run `pnpm test -- packages/provider-proxy/src/stream.test.ts -t maps_stream_usage_chunk`
    Expected: Event list contains `response.usage` before `response.completed`; no `hidden-chain` or `reasoning_content`.
    Evidence: evidence/task-3-stream-usage.txt
  ```

  **Commit**: NO | Message: `feat(provider-proxy): surface cache usage` | Files: `packages/provider-proxy/src/types.ts`, `packages/provider-proxy/src/chatToResponses.ts`, `packages/provider-proxy/src/chatToResponses.test.ts`, `packages/provider-proxy/src/stream.ts`, `packages/provider-proxy/src/stream.test.ts`

- [x] 4. Wire Cache Diagnostics Into Server Logs And Responses

  **What to do**: Update `packages/provider-proxy/src/server.ts`, `packages/provider-proxy/src/server.test.ts`, `packages/provider-proxy/src/index.ts`, and `packages/provider-proxy/package.json` if using `@dcc/shared`.

  Add a bounded previous-shape tracker:
  - Prefer importing `createBoundedStore` from `@dcc/shared`; add `"@dcc/shared": "workspace:*"` to `packages/provider-proxy/package.json` if required by package resolution.
  - Store one previous shape per session key with `ttlMs = 6 * 60 * 60 * 1000` and `maxEntriesPerSession = 1`.
  - Session key extraction order is exactly:
    1. `request.metadata.dcc_cache_session_id` when it is a non-empty string.
    2. `request.metadata.session_id` when it is a non-empty string.
    3. Header `x-dcc-cache-session-id` when it is a non-empty string.
    4. No key: comparison disabled.

  Add response field:
  - `cache_diagnostics?: CacheDiagnostics`
  - Always include it for successful `/v1/responses` when a chat request was transformed.
  - When no session key exists, set `comparison: "unavailable"`, `prefix_changed: false`, and empty reasons.
  - On first observation for a key, set `comparison: "first_observation"`, `prefix_changed: false`, and store shape.
  - On later observation, set `comparison: "compared"` and reasons from shape comparison, then store current shape.
  - Compute current shape before upstream call, but update the stored previous shape only after `chatCompletionProvider` succeeds and `convertChatCompletionToResponses` succeeds.

  Add log fields:
  - Extend `ProxyLogEntry` with optional `usage?: NormalizedUsage` and `cache_diagnostics?: CacheDiagnostics`.
  - Keep `detail` redaction behavior unchanged.
  - `response_completed` log must include usage and diagnostics when present.

  **Must NOT do**: Do not use prompt text, request body text, authorization, or output text as a session key. Do not log raw metadata except the safe derived comparison status.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Task 5, Task 6 | Blocked By: Task 1, Task 2

  **References**:
  - Pattern: `packages/provider-proxy/src/server.ts:30` - current log entry type.
  - Pattern: `packages/provider-proxy/src/server.ts:66` - current redacting logger.
  - Pattern: `packages/provider-proxy/src/server.ts:117` - `/v1/responses` transform/provider/response flow.
  - Pattern: `packages/shared/src/bounded-store.ts:1` - existing TTL bounded store.
  - Pattern: `packages/provider-proxy/src/index.ts:56` - provider-proxy exports public types.
  - External: [Reasonix usage line diagnostics](https://github.com/esengine/deepseek-reasonix/blob/fc7a17994a63afde423e86120cae87582dc265c2/internal/agent/textsink.go#L177-L217) - usage and prefix-change reasons travel together.

  **Acceptance Criteria**:
  - [ ] `/v1/responses` response includes `cache_diagnostics.comparison="unavailable"` when no session key is present.
  - [ ] With `metadata.dcc_cache_session_id`, first request returns `first_observation`.
  - [ ] Second request with same session and same prefix returns `compared` and `prefix_changed=false`.
  - [ ] Second request with changed instructions returns `compared`, `prefix_changed=true`, reasons `["system"]`.
  - [ ] Second request with changed tool schema returns reasons `["tools"]`.
  - [ ] A test can force rewrite-version comparison and get reason `["rewrite"]`.
  - [ ] `logSink` receives normalized usage and cache diagnostics without raw prompt/tool/auth data.
  - [ ] `pnpm test -- packages/provider-proxy/src/server.test.ts packages/provider-proxy/src/cacheDiagnostics.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Session-keyed comparison reports system change
    Tool: bash
    Steps: Run `pnpm test -- packages/provider-proxy/src/server.test.ts -t reports_cache_prefix_system_change`
    Expected: First response is `first_observation`; second response is `compared` with reason `system`.
    Evidence: evidence/task-4-server-diagnostics.txt

  Scenario: Diagnostics fail closed without leakage
    Tool: bash
    Steps: Run `pnpm test -- packages/provider-proxy/src/server.test.ts -t cache_diagnostics_do_not_leak_sensitive_content`
    Expected: Serialized response/log does not contain fixture prompt, tool description, Authorization, `sk-`, `hidden-chain`, or `reasoning_content`.
    Evidence: evidence/task-4-server-diagnostics-redaction.txt
  ```

  **Commit**: NO | Message: `feat(provider-proxy): report cache diagnostics` | Files: `packages/provider-proxy/src/server.ts`, `packages/provider-proxy/src/server.test.ts`, `packages/provider-proxy/src/index.ts`, `packages/provider-proxy/package.json`

- [x] 5. Update Fixtures And CLI Fixture Coverage

  **What to do**: Update or add offline fixtures under `tests/fixtures/proxy/` and e2e assertions in `tests/e2e/cli/proxy-transform.test.ts` and `tests/e2e/cli/proxy-stream.test.ts`.

  Required fixture changes:
  - Add cache usage to `tests/fixtures/proxy/text-response.json` or create `tests/fixtures/proxy/cache-usage-response.json`.
  - Add `tests/fixtures/proxy/stream-usage-response.sse` with a usage chunk before `[DONE]`.
  - Keep existing `stream-response.sse` unchanged so no-usage stream behavior remains covered.

  CLI fixture transform behavior:
  - `transformProxyFixtureFile` may continue to print only `response.<status>` and `output_text`.
  - If adding printed cache diagnostics, print only counts/hashes/reasons, never raw prompt or tool schema.
  - E2E must assert no prompt/auth/reasoning leakage.

  **Must NOT do**: Do not require live DeepSeek. Do not make existing no-usage fixtures fail.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: Final Verification | Blocked By: Task 3, Task 4

  **References**:
  - Pattern: `tests/fixtures/proxy/text-response.json:1` - current non-stream proxy fixture.
  - Pattern: `tests/fixtures/proxy/stream-response.sse:1` - current stream fixture without usage.
  - Pattern: `packages/provider-proxy/src/fixtureTransform.ts:27` - non-stream fixture transform.
  - Pattern: `packages/provider-proxy/src/fixtureTransform.ts:58` - stream fixture transform.
  - Pattern: `tests/e2e/cli/proxy-transform.test.ts:5` - existing no-leak CLI fixture assertions.
  - Pattern: `tests/e2e/cli/proxy-stream.test.ts:5` - existing stream event assertions.

  **Acceptance Criteria**:
  - [ ] Fixture transform test covers non-stream usage fixture.
  - [ ] Stream fixture test covers a usage chunk without changing old no-usage fixture expected sequence.
  - [ ] CLI output never contains raw prompt text, authorization strings, `sk-`, `hidden-chain`, or `reasoning_content`.
  - [ ] `pnpm test -- tests/e2e/cli/proxy-transform.test.ts tests/e2e/cli/proxy-stream.test.ts` passes.

  **QA Scenarios**:
  ```text
  Scenario: Non-stream fixture with cache usage
    Tool: bash
    Steps: Run `pnpm test -- tests/e2e/cli/proxy-transform.test.ts -t transforms_cache_usage_fixture_without_leaks`
    Expected: CLI succeeds and no sensitive strings are emitted.
    Evidence: evidence/task-5-fixture-transform.txt

  Scenario: Stream usage fixture
    Tool: bash
    Steps: Run `pnpm test -- tests/e2e/cli/proxy-stream.test.ts -t prints_stream_usage_event_without_leaks`
    Expected: CLI includes `response.usage` for the usage fixture and still redacts reasoning content.
    Evidence: evidence/task-5-stream-fixture.txt
  ```

  **Commit**: NO | Message: `test(provider-proxy): cover cache usage fixtures` | Files: `tests/fixtures/proxy/*`, `tests/e2e/cli/proxy-transform.test.ts`, `tests/e2e/cli/proxy-stream.test.ts`, `packages/provider-proxy/src/fixtureTransform.ts` if needed

- [x] 6. Document Cache Observability Contract

  **What to do**: Update `docs/provider-proxy.md` and `docs/external-contracts.md`.

  `docs/provider-proxy.md` must state:
  - DeepSeek context caching is server-side and automatic.
  - DCC does not cache responses locally.
  - DCC surfaces normalized cache usage when DeepSeek reports it.
  - DCC reports prefix-shape diagnostics with hashes and reason enums only.
  - Change reasons require explicit `metadata.dcc_cache_session_id`, `metadata.session_id`, or `x-dcc-cache-session-id`.
  - Missing session key means `comparison="unavailable"`.

  `docs/external-contracts.md` must add DeepSeek sources:
  - `https://api-docs.deepseek.com/guides/kv_cache`
  - `https://api-docs.deepseek.com/api/create-chat-completion`
  - It must keep the existing `reasoning_content` assumption unchanged.

  **Must NOT do**: Do not claim cache hits are guaranteed. Do not document live checks as default. Do not change model aliases or pricing docs.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: Final Verification | Blocked By: Task 3, Task 4

  **References**:
  - Pattern: `docs/provider-proxy.md:1` - current provider proxy command and behavior docs are short.
  - Pattern: `docs/external-contracts.md:21` - DeepSeek contract section.
  - Pattern: `docs/external-contracts.md:37` - default verification is offline and fixture-backed.
  - External: [DeepSeek Context Caching](https://api-docs.deepseek.com/guides/kv_cache) - cache is automatic, best-effort, and reports hit/miss tokens.
  - External: [Reasonix SPEC cache stability](https://github.com/esengine/deepseek-reasonix/blob/fc7a17994a63afde423e86120cae87582dc265c2/docs/SPEC.md#L162-L199) - prefix stability is design discipline, not local response caching.

  **Acceptance Criteria**:
  - [ ] Docs explicitly say this is not local response caching.
  - [ ] Docs name the three session-key sources and unavailable behavior.
  - [ ] Docs include the two DeepSeek cache/usage URLs.
  - [ ] Docs keep existing `reasoning_content` contract unchanged.
  - [ ] `pnpm test -- tests/unit/docs/readme-contract.test.ts tests/unit/contracts/deepseek-contract.test.ts` passes, or if those tests do not cover the changed docs, full `pnpm test` remains the acceptance gate.

  **QA Scenarios**:
  ```text
  Scenario: Provider proxy docs explain cache observability
    Tool: bash
    Steps: Run `rg -n "context caching|cache_diagnostics|dcc_cache_session_id|not cache responses locally" docs/provider-proxy.md`
    Expected: All required phrases are present.
    Evidence: evidence/task-6-provider-proxy-docs.txt

  Scenario: External contract keeps reasoning content unchanged
    Tool: bash
    Steps: Run `rg -n "reasoning_content|kv_cache|create-chat-completion" docs/external-contracts.md`
    Expected: Existing `reasoning_content` assumption remains and DeepSeek cache docs are listed.
    Evidence: evidence/task-6-external-contracts.txt
  ```

  **Commit**: NO | Message: `docs(provider-proxy): document cache diagnostics` | Files: `docs/provider-proxy.md`, `docs/external-contracts.md`

## Final Verification Wave
> ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. Plan Compliance Audit
  - Verify only requested items 1-3 were implemented.
  - Verify no local response cache, tool reorder mutation, session orchestration, live test, or `reasoning_content` behavior change was added.
  - Evidence: `evidence/f1-plan-compliance.txt`

- [x] F2. Code Quality Review
  - Run `pnpm typecheck`.
  - Run `pnpm lint`.
  - Inspect public exports in `packages/provider-proxy/src/index.ts`.
  - Evidence: `evidence/f2-code-quality.txt`

- [x] F3. Real Manual QA
  - Run targeted provider-proxy tests:
    `pnpm test -- packages/provider-proxy/src/cacheUsage.test.ts packages/provider-proxy/src/cacheDiagnostics.test.ts packages/provider-proxy/src/chatToResponses.test.ts packages/provider-proxy/src/stream.test.ts packages/provider-proxy/src/server.test.ts`
  - Run CLI fixture tests:
    `pnpm test -- tests/e2e/cli/proxy-transform.test.ts tests/e2e/cli/proxy-stream.test.ts`
  - Evidence: `evidence/f3-manual-qa.txt`

- [x] F4. Scope Fidelity Check
  - Run `pnpm test`.
  - Run `rg -n "reasoning_content|prompt_cache_hit_tokens|prompt_cache_miss_tokens|cache_diagnostics|CACHE_DIAGNOSTIC_REWRITE_VERSION" packages/provider-proxy docs tests/fixtures tests/e2e`.
  - Confirm `reasoning_content` tests/contracts still pass and cache additions are additive.
  - Evidence: `evidence/f4-scope-fidelity.txt`

## Commit Strategy
- Current workspace is not a git repository. Do not attempt `git commit`.
- If execution later happens inside a git-enabled copy, use one commit after all verification passes:
  `feat(provider-proxy): surface deepseek cache diagnostics`

## Success Criteria
- DeepSeek cache usage is parsed and exposed when present.
- Prefix shape diagnostics are available without leaking raw prompt/tool/reasoning/auth data.
- System/tool/rewrite change reasons are reported only when a safe session baseline exists.
- No behavior outside items 1-3 changed.
- All verification commands pass.
