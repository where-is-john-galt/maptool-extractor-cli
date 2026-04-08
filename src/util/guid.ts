import crypto from "node:crypto";

/** 32 uppercase hex chars (16 bytes), MapTool {@link net.rptools.maptool.model.GUID} string form. */
export function randomGuidHex(): string {
  return crypto.randomBytes(16).toString("hex").toUpperCase();
}

export function isLikelyGuidHex(s: string): boolean {
  return /^[0-9A-Fa-f]{32}$/.test(s);
}

/**
 * MapTool 1.18+ XStream often stores {@code baGUID} as base64 (16 bytes). Older saves used 32 hex chars.
 * Normalizes either form to uppercase hex so manifest / comparisons match {@link net.rptools.maptool.model.GUID#toString()}.
 */
export function normalizeBaGuidTextToHex(text: string): string | undefined {
  const t = text.trim();
  if (isLikelyGuidHex(t)) {
    return t.toUpperCase();
  }
  try {
    const buf = Buffer.from(t, "base64");
    if (buf.length === 16) {
      return buf.toString("hex").toUpperCase();
    }
  } catch {
    /* invalid base64 */
  }
  return undefined;
}
