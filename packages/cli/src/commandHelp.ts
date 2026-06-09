const commandUsages = {
  auth: "Usage: dcc auth login|status|logout [--key <sk-...>|--stdin|--skip]",
  "ast-grep": "Usage: dcc ast-grep search|rewrite|describe|list-languages ...",
  contracts: "Usage: dcc contracts verify [--offline|--live]",
  debug: "Usage: dcc debug redact|patch-config",
  doctor: "Usage: dcc doctor [--home <path>] [--fixture <path>] [--live] [--strict]",
  evidence: "Usage: dcc evidence start --plan <path> [--cwd <path>] [--session-id <id>]",
  fixtures: "Usage: dcc fixtures verify <fixture-path>",
  hashline: "Usage: dcc hashline read|apply|verify|mcp ...",
  hooks:
    "Usage: dcc hooks session-start|user-prompt-submit|post-tool-use|post-compact|stop|subagent-stop",
  "init-deep": "Usage: dcc init-deep [--cwd <path>] [--dry-run] [--refresh-nested-agents]",
  install:
    "Usage: dcc install [--home <path>] [--provider-mode proxy|plugin-only] [--proxy-host <host>] [--proxy-port <port>] [--dry-run] [--no-tui]",
  loop: "Usage: dcc loop [task] [--cwd <path>] [--session-id <id>] [--resume <id>] [--max-steps <n>]",
  lsp: "Usage: dcc lsp diagnostics|status|symbols|goto-definition|find-references|prepare-rename|rename <file>",
  models: "Usage: dcc models",
  package: "Usage: dcc package [--out <dir>] [--dry-run]",
  plan: "Usage: dcc plan <task> [--cwd <path>] [--no-edit]",
  plugin: "Usage: dcc plugin validate --fixture <path>",
  proxy:
    "Usage: dcc proxy start|status|stop|transform-fixture|stream-fixture|reasoning-error-fixture [options]",
  rules: "Usage: dcc rules list --cwd <path> [--budget <chars>] [--dry-run]",
  sandbox:
    "Usage: dcc sandbox run|status|path|reset [--home <path>] [--proxy-port <port>] [--profile deepseek-proxy|deepseek-flash|deepseek-current] [--auto-prompt <text>] [--skip-codex] [--skip-auth] [--keep-proxy] [--mock-upstream <path>]",
  skills: "Usage: dcc skills inspect <skill>",
  "start-work":
    "Usage: dcc start-work <plan|verify> [--cwd <path>] [--session-id <id>] [--dry-run] [--complete-task <n>] [--evidence <path>]",
  switch:
    "Usage: dcc switch auto|flash|pro [--home <path>] [--prompt <text>|--prompt-file <path>|--stdin] [--dry-run]",
  uninstall: "Usage: dcc uninstall [--home <path>] [--dry-run]",
} as const;

type HelpCommand = keyof typeof commandUsages;

const helpCommandSet = new Set<string>(Object.keys(commandUsages));

const isHelpCommand = (command: string): command is HelpCommand => helpCommandSet.has(command);

export const isHelpRequested = (args: readonly string[]): boolean =>
  args.includes("--help") || args.includes("-h");

export const renderCommandHelp = (command: string): string | undefined => {
  if (!isHelpCommand(command)) {
    return undefined;
  }

  return `${commandUsages[command]}\n`;
};
