import { test, expect } from "bun:test";
import { extractDataBlob, readFanId } from "../src/parse";

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
