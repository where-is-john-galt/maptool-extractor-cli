import fs from "node:fs/promises";
import path from "node:path";

import { type Manifest, type ManifestMacro, MACRO_DEFAULTS } from "../manifest/schema.js";
import { encodeMacroFilename, manifestMacroKey, sanitizeSlug } from "../pack/filenames.js";
import {
  campaignGmMacrosDir,
  campaignMacrosDir,
  macrosRoot,
  tokenMacrosDir,
} from "../util/paths.js";
import type { ParsedMacro } from "../xml/content-model.js";

function sparseMacroFromParsed(m: ParsedMacro): ManifestMacro | undefined {
  const slice: ManifestMacro = {};
  if (m.colorKey !== MACRO_DEFAULTS.colorKey) {
    slice.colorKey = m.colorKey;
  }
  if (m.autoExecute !== MACRO_DEFAULTS.autoExecute) {
    slice.autoExecute = m.autoExecute;
  }
  if (m.group !== MACRO_DEFAULTS.group) {
    slice.group = m.group;
  }
  if (m.applyToTokens !== MACRO_DEFAULTS.applyToTokens) {
    slice.applyToTokens = m.applyToTokens;
  }
  if (m.includeLabel !== MACRO_DEFAULTS.includeLabel) {
    slice.includeLabel = m.includeLabel;
  }
  if (m.sortby !== MACRO_DEFAULTS.sortby) {
    slice.sortby = m.sortby;
  }
  return Object.keys(slice).length > 0 ? slice : undefined;
}

/**
 * Token macros: never persist `group` in manifest — pack derives it from subfolders under the token
 * or from legacy flat files via manifest entries left from older tooling (root only).
 */
function sparseTokenMacroFromParsed(m: ParsedMacro): ManifestMacro | undefined {
  const slice: ManifestMacro = {};
  if (m.colorKey !== MACRO_DEFAULTS.colorKey) {
    slice.colorKey = m.colorKey;
  }
  if (m.autoExecute !== MACRO_DEFAULTS.autoExecute) {
    slice.autoExecute = m.autoExecute;
  }
  if (m.applyToTokens !== MACRO_DEFAULTS.applyToTokens) {
    slice.applyToTokens = m.applyToTokens;
  }
  if (m.includeLabel !== MACRO_DEFAULTS.includeLabel) {
    slice.includeLabel = m.includeLabel;
  }
  if (m.sortby !== MACRO_DEFAULTS.sortby) {
    slice.sortby = m.sortby;
  }
  return Object.keys(slice).length > 0 ? slice : undefined;
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

/** Prepare output tree layout and return new manifest starter. */
export async function prepareUnpackLayout(workDir: string): Promise<Manifest> {
  await ensureDir(macrosRoot(workDir));
  await ensureDir(campaignMacrosDir(workDir));
  await ensureDir(campaignGmMacrosDir(workDir));
  await ensureDir(path.join(macrosRoot(workDir), "tokens"));
  await ensureDir(path.join(workDir, "assets"));
  return {
    schemaVersion: 1,
    tokens: {},
    campaign: { macros: {} },
    campaignGm: { macros: {} },
  };
}

export async function writeMacroFile(filePath: string, body: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, body, "utf8");
}

export async function unpackCampaignMacros(
  workDir: string,
  campaignMacros: ParsedMacro[],
  gmMacros: ParsedMacro[],
  manifest: Manifest,
): Promise<void> {
  for (const m of campaignMacros) {
    const { filename } = encodeMacroFilename(m.label, m.index, false);
    const mp = path.join(campaignMacrosDir(workDir), filename);
    await writeMacroFile(mp, m.command);
    const key = manifestMacroKey(m.label, m.index);
    const sparse = sparseMacroFromParsed(m);
    if (sparse) {
      manifest.campaign.macros[key] = sparse;
    }
  }
  for (const m of gmMacros) {
    const { filename } = encodeMacroFilename(m.label, m.index, true);
    const mp = path.join(campaignGmMacrosDir(workDir), filename);
    await writeMacroFile(mp, m.command);
    const key = manifestMacroKey(m.label, m.index);
    const sparse = sparseMacroFromParsed(m);
    if (!manifest.campaignGm) {
      manifest.campaignGm = { macros: {} };
    }
    if (sparse) {
      manifest.campaignGm.macros[key] = sparse;
    }
  }
}

export async function unpackTokenMacros(
  workDir: string,
  tokenFolder: string,
  tokenIdHex: string,
  macros: ParsedMacro[],
  manifest: Manifest,
): Promise<void> {
  const folder = sanitizeSlug(tokenFolder) || "token";
  const dir = tokenMacrosDir(workDir, folder);
  await ensureDir(dir);
  const prev = manifest.tokens[folder];
  manifest.tokens[folder] = {
    id: tokenIdHex,
    macros: {},
    overrides: prev?.overrides,
  };
  const entry = manifest.tokens[folder]!;

  for (const m of macros) {
    const { filename } = encodeMacroFilename(m.label, m.index, false);
    const trimmedGroup = m.group.normalize("NFC").trim();
    const groupDir = trimmedGroup ? sanitizeSlug(trimmedGroup) : "";
    const mp = groupDir ? path.join(dir, groupDir, filename) : path.join(dir, filename);
    await writeMacroFile(mp, m.command);
    const key = manifestMacroKey(m.label, m.index);
    const sparse = sparseTokenMacroFromParsed(m);
    if (sparse) {
      entry.macros[key] = sparse;
    }
  }
}
