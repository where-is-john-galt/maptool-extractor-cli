import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import AdmZip from "adm-zip";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist/cli.js");
const fixtureXml = path.join(root, "test/fixtures/minimal-content.xml");

test("cli unpack → macro list → pack", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "maptool-extractor-cli-"));
  const cmpgn = path.join(tmp, "game.cmpgn");
  const z = new AdmZip();
  z.addFile("content.xml", await fs.readFile(fixtureXml));
  z.addFile(
    "properties.xml",
    Buffer.from('<?xml version="1.0" encoding="UTF-8"?><properties/>', "utf8"),
  );
  z.writeZip(cmpgn);

  const work = path.join(tmp, "work");
  let r = spawnSync(process.execPath, [cli, "unpack", cmpgn, work], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);

  const groupedMacro = path.join(
    work,
    "macros",
    "tokens",
    "Hero",
    "Karta postaci",
    "Sheet__idx1.mtmacro",
  );
  await fs.access(groupedMacro);

  r = spawnSync(process.execPath, [cli, "macro", "list", work], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Ping/);
  assert.match(r.stdout, /Act/);
  assert.match(r.stdout, /Sheet/);
  assert.match(r.stdout, /Karta postaci\/Sheet__idx1\.mtmacro/);

  const out = path.join(tmp, "out.cmpgn");
  r = spawnSync(process.execPath, [cli, "pack", work, out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);

  const z2 = new AdmZip(out);
  const cx = z2.readAsText("content.xml");
  assert.match(cx, /say Hello/);
  assert.match(cx, /token macro/);
  assert.match(cx, /sheet body/);
  assert.match(cx, /<label>Sheet<\/label>\s*[\s\S]*?<group>Karta postaci<\/group>/);
});

test("pack maps new token macro file in subfolder to XML group", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "maptool-extractor-cli-grp-"));
  const cmpgn = path.join(tmp, "game.cmpgn");
  const z = new AdmZip();
  z.addFile("content.xml", await fs.readFile(fixtureXml));
  z.addFile(
    "properties.xml",
    Buffer.from('<?xml version="1.0" encoding="UTF-8"?><properties/>', "utf8"),
  );
  z.writeZip(cmpgn);

  const work = path.join(tmp, "work");
  let r = spawnSync(process.execPath, [cli, "unpack", cmpgn, work], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);

  const newDir = path.join(work, "macros", "tokens", "Hero", "Rzuty");
  await fs.mkdir(newDir, { recursive: true });
  await fs.writeFile(path.join(newDir, "Roll__idx5.mtmacro"), "1d20", "utf8");

  const out = path.join(tmp, "out.cmpgn");
  r = spawnSync(process.execPath, [cli, "pack", work, out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);

  const cx = new AdmZip(out).readAsText("content.xml");
  assert.match(cx, /<label>Roll<\/label>\s*[\s\S]*?<group>Rzuty<\/group>/);
  assert.match(cx, /1d20/);
});
