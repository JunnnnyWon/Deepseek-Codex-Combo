# External Contract Snapshot

Checked: 2026-06-07

## Codex

Sources:
- https://developers.openai.com/codex/config-advanced
- https://developers.openai.com/codex/plugins/build
- https://developers.openai.com/codex/hooks
- https://developers.openai.com/codex/mcp

Implementation assumptions:
- Custom providers are user-level Codex configuration, not project-local configuration.
- Project `.codex/config.toml` cannot override provider, provider table, profile, notification, or telemetry routing keys.
- DeepSeek-Codex-Combo v1 must expose a Responses-compatible local proxy and configure it through `model_providers.<id>`.
- Plugin bundles are rooted by `.codex-plugin/plugin.json`; `skills/`, `hooks/hooks.json`, `.mcp.json`, and assets live at plugin root.
- Bundled MCP servers may be declared by a plugin and user config can enable/disable them under `plugins.<plugin>.mcp_servers.<server>`.
- Lifecycle hooks support events including `SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `PostCompact`, `Stop`, and `SubagentStop`; matcher behavior differs by event and must be tested per hook.

## DeepSeek

Sources:
- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/api/list-models
- https://api-docs.deepseek.com/quick_start/pricing
- https://api-docs.deepseek.com/guides/thinking_mode
- https://api-docs.deepseek.com/guides/kv_cache
- https://api-docs.deepseek.com/api/create-chat-completion

Implementation assumptions:
- OpenAI-compatible base URL is `https://api.deepseek.com`.
- v1 proxy upstream target is Chat Completions at `https://api.deepseek.com/chat/completions`.
- Required model IDs are `deepseek-v4-flash` and `deepseek-v4-pro`.
- Legacy model names `deepseek-chat` and `deepseek-reasoner` are compatibility aliases scheduled for deprecation on 2026-07-24 15:59 UTC.
- V4 Flash and V4 Pro support thinking and non-thinking modes, JSON output, and tool calls.
- In thinking mode with tool calls, `reasoning_content` must be preserved for subsequent API context, but DeepSeek-Codex-Combo must not write raw reasoning content into durable logs, telemetry, or evidence.
- DeepSeek context caching is automatic and best-effort; DeepSeek-Codex-Combo surfaces `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens` when reported, but it does not guarantee cache hits or store local response caches.

## Live Check Policy

Default verification is offline and fixture-backed. Live DeepSeek checks require both `DEEPSEEK_API_KEY` and an explicit `--live` flag; default CLI and CI paths must not make paid or networked API calls.
