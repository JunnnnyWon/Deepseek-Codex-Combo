import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempHome {
  readonly cleanup: () => Promise<void>;
  readonly codexHome: string;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
}

const safeLabel = (label: string): string => label.replace(/[^A-Za-z0-9_-]/g, "-");

export const createTempHome = async (label: string): Promise<TempHome> => {
  const home = await mkdtemp(join(tmpdir(), `dcc-${safeLabel(label)}-`));
  const codexHome = join(home, ".codex");
  await mkdir(codexHome, { recursive: true });

  return {
    cleanup: async () => {
      await rm(home, { force: true, recursive: true });
    },
    codexHome,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      HOME: home,
    },
    home,
  };
};
