import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAutostartPlan } from "./autostart";

const tempHomes: string[] = [];

const makeHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), "dcc-autostart-test-"));
  tempHomes.push(home);
  return home;
};

afterEach(async () => {
  const homes = tempHomes.splice(0);
  await Promise.all(homes.map((home) => rm(home, { force: true, recursive: true })));
});

describe("autostart planning", () => {
  it("default_autostart_creates_no_launch_artifacts", async () => {
    const home = await makeHome();
    const plan = createAutostartPlan({ home, mode: "none" });

    expect(plan.mode).toBe("none");
    expect(plan.plannedFiles).toHaveLength(0);
  });
});
