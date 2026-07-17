# Bandcamp Wishlist Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A zero-dependency Bun/TypeScript CLI that reads a public Bandcamp wishlist and writes it to a single easy-to-parse JSON file.

**Architecture:** Scrape the target user's public profile page once to get their `fan_id`, then page the entire wishlist through Bandcamp's unauthenticated `wishlist_items` API (seeded with a synthetic far-future token so the first page is the newest items), normalize each item, and write one JSON snapshot. All network I/O is isolated in `bandcamp.ts`; all parsing is pure and unit-tested in `parse.ts`.

**Tech Stack:** Bun 1.3.x runtime, TypeScript, native `fetch`, built-in `node:util` `parseArgs`, `bun test`, Biome (lint/format). No runtime dependencies.

---

## Reference: verified facts (see `docs/2026-07-17-wishlist-exporter-design.md`)

- Profile page: `GET https://bandcamp.com/<username>/wishlist` → HTML with
  `<div id="pagedata" data-blob="<HTML-escaped JSON>">`. `fan_data.fan_id` lives inside.
- Paging API: `POST https://bandcamp.com/api/fancollection/1/wishlist_items`
  body `{ fan_id, older_than_token, count }` → `{ items[], more_available, last_token }`.
- Synthetic start token `"9999999999:9999999999:a::"` returns the newest items first.
- Test account: `jzstern`, fan_id `1238758`, ~1347 items.
- API item fields used: `item_id`, `item_type` (`"album"`/`"track"`), `band_name`,
  `item_title`, `item_url`, `item_art_url`, `added` (e.g. `"30 Jun 2026 21:25:32 GMT"`).

---

## File structure

- Create: `package.json` — scripts, Bun/TS config pointer, no deps
- Create: `tsconfig.json` — strict TS, bundler resolution
- Create: `biome.json` — formatter/linter config
- Create: `.gitignore` — `node_modules`, `output/`
- Create: `src/types.ts` — `WishlistItem`, `WishlistSnapshot`, `RawApiItem`
- Create: `src/parse.ts` — pure: `extractDataBlob`, `readFanId`, `normalizeItem`, `parseBandcampDate`, `newestToken`
- Create: `src/bandcamp.ts` — I/O: `resolveFanId`, `fetchAllWishlistItems`
- Create: `src/output.ts` — `writeSnapshot`
- Create: `src/cli.ts` — flag parsing + orchestration
- Create: `test/parse.test.ts` — unit tests for `parse.ts`
- Create: `test/fixtures/data-blob.html` — a captured `<div id="pagedata">` snippet
- Create: `test/fixtures/api-response.json` — one captured API response

---

## Task 0: Project scaffold

**Files:** `package.json`, `tsconfig.json`, `biome.json`, `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "bandcamp-wishlist",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "export": "bun run src/cli.ts",
    "test": "bun test",
    "check": "biome check ."
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["bun-types"],
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": { "ignore": ["output", "test/fixtures"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "linter": { "enabled": true, "rules": { "recommended": true } }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
output/
*.log
```

- [ ] **Step 5: Install dev deps and commit**

```bash
pnpm add -D bun-types @biomejs/biome
git add -A && git commit -m "chore: scaffold bandcamp-wishlist CLI"
```

Expected: `pnpm` creates `node_modules` + lockfile; commit succeeds.

---

## Task 1: Types

**Files:** Create `src/types.ts`

- [ ] **Step 1: Write the types**

```typescript
export type ItemType = "album" | "track";

export interface WishlistItem {
  itemId: number;
  itemType: ItemType;
  artist: string;
  title: string;
  url: string;
  artUrl: string | null;
  addedAt: string | null; // ISO 8601
}

export interface WishlistSnapshot {
  source: "bandcamp";
  username: string;
  fanId: number;
  fetchedAt: string; // ISO 8601
  count: number;
  items: WishlistItem[];
}

// Minimal shape of a raw item from the wishlist_items API (only fields we read).
export interface RawApiItem {
  item_id: number;
  item_type: string;
  band_name: string;
  item_title: string;
  item_url: string;
  item_art_url?: string | null;
  added?: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts && git commit -m "feat: wishlist snapshot types"
```

---

## Task 2: Capture test fixtures

**Files:** Create `test/fixtures/data-blob.html`, `test/fixtures/api-response.json`

- [ ] **Step 1: Capture a real profile page and slice out the pagedata div**

```bash
mkdir -p test/fixtures
curl -sL -A "Mozilla/5.0" "https://bandcamp.com/jzstern/wishlist" -o /tmp/wl.html
# Extract just the <div id="pagedata" ...></div> element into the fixture:
bun -e 'const h=await Bun.file("/tmp/wl.html").text(); const m=h.match(/<div id="pagedata"[^>]*><\/div>/); await Bun.write("test/fixtures/data-blob.html", m[0]);'
```

Expected: `test/fixtures/data-blob.html` is a single `<div id="pagedata" data-blob="...">` line.

- [ ] **Step 2: Capture one real API response**

```bash
curl -s -X POST "https://bandcamp.com/api/fancollection/1/wishlist_items" \
  -H "Content-Type: application/json" -A "Mozilla/5.0" \
  -d '{"fan_id":1238758,"older_than_token":"9999999999:9999999999:a::","count":5}' \
  -o test/fixtures/api-response.json
```

Expected: JSON with `items` (5), `more_available: true`, `last_token`.

- [ ] **Step 3: Commit fixtures**

```bash
git add test/fixtures && git commit -m "test: capture bandcamp fixtures"
```

---

## Task 3: `parse.ts` — data-blob extraction (TDD)

**Files:** Create `src/parse.ts`, `test/parse.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test test/parse.test.ts`
Expected: FAIL — `extractDataBlob` not exported.

- [ ] **Step 3: Implement**

```typescript
export function extractDataBlob(html: string): any {
  const m = html.match(/id="pagedata"[^>]*\bdata-blob="([^"]*)"/);
  if (!m) throw new Error("Could not find data-blob in Bandcamp page (markup may have changed).");
  const json = m[1]
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
  try {
    return JSON.parse(json);
  } catch {
    throw new Error("Failed to parse Bandcamp data-blob JSON (markup may have changed).");
  }
}

export function readFanId(blob: any): number {
  const id = blob?.fan_data?.fan_id;
  if (typeof id !== "number") throw new Error("fan_id not found in Bandcamp page.");
  return id;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test test/parse.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/parse.ts test/parse.test.ts && git commit -m "feat: extract fan_id from bandcamp page"
```

---

## Task 4: `parse.ts` — date parsing (TDD)

**Files:** Modify `src/parse.ts`, `test/parse.test.ts`

- [ ] **Step 1: Add failing tests**

```typescript
import { parseBandcampDate } from "../src/parse";

test("parseBandcampDate converts Bandcamp date to ISO", () => {
  expect(parseBandcampDate("30 Jun 2026 21:25:32 GMT")).toBe("2026-06-30T21:25:32.000Z");
});

test("parseBandcampDate returns null for missing/garbage", () => {
  expect(parseBandcampDate(null)).toBeNull();
  expect(parseBandcampDate("not a date")).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL** (`bun test test/parse.test.ts`)

- [ ] **Step 3: Implement**

```typescript
export function parseBandcampDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/parse.ts test/parse.test.ts && git commit -m "feat: parse bandcamp dates to ISO"
```

---

## Task 5: `parse.ts` — item normalization + newestToken (TDD)

**Files:** Modify `src/parse.ts`, `test/parse.test.ts`

- [ ] **Step 1: Add failing tests** (drive off the real API fixture)

```typescript
import { normalizeItem, newestToken } from "../src/parse";

const api = await Bun.file("test/fixtures/api-response.json").json();

test("normalizeItem maps a real API item to WishlistItem", () => {
  const raw = api.items[0];
  const item = normalizeItem(raw);
  expect(item.itemId).toBe(raw.item_id);
  expect(item.artist).toBe(raw.band_name);
  expect(item.title).toBe(raw.item_title);
  expect(item.url).toBe(raw.item_url);
  expect(["album", "track"]).toContain(item.itemType);
  expect(item.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO
});

test("normalizeItem coerces unexpected item_type to 'album'", () => {
  const item = normalizeItem({ ...api.items[0], item_type: "weird" });
  expect(item.itemType).toBe("album");
});

test("newestToken has the token shape", () => {
  expect(newestToken()).toMatch(/^\d+:\d+:[at]::$/);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { RawApiItem, WishlistItem } from "./types";

export function normalizeItem(raw: RawApiItem): WishlistItem {
  const itemType = raw.item_type === "track" ? "track" : "album";
  return {
    itemId: raw.item_id,
    itemType,
    artist: raw.band_name,
    title: raw.item_title,
    url: raw.item_url,
    artUrl: raw.item_art_url ?? null,
    addedAt: parseBandcampDate(raw.added),
  };
}

export function newestToken(): string {
  return "9999999999:9999999999:a::";
}
```

- [ ] **Step 4: Run — expect PASS (all parse tests green)**

- [ ] **Step 5: Commit**

```bash
git add src/parse.ts test/parse.test.ts && git commit -m "feat: normalize wishlist items"
```

---

## Task 6: `bandcamp.ts` — network layer

**Files:** Create `src/bandcamp.ts`

> Not unit-tested (live I/O); exercised in the Task 8 acceptance run. Keep this
> module thin so the untested surface is small.

- [ ] **Step 1: Implement**

```typescript
import { extractDataBlob, readFanId, newestToken, normalizeItem } from "./parse";
import type { RawApiItem, WishlistItem } from "./types";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const WISHLIST_API = "https://bandcamp.com/api/fancollection/1/wishlist_items";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postJson<T>(url: string, body: unknown, attempt = 1): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify(body),
  });
  if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
    await sleep(500 * 2 ** (attempt - 1));
    return postJson<T>(url, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`Bandcamp API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export async function resolveFanId(username: string): Promise<number> {
  const res = await fetch(`https://bandcamp.com/${encodeURIComponent(username)}/wishlist`, {
    headers: { "User-Agent": UA },
  });
  if (res.status === 404) throw new Error(`Bandcamp user "${username}" not found.`);
  if (!res.ok) throw new Error(`Failed to load Bandcamp page for "${username}" (${res.status}).`);
  return readFanId(extractDataBlob(await res.text()));
}

export async function fetchAllWishlistItems(
  fanId: number,
  count = 100,
  onProgress?: (loaded: number) => void,
): Promise<WishlistItem[]> {
  const items: WishlistItem[] = [];
  let token = newestToken();
  for (;;) {
    const page = await postJson<{
      items: RawApiItem[];
      more_available: boolean;
      last_token: string;
    }>(WISHLIST_API, { fan_id: fanId, older_than_token: token, count });
    for (const raw of page.items ?? []) items.push(normalizeItem(raw));
    onProgress?.(items.length);
    if (!page.more_available || !page.items?.length) break;
    token = page.last_token;
    await sleep(250);
  }
  return items;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/bandcamp.ts && git commit -m "feat: bandcamp network layer"
```

Expected: tsc clean.

---

## Task 7: `output.ts` + `cli.ts`

**Files:** Create `src/output.ts`, `src/cli.ts`

- [ ] **Step 1: Implement `output.ts`**

```typescript
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { WishlistSnapshot } from "./types";

export async function writeSnapshot(
  snapshot: WishlistSnapshot,
  path: string,
  pretty: boolean,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(snapshot, null, pretty ? 2 : 0));
}
```

- [ ] **Step 2: Implement `cli.ts`**

```typescript
import { parseArgs } from "node:util";
import { resolveFanId, fetchAllWishlistItems } from "./bandcamp";
import { writeSnapshot } from "./output";
import type { WishlistSnapshot } from "./types";

async function main() {
  const { values } = parseArgs({
    options: {
      user: { type: "string", default: "jzstern" },
      out: { type: "string", default: "./output/wishlist.json" },
      count: { type: "string", default: "100" },
      pretty: { type: "boolean", default: false },
    },
  });

  const username = values.user as string;
  const out = values.out as string;
  const count = Number.parseInt(values.count as string, 10) || 100;

  console.log(`Resolving fan id for "${username}"…`);
  const fanId = await resolveFanId(username);

  console.log(`Fetching wishlist (fan_id ${fanId})…`);
  const items = await fetchAllWishlistItems(fanId, count, (n) =>
    process.stdout.write(`\r  ${n} items…`),
  );
  process.stdout.write("\n");

  const snapshot: WishlistSnapshot = {
    source: "bandcamp",
    username,
    fanId,
    fetchedAt: new Date().toISOString(),
    count: items.length,
    items,
  };

  await writeSnapshot(snapshot, out, values.pretty as boolean);
  console.log(`Wrote ${items.length} items → ${out}`);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
```

- [ ] **Step 3: Typecheck, lint, commit**

```bash
bunx tsc --noEmit && bun run check
git add src/output.ts src/cli.ts && git commit -m "feat: output writer and CLI"
```

---

## Task 8: End-to-end acceptance

**Files:** none (verification), then `README.md`

- [ ] **Step 1: Run against the live account**

```bash
bun run src/cli.ts --user jzstern --pretty
```

Expected: progress climbs to ~1347, then `Wrote 1347 items → ./output/wishlist.json`.

- [ ] **Step 2: Sanity-check the output**

```bash
bun -e 'const s=await Bun.file("output/wishlist.json").json(); console.log("count", s.count, "| sample", s.items[0].artist, "—", s.items[0].title); console.log("all have url:", s.items.every(i=>i.url)); console.log("all have artist+title:", s.items.every(i=>i.artist&&i.title));'
```

Expected: `count` matches `items.length`, all items have `url`, `artist`, `title`.

- [ ] **Step 3: Error-path smoke test**

```bash
bun run src/cli.ts --user this-user-does-not-exist-zzz 2>&1 | head -1
```

Expected: `Error: Bandcamp user "this-user-does-not-exist-zzz" not found.` (exit 1)

- [ ] **Step 4: Write `README.md`** (install, usage, output shape, one-line note that it reads only public wishlists)

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "docs: README + verified end-to-end export"
```

---

## Done when

- `bun test` is green (all `parse.ts` behavior covered).
- `bun run src/cli.ts --user jzstern` writes a valid snapshot of ~1347 items.
- Every item has non-empty `artist`, `title`, `url`.
- Unknown-user path fails with a clear message and non-zero exit.
