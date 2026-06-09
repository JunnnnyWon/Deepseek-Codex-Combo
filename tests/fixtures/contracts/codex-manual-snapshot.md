# Codex Manual Snapshot

Checked: 2026-06-07

Sources:
- https://developers.openai.com/codex/config-advanced
- https://developers.openai.com/codex/plugins/build
- https://developers.openai.com/codex/hooks
- https://developers.openai.com/codex/mcp

Facts captured for tests:
- Custom model providers are configured in user-level Codex config through `model_providers`.
- The DeepSeek proxy compatibility path uses the Responses wire.
- Project `.codex/config.toml` layers cannot override provider or auth routing keys.
- Plugin bundles use `.codex-plugin/plugin.json`, optional `skills/`, `hooks/hooks.json`, and `.mcp.json`.
- Plugin-provided MCP servers are declared by the plugin and toggled by user config under `plugins.<plugin>.mcp_servers`.
