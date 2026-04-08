/**
 * npm run unpack:test-campaign — cross-platform (no shell $(...)).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "test", "test_campain_work");

const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const resolved = spawnSync(process.execPath, [path.join(root, "scripts", "resolve-test-campaign.mjs")], {
  cwd: root,
  encoding: "utf8",
});
if (resolved.status !== 0) {
  process.stderr.write(resolved.stderr || resolved.stdout);
  process.exit(resolved.status ?? 1);
}
const campaignPath = resolved.stdout.trim();

const unpack = spawnSync(
  process.execPath,
  [path.join(root, "dist", "cli.js"), "unpack", campaignPath, workDir],
  {
    cwd: root,
    stdio: "inherit",
  },
);
if (unpack.status !== 0) {
  process.exit(unpack.status ?? 1);
}

console.error(`Unpacked ${campaignPath} -> ${workDir}`);
