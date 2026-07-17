import { test, expect } from "bun:test";
import { extractDataBlob, parseBandcampDate, readFanId } from "../src/parse";

const html = await Bun.file("test/fixtures/data-blob.html").text();

test("extractDataBlob returns the parsed JSON object", () => {
  const blob = extractDataBlob(html);
  expect(typeof blob).toBe("object");
  expect(blob.fan_data).toBeDefined();
});

test("readFanId pulls the numeric fan id", () => {
  expect(readFanId(extractDataBlob(html))).toBe(1238758);
});

test("extractDataBlob throws a clear error on markup it can't parse", () => {
  expect(() => extractDataBlob("<div>nope</div>")).toThrow(/data-blob/i);
});

test("parseBandcampDate converts Bandcamp date to ISO", () => {
  expect(parseBandcampDate("30 Jun 2026 21:25:32 GMT")).toBe("2026-06-30T21:25:32.000Z");
});

test("parseBandcampDate returns null for missing/garbage", () => {
  expect(parseBandcampDate(null)).toBeNull();
  expect(parseBandcampDate("not a date")).toBeNull();
});
