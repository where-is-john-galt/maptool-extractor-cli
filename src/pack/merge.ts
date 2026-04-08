import fs from "node:fs/promises";
import path from "node:path";

import { readManifest, writeManifest } from "../manifest/io.js";
import { MACRO_DEFAULTS, type Manifest, type ManifestMacro } from "../manifest/schema.js";
import { normalizeOutputXml, stripUtf8Bom } from "../util/bom.js";
import { randomGuidHex } from "../util/guid.js";
import {
  campaignGmMacrosDir,
  campaignMacrosDir,
  macrosRoot,
  tokenMacrosDir,
} from "../util/paths.js";
import {
  appendTokenToZoneTokenMap,
  collectTokenEntriesFromDoc,
  deepCloneAst,
  extractCampaignMacros,
  extractTokenMacros,
  findAnyMacroButtonTemplate,
  findCampaignRoot,
  findFirstZoneWithTokenMap,
  patchMacroButtonAst,
  replaceTokenMacroPropertiesMap,
  setMacroListContent,
  findTokenByIdHex,
  setTokenIdHex,
  setTokenName,
} from "../xml/content-model.js";
import { buildContentXml, parseContentXml } from "../xml/parser.js";
import { type OrderedChild } from "../xml/ordered-ast.js";
import { writeCampaignZip } from "../zip/campaign-zip.js";

import { decodeMacroFilename, manifestMacroKey } from "./filenames.js";

function mergedMacroMeta(
  key: string,
  section: Record<string, ManifestMacro>,
): {
  colorKey: string;
  autoExecute: boolean;
  group: string;
  applyToTokens: boolean;
  includeLabel: boolean;
  sortby: string;
} {
  const m = section[key];
  return {
    colorKey: m?.colorKey ?? MACRO_DEFAULTS.colorKey,
    autoExecute: m?.autoExecute ?? MACRO_DEFAULTS.autoExecute,
    group: m?.group ?? MACRO_DEFAULTS.group,
    applyToTokens: m?.applyToTokens ?? MACRO_DEFAULTS.applyToTokens,
    includeLabel: m?.includeLabel ?? MACRO_DEFAULTS.includeLabel,
    sortby: m?.sortby ?? MACRO_DEFAULTS.sortby,
  };
}

async function listMtMacrosInDir(dir: string): Promise<string[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith(".mtmacro")).map((n) => path.join(dir, n));
}

/** All `.mtmacro` files under `rootDir` (recursive). */
async function listMtMacrosRecursive(rootDir: string): Promise<string[]> {
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
        out.push(full);
      }
    }
  }
  await walk(rootDir);
  return out;
}

/** Parent directory of a macro relative to the token folder → MapTool `group` (segments joined with `/`). */
function macroGroupFromRelativeParent(relParent: string): string {
  const n = path.normalize(relParent);
  if (n === "." || n === "") {
    return "";
  }
  return n.split(path.sep).join("/");
}

function preferCdata(body: string, inherited: boolean | undefined): boolean {
  if (inherited !== undefined) {
    return inherited;
  }
  return body.includes("<") || body.includes("]]>") || body.includes("\n");
}

async function packCampaignMacroList(
  doc: unknown[],
  campaign: OrderedChild,
  manifest: Manifest,
  workDir: string,
  isGmPanel: boolean,
): Promise<void> {
  const dir = isGmPanel ? campaignGmMacrosDir(workDir) : campaignMacrosDir(workDir);
  const absPaths = (await listMtMacrosInDir(dir)).sort((a, b) => a.localeCompare(b));
  const section: Record<string, ManifestMacro> = isGmPanel
    ? (manifest.campaignGm?.macros ?? {})
    : manifest.campaign.macros;

  const field = isGmPanel ? "gmMacroButtonProperties" : "macroButtonProperties";
  const existingList = extractCampaignMacros(campaign)[isGmPanel ? "gm" : "player"];

  const decoded: Array<{
    abs: string;
    label: string;
    key: string;
    body: string;
    macroIndex: number;
  }> = [];

  for (const abs of absPaths) {
    const base = path.basename(abs);
    const dec = decodeMacroFilename(base);
    if (!dec) {
      continue;
    }
    const body = await fs.readFile(abs, "utf8");
    const macroIndex = dec.indexFromFile ?? 0;
    const key = manifestMacroKey(dec.label, macroIndex);
    decoded.push({
      abs,
      label: dec.label,
      key,
      body,
      macroIndex,
    });
  }

  const keySet = new Set<string>();
  for (const d of decoded) {
    if (keySet.has(d.key)) {
      throw new Error(`Duplicate macro key "${d.key}" under ${isGmPanel ? "campaign-gm" : "campaign"}`);
    }
    keySet.add(d.key);
  }

  const template = findAnyMacroButtonTemplate(doc);
  if (!template) {
    throw new Error(
      "No MacroButtonProperties found in content.xml; cannot build new campaign macros without a template token/campaign macro",
    );
  }

  const macroNodes: OrderedChild[] = [];
  for (let i = 0; i < decoded.length; i++) {
    const d = decoded[i]!;
    const meta = mergedMacroMeta(d.key, section);
    const existingMacro = existingList.find((m) => m.label === d.label && m.index === d.macroIndex);
    const ast = existingMacro
      ? (deepCloneAst(existingMacro.rawAst) as OrderedChild)
      : (deepCloneAst(template) as OrderedChild);
    patchMacroButtonAst(
      ast,
      {
        index: i,
        label: d.label,
        command: d.body,
        commandUsesCdata: preferCdata(d.body, existingMacro?.commandUsesCdata),
        colorKey: meta.colorKey,
        autoExecute: meta.autoExecute,
        group: meta.group,
        applyToTokens: meta.applyToTokens,
        includeLabel: meta.includeLabel,
        sortby: meta.sortby,
      },
      { regenerateMacroUuid: !existingMacro },
    );
    macroNodes.push(ast);
  }

  setMacroListContent(campaign, field, macroNodes);
}

async function packTokenFolder(
  doc: unknown[],
  manifest: Manifest,
  workDir: string,
  folder: string,
  templateMacro: OrderedChild,
): Promise<void> {
  const dir = tokenMacrosDir(workDir, folder);
  const normDir = path.normalize(dir);
  const absPaths = (await listMtMacrosRecursive(dir)).sort((a, b) => a.localeCompare(b));

  const decoded: Array<{
    abs: string;
    label: string;
    key: string;
    body: string;
    macroIndex: number;
  }> = [];

  for (const abs of absPaths) {
    const base = path.basename(abs);
    const dec = decodeMacroFilename(base);
    if (!dec) {
      continue;
    }
    if (dec.isGm) {
      throw new Error(
        `Token macro ${base} uses gm__ prefix; gm__ is only for campaign-gm/ directory`,
      );
    }
    const body = await fs.readFile(abs, "utf8");
    const macroIndex = dec.indexFromFile ?? 0;
    const key = manifestMacroKey(dec.label, macroIndex);
    decoded.push({ abs, label: dec.label, key, body, macroIndex });
  }

  const keySet = new Set<string>();
  for (const d of decoded) {
    if (keySet.has(d.key)) {
      throw new Error(`Duplicate macro key "${d.key}" for token folder "${folder}"`);
    }
    keySet.add(d.key);
  }

  const zoneInfo = findFirstZoneWithTokenMap(doc);
  if (!zoneInfo) {
    throw new Error("No Zone with tokenMap found in content.xml");
  }

  let manifestEntry = manifest.tokens[folder] ?? { macros: {} };
  const idFromManifest = manifestEntry.id?.toUpperCase();

  let tokenAst: OrderedChild | undefined;
  if (idFromManifest) {
    tokenAst = findTokenByIdHex(doc, idFromManifest);
  }

  const isNew = !tokenAst;
  if (isNew) {
    const entries = collectTokenEntriesFromDoc(doc);
    const tplTok = entries[0]?.token;
    if (!tplTok) {
      throw new Error(
        "Campaign contains no tokens; add at least one token in MapTool before creating new macro folders",
      );
    }
    tokenAst = deepCloneAst(tplTok) as OrderedChild;
    const newId = randomGuidHex();
    setTokenIdHex(tokenAst, newId);
    setTokenName(tokenAst, folder);
    replaceTokenMacroPropertiesMap(tokenAst, []);
    appendTokenToZoneTokenMap(zoneInfo.tokenMap, tokenAst);
    manifestEntry = { ...manifestEntry, id: newId, macros: manifestEntry.macros ?? {} };
    manifest.tokens[folder] = manifestEntry;
  } else {
    if (!manifest.tokens[folder]) {
      const hex =
        idFromManifest ??
        collectTokenEntriesFromDoc(doc).find((e) => e.token === tokenAst)?.idHex;
      if (!hex) {
        throw new Error(`Could not resolve token id for folder "${folder}"`);
      }
      manifest.tokens[folder] = { id: hex, macros: {} };
    }
    manifestEntry = manifest.tokens[folder]!;
  }

  const existingParsed = extractTokenMacros(tokenAst!);
  const macroNodes: OrderedChild[] = [];
  const section = manifestEntry.macros ?? {};

  for (let i = 0; i < decoded.length; i++) {
    const d = decoded[i]!;
    const meta = mergedMacroMeta(d.key, section);
    const rel = path.relative(normDir, path.normalize(d.abs));
    const relParent = path.dirname(rel);
    const groupForXml =
      relParent === "." || relParent === ""
        ? meta.group
        : macroGroupFromRelativeParent(relParent);
    const existingMatch =
      existingParsed.find((m) => m.label === d.label && m.index === d.macroIndex) ??
      existingParsed.find((m) => m.label === d.label);
    const astSource: OrderedChild = existingMatch
      ? (deepCloneAst(existingMatch.rawAst) as OrderedChild)
      : (deepCloneAst(templateMacro) as OrderedChild);
    patchMacroButtonAst(
      astSource,
      {
        index: i,
        label: d.label,
        command: d.body,
        commandUsesCdata: preferCdata(d.body, existingMatch?.commandUsesCdata),
        colorKey: meta.colorKey,
        autoExecute: meta.autoExecute,
        group: groupForXml,
        applyToTokens: meta.applyToTokens,
        includeLabel: meta.includeLabel,
        sortby: meta.sortby,
      },
      { regenerateMacroUuid: !existingMatch },
    );
    macroNodes.push(astSource);
  }

  replaceTokenMacroPropertiesMap(tokenAst!, macroNodes);
}

/** Ensure parsed XML document root is an array (preserveOrder root). */
function ensureDocArray(doc: unknown): unknown[] {
  if (Array.isArray(doc)) {
    return doc as unknown[];
  }
  return [doc];
}

export async function packWorkingDir(workDir: string, outputCmpgn: string): Promise<void> {
  const contentPath = path.join(workDir, "content.xml");
  const raw = await fs.readFile(contentPath, "utf8");
  const doc = ensureDocArray(parseContentXml(stripUtf8Bom(raw)));
  const manifest = await readManifest(workDir);

  const campaign = findCampaignRoot(doc);
  if (!campaign) {
    throw new Error(
      "Could not find campaign data in content.xml (expected MapTool PersistedCampaign.<campaign> or net.rptools.maptool.model.Campaign)",
    );
  }

  await packCampaignMacroList(doc, campaign, manifest, workDir, false);
  await packCampaignMacroList(doc, campaign, manifest, workDir, true);

  const tokensRoot = path.join(macrosRoot(workDir), "tokens");
  let tokenDirs: string[] = [];
  try {
    tokenDirs = await fs.readdir(tokensRoot);
  } catch {
    tokenDirs = [];
  }

  const templateMacro = findAnyMacroButtonTemplate(doc);
  if (!templateMacro) {
    throw new Error("No MacroButtonProperties template in document");
  }

  for (const folder of tokenDirs.sort()) {
    const full = path.join(tokensRoot, folder);
    const st = await fs.stat(full).catch(() => null);
    if (!st?.isDirectory()) {
      continue;
    }
    await packTokenFolder(doc, manifest, workDir, folder, templateMacro);
  }

  await writeManifest(workDir, manifest);

  const outXml = normalizeOutputXml(buildContentXml(doc));
  await fs.writeFile(contentPath, outXml, "utf8");

  writeCampaignZip(workDir, outputCmpgn);
}
