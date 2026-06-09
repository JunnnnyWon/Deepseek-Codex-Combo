#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const runDocker = (args) =>
  spawnSync("docker", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });

const splitLines = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const removeLocalArtifacts = () => {
  const paths = [
    join(repoRoot, ".dcc", "evidence", "docker-user-install"),
    join(repoRoot, ".dcc", "release-docker"),
  ];
  for (const path of paths) {
    rmSync(path, { force: true, recursive: true });
    console.log(`removed: ${path}`);
  }
};

const removeContainers = () => {
  const list = runDocker(["ps", "-aq", "--filter", "name=dcc-user-install-e2e"]);
  if (list.error !== undefined || list.status !== 0) {
    console.warn("docker unavailable: skipped container cleanup");
    return;
  }
  const ids = splitLines(list.stdout);
  if (ids.length === 0) {
    console.log("containers: none");
    return;
  }
  const removed = runDocker(["rm", "-f", ...ids]);
  if (removed.error !== undefined || removed.status !== 0) {
    throw new Error(`docker container cleanup failed\n${removed.stderr}`);
  }
  console.log(`containers removed: ${ids.length}`);
};

const removeImages = () => {
  const list = runDocker(["images", "--format", "{{.Repository}}:{{.Tag}} {{.ID}}"]);
  if (list.error !== undefined || list.status !== 0) {
    console.warn("docker unavailable: skipped image cleanup");
    return;
  }
  const ids = splitLines(list.stdout)
    .filter((line) => line.startsWith("dcc-user-install-e2e:"))
    .map((line) => line.split(/\s+/)[1])
    .filter((id) => id !== undefined);
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    console.log("images: none");
    return;
  }
  const removed = runDocker(["rmi", "-f", ...uniqueIds]);
  if (removed.error !== undefined || removed.status !== 0) {
    throw new Error(`docker image cleanup failed\n${removed.stderr}`);
  }
  console.log(`images removed: ${uniqueIds.length}`);
};

const main = () => {
  try {
    removeLocalArtifacts();
    removeContainers();
    removeImages();
    console.log("Docker DCC cleanup complete.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
};

main();
