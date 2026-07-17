# bandcamp-wishlist-export

Export a **public** Bandcamp wishlist to a single, easy-to-parse JSON file.

A zero-dependency [Bun](https://bun.sh) + TypeScript CLI. It reads the wishlist
the same way Bandcamp's own web UI does: it fetches the public profile page once
to resolve the account's `fan_id`, then pages through Bandcamp's `wishlist_items`
API until the whole list is collected. No login, no credentials — it only works
with wishlists that are public (the Bandcamp default).

## Requirements

- [Bun](https://bun.sh) 1.x

## Install

```bash
git clone https://github.com/jzstern/bandcamp-wishlist-export.git
cd bandcamp-wishlist-export
bun install
```

## Usage

```bash
bun run src/cli.ts --user <username> [options]
```

| Flag       | Default                  | Description                                             |
| ---------- | ------------------------ | ------------------------------------------------------- |
| `--user`   | (required)               | Bandcamp username (the `bandcamp.com/<username>` part). |
| `--out`    | `./output/wishlist.json` | Output file path. Parent dirs are created.              |
| `--pretty` | off                      | Pretty-print the JSON (2-space indent).                 |
| `--count`  | `100`                    | Items fetched per API request.                          |
| `--help`   |                          | Show usage.                                             |

Example:

```bash
bun run src/cli.ts --user jzstern --pretty
# Resolving fan id for "jzstern"…
# Fetching wishlist (fan_id 1238758)…
#   1347 items…
# Wrote 1347 items → ./output/wishlist.json
```

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
      "itemType": "album",          // "album" | "track"
      "artist": "Sub Basics & Pugilist",
      "title": "Control",
      "url": "https://pugilist.bandcamp.com/album/control",
      "artUrl": "https://f4.bcbits.com/img/a2643044056_9.jpg",
      "addedAt": "2026-07-17T07:21:17.000Z"  // ISO 8601, or null
    }
  ]
}
```

## Development

```bash
bun test          # unit tests for the pure parsing layer
bunx tsc --noEmit # typecheck
bun run check     # Biome lint + format
```

`src/parse.ts` holds the pure, unit-tested parsing functions (tested against real
captured fixtures in `test/fixtures/`). All network I/O is isolated in
`src/bandcamp.ts`, so if Bandcamp's internal API ever changes, there's a single
place to fix.

## Notes

- The wishlist API is Bandcamp's own undocumented internal endpoint; it can change
  without notice. Parsing failures surface a clear error rather than writing a
  partial file.
- A wishlist set to private returns no items — make it public to export it.
- Be a good citizen: the tool paces its requests (~4/sec) and fetches only what
  the public web UI already serves.

## License

[MIT](LICENSE)
