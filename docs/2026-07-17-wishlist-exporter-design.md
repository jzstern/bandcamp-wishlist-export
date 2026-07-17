# Bandcamp Wishlist Exporter — Design

**Date:** 2026-07-17
**Status:** Approved (design), verified against live data

## Goal

A small CLI that reads a public Bandcamp wishlist and writes it to a single,
easy-to-parse JSON file. This is step 1 of a larger toolkit; the JSON it produces
is the input a later step would use to search for releases elsewhere.

Non-goals (explicitly out of scope for this tool): authentication/private
wishlists, downloading audio, incremental diffing, and any Soulseek integration.

## How Bandcamp exposes a wishlist (verified 2026-07-17)

A user's public wishlist lives at `https://bandcamp.com/<username>/wishlist`.
Two facts were confirmed against the live account `jzstern` (fan_id 1238758,
1347 wishlist items):

1. The profile HTML embeds a JSON blob in `<div id="pagedata" data-blob="...">`.
   The blob is HTML-entity-escaped. It contains `fan_data.fan_id`,
   `wishlist_data.item_count`, and a first-page cache — but that cache uses a
   *different, thinner* item shape than the paging API and lacks `added` dates.

2. Bandcamp's own web UI pages the wishlist through an unauthenticated endpoint:

   ```
   POST https://bandcamp.com/api/fancollection/1/wishlist_items
   Content-Type: application/json
   { "fan_id": <int>, "older_than_token": "<token>", "count": <int> }
   ```

   Response: `{ items: [...], more_available: bool, last_token: "<token>", ... }`.
   Each item is rich and uniform, including `added` ("30 Jun 2026 21:25:32 GMT"),
   `item_art_url`, `item_title`, `band_name`, `item_url`, `item_type`, price, etc.

**Key finding that shapes the design:** a *synthetic* `older_than_token` with a
far-future timestamp (`"9999999999:9999999999:a::"`) returns the true newest
items first. This means we can page the **entire** wishlist through the clean API
and never touch the thin embedded cache — we only scrape the page for `fan_id`.

Token format is `<unix_ts>:<item_id>:<type>::`; we treat it as opaque and just
feed each response's `last_token` back as the next `older_than_token`.

## Approach

Chosen: **HTTP + internal fan API**, zero runtime dependencies.
Rejected: headless browser (heavy, unnecessary — the data is plain JSON) and a
browser-fallback hybrid (more code than this basic tool warrants).

## Flow

```
cli.ts  --user jzstern  --out ./output/wishlist.json
   │
   ├─ bandcamp.ts: GET /<user>/wishlist  → parse.ts extracts fan_id from data-blob
   │
   ├─ bandcamp.ts: loop POST /api/fancollection/1/wishlist_items
   │     start older_than_token = synthetic "newest" token
   │     each page: normalize items, then older_than_token = resp.last_token
   │     stop when more_available === false
   │     polite ~250ms delay between pages; retry w/ backoff on 429/5xx
   │
   └─ output.ts: write { source, username, fanId, fetchedAt, count, items[] }
```

At 1347 items and a default page `count` of 100, that's ~14 requests.

## Modules

- **`src/types.ts`** — `WishlistItem`, `WishlistSnapshot`.
- **`src/parse.ts`** — pure functions, the unit-tested core:
  - `extractDataBlob(html) → object` (find attribute, HTML-unescape, JSON.parse)
  - `readFanId(blob) → number`
  - `normalizeItem(apiItem) → WishlistItem`
  - `newestToken() → string` (synthetic starting token)
- **`src/bandcamp.ts`** — all network I/O: `resolveFanId(username)` and
  `fetchAllWishlistItems(fanId)` (the paging loop). Depends on `parse.ts`.
- **`src/output.ts`** — `writeSnapshot(snapshot, path, { pretty })`; creates
  parent dirs.
- **`src/cli.ts`** — `util.parseArgs` for flags, orchestration, human-readable
  summary to stdout.

## Output shape

```jsonc
{
  "source": "bandcamp",
  "username": "jzstern",
  "fanId": 1238758,
  "fetchedAt": "2026-07-17T21:00:00.000Z",
  "count": 1347,
  "items": [
    {
      "itemId": 2405228465,
      "itemType": "album",              // "album" | "track"
      "artist": "Sub Basics & Pugilist",
      "title": "Control",
      "url": "https://pugilist.bandcamp.com/album/control",
      "artUrl": "https://f4.bcbits.com/img/a0300676210_9.jpg",
      "addedAt": "2026-07-17T07:21:17.000Z"   // ISO 8601, parsed from `added`
    }
  ]
}
```

`artist` + `title` + `url` are the fields a later search step keys on. `price`
and `currency` are trivially available from the API and can be added later if a
"name-your-price" filter becomes useful; omitted now (YAGNI).

## CLI

```
bun run src/cli.ts --user <username> [--out ./output/wishlist.json] [--pretty] [--count 100]
```

Defaults: `--user jzstern`, `--out ./output/wishlist.json`, pretty off, count 100.
The username is not a secret, so it is a plain flag (no Doppler).

## Error handling

- **Unknown user (404 on page):** clear message naming the username.
- **`data-blob`/`fan_id` missing:** fail with "couldn't parse Bandcamp page —
  their markup may have changed" (single known place to fix).
- **Private/empty wishlist:** `item_count` 0 or API returns no items → write an
  empty snapshot and warn, rather than erroring.
- **HTTP 429/5xx during paging:** retry up to 3× with exponential backoff; if a
  page still fails, abort with an error and do **not** write a partial file.

## Testing (TDD)

- `parse.ts` is pure and covered by unit tests against saved fixtures in
  `test/fixtures/`: a real captured `data-blob` snippet and one real API
  response. Tests: blob extraction + unescape, `fan_id` read, item normalization
  (album and track), `added`→ISO conversion, art URL passthrough.
- `bandcamp.ts` paging is verified once end-to-end against the live `jzstern`
  account as the final acceptance step (expect ~1347 items).
```
