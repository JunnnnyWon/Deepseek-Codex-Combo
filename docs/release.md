# Release

Create a release manifest and checksum manifest:

```bash
node bin/dcc.mjs package --dry-run --out .dcc/release
```

The release manifest includes CLI bins, package files, plugin bundle files, skills, hooks, MCP config, agents, assets, README, docs, changelog, CI workflow, and supply-chain notes.

Dry run writes only manifest files into the output directory. A non-dry run may copy the listed files into the output payload directory.

Install from a copied release payload:

```bash
pnpm build
node bin/dcc.mjs package --out .dcc/release
cd .dcc/release/files
node dist/bin/dcc.mjs --help
node dist/bin/dcc.mjs install --home "$DCC_SANDBOX_HOME" --no-tui --provider-mode=proxy --proxy-port 41473
node dist/bin/dcc.mjs uninstall --home "$DCC_SANDBOX_HOME"
```

The release payload is self-contained for local use from its `files/` directory. You can run `node dist/bin/dcc.mjs install` there without depending on the original checkout path.

Verify checksums by comparing every `checksums.manifest.json` entry with the copied file in the release `files/` directory before publishing.

Publish to npm:

```bash
npm whoami
npm publish --access public
```

The package is sandbox-first: `npx deepseek-codex-combo@latest` and the global
`dcc` command both run the isolated sandbox by default. User-level Codex install
remains available as an explicit advanced command:

```bash
npx deepseek-codex-combo@latest install --no-tui --provider-mode=proxy
```
