/**
 * Prints absolute path to the campaign file used for dev scripts.
 * Prefer test/test_campain/campaign.cmpgn; otherwise the only *.cmpgn in that folder.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "test", "test_campain");
const preferred = path.join(dir, "campaign.cmpgn");

if (fs.existsSync(preferred)) {
  console.log(preferred);
  process.exit(0);
}

if (!fs.existsSync(dir)) {
  console.error(
    `Missing directory ${path.relative(root, dir)}. Create it and add a .cmpgn file (e.g. campaign.cmpgn).`,
  );
  process.exit(1);
}

const cmpgns = fs
  .readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith(".cmpgn"))
  .map((f) => path.join(dir, f));

if (cmpgns.length === 1) {
  console.log(cmpgns[0]);
  process.exit(0);
}

if (cmpgns.length === 0) {
  console.error(
    `No .cmpgn file in ${path.relative(root, dir)}. Add one (e.g. campaign.cmpgn).`,
  );
  process.exit(1);
}

console.error(
  `More than one .cmpgn in ${path.relative(root, dir)} — keep a single file or use campaign.cmpgn.`,
);
process.exit(1);
