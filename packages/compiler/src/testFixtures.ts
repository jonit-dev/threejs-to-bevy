import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function copyFixtureBundle(sourceBundlePath: string, prefix = "tn-fixture-"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const bundle = join(root, "game.bundle");
  await cp(sourceBundlePath, bundle, { recursive: true });
  return bundle;
}
