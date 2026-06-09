export type { AutostartPlan, AutostartPlanOptions, ProxyAutostartMode } from "./autostart.ts";
export { createAutostartPlan } from "./autostart.ts";
export type { ProxyProviderConfig } from "./configToml.ts";
export {
  ConfigTomlError,
  countManagedProviderBlocks,
  providerBlockName,
  removeManagedProviderBlock,
  renderProxyProviderBlock,
  upsertManagedProviderBlock,
} from "./configToml.ts";
export type { InstallOptions, InstallPlan, PluginInstallPlan, ProviderMode } from "./install.ts";
export {
  createInstallPlan,
  renderInstallPlanForCli,
  UnsupportedProviderModeError,
} from "./install.ts";
export type { UninstallOptions, UninstallPlan } from "./uninstall.ts";
export { createUninstallPlan, renderUninstallPlanForCli } from "./uninstall.ts";

export const packageName = "@deepseek-codex-combo/codex-installer";
