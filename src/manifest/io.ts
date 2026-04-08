import fs from "node:fs/promises";
import path from "node:path";

import { emptyManifest, manifestSchema, type Manifest } from "./schema.js";

export const MANIFEST_FILE = "manifest.json";

export async function readManifest(workDir: string): Promise<Manifest> {
  const p = path.join(workDir, MANIFEST_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(p, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return emptyManifest();
    }
    throw e;
  }
  const json = JSON.parse(raw) as unknown;
  return manifestSchema.parse(json);
}

export async function writeManifest(workDir: string, manifest: Manifest): Promise<void> {
  const p = path.join(workDir, MANIFEST_FILE);
  const validated = manifestSchema.parse(manifest);
  await fs.writeFile(p, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
}

export function mergeMacroSparse(
  base: Record<string, unknown>,
  overlay: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!overlay) return { ...base };
  return { ...base, ...overlay };
}
