export type { BoundedStore, BoundedStoreOptions } from "./bounded-store";
export { createBoundedStore } from "./bounded-store";
export type { ManagedBlockReplacement, TomlValidationResult } from "./managed-block";
export { removeManagedBlock, replaceManagedBlock, validateTomlDocument } from "./managed-block";
export type { RedactionOptions } from "./redact";
export { redactText } from "./redact";

export const packageName = "@dcc/shared";
