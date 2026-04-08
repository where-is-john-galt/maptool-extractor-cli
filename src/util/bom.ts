const UTF8_BOM = "\uFEFF";

export function stripUtf8Bom(text: string): string {
  if (text.startsWith(UTF8_BOM)) {
    return text.slice(1);
  }
  return text;
}

/** MapTool: normalize to UTF-8 without BOM on write. */
export function normalizeOutputXml(text: string): string {
  return stripUtf8Bom(text);
}
