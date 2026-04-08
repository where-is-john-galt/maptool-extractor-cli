/**
 * Pack test/test_campain_work using the same basename as the resolved source campaign.
 * Output: test/test_campain/<basename>.repacked.cmpgn
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "test", "test_campain_work");

function resolveSourcePath() {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "resolve-test-campaign.mjs")], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return r.stdout.trim();
}

const source = resolveSourcePath();
const base = path.basename(source, path.extname(source));
const outDir = path.dirname(source);
const output = path.join(outDir, `${base}.repacked.cmpgn`);

const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const pack = spawnSync(
  process.execPath,
  [path.join(root, "dist", "cli.js"), "pack", workDir, output],
  {
    cwd: root,
    stdio: "inherit",
  },
);
if (pack.status !== 0) {
  process.exit(pack.status ?? 1);
}

console.error(`Packed ${workDir} -> ${output}`);
