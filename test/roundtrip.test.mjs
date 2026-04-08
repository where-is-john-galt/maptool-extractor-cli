import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeBaGuidTextToHex } from "../dist/util/guid.js";
import { stripUtf8Bom } from "../dist/util/bom.js";
import {
  extractTokenName,
  findCampaignRoot,
} from "../dist/xml/content-model.js";
import { buildContentXml, parseContentXml } from "../dist/xml/parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("content.xml round-trip (parse → build → parse) is stable", () => {
  const fixturePath = path.join(__dirname, "fixtures", "minimal-content.xml");
  const fixture = fs.readFileSync(fixturePath, "utf8");
  const doc = parseContentXml(stripUtf8Bom(fixture));
  const built = buildContentXml(doc);
  const again = parseContentXml(stripUtf8Bom(built));
  assert.deepEqual(again, doc);
});

test("MapTool 1.18.x PersistedCampaign wrapper: find Campaign under <campaign>", () => {
  const fixturePath = path.join(__dirname, "fixtures", "persisted-campaign-1-18-shape.xml");
  const fixture = fs.readFileSync(fixturePath, "utf8");
  const doc = parseContentXml(stripUtf8Bom(fixture));
  const root = findCampaignRoot(doc);
  assert.ok(root, "findCampaignRoot");
  assert.equal(extractTokenName(root), "FromPersistedWrapper");
});

test("MapTool 1.18 baGUID: base64 in XML maps to same hex as Java GUID#toString", () => {
  assert.equal(
    normalizeBaGuidTextToHex("70qTNw//R06UL7E7OLjXMA=="),
    "EF4A93370FFF474E942FB13B38B8D730",
  );
});

test("UTF-8 BOM is stripped", () => {
  const inner = "<r/>";
  const withBom = "\uFEFF" + inner;
  assert.equal(stripUtf8Bom(withBom), inner);
});
