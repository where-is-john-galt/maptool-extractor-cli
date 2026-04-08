import fs from "node:fs/promises";
import path from "node:path";

import { readManifest } from "../manifest/io.js";
import { decodeMacroFilename, manifestMacroKey } from "../pack/filenames.js";
import { campaignGmMacrosDir, campaignMacrosDir, macrosRoot } from "../util/paths.js";

async function listMtNames(dir: string): Promise<string[]> {
  try {
    const n = await fs.readdir(dir);
    return n.filter((f) => f.endsWith(".mtmacro")).sort();
  } catch {
    return [];
  }
}

/** Relative paths to every `.mtmacro` under `tokenDir`, sorted. */
async function listTokenMacroRelPaths(tokenDir: string): Promise<string[]> {
  const normRoot = path.normalize(tokenDir);
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && e.name.endsWith(".mtmacro")) {
        out.push(path.relative(normRoot, path.normalize(full)));
      }
    }
  }
  await walk(normRoot);
  return out.sort((a, b) => a.localeCompare(b));
}

export async function runMacroList(workDir: string): Promise<void> {
  const manifest = await readManifest(workDir);

  const campaign = await listMtNames(campaignMacrosDir(workDir));
  const campaignGm = await listMtNames(campaignGmMacrosDir(workDir));

  console.log("Campaign (player)");
  for (const f of campaign) {
    const dec = decodeMacroFilename(f);
    const label = dec?.label ?? f;
    const meta = dec ? manifest.campaign.macros[manifestMacroKey(dec.label, dec.indexFromFile ?? 0)] : undefined;
    const extra = meta && Object.keys(meta).length ? `  ${JSON.stringify(meta)}` : "";
    console.log(`  ${label}  (${f})${extra}`);
  }

  console.log("\nCampaign (GM)");
  for (const f of campaignGm) {
    const dec = decodeMacroFilename(f);
    const label = dec?.label ?? f;
    const key = dec ? manifestMacroKey(dec.label, dec.indexFromFile ?? 0) : "";
    const meta = manifest.campaignGm?.macros[key];
    const extra = meta && Object.keys(meta).length ? `  ${JSON.stringify(meta)}` : "";
    console.log(`  ${label}  (${f})${extra}`);
  }

  const tokensRoot = path.join(macrosRoot(workDir), "tokens");
  let tokenDirs: string[] = [];
  try {
    tokenDirs = (await fs.readdir(tokensRoot)).sort();
  } catch {
    tokenDirs = [];
  }

  console.log("\nTokens");
  for (const folder of tokenDirs) {
    const full = path.join(tokensRoot, folder);
    const st = await fs.stat(full).catch(() => null);
    if (!st?.isDirectory()) {
      continue;
    }
    const id = manifest.tokens[folder]?.id ?? "?";
    console.log(`  ${folder}  [id ${id}]`);
    for (const rel of await listTokenMacroRelPaths(full)) {
      const base = path.basename(rel);
      const dec = decodeMacroFilename(base);
      const label = dec?.label ?? base;
      const key = dec ? manifestMacroKey(dec.label, dec.indexFromFile ?? 0) : "";
      const meta = manifest.tokens[folder]?.macros[key];
      const extra = meta && Object.keys(meta).length ? `  ${JSON.stringify(meta)}` : "";
      const relSlash = rel.split(path.sep).join("/");
      console.log(`    ${label}  (${relSlash})${extra}`);
    }
  }
}
