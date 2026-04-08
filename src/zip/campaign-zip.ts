import fs from "node:fs";
import path from "node:path";

import AdmZip from "adm-zip";

function walkFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkFilesRecursive(p));
    } else {
      out.push(p);
    }
  }
  return out;
}

/** Extract `.cmpgn` (ZIP) to a directory. */
export function extractCampaignZip(campaignPath: string, outputDir: string, overwrite = true): void {
  const resolved = path.resolve(campaignPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Campaign file not found: ${resolved}`);
  }
  const zip = new AdmZip(resolved);
  zip.extractAllTo(outputDir, overwrite);
}

/** Build `.cmpgn` from a working directory (`content.xml`, `properties.xml`, `assets/**`). */
export function writeCampaignZip(workDir: string, outputPath: string): void {
  const zip = new AdmZip();
  const contentPath = path.join(workDir, "content.xml");
  if (!fs.existsSync(contentPath)) {
    throw new Error(`Missing content.xml in ${workDir}`);
  }
  zip.addFile("content.xml", fs.readFileSync(contentPath));
  const propsPath = path.join(workDir, "properties.xml");
  if (fs.existsSync(propsPath)) {
    zip.addFile("properties.xml", fs.readFileSync(propsPath));
  }
  const assetsRoot = path.join(workDir, "assets");
  if (fs.existsSync(assetsRoot)) {
    for (const abs of walkFilesRecursive(assetsRoot)) {
      const rel = path.relative(assetsRoot, abs);
      const zipPath = `assets/${rel.split(path.sep).join("/")}`;
      zip.addFile(zipPath, fs.readFileSync(abs));
    }
  }
  zip.writeZip(outputPath);
}
