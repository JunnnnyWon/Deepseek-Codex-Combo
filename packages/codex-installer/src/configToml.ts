import { replaceManagedBlock, validateTomlDocument } from "../../shared/src/managed-block.ts";

export interface ProxyProviderConfig {
  readonly host: string;
  readonly port: number;
}

export interface PluginMcpConfig {
  readonly astGrepEnabled: boolean;
  readonly hashlineEnabled: boolean;
}

export interface DeepseekProfileConfig {
  readonly codexAutonomous: boolean;
}

export interface ModelCatalogConfig {
  readonly path: string;
}

export class ConfigTomlError extends Error {
  readonly code = "config_parse_error";
  readonly name = "ConfigTomlError";
}

export const modelCatalogBlockName = "model catalog";
export const providerBlockName = "provider deepseek_proxy";
export const pluginActivationBlockName = "plugin deepseek-codex-combo activation";
export const pluginMcpBlockName = "plugin deepseek-codex-combo mcp_servers";
export const profileBlockName = "profile deepseek-proxy";

const modelCatalogStartMarker = `# >>> DCC managed: ${modelCatalogBlockName}`;
const modelCatalogEndMarker = `# <<< DCC managed: ${modelCatalogBlockName}`;
const startMarker = `# >>> DCC managed: ${providerBlockName}`;
const endMarker = `# <<< DCC managed: ${providerBlockName}`;
const pluginActivationStartMarker = `# >>> DCC managed: ${pluginActivationBlockName}`;
const pluginActivationEndMarker = `# <<< DCC managed: ${pluginActivationBlockName}`;
const pluginMcpStartMarker = `# >>> DCC managed: ${pluginMcpBlockName}`;
const pluginMcpEndMarker = `# <<< DCC managed: ${pluginMcpBlockName}`;
const profileStartMarker = `# >>> DCC managed: ${profileBlockName}`;
const profileEndMarker = `# <<< DCC managed: ${profileBlockName}`;

export const renderProxyProviderBlock = (config: ProxyProviderConfig): string =>
  [
    "[model_providers.deepseek_proxy]",
    'name = "DeepSeek Proxy"',
    `base_url = "http://${config.host}:${config.port}/v1"`,
    'wire_api = "responses"',
  ].join("\n");

const escapeTomlBasicString = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

export const renderModelCatalogBlock = (config: ModelCatalogConfig): string =>
  `model_catalog_json = "${escapeTomlBasicString(config.path)}"`;

export const renderPluginMcpBlock = (config: PluginMcpConfig): string =>
  [
    `[plugins."deepseek-codex-combo@deepseek-codex-combo".mcp_servers]`,
    ...(config.astGrepEnabled ? ["dcc_ast_grep = { enabled = true }"] : []),
    ...(config.hashlineEnabled ? ["dcc_hashline = { enabled = true }"] : []),
  ].join("\n");

export const renderPluginActivationBlock = (): string =>
  [`[plugins."deepseek-codex-combo@deepseek-codex-combo"]`, "enabled = true"].join("\n");

export const renderDeepseekProfileBlock = (config: DeepseekProfileConfig): string =>
  [
    "[profiles.deepseek-proxy]",
    'model_provider = "deepseek_proxy"',
    'model = "deepseek-v4-pro"',
    ...(config.codexAutonomous ? ['approval_policy = "never"'] : []),
    "",
    "[profiles.deepseek-flash]",
    'model_provider = "deepseek_proxy"',
    'model = "deepseek-v4-flash"',
    ...(config.codexAutonomous ? ['approval_policy = "never"'] : []),
  ].join("\n");

export const countManagedProviderBlocks = (document: string): number => {
  let count = 0;
  let cursor = 0;
  let index = document.indexOf(startMarker, cursor);
  while (index !== -1) {
    count += 1;
    cursor = index + startMarker.length;
    index = document.indexOf(startMarker, cursor);
  }

  return count;
};

const assertValidToml = (document: string): void => {
  const validation = validateTomlDocument(document);
  if (!validation.ok) {
    throw new ConfigTomlError(validation.message);
  }
};

const removeFirstManagedModelCatalogBlock = (document: string): string => {
  const startIndex = document.indexOf(modelCatalogStartMarker);
  if (startIndex === -1) {
    return document;
  }

  const endIndex = document.indexOf(
    modelCatalogEndMarker,
    startIndex + modelCatalogStartMarker.length,
  );
  if (endIndex === -1) {
    return document;
  }

  let removeEnd = endIndex + modelCatalogEndMarker.length;
  if (document.slice(removeEnd, removeEnd + 1) === "\n") {
    removeEnd += 1;
  }

  return `${document.slice(0, startIndex)}${document.slice(removeEnd)}`;
};

export const removeManagedModelCatalogBlock = (document: string): string => {
  let next = document;
  let previous = "";
  while (next !== previous) {
    previous = next;
    next = removeFirstManagedModelCatalogBlock(next);
  }
  assertValidToml(next);

  return next;
};

export const upsertManagedModelCatalogBlock = (
  document: string,
  config: ModelCatalogConfig,
): string => {
  const cleaned = removeManagedModelCatalogBlock(document);
  const separator = cleaned.length === 0 || cleaned.startsWith("\n") ? "" : "\n";
  const next = [
    modelCatalogStartMarker,
    renderModelCatalogBlock(config),
    modelCatalogEndMarker,
    `${separator}${cleaned}`,
  ].join("\n");
  assertValidToml(next);

  return next;
};

export const upsertManagedProviderBlock = (
  document: string,
  config: ProxyProviderConfig,
): string => {
  const next = replaceManagedBlock(document, {
    content: renderProxyProviderBlock(config),
    name: providerBlockName,
  });
  assertValidToml(next);

  return next;
};

const removeFirstManagedProviderBlock = (document: string): string => {
  const startIndex = document.indexOf(startMarker);
  if (startIndex === -1) {
    return document;
  }

  const endIndex = document.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex === -1) {
    return document;
  }

  let removeEnd = endIndex + endMarker.length;
  if (document.slice(removeEnd, removeEnd + 1) === "\n") {
    removeEnd += 1;
  }

  return `${document.slice(0, startIndex)}${document.slice(removeEnd)}`;
};

export const removeManagedProviderBlock = (document: string): string => {
  let next = document;
  let previous = "";
  while (next !== previous) {
    previous = next;
    next = removeFirstManagedProviderBlock(next);
  }
  assertValidToml(next);

  return next;
};

const removeFirstManagedPluginMcpBlock = (document: string): string => {
  const startIndex = document.indexOf(pluginMcpStartMarker);
  if (startIndex === -1) {
    return document;
  }

  const endIndex = document.indexOf(pluginMcpEndMarker, startIndex + pluginMcpStartMarker.length);
  if (endIndex === -1) {
    return document;
  }

  let removeEnd = endIndex + pluginMcpEndMarker.length;
  if (document.slice(removeEnd, removeEnd + 1) === "\n") {
    removeEnd += 1;
  }

  return `${document.slice(0, startIndex)}${document.slice(removeEnd)}`;
};

const removeFirstManagedPluginActivationBlock = (document: string): string => {
  const startIndex = document.indexOf(pluginActivationStartMarker);
  if (startIndex === -1) {
    return document;
  }

  const endIndex = document.indexOf(
    pluginActivationEndMarker,
    startIndex + pluginActivationStartMarker.length,
  );
  if (endIndex === -1) {
    return document;
  }

  let removeEnd = endIndex + pluginActivationEndMarker.length;
  if (document.slice(removeEnd, removeEnd + 1) === "\n") {
    removeEnd += 1;
  }

  return `${document.slice(0, startIndex)}${document.slice(removeEnd)}`;
};

export const upsertManagedPluginActivationBlock = (document: string): string => {
  const next = replaceManagedBlock(document, {
    content: renderPluginActivationBlock(),
    name: pluginActivationBlockName,
  });
  assertValidToml(next);

  return next;
};

export const upsertManagedPluginMcpBlock = (document: string, config: PluginMcpConfig): string => {
  const next = replaceManagedBlock(document, {
    content: renderPluginMcpBlock(config),
    name: pluginMcpBlockName,
  });
  assertValidToml(next);

  return next;
};

const removeFirstManagedProfileBlock = (document: string): string => {
  const startIndex = document.indexOf(profileStartMarker);
  if (startIndex === -1) {
    return document;
  }

  const endIndex = document.indexOf(profileEndMarker, startIndex + profileStartMarker.length);
  if (endIndex === -1) {
    return document;
  }

  let removeEnd = endIndex + profileEndMarker.length;
  if (document.slice(removeEnd, removeEnd + 1) === "\n") {
    removeEnd += 1;
  }

  return `${document.slice(0, startIndex)}${document.slice(removeEnd)}`;
};

export const upsertManagedProfileBlock = (
  document: string,
  config: DeepseekProfileConfig,
): string => {
  const next = replaceManagedBlock(document, {
    content: renderDeepseekProfileBlock(config),
    name: profileBlockName,
  });
  assertValidToml(next);

  return next;
};

export const removeManagedPluginMcpBlock = (document: string): string => {
  let next = document;
  let previous = "";
  while (next !== previous) {
    previous = next;
    next = removeFirstManagedPluginMcpBlock(next);
  }
  assertValidToml(next);

  return next;
};

export const removeManagedPluginActivationBlock = (document: string): string => {
  let next = document;
  let previous = "";
  while (next !== previous) {
    previous = next;
    next = removeFirstManagedPluginActivationBlock(next);
  }
  assertValidToml(next);

  return next;
};

export const removeManagedProfileBlock = (document: string): string => {
  let next = document;
  let previous = "";
  while (next !== previous) {
    previous = next;
    next = removeFirstManagedProfileBlock(next);
  }
  assertValidToml(next);

  return next;
};
