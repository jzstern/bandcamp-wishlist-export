import {
  extractDataBlob,
  newestToken,
  normalizeItem,
  readFanId,
} from "./parse";
import type { RawApiItem, WishlistItem } from "./types";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const WISHLIST_API = "https://bandcamp.com/api/fancollection/1/wishlist_items";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postJson<T>(
  url: string,
  body: unknown,
  attempt = 1,
): Promise<T> {
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
  const res = await fetch(
    `https://bandcamp.com/${encodeURIComponent(username)}/wishlist`,
    { headers: { "User-Agent": UA } },
  );
  if (res.status === 404)
    throw new Error(`Bandcamp user "${username}" not found.`);
  if (!res.ok) {
    throw new Error(
      `Failed to load Bandcamp page for "${username}" (${res.status}).`,
    );
  }
  return readFanId(extractDataBlob(await res.text()));
}

interface WishlistPage {
  items: RawApiItem[];
  more_available: boolean;
  last_token: string;
}

export async function fetchAllWishlistItems(
  fanId: number,
  count = 100,
  onProgress?: (loaded: number) => void,
): Promise<WishlistItem[]> {
  const items: WishlistItem[] = [];
  let token = newestToken();
  for (;;) {
    const page = await postJson<WishlistPage>(WISHLIST_API, {
      fan_id: fanId,
      older_than_token: token,
      count,
    });
    for (const raw of page.items ?? []) items.push(normalizeItem(raw));
    onProgress?.(items.length);
    if (!page.more_available || !page.items?.length) break;
    token = page.last_token;
    await sleep(250);
  }
  return items;
}
