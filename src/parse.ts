const DATA_BLOB_PATTERN = /id="pagedata"[^>]*\bdata-blob="([^"]*)"/;

function unescapeHtmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

// biome-ignore lint/suspicious/noExplicitAny: page data shape is defined by Bandcamp, not us
export function extractDataBlob(html: string): any {
  const match = DATA_BLOB_PATTERN.exec(html);
  if (!match || match[1] === undefined) {
    throw new Error("Could not find a #pagedata element with a data-blob attribute");
  }

  const json = unescapeHtmlEntities(match[1]);
  try {
    return JSON.parse(json);
  } catch {
    throw new Error("Found data-blob attribute but could not parse it as JSON; Bandcamp's markup may have changed");
  }
}

// biome-ignore lint/suspicious/noExplicitAny: page data shape is defined by Bandcamp, not us
export function readFanId(blob: any): number {
  const fanId = blob?.fan_data?.fan_id;
  if (typeof fanId !== "number") {
    throw new Error("fan_id not found");
  }
  return fanId;
}

export function parseBandcampDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return null;
  }

  return new Date(ms).toISOString();
}
