import path from "node:path";

export function macrosRoot(workDir: string): string {
  return path.join(workDir, "macros");
}

export function campaignMacrosDir(workDir: string): string {
  return path.join(macrosRoot(workDir), "campaign");
}

export function campaignGmMacrosDir(workDir: string): string {
  /** GM campaign macros (MapTool 1.5.6+); kept separate to avoid panel mix-ups. */
  return path.join(macrosRoot(workDir), "campaign-gm");
}

export function tokenMacrosDir(workDir: string, tokenFolder: string): string {
  return path.join(macrosRoot(workDir), "tokens", tokenFolder);
}

export function normalizeFsPathKey(p: string): string {
  return path.normalize(p);
}

/** NFC normalize folder names from manifest / disk for stable map keys. */
export function normalizeTokenFolderName(name: string): string {
  return name.normalize("NFC");
}
