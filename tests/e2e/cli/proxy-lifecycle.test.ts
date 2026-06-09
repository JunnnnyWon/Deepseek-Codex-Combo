import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const makeHome = (): string => mkdtempSync(join(tmpdir(), "dcc-proxy-lifecycle-home-"));

const cleanupHome = (home: string): void => {
  rmSync(home, { force: true, recursive: true });
};

const getFreePort = async (): Promise<number> =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("free port server did not bind");
      }
      server.close(() => resolve(address.port));
    });
  });

const runDcc = (args: readonly string[]) =>
  spawnSync(process.execPath, ["bin/dcc.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 10_000,
  });

describe("dcc proxy lifecycle", () => {
  it("starts_reports_and_stops_background_proxy", async () => {
    const home = makeHome();
    const port = await getFreePort();
    try {
      const start = runDcc([
        "proxy",
        "start",
        "--background",
        "--home",
        home,
        "--port",
        String(port),
        "--mock-upstream",
        "tests/fixtures/proxy/text-response.json",
      ]);
      expect(`${start.stdout}\n${start.stderr}`).toContain("proxy background: started");
      expect(start.status).toBe(0);

      const status = runDcc(["proxy", "status", "--home", home, "--port", String(port)]);
      expect(status.stdout).toContain("proxy status: running");
      await expect(fetch(`http://127.0.0.1:${port}/healthz`)).resolves.toMatchObject({
        status: 200,
      });

      const stop = runDcc(["proxy", "stop", "--home", home, "--port", String(port)]);
      expect(stop.stdout).toContain("proxy stop: stopped");
      expect(stop.status).toBe(0);

      const stopped = runDcc(["proxy", "status", "--home", home, "--port", String(port)]);
      expect(stopped.stdout).toContain("proxy status: stopped");
    } finally {
      runDcc(["proxy", "stop", "--home", home, "--port", String(port)]);
      cleanupHome(home);
    }
  });

  it("stop_cleans_stale_state_without_killing_unknown_processes", async () => {
    const home = makeHome();
    const port = await getFreePort();
    const statePath = join(home, ".dcc", "proxy", `port-${port}.json`);
    try {
      mkdirSync(join(home, ".dcc", "proxy"), { recursive: true });
      writeFileSync(
        statePath,
        `${JSON.stringify({
          host: "127.0.0.1",
          pid: 999_999,
          port,
          startedAt: "2026-06-07T00:00:00.000Z",
        })}\n`,
        "utf8",
      );

      const stop = runDcc(["proxy", "stop", "--home", home, "--port", String(port)]);

      expect(stop.stdout).toContain("proxy stop: stale state cleaned");
      expect(stop.status).toBe(0);
      expect(existsSync(statePath)).toBe(false);
    } finally {
      cleanupHome(home);
    }
  });

  it("fails_background_start_without_stale_state_when_port_is_busy", async () => {
    const home = makeHome();
    const port = await getFreePort();
    const server = createServer((_request, response) => {
      response.writeHead(404).end();
    });
    const statePath = join(home, ".dcc", "proxy", `port-${port}.json`);
    try {
      await new Promise<void>((resolve) => {
        server.listen(port, "127.0.0.1", () => resolve());
      });

      const start = runDcc([
        "proxy",
        "start",
        "--background",
        "--home",
        home,
        "--port",
        String(port),
        "--mock-upstream",
        "tests/fixtures/proxy/text-response.json",
      ]);

      expect(start.status).not.toBe(0);
      expect(`${start.stdout}\n${start.stderr}`).toContain("proxy_port_unavailable");
      expect(existsSync(statePath)).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
            return;
          }
          reject(error);
        });
      });
      cleanupHome(home);
    }
  });
});
