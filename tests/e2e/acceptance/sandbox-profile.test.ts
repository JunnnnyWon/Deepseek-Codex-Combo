import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runDcc = (args: readonly string[], env: NodeJS.ProcessEnv = process.env, timeout = 15_000) =>
  spawnSync(process.execPath, ["bin/dcc.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    timeout,
  });

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

const findCodexCli = (): string | undefined => {
  const result = spawnSync("sh", ["-lc", "command -v codex"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 5_000,
  });
  const binary = result.stdout.trim();
  return result.status === 0 && binary.length > 0 ? binary : undefined;
};

describe("sandbox Codex profile acceptance", () => {
  it("sandbox_first_use_flow_installs_proxy_smokes_profile_and_uninstalls", async () => {
    const home = mkdtempSync(join(tmpdir(), "dcc-sandbox-home-"));
    const port = await getFreePort();
    try {
      const install = runDcc([
        "install",
        "--home",
        home,
        "--provider-mode=proxy",
        "--no-tui",
        "--proxy-port",
        String(port),
      ]);
      expect(install.status).toBe(0);

      const config = readFileSync(join(home, ".codex", "config.toml"), "utf8");
      const profile = readFileSync(join(home, ".codex", "profiles", "deepseek-proxy.toml"), "utf8");
      const flashProfile = readFileSync(
        join(home, ".codex", "profiles", "deepseek-flash.toml"),
        "utf8",
      );
      expect(config).toContain("[model_providers.deepseek_proxy]");
      expect(config).toContain(`base_url = "http://127.0.0.1:${port}/v1"`);
      expect(config).toContain('[plugins."deepseek-codex-combo@deepseek-codex-combo"]');
      expect(config).toContain('[plugins."deepseek-codex-combo@deepseek-codex-combo".mcp_servers]');
      expect(config).toContain("[profiles.deepseek-proxy]");
      expect(config).toContain("[profiles.deepseek-flash]");
      expect(config).toContain('model_provider = "deepseek_proxy"');
      expect(config).toContain('model = "deepseek-v4-pro"');
      expect(config).toContain('model = "deepseek-v4-flash"');
      expect(profile).toContain('model_provider = "deepseek_proxy"');
      expect(profile).toContain('model = "deepseek-v4-pro"');
      expect(flashProfile).toContain('model_provider = "deepseek_proxy"');
      expect(flashProfile).toContain('model = "deepseek-v4-flash"');
      expect(
        existsSync(
          join(
            home,
            ".codex",
            "plugins",
            "cache",
            "deepseek-codex-combo",
            "deepseek-codex-combo",
            "0.1.0",
          ),
        ),
      ).toBe(true);
      expect(existsSync(join(home, ".codex", "marketplaces", "deepseek-codex-combo.json"))).toBe(
        true,
      );
      expect(existsSync(join(home, ".codex", "model-catalog.deepseek-codex-combo.json"))).toBe(
        true,
      );
      expect(existsSync(join(home, ".codex", "agents", "dcc-planner-pro.toml"))).toBe(true);

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
      expect(start.status).toBe(0);
      expect(start.stdout).toContain("proxy background: started");

      const smoke = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
        body: JSON.stringify({ input: "sandbox smoke", model: "deepseek-v4-flash" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const smokeBody = await smoke.text();
      expect(smoke.status).toBe(200);
      expect(smokeBody).toContain("response.completed");

      const doctor = runDcc(["doctor", "--home", home, "--strict"]);
      expect(doctor.status).toBe(0);
      expect(`${doctor.stdout}\n${doctor.stderr}`).toContain("Doctor: ok");

      const codex = findCodexCli();
      if (codex === undefined) {
        expect("codex_unavailable").toBe("codex_unavailable");
      } else {
        const codexHelp = spawnSync(codex, ["--profile", "deepseek-proxy", "--help"], {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, CODEX_HOME: join(home, ".codex"), HOME: home },
          timeout: 10_000,
        });
        expect(codexHelp.status).toBe(0);
        expect(`${codexHelp.stdout}\n${codexHelp.stderr}`).toContain("Codex CLI");

        const codexFlashHelp = spawnSync(codex, ["--profile", "deepseek-flash", "--help"], {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, CODEX_HOME: join(home, ".codex"), HOME: home },
          timeout: 10_000,
        });
        expect(codexFlashHelp.status).toBe(0);
        expect(`${codexFlashHelp.stdout}\n${codexFlashHelp.stderr}`).toContain("Codex CLI");

        const promptInput = spawnSync(
          codex,
          ["--profile", "deepseek-proxy", "debug", "prompt-input", "Use dcc-plan"],
          {
            cwd: process.cwd(),
            encoding: "utf8",
            env: { ...process.env, CODEX_HOME: join(home, ".codex"), HOME: home },
            timeout: 10_000,
          },
        );
        expect(promptInput.status).toBe(0);
        expect(`${promptInput.stdout}\n${promptInput.stderr}`).toContain(
          "deepseek-codex-combo:dcc-plan",
        );

        const debugModels = spawnSync(codex, ["debug", "models"], {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, CODEX_HOME: join(home, ".codex"), HOME: home },
          timeout: 10_000,
        });
        const models = JSON.parse(debugModels.stdout) as {
          readonly models: readonly {
            readonly slug: string;
            readonly context_window?: number;
            readonly model_messages?: unknown;
          }[];
        };
        expect(debugModels.status).toBe(0);
        expect(models.models).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              context_window: 1000000,
              model_messages: expect.any(Object),
              slug: "deepseek-v4-pro",
            }),
          ]),
        );
      }

      const stop = runDcc(["proxy", "stop", "--home", home, "--port", String(port)]);
      expect(stop.status).toBe(0);

      const uninstall = runDcc(["uninstall", "--home", home]);
      expect(uninstall.status).toBe(0);
      const cleanedConfig = readFileSync(join(home, ".codex", "config.toml"), "utf8");
      expect(cleanedConfig).not.toContain("deepseek_proxy");
      expect(cleanedConfig).not.toContain("deepseek-codex-combo");
      expect(
        existsSync(
          join(
            home,
            ".codex",
            "plugins",
            "cache",
            "deepseek-codex-combo",
            "deepseek-codex-combo",
            "0.1.0",
          ),
        ),
      ).toBe(false);
      expect(existsSync(join(home, ".codex", "marketplaces", "deepseek-codex-combo.json"))).toBe(
        false,
      );
      expect(existsSync(join(home, ".codex", "model-catalog.deepseek-codex-combo.json"))).toBe(
        false,
      );
      expect(existsSync(join(home, ".codex", "agents", "dcc-planner-pro.toml"))).toBe(false);
      expect(existsSync(join(home, ".codex", "profiles", "deepseek-proxy.toml"))).toBe(false);
      expect(existsSync(join(home, ".codex", "profiles", "deepseek-flash.toml"))).toBe(false);
    } finally {
      runDcc(["proxy", "stop", "--home", home, "--port", String(port)]);
      rmSync(home, { force: true, recursive: true });
    }
  });
});
