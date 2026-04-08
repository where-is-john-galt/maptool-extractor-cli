import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Resolves to repo/package root `package.json` from emitted `dist/util/package-meta.js`. */
export function readPackageVersion(): string {
  const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
  let raw: string;
  try {
    raw = readFileSync(pkgPath, "utf8");
  } catch {
    throw new Error(`maptool-extractor: could not read ${pkgPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`maptool-extractor: invalid JSON in ${pkgPath}`);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    typeof (parsed as { version: unknown }).version !== "string" ||
    (parsed as { version: string }).version.length === 0
  ) {
    throw new Error(`maptool-extractor: missing or invalid "version" in ${pkgPath}`);
  }
  return (parsed as { version: string }).version;
}
