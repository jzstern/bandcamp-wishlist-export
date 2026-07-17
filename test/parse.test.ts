import { expect, test } from "bun:test";
import {
  extractDataBlob,
  newestToken,
  normalizeItem,
  parseBandcampDate,
  readFanId,
} from "../src/parse";

const html = await Bun.file("test/fixtures/data-blob.html").text();
const api = await Bun.file("test/fixtures/api-response.json").json();

test("extractDataBlob returns the parsed JSON object", () => {
  const blob = extractDataBlob(html);
  expect(typeof blob).toBe("object");
  expect(blob.fan_data).toBeDefined();
});

test("readFanId pulls the numeric fan id", () => {
  expect(readFanId(extractDataBlob(html))).toBe(1238758);
});

test("readFanId throws when fan_id is missing or non-numeric", () => {
  expect(() => readFanId({})).toThrow(/fan_id/i);
});

test("extractDataBlob throws a clear error on markup it can't parse", () => {
  expect(() => extractDataBlob("<div>nope</div>")).toThrow(/data-blob/i);
});

test("extractDataBlob throws when data-blob is present but not valid JSON", () => {
  const markup = '<div id="pagedata" data-blob="{not json"></div>';
  expect(() => extractDataBlob(markup)).toThrow(/data-blob|markup|parse/i);
});

test("parseBandcampDate converts Bandcamp date to ISO", () => {
  expect(parseBandcampDate("30 Jun 2026 21:25:32 GMT")).toBe(
    "2026-06-30T21:25:32.000Z",
  );
});

test("parseBandcampDate returns null for missing/garbage", () => {
  expect(parseBandcampDate(null)).toBeNull();
  expect(parseBandcampDate("not a date")).toBeNull();
});

test("normalizeItem maps a real API item to WishlistItem", () => {
  const raw = api.items[0];
  const item = normalizeItem(raw);
  expect(item.itemId).toBe(raw.item_id);
  expect(item.artist).toBe(raw.band_name);
  expect(item.title).toBe(raw.item_title);
  expect(item.url).toBe(raw.item_url);
  expect(["album", "track"]).toContain(item.itemType);
  expect(item.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test("normalizeItem coerces unexpected item_type to 'album'", () => {
  const item = normalizeItem({ ...api.items[0], item_type: "weird" });
  expect(item.itemType).toBe("album");
});

test("normalizeItem preserves 'track' type from a real track item", () => {
  const rawTrack = api.items.find(
    (item: { item_type: string }) => item.item_type === "track",
  );
  expect(rawTrack).toBeDefined();
  expect(normalizeItem(rawTrack).itemType).toBe("track");
});

test("newestToken has the token shape", () => {
  expect(newestToken()).toMatch(/^\d+:\d+:[at]::$/);
});
