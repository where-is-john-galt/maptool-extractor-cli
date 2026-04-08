const MACRO_EXT = ".mtmacro";

/** Slug for filesystem segment (token folder or macro stem base). */
export function sanitizeSlug(label: string): string {
  const s = label.normalize("NFC").trim() || "macro";
  return s
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export interface EncodedMacroName {
  /** Filename without directory, e.g. `gm__Label__idx1.mtmacro` */
  filename: string;
}

function escapeForFilename(label: string): string {
  return sanitizeSlug(label).replace(/[/\\]/g, "_");
}

/**
 * Build `.mtmacro` filename. For duplicate labels on one token, pass distinct `index`.
 * GM campaign macros use `gm__` prefix so `pack` routes them to `gmMacroButtonProperties`.
 */
export function encodeMacroFilename(label: string, index: number, isGm: boolean): EncodedMacroName {
  const base = escapeForFilename(label);
  const idxPart = index > 0 ? `__idx${index}` : "";
  const prefix = isGm ? "gm__" : "";
  return { filename: `${prefix}${base}${idxPart}${MACRO_EXT}` };
}

export interface DecodedMacroFilename {
  /** Logical macro label (restore from file). */
  label: string;
  /** Disambiguation index from filename, or macro index from XML when `__idxN` present. */
  indexFromFile?: number;
  isGm: boolean;
}

/**
 * Decode macro filename from disk. Supports `gm__Label.mtmacro`, `Label__idx2.mtmacro`,
 * and `gm__Label__idx1.mtmacro`.
 */
/** Key used in `manifest.json` `campaign.macros` / `tokens[].macros`. */
export function manifestMacroKey(label: string, macroIndex: number): string {
  if (macroIndex > 0) {
    return `${label}__idx${macroIndex}`;
  }
  return label;
}

export function decodeMacroFilename(filename: string): DecodedMacroFilename | undefined {
  if (!filename.endsWith(MACRO_EXT)) {
    return undefined;
  }
  let rest = filename.slice(0, -MACRO_EXT.length);
  let isGm = false;
  if (rest.startsWith("gm__")) {
    isGm = true;
    rest = rest.slice(3);
  }
  let label = rest;
  let indexFromFile: number | undefined;
  const idxMatch = rest.match(/__idx(\d+)$/);
  if (idxMatch) {
    label = rest.slice(0, -idxMatch[0]!.length);
    indexFromFile = Number(idxMatch[1]);
  }
  label = label.normalize("NFC");
  if (!label) {
    return undefined;
  }
  return { label, indexFromFile, isGm };
}
