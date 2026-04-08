import { XMLBuilder, XMLParser, type XmlBuilderOptions, type X2jOptions } from "fast-xml-parser";

/** Options locked for MapTool / XStream round-trip compatibility — use for both parse and build. */
export const XML_OPTIONS_PARSE: X2jOptions = {
  preserveOrder: true,
  ignoreAttributes: false,
  trimValues: false,
  parseTagValue: false,
  /**
   * Defaults (max 1000 expansions) fail on large MapTool campaigns where many `&…;`/`&` sequences
   * appear in macro text and elsewhere.
   */
  processEntities: {
    enabled: true,
    maxTotalExpansions: 10_000_000,
    maxExpandedLength: 100_000_000,
    maxEntityCount: 50_000,
  },
  cdataPropName: "#cdata",
  attributeNamePrefix: "@_",
};

export const XML_OPTIONS_BUILD: XmlBuilderOptions = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "#cdata",
  /** `false` avoids injecting extra whitespace text nodes that break strict AST round-trip. */
  format: false,
  suppressEmptyNode: false,
  suppressUnpairedNode: false,
};

export function createXmlParser(): XMLParser {
  return new XMLParser(XML_OPTIONS_PARSE);
}

export function createXmlBuilder(): XMLBuilder {
  return new XMLBuilder(XML_OPTIONS_BUILD);
}

export function parseContentXml(xmlText: string): unknown[] {
  return createXmlParser().parse(xmlText) as unknown[];
}

export function buildContentXml(doc: unknown[]): string {
  return createXmlBuilder().build(doc);
}
