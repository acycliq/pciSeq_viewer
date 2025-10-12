// Fetch and cache Arrow shard manifests and resolve shard URLs relative to the manifest

const manifestCache = new Map();

export async function getManifest(manifestUrl) {
  if (manifestCache.has(manifestUrl)) return manifestCache.get(manifestUrl);
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`Failed to fetch manifest ${manifestUrl}: ${res.status}`);
  const json = await res.json();
  manifestCache.set(manifestUrl, json);
  return json;
}

export function resolveShardUrls(manifestUrl, manifest) {
  const base = new URL(manifestUrl, window.location.href);
  const baseDir = base.href.substring(0, base.href.lastIndexOf('/') + 1);
  return manifest.shards.map(s => ({ url: new URL(s.url, baseDir).href, rows: s.rows }));
}

export function clearManifestCache() { manifestCache.clear(); }

