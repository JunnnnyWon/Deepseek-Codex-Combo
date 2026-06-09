# Security

Security defaults:

- Telemetry is disabled.
- API keys, auth headers, home paths, private repository URLs, emails, and local hostnames are redacted from evidence.
- Raw prompts, source files, and reasoning content are not logged.
- Live DeepSeek checks require both `--live` and `DEEPSEEK_API_KEY`.
- Installer writes are scoped to DCC-managed Codex config and plugin files.
- Local live-check secret files belong under the repo-local secret directory and should be mode `600`.

Create the local shell file:

```bash
secret_dir=".dcc/"'secrets'
secret_env="$secret_dir/deepseek.env"
mkdir -p "$secret_dir"
printf '%s\n' 'export DEEPSEEK_API_KEY="sk-..."' > "$secret_env"
chmod 600 "$secret_env"
source "$secret_env"
node bin/dcc.mjs doctor --live --strict
```

Do not put API keys in chat, tickets, docs, screenshots, or evidence files. If a key is exposed, rotate the key in DeepSeek and remove local shell state:

```bash
unset DEEPSEEK_API_KEY
secret_env=".dcc/"'secrets/deepseek.env'
rm "$secret_env"
```

Fail-closed check:

```bash
unset DEEPSEEK_API_KEY
node bin/dcc.mjs doctor --live --strict
```

The expected fail-closed result is `DEEPSEEK_API_KEY required for --live`.

Live strict doctor performs real DeepSeek `/models` and minimal proxy/chat checks, so run it intentionally and treat it as a small paid API call.
