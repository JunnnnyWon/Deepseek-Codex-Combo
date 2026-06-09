export type ProxyAutostartMode = "launchd" | "none" | "systemd";

export interface AutostartPlanOptions {
  readonly home: string;
  readonly mode: ProxyAutostartMode;
}

export interface AutostartPlan {
  readonly mode: ProxyAutostartMode;
  readonly plannedFiles: readonly string[];
}

export const createAutostartPlan = (options: AutostartPlanOptions): AutostartPlan => {
  if (options.mode === "none") {
    return { mode: "none", plannedFiles: [] };
  }

  const file =
    options.mode === "launchd"
      ? `${options.home}/Library/LaunchAgents/com.deepseek-codex-combo.proxy.plist`
      : `${options.home}/.config/systemd/user/deepseek-codex-combo-proxy.service`;

  return { mode: options.mode, plannedFiles: [file] };
};
