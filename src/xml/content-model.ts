import { randomUUID } from "node:crypto";

import { normalizeBaGuidTextToHex } from "../util/guid.js";
import {
  type OrderedChild,
  childrenOf,
  extractTextContent,
  findFirstTag,
  hasCdataWrapper,
  isCampaignTag,
  isGuidTag,
  isMacroButtonTag,
  isOrderedElement,
  isTokenTag,
  isZoneTag,
  isIntTag,
  setChildren,
  setTextOrCdataContent,
  tagNameOf,
  walkDepthFirst,
} from "./ordered-ast.js";

export interface ParsedMacro {
  index: number;
  label: string;
  command: string;
  colorKey: string;
  autoExecute: boolean;
  group: string;
  applyToTokens: boolean;
  includeLabel: boolean;
  sortby: string;
  hotKey: string;
  fontColorKey: string;
  fontSize: string;
  rawAst: OrderedChild;
  commandUsesCdata: boolean;
}

function readIntChild(children: unknown[], tag: string, fallback = 0): number {
  const n = findFirstTag(children, tag);
  if (!n) {
    return fallback;
  }
  const t = extractTextContent(childrenOf(n)).trim();
  const i = Number.parseInt(t, 10);
  return Number.isFinite(i) ? i : fallback;
}

function readStringChild(children: unknown[], tag: string, fallback = ""): string {
  const n = findFirstTag(children, tag);
  if (!n) {
    return fallback;
  }
  return extractTextContent(childrenOf(n));
}

function readBooleanChild(children: unknown[], tag: string, fallback: boolean): boolean {
  const n = findFirstTag(children, tag);
  if (!n) {
    return fallback;
  }
  const ch = childrenOf(n);
  if (ch.length === 0) {
    return true;
  }
  const t = extractTextContent(ch).trim().toLowerCase();
  return t === "true" || t === "1";
}

export function extractGuidHexFromGuidNode(guidNode: OrderedChild): string | undefined {
  const ch = childrenOf(guidNode);
  const ba = findFirstTag(ch, "baGUID");
  if (ba) {
    const inner = childrenOf(ba);
    const text = extractTextContent(inner).trim();
    const fromNorm = normalizeBaGuidTextToHex(text);
    if (fromNorm) {
      return fromNorm;
    }
    const bytes: number[] = [];
    for (const item of inner) {
      if (!isOrderedElement(item)) {
        continue;
      }
      if (tagNameOf(item) === "byte") {
        const v = Number.parseInt(extractTextContent(childrenOf(item)).trim(), 10);
        if (Number.isFinite(v)) {
          bytes.push(v & 0xff);
        }
      }
    }
    if (bytes.length === 16) {
      return Buffer.from(bytes).toString("hex").toUpperCase();
    }
  }
  return undefined;
}

export function extractTokenIdHex(tokenNode: OrderedChild): string | undefined {
  const idWrap = findFirstTag(childrenOf(tokenNode), "id");
  if (!idWrap) {
    return undefined;
  }
  const idCh = childrenOf(idWrap);
  for (const item of idCh) {
    if (isOrderedElement(item) && isGuidTag(tagNameOf(item)!)) {
      return extractGuidHexFromGuidNode(item);
    }
  }
  const t = extractTextContent(idCh).replace(/\s/g, "");
  return normalizeBaGuidTextToHex(t);
}

export function extractTokenName(tokenNode: OrderedChild): string {
  return readStringChild(childrenOf(tokenNode), "name", "");
}

function parseMacroButtonProps(macroNode: OrderedChild): ParsedMacro {
  const ch = childrenOf(macroNode);
  const commandWrap = findFirstTag(ch, "command");
  const commandUsesCdata = commandWrap ? hasCdataWrapper(childrenOf(commandWrap)) : false;
  const command = commandWrap ? extractTextContent(childrenOf(commandWrap)) : "";
  return {
    index: readIntChild(ch, "index", 0),
    label: readStringChild(ch, "label", ""),
    command,
    colorKey: readStringChild(ch, "colorKey", "default"),
    autoExecute: readBooleanChild(ch, "autoExecute", false),
    group: readStringChild(ch, "group", ""),
    applyToTokens: readBooleanChild(ch, "applyToTokens", false),
    includeLabel: readBooleanChild(ch, "includeLabel", false),
    sortby: readStringChild(ch, "sortby", ""),
    hotKey: readStringChild(ch, "hotKey", ""),
    fontColorKey: readStringChild(ch, "fontColorKey", "black"),
    fontSize: readStringChild(ch, "fontSize", "1.00em"),
    rawAst: macroNode,
    commandUsesCdata,
  };
}

function entryKeyValue(entryChildren: unknown[]): { keyEl: OrderedChild; valueEl: OrderedChild } | undefined {
  const els = entryChildren.filter(isOrderedElement) as OrderedChild[];
  if (els.length < 2) {
    return undefined;
  }
  return { keyEl: els[0]!, valueEl: els[1]! };
}

function iterMapEntries(mapChildren: unknown[]): Array<{ keyEl: OrderedChild; valueEl: OrderedChild }> {
  const out: Array<{ keyEl: OrderedChild; valueEl: OrderedChild }> = [];
  for (const item of mapChildren) {
    if (!isOrderedElement(item)) {
      continue;
    }
    if (tagNameOf(item) !== "entry") {
      continue;
    }
    const pair = entryKeyValue(childrenOf(item));
    if (pair) {
      out.push(pair);
    }
  }
  return out;
}

export function extractTokenMacros(tokenNode: OrderedChild): ParsedMacro[] {
  const mapWrap = findFirstTag(childrenOf(tokenNode), "macroPropertiesMap");
  if (!mapWrap) {
    return [];
  }
  const macros: ParsedMacro[] = [];
  for (const { valueEl } of iterMapEntries(childrenOf(mapWrap))) {
    if (isMacroButtonTag(tagNameOf(valueEl)!)) {
      macros.push(parseMacroButtonProps(valueEl));
    }
  }
  macros.sort((a, b) => a.index - b.index);
  return macros;
}

/**
 * Campaign save shape: `zones` plus macro panels and/or `campaignProperties` (MapTool ≥1.3).
 * .cmpgn z MapTool 1.18.x to zwykle {@code PersistedCampaign} z polami {@code Campaign} inline pod {@code <campaign>}.
 */
function looksLikeCampaignRootStructure(node: OrderedChild): boolean {
  const ch = childrenOf(node);
  let hasZones = false;
  let hasMacroPanel = false;
  for (const item of ch) {
    if (!isOrderedElement(item)) {
      continue;
    }
    const t = tagNameOf(item);
    if (t === "zones") {
      hasZones = true;
    }
    if (t === "macroButtonProperties" || t === "gmMacroButtonProperties") {
      hasMacroPanel = true;
    }
  }
  if (hasZones && hasMacroPanel) {
    return true;
  }
  /** Macro lists may be elided in edge cases; `campaignProperties` is a reliable sibling of `zones`. */
  if (hasZones && findFirstTag(ch, "campaignProperties")) {
    return true;
  }
  return false;
}

/**
 * MapTool 1.18.x (and long prior) saves `.cmpgn` as {@code PersistedCampaign}, not raw {@code Campaign}.
 * XStream often inlines {@code Campaign} fields directly under the {@code <campaign>} element, so there is
 * no {@code net.rptools.maptool.model.Campaign} tag in the file.
 */
function tryUnwrapPersistedCampaignRoot(doc: unknown[]): OrderedChild | undefined {
  for (const top of doc) {
    if (!isOrderedElement(top)) {
      continue;
    }
    const rootTag = tagNameOf(top)!;
    if (!rootTag.includes("PersistedCampaign")) {
      continue;
    }
    const campaignEl = findFirstTag(childrenOf(top), "campaign");
    if (!campaignEl) {
      continue;
    }
    if (looksLikeCampaignRootStructure(campaignEl)) {
      return campaignEl;
    }
    for (const item of childrenOf(campaignEl)) {
      if (!isOrderedElement(item)) {
        continue;
      }
      const t = tagNameOf(item)!;
      if (isCampaignTag(t) || looksLikeCampaignRootStructure(item)) {
        return item;
      }
    }
    return campaignEl;
  }
  return undefined;
}

export function findCampaignRoot(doc: unknown[]): OrderedChild | undefined {
  const persisted = tryUnwrapPersistedCampaignRoot(doc);
  if (persisted) {
    return persisted;
  }
  let found: OrderedChild | undefined;
  walkDepthFirst(doc, (node) => {
    if (found) {
      return;
    }
    const t = tagNameOf(node);
    if (t && isCampaignTag(t)) {
      found = node;
    }
  });
  if (found) {
    return found;
  }
  walkDepthFirst(doc, (node) => {
    if (found) {
      return;
    }
    if (looksLikeCampaignRootStructure(node)) {
      found = node;
    }
  });
  return found;
}

function extractMacroListFromCampaign(
  campaign: OrderedChild,
  field: "macroButtonProperties" | "gmMacroButtonProperties",
): ParsedMacro[] {
  const wrap = findFirstTag(childrenOf(campaign), field);
  if (!wrap) {
    return [];
  }
  const macros: ParsedMacro[] = [];
  for (const item of childrenOf(wrap)) {
    if (isOrderedElement(item) && isMacroButtonTag(tagNameOf(item)!)) {
      macros.push(parseMacroButtonProps(item));
    }
  }
  macros.sort((a, b) => a.index - b.index);
  return macros;
}

export function extractCampaignMacros(campaign: OrderedChild): {
  player: ParsedMacro[];
  gm: ParsedMacro[];
} {
  return {
    player: extractMacroListFromCampaign(campaign, "macroButtonProperties"),
    gm: extractMacroListFromCampaign(campaign, "gmMacroButtonProperties"),
  };
}

export function replaceMacroCommand(macro: ParsedMacro, newCommand: string): void {
  const ch = childrenOf(macro.rawAst);
  const cmd = findFirstTag(ch, "command");
  if (!cmd) {
    ch.push({ command: [] });
    const nw = findFirstTag(ch, "command")!;
    setTextOrCdataContent(childrenOf(nw), newCommand, macro.commandUsesCdata);
    return;
  }
  setTextOrCdataContent(childrenOf(cmd), newCommand, macro.commandUsesCdata);
}

export function buildGuidNode(hexUpper: string): OrderedChild {
  return {
    "net.rptools.maptool.model.GUID": [{ baGUID: [{ "#text": hexUpper.toUpperCase() }] }],
  };
}

export function buildMapEntry(keyNode: OrderedChild, valueNode: OrderedChild): OrderedChild {
  return {
    entry: [keyNode, valueNode],
  };
}

/** Replace all macro entries in `macroPropertiesMap` from ordered `MacroButtonProperties` nodes. */
export function replaceTokenMacroPropertiesMap(tokenNode: OrderedChild, macroNodes: OrderedChild[]): void {
  const ch = childrenOf(tokenNode);
  let mapWrap = findFirstTag(ch, "macroPropertiesMap");
  if (!mapWrap) {
    mapWrap = { macroPropertiesMap: [] };
    ch.push(mapWrap);
  }
  const mapCh = childrenOf(mapWrap);
  mapCh.length = 0;
  for (let i = 0; i < macroNodes.length; i++) {
    const mn = macroNodes[i]!;
    const idx = readIntChild(childrenOf(mn), "index", i);
    const keyTag = findFirstTag(childrenOf(mn), "index") ? "int" : "int";
    void keyTag;
    mapCh.push(
      buildMapEntry({ int: [{ "#text": String(idx) }] } as OrderedChild, mn),
    );
  }
}

export function collectAllTokens(doc: unknown[]): OrderedChild[] {
  const tokens: OrderedChild[] = [];
  walkDepthFirst(doc, (node) => {
    const t = tagNameOf(node);
    if (t && isTokenTag(t)) {
      tokens.push(node);
    }
  });
  return tokens;
}

/**
 * Token IDs in MapTool 1.18+ often use {@code <id reference="..."/>} with no inline bytes; the stable id
 * is the GUID used as the {@code tokenMap} entry key.
 */
export function collectTokenEntriesFromDoc(
  doc: unknown[],
): Array<{ token: OrderedChild; idHex: string }> {
  const out: Array<{token: OrderedChild; idHex: string }> = [];
  const seen = new Set<string>();
  walkDepthFirst(doc, (node) => {
    const t = tagNameOf(node);
    if (t !== "tokenMap") {
      return;
    }
    for (const item of childrenOf(node)) {
      if (!isOrderedElement(item) || tagNameOf(item) !== "entry") {
        continue;
      }
      const pair = entryKeyValue(childrenOf(item));
      if (!pair) {
        continue;
      }
      const { keyEl, valueEl } = pair;
      if (!isTokenTag(tagNameOf(valueEl)!)) {
        continue;
      }
      const idHex = extractGuidHexFromGuidNode(keyEl as OrderedChild);
      if (!idHex) {
        continue;
      }
      if (seen.has(idHex)) {
        continue;
      }
      seen.add(idHex);
      out.push({ token: valueEl as OrderedChild, idHex });
    }
  });
  return out;
}

export function findTokenByIdHex(doc: unknown[], idHex: string): OrderedChild | undefined {
  const want = idHex.toUpperCase();
  for (const { token, idHex: h } of collectTokenEntriesFromDoc(doc)) {
    if (h === want) {
      return token;
    }
  }
  return undefined;
}

export function findFirstZoneWithTokenMap(doc: unknown[]): {
  zone: OrderedChild;
  tokenMap: OrderedChild;
} | undefined {
  let found: { zone: OrderedChild; tokenMap: OrderedChild } | undefined;
  walkDepthFirst(doc, (node) => {
    if (found) {
      return;
    }
    const tname = tagNameOf(node);
    if (tname && isZoneTag(tname)) {
      const tm = findFirstTag(childrenOf(node), "tokenMap");
      if (tm) {
        found = { zone: node, tokenMap: tm };
      }
    }
  });
  return found;
}

function macroMapKeyIndex(keyEl: OrderedChild): number {
  const t = tagNameOf(keyEl);
  if (t && isIntTag(t)) {
    return Number.parseInt(extractTextContent(childrenOf(keyEl)).trim(), 10) || 0;
  }
  return readIntChild(childrenOf(keyEl), "int", -1);
}

function shallowCloneOrdered(node: OrderedChild): OrderedChild {
  const tag = tagNameOf(node)!;
  const ch = childrenOf(node);
  const clone: OrderedChild = { [tag]: [] } as OrderedChild;
  if (node[":@"]) {
    clone[":@"] = { ...node[":@"] };
  }
  const dest = childrenOf(clone);
  for (const c of ch) {
    dest.push(deepCloneAst(c));
  }
  return clone;
}

export function deepCloneAst(node: unknown): unknown {
  if (node === null || node === undefined) {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((x) => deepCloneAst(x));
  }
  if (typeof node === "object") {
    if (isOrderedElement(node)) {
      return shallowCloneOrdered(node);
    }
    const o = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = deepCloneAst(v) as unknown;
    }
    return out;
  }
  return node;
}

export function setTokenIdHex(tokenNode: OrderedChild, hex: string): void {
  const ch = childrenOf(tokenNode);
  let idWrap = findFirstTag(ch, "id");
  if (!idWrap) {
    idWrap = { id: [] };
    ch.unshift(idWrap);
  }
  setChildren(idWrap, [buildGuidNode(hex)]);
}

export function setTokenName(tokenNode: OrderedChild, name: string): void {
  const ch = childrenOf(tokenNode);
  let nameEl = findFirstTag(ch, "name");
  if (!nameEl) {
    nameEl = { name: [] };
    ch.push(nameEl);
  }
  setTextOrCdataContent(childrenOf(nameEl), name, false);
}

export function appendTokenToZoneTokenMap(tokenMap: OrderedChild, tokenNode: OrderedChild): void {
  const idHex = extractTokenIdHex(tokenNode);
  if (!idHex) {
    return;
  }
  const keyGuid = buildGuidNode(idHex);
  const entries = childrenOf(tokenMap);
  entries.push(buildMapEntry(keyGuid, tokenNode));
}

export function setMacroListContent(
  campaign: OrderedChild,
  field: "macroButtonProperties" | "gmMacroButtonProperties",
  macroNodes: OrderedChild[],
): void {
  const ch = childrenOf(campaign);
  let wrap = findFirstTag(ch, field);
  if (!wrap) {
    wrap = { [field]: [] } as OrderedChild;
    ch.push(wrap);
  }
  setChildren(wrap, macroNodes);
}

export function findAnyMacroButtonTemplate(doc: unknown[]): OrderedChild | undefined {
  let found: OrderedChild | undefined;
  walkDepthFirst(doc, (n) => {
    if (found) {
      return;
    }
    const t = tagNameOf(n);
    if (t && isMacroButtonTag(t)) {
      found = n;
    }
  });
  return found;
}

function setStringFieldCh(ch: unknown[], tag: string, val: string): void {
  let el = findFirstTag(ch, tag);
  if (!el) {
    el = { [tag]: [] } as OrderedChild;
    ch.push(el);
  }
  setTextOrCdataContent(childrenOf(el), val, false);
}

function setBoolFieldCh(ch: unknown[], tag: string, val: boolean): void {
  setStringFieldCh(ch, tag, val ? "true" : "false");
}

/** Patch macro XML in place (mutates `macro` AST). */
export function patchMacroButtonAst(
  macro: OrderedChild,
  updates: {
    index: number;
    label: string;
    command: string;
    commandUsesCdata: boolean;
    colorKey: string;
    autoExecute: boolean;
    group: string;
    applyToTokens: boolean;
    includeLabel: boolean;
    sortby: string;
  },
  options?: { regenerateMacroUuid?: boolean },
): void {
  const ch = childrenOf(macro);
  let uuidEl = findFirstTag(ch, "macroUUID");
  if (!uuidEl) {
    uuidEl = { macroUUID: [] };
    ch.push(uuidEl);
  }
  const regen = options?.regenerateMacroUuid ?? false;
  const existingUuid = extractTextContent(childrenOf(uuidEl)).trim();
  if (regen || !existingUuid) {
    setTextOrCdataContent(childrenOf(uuidEl), randomUUID(), false);
  }

  setStringFieldCh(ch, "index", String(updates.index));
  setStringFieldCh(ch, "label", updates.label);
  let cmd = findFirstTag(ch, "command");
  if (!cmd) {
    cmd = { command: [] };
    ch.push(cmd);
  }
  setTextOrCdataContent(childrenOf(cmd), updates.command, updates.commandUsesCdata);
  setStringFieldCh(ch, "colorKey", updates.colorKey);
  setBoolFieldCh(ch, "autoExecute", updates.autoExecute);
  setStringFieldCh(ch, "group", updates.group);
  setBoolFieldCh(ch, "applyToTokens", updates.applyToTokens);
  setBoolFieldCh(ch, "includeLabel", updates.includeLabel);
  setStringFieldCh(ch, "sortby", updates.sortby);
}

/** Remove token macro entries whose index is not in `keepIndices`. */
export function filterTokenMacroMap(tokenNode: OrderedChild, keepIndices: Set<number>): void {
  const mapWrap = findFirstTag(childrenOf(tokenNode), "macroPropertiesMap");
  if (!mapWrap) {
    return;
  }
  const next: unknown[] = [];
  for (const item of childrenOf(mapWrap)) {
    if (!isOrderedElement(item) || tagNameOf(item) !== "entry") {
      next.push(item);
      continue;
    }
    const pair = entryKeyValue(childrenOf(item));
    if (!pair) {
      next.push(item);
      continue;
    }
    const keyIdx = macroMapKeyIndex(pair.keyEl);
    const macroIndex = isMacroButtonTag(tagNameOf(pair.valueEl)!)
      ? readIntChild(childrenOf(pair.valueEl), "index", keyIdx)
      : keyIdx;
    if (keepIndices.has(macroIndex)) {
      next.push(item);
    }
  }
  setChildren(mapWrap, next);
}
