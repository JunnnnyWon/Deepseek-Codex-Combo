# Architecture

DeepSeek-Codex-Combo is split into small packages with one job each:

- `packages/provider-proxy` translates Codex Responses-shaped traffic to DeepSeek Chat Completions and back.
- `packages/codex-installer` writes reversible Codex config, profile, plugin, and MCP server plans.
- `packages/model-core` owns the DeepSeek Pro and Flash catalog plus routing rules.
- `packages/rules-engine`, `packages/comment-checker-core`, `packages/lsp-tools-mcp`, `packages/ast-grep-mcp`, and `packages/hashline-core` provide optional local tooling.
- `packages/boulder-state` and `packages/cli` coordinate plan, start-work, loop, evidence, and verifier behavior.
- `plugins/deepseek-codex-combo` contains the Codex plugin assets shipped by the release package.

The default provider mode is proxy mode because it works with the current Responses contract and avoids unsupported native provider assumptions.
