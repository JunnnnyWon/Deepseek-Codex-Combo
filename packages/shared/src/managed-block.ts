import { parse as parseToml } from "smol-toml";

export interface ManagedBlockReplacement {
  readonly name: string;
  readonly content: string;
}

export type TomlValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "config_parse_error"; readonly message: string };

const blockStart = (name: string): string => `# >>> DCC managed: ${name}`;
const blockEnd = (name: string): string => `# <<< DCC managed: ${name}`;

export const replaceManagedBlock = (
  document: string,
  replacement: ManagedBlockReplacement,
): string => {
  const startMarker = blockStart(replacement.name);
  const endMarker = blockEnd(replacement.name);
  const startIndex = document.indexOf(startMarker);

  if (startIndex === -1) {
    const separator = document.endsWith("\n") || document.length === 0 ? "" : "\n";
    return `${document}${separator}${startMarker}\n${replacement.content}\n${endMarker}\n`;
  }

  const searchFrom = startIndex + startMarker.length;
  const endIndex = document.indexOf(endMarker, searchFrom);
  if (endIndex === -1) {
    return `${document.slice(0, searchFrom)}\n${replacement.content}\n${endMarker}${document.slice(searchFrom)}`;
  }

  const afterEnd = endIndex + endMarker.length;
  return `${document.slice(0, startIndex)}${startMarker}\n${replacement.content}\n${endMarker}${document.slice(afterEnd)}`;
};

export const removeManagedBlock = (document: string, name: string): string => {
  const startMarker = blockStart(name);
  const endMarker = blockEnd(name);
  const startIndex = document.indexOf(startMarker);
  if (startIndex === -1) {
    return document;
  }

  const endIndex = document.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex === -1) {
    return document;
  }

  let removeEnd = endIndex + endMarker.length;
  if (document[removeEnd] === "\r" && document[removeEnd + 1] === "\n") {
    removeEnd += 2;
  } else if (document[removeEnd] === "\n") {
    removeEnd += 1;
  }

  return document.slice(0, startIndex) + document.slice(removeEnd);
};

export const validateTomlDocument = (document: string): TomlValidationResult => {
  try {
    parseToml(document);
    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown TOML parse error";
    return { ok: false, code: "config_parse_error", message };
  }
};
