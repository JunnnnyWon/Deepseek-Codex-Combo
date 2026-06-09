# Provider Proxy

The provider proxy exposes a local Responses-compatible surface and forwards transformed requests to DeepSeek Chat Completions. It supports offline fixture checks for text, streaming, tool calls, and reasoning-continuation failure handling.

Useful commands:

```bash
node bin/dcc.mjs proxy start --background --host 127.0.0.1 --port 41473
node bin/dcc.mjs proxy status --port 41473
curl -i http://127.0.0.1:41473/healthz
node bin/dcc.mjs proxy stop --port 41473
node bin/dcc.mjs proxy transform-fixture tests/fixtures/proxy/text-response.json
node bin/dcc.mjs proxy stream-fixture tests/fixtures/proxy/stream-response.sse
```

The proxy binds to loopback by default. Remote bind requires an explicit flag and should not be used for normal local Codex operation.

## Cache Observability

DeepSeek context caching is server-side and automatic. DeepSeek-Codex-Combo does not cache responses locally; it only reports cache usage and proxy-visible prefix diagnostics when DeepSeek returns usage data.

Successful `/v1/responses` calls include normalized `usage` when the upstream response reports token accounting. The cache fields use DeepSeek names:

- `prompt_cache_hit_tokens`
- `prompt_cache_miss_tokens`
- `reasoning_tokens`

Successful responses also include `cache_diagnostics`. The diagnostic payload contains hashes, token counts, comparison status, and reason enums only. It must not contain raw prompts, tool descriptions, tool schemas, tool arguments, authorization values, output text, or reasoning content.

Prefix-change reasons require an explicit safe session key. The proxy checks these sources in order:

1. `metadata.dcc_cache_session_id`
2. `metadata.session_id`
3. `x-dcc-cache-session-id`

When no session key is present, `cache_diagnostics.comparison` is `unavailable`. With a session key, the first successful request is `first_observation`; later successful requests for the same key are `compared` and may report `system`, `tools`, or `rewrite` in `prefix_change_reasons`.

Example request metadata:

```json
{
  "metadata": {
    "dcc_cache_session_id": "local-cache-check"
  }
}
```

Cache hits are best-effort server-side behavior. Use `cache_diagnostics` to understand whether the proxy saw a comparable stable prefix and whether DeepSeek reported cache token fields, not as a guarantee that a repeated prompt will be discounted.

Live gated cache check:

```bash
set -a
secret_env=".dcc/"'secrets/deepseek.env'
source "$secret_env"
set +a
pnpm live:cache -- --out evidence/production-dcc/live-cache-pair.txt
```

The helper starts a temporary real-upstream proxy, sends two identical stable-prefix `/v1/responses` requests with the same `metadata.dcc_cache_session_id`, writes only status/comparison/token-count summaries, and stops the proxy before exit.
