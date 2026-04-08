import fs from "node:fs/promises";
import path from "node:path";

import { writeManifest } from "../manifest/io.js";
import { prepareUnpackLayout, unpackCampaignMacros, unpackTokenMacros } from "../unpack/macro-fs.js";
import { normalizeTokenFolderName } from "../util/paths.js";
import { sanitizeSlug } from "../pack/filenames.js";
import {
  collectTokenEntriesFromDoc,
  extractCampaignMacros,
  extractTokenMacros,
  extractTokenName,
  findCampaignRoot,
} from "../xml/content-model.js";
import { parseContentXml } from "../xml/parser.js";
import { stripUtf8Bom } from "../util/bom.js";
import { extractCampaignZip } from "../zip/campaign-zip.js";

function allocateTokenFolder(used: Set<string>, tokenName: string, idHex: string): string {
  const base = sanitizeSlug(normalizeTokenFolderName(tokenName)) || "token";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const withId = `${base}__${idHex.slice(0, 8).toUpperCase()}`;
  used.add(withId);
  return withId;
}

function ensureDocArray(doc: unknown): unknown[] {
  if (Array.isArray(doc)) {
    return doc as unknown[];
  }
  return [doc];
}

export async function runUnpack(campaignPath: string, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  extractCampaignZip(campaignPath, outputDir, true);

  const contentPath = path.join(outputDir, "content.xml");
  const raw = await fs.readFile(contentPath, "utf8");
  const doc = ensureDocArray(parseContentXml(stripUtf8Bom(raw)));
  const campaign = findCampaignRoot(doc);
  if (!campaign) {
    throw new Error(
      "Could not find campaign data in content.xml (expected MapTool PersistedCampaign.<campaign> or net.rptools.maptool.model.Campaign)",
    );
  }

  const manifest = await prepareUnpackLayout(outputDir);

  const { player, gm } = extractCampaignMacros(campaign);
  await unpackCampaignMacros(outputDir, player, gm, manifest);

  const usedFolders = new Set<string>();
  for (const { token, idHex } of collectTokenEntriesFromDoc(doc)) {
    const name = extractTokenName(token);
    const folder = allocateTokenFolder(usedFolders, name, idHex);
    const macros = extractTokenMacros(token);
    await unpackTokenMacros(outputDir, folder, idHex, macros, manifest);
  }

  await writeManifest(outputDir, manifest);

  await fs.writeFile(
    path.join(outputDir, ".maptool-readme.txt"),
    [
      "Token folders are keyed by manifest.json (token id).",
      "If you rename a token folder, also move the matching entry under manifest.tokens to the new name.",
      "Under each token folder, subfolders mirror MapTool macro groups; ungrouped macros sit in the token folder root.",
      "Adding a new .mtmacro file under a subfolder sets that macro's group to the folder path when you pack.",
      "Campaign player macros: macros/campaign/",
      "Campaign GM macros: macros/campaign-gm/",
      "",
    ].join("\n"),
    "utf8",
  );

}
