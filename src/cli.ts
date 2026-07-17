import { parseArgs } from "node:util";
import { fetchAllWishlistItems, resolveFanId } from "./bandcamp";
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
