import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface FixtureFile {
  readonly contents: string;
  readonly path: string;
}

export interface FixtureSpec {
  readonly files: readonly FixtureFile[];
  readonly root: string;
}

export const writeFixture = async (spec: FixtureSpec): Promise<void> => {
  for (const file of spec.files) {
    const target = join(spec.root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contents);
  }
};
