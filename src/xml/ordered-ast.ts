/** Single element in fast-xml-parser preserveOrder mode: `{ "TagName": children[] }` plus optional `":@"`. */

export type OrderedChild = Record<string, unknown> & { ":@"?: Record<string, string> };

export function isOrderedElement(x: unknown): x is OrderedChild {
  if (!x || typeof x !== "object" || Array.isArray(x)) {
    return false;
  }
  const keys = Object.keys(x as object).filter((k) => k !== ":@");
  if (keys.length !== 1) {
    return false;
  }
  const k = keys[0]!;
  /** Text leaves like `{ "#text": "x" }` are not element nodes. */
  if (k === "#text") {
    return false;
  }
  const v = (x as Record<string, unknown>)[k];
  return Array.isArray(v);
}

export function tagNameOf(node: unknown): string | undefined {
  if (!isOrderedElement(node)) {
    return undefined;
  }
  const keys = Object.keys(node).filter((k) => k !== ":@");
  return keys[0];
}

export function childrenOf(node: unknown): unknown[] {
  if (!isOrderedElement(node)) {
    return [];
  }
  const tag = tagNameOf(node)!;
  const ch = (node as Record<string, unknown>)[tag];
  return Array.isArray(ch) ? (ch as unknown[]) : [];
}

export function setChildren(node: OrderedChild, newChildren: unknown[]): void {
  const tag = tagNameOf(node)!;
  (node as Record<string, unknown>)[tag] = newChildren;
}

export function extractTextContent(children: unknown[]): string {
  let s = "";
  for (const item of children) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      if ("#text" in o && Object.keys(o).length === 1) {
        s += String(o["#text"]);
        continue;
      }
    }
    if (isOrderedElement(item)) {
      s += extractTextContent(childrenOf(item));
    }
  }
  return s;
}

export function hasCdataWrapper(children: unknown[]): boolean {
  for (const item of children) {
    if (!isOrderedElement(item)) {
      continue;
    }
    if (tagNameOf(item) === "#cdata") {
      return true;
    }
  }
  return false;
}

/** Set textual or CDATA content for a single-tag leaf block like `<command>...</command>`. */
export function setTextOrCdataContent(children: unknown[], text: string, useCdata: boolean): void {
  children.length = 0;
  if (useCdata) {
    children.push({
      "#cdata": [{ "#text": text }],
    });
  } else {
    children.push({ "#text": text });
  }
}

export function findFirstTag(children: unknown[], tag: string): OrderedChild | undefined {
  for (const item of children) {
    if (isOrderedElement(item) && tagNameOf(item) === tag) {
      return item;
    }
  }
  return undefined;
}

export function walkDepthFirst(ast: unknown[], visitor: (node: OrderedChild) => void): void {
  const stack: unknown[] = [...ast];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) {
      continue;
    }
    if (Array.isArray(cur)) {
      for (let i = cur.length - 1; i >= 0; i--) {
        stack.push(cur[i]);
      }
      continue;
    }
    if (isOrderedElement(cur)) {
      visitor(cur);
      const ch = childrenOf(cur);
      for (let i = ch.length - 1; i >= 0; i--) {
        stack.push(ch[i]);
      }
    }
  }
}

export function isTokenTag(tag: string): boolean {
  return tag === "net.rptools.maptool.model.Token";
}

export function isMacroButtonTag(tag: string): boolean {
  return tag === "net.rptools.maptool.model.MacroButtonProperties";
}

export function isCampaignTag(tag: string): boolean {
  if (tag === "net.rptools.maptool.model.Campaign") {
    return true;
  }
  /** XStream sometimes emits a short or relocated class name depending on version/aliases. */
  if (tag === "Campaign" || tag.endsWith(".Campaign")) {
    return true;
  }
  return false;
}

export function isZoneTag(tag: string): boolean {
  return tag === "net.rptools.maptool.model.Zone";
}

export function isIntTag(tag: string): boolean {
  return tag === "int";
}

export function isGuidTag(tag: string): boolean {
  return tag === "net.rptools.maptool.model.GUID";
}
