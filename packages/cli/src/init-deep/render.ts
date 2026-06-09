import type { PackageBoundary, ProjectAnalysis } from "./scan.ts";

export interface GeneratedFile {
  readonly content: string;
  readonly path: string;
}

const renderManagedDocument = (title: string, blockName: string, body: readonly string[]): string =>
  [
    `# ${title}`,
    "",
    `<!-- dcc-managed: ${blockName} START -->`,
    ...body,
    `<!-- dcc-managed: ${blockName} END -->`,
    "",
  ].join("\n");

const bulletList = (items: readonly string[], fallback: string): readonly string[] =>
  items.length === 0 ? [`- ${fallback}`] : items.map((item) => `- ${item}`);

const renderBoundary = (boundary: PackageBoundary): string =>
  boundary.path === "."
    ? `${boundary.name} (${boundary.kind})`
    : `${boundary.path} (${boundary.kind})`;

export const createGeneratedFiles = (analysis: ProjectAnalysis): readonly GeneratedFile[] => {
  const packageList = bulletList(
    analysis.packageBoundaries.map(renderBoundary),
    "No package boundaries detected.",
  );
  const commandList = bulletList(
    analysis.buildCommands.map((command) => `\`${command}\``),
    "No commands detected.",
  );
  const generatedPathList = bulletList(
    analysis.generatedFiles,
    "No generated or vendor paths detected.",
  );
  const publicApiList = bulletList(
    analysis.publicApiFiles,
    "No obvious public API entrypoints detected.",
  );
  const securityList = bulletList(
    analysis.securitySensitiveFiles,
    "No obvious secret-bearing files detected.",
  );
  const testList = bulletList(analysis.testFiles, "No tests detected.");
  const uncertaintyList = bulletList(analysis.uncertainty, "No uncertainty recorded.");

  const projectIndex = JSON.stringify(
    {
      buildCommands: analysis.buildCommands,
      fileCount: analysis.fileCount,
      generatedFiles: analysis.generatedFiles,
      loc: analysis.loc,
      migrationFiles: analysis.migrationFiles,
      packages: analysis.packageBoundaries,
      productSourceFiles: analysis.productSourceFiles,
      publicApiFiles: analysis.publicApiFiles,
      securitySensitiveFiles: analysis.securitySensitiveFiles,
      testFiles: analysis.testFiles,
      uncertainty: analysis.uncertainty,
    },
    null,
    2,
  );

  return [
    {
      path: "AGENTS.md",
      content: renderManagedDocument("AGENTS.md", "agents", [
        "## Project overview",
        `This repository currently contains ${analysis.fileCount} tracked files and approximately ${analysis.loc} non-empty code lines.`,
        "",
        "## Build and test",
        ...commandList,
        "",
        "## Editing rules",
        "- Do not modify generated or vendor-managed files unless regeneration is part of the task.",
        "- Preserve user-authored content outside DCC managed sections on reruns.",
        "",
        "## Package boundaries",
        ...packageList,
        "",
        "## Public API hints",
        ...publicApiList,
        "",
        "## DCC notes",
        "- Use `dcc lsp diagnostics <file>` after TypeScript edits when available.",
        "- Use `dcc ast-grep` for structural search before broad text rewrites.",
        "",
        "## Uncertainty",
        ...uncertaintyList,
      ]),
    },
    { path: ".dcc/project-index.json", content: `${projectIndex}\n` },
    {
      path: ".dcc/rules/coding-style.md",
      content: renderManagedDocument("Coding Style", "rules-coding-style", [
        "## Languages and boundaries",
        ...packageList,
        "",
        "## Generated paths",
        ...generatedPathList,
        "",
        "## Editing guidance",
        "- Prefer the nearest package boundary before creating new modules.",
        "- Keep generated and vendor directories read-only unless regeneration is explicitly required.",
      ]),
    },
    {
      path: ".dcc/rules/testing.md",
      content: renderManagedDocument("Testing", "rules-testing", [
        "## Existing tests",
        ...testList,
        "",
        "## Known commands",
        ...commandList,
        "",
        "## Guidance",
        "- Add targeted tests close to the changed surface first.",
        "- Treat missing tests as uncertainty, not proof that a surface is unused.",
      ]),
    },
    {
      path: ".dcc/rules/architecture.md",
      content: renderManagedDocument("Architecture", "rules-architecture", [
        "## Package map",
        ...packageList,
        "",
        "## Public API entrypoints",
        ...publicApiList,
        "",
        "## Migration and legacy markers",
        ...bulletList(analysis.migrationFiles, "No migration or legacy markers detected."),
      ]),
    },
    {
      path: ".dcc/rules/security.md",
      content: renderManagedDocument("Security", "rules-security", [
        "## Sensitive files",
        ...securityList,
        "",
        "## Guidance",
        "- Confirm secret handling before logging file contents or environment values.",
        "- Redact credentials, tokens, and local absolute paths in evidence artifacts.",
      ]),
    },
    {
      path: ".dcc/memory/root-summary.md",
      content: renderManagedDocument("Root Summary", "memory-root-summary", [
        `- Files scanned: ${analysis.fileCount}`,
        `- Approximate non-empty code lines: ${analysis.loc}`,
        `- Product source files: ${analysis.productSourceFiles.length}`,
        `- Test files: ${analysis.testFiles.length}`,
        "",
        "## Commands",
        ...commandList,
        "",
        "## Uncertainty",
        ...uncertaintyList,
      ]),
    },
    {
      path: ".dcc/memory/package-map.md",
      content: renderManagedDocument("Package Map", "memory-package-map", [
        "## Boundaries",
        ...packageList,
        "",
        "## Public API",
        ...publicApiList,
        "",
        "## Generated paths",
        ...generatedPathList,
      ]),
    },
    {
      path: ".dcc/memory/risk-map.md",
      content: renderManagedDocument("Risk Map", "memory-risk-map", [
        "## Generated and vendor surfaces",
        ...generatedPathList,
        "",
        "## Security-sensitive surfaces",
        ...securityList,
        "",
        "## Uncertainty",
        ...uncertaintyList,
      ]),
    },
  ];
};
