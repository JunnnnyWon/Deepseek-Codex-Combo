# Troubleshooting

| Symptom | Action |
| --- | --- |
| Codex uses the wrong model | Check the `deepseek-proxy` profile and `model_provider = "deepseek_proxy"`. |
| Proxy is unreachable | Run `dcc proxy status`, then start `dcc proxy start --background` and confirm the loopback port. |
| Missing API key | Source the local secret env file before `dcc doctor --live --strict`. |
| Native provider error | Use `--provider-mode=proxy`; native provider mode is unsupported and fail-closed. |
| Cache diagnostics show `unavailable` | Send a safe session key such as `metadata.dcc_cache_session_id`; cache hits remain best-effort. |
| LSP unavailable | Install the relevant language server or treat diagnostics as warnings. |
| Hashline patch rejected | Refresh the file and retry with current line hashes. |

For offline validation, prefer fixture commands and dry runs before touching user-level config.
