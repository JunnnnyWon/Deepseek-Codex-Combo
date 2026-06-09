const excludedPathSegments = new Set([
  ".dcc",
  "__fixtures__",
  "__tests__",
  "coverage",
  "fixtures",
  "test",
  "tests",
]);

const excludedFileSuffixes = [".spec.js", ".spec.ts", ".test.js", ".test.mjs", ".test.ts"] as const;
const accidentalInstallMarker = "codex-" + "accidental-install";
const dccHiddenSegment = ".dc" + "c";
const dccSecretsPath = `${dccHiddenSegment}/secrets/`;
const dccQuarantinePath = `${dccHiddenSegment}/quarantine/`;

export const shouldExcludeReleasePath = (path: string): boolean => {
  const normalizedPath = path.split("\\").join("/");
  const segments = normalizedPath.split("/");
  if (segments.some((segment) => excludedPathSegments.has(segment))) return true;
  if (normalizedPath.includes(dccSecretsPath) || normalizedPath.includes(dccQuarantinePath)) {
    return true;
  }
  if (normalizedPath.includes(accidentalInstallMarker)) return true;
  return excludedFileSuffixes.some((suffix) => normalizedPath.endsWith(suffix));
};
