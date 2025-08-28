// Spatial Index Worker (Arrow boundaries only)
// Builds per-cell bounds across all planes and an RBush tree entirely off the main thread.
// Posts back a serialized RBush tree via toJSON for main-thread rehydration.

import { tableFromIPC } from 'https://cdn.jsdelivr.net/npm/apache-arrow@12.0.1/+esm';
import RBush from 'https://cdn.jsdelivr.net/npm/rbush@3.0.1/+esm';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function fetchFeather(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch feather ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function resolveShardUrls(manifestUrl, manifest) {
  const base = new URL(manifestUrl, self.location.href);
  const baseDir = base.href.substring(0, base.href.lastIndexOf('/') + 1);
  return manifest.shards.map(s => ({ url: new URL(s.url, baseDir).href, plane: Number(s.plane ?? -1) }));
}

// Transform to tile space (duplicate of app transformToTileCoordinates)
function toTileXY(x, y, img) {
  const { width, height, tileSize } = img;
  const maxDimension = Math.max(width, height);
  const xAdj = width / maxDimension;
  const yAdj = height / maxDimension;
  return [ x * (tileSize / width) * xAdj, y * (tileSize / height) * yAdj ];
}

function getList(table, name) {
  const col = table.getChild(name);
  const out = [];
  if (!col) return out;
  for (let i = 0; i < col.length; i++) {
    const v = col.get(i);
    out.push(v && typeof v.toArray === 'function' ? v.toArray() : (v || []));
  }
  return out;
}

async function buildIndexArrow(cfg) {
  const { manifestUrl, img } = cfg;
  const manifest = await fetchJSON(manifestUrl);
  const shards = resolveShardUrls(manifestUrl, manifest);
  // cellId -> { minX, minY, maxX, maxY, planes:Set<number> }
  const cellMap = new Map();

  // Process shards sequentially; they are per-plane files
  for (const { url, plane } of shards) {
    try {
      const buf = await fetchFeather(url);
      const table = tableFromIPC(buf);
      const xLists = getList(table, 'x_list');
      const yLists = getList(table, 'y_list');
      const labelsCol = table.getChild('label');
      const planeCol = table.getChild('plane_id');
      const n = xLists.length;
      for (let i = 0; i < n; i++) {
        const xs = xLists[i];
        const ys = yLists[i];
        if (!xs || !ys || xs.length < 2) continue;
        const label = labelsCol ? Number(labelsCol.get(i)) : -1;
        if (label < 0) continue;
        const planeId = planeCol ? Number(planeCol.get(i)) : (Number.isFinite(plane) ? plane : -1);
        // Compute bounds in tile space
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let k = 0; k < xs.length; k++) {
          const [tx, ty] = toTileXY(Number(xs[k]), Number(ys[k]), img);
          if (tx < minX) minX = tx;
          if (tx > maxX) maxX = tx;
          if (ty < minY) minY = ty;
          if (ty > maxY) maxY = ty;
        }
        if (!cellMap.has(label)) cellMap.set(label, { minX, minY, maxX, maxY, planes: new Set() });
        const acc = cellMap.get(label);
        acc.minX = Math.min(acc.minX, minX);
        acc.minY = Math.min(acc.minY, minY);
        acc.maxX = Math.max(acc.maxX, maxX);
        acc.maxY = Math.max(acc.maxY, maxY);
        if (Number.isFinite(planeId) && planeId >= 0) acc.planes.add(planeId);
      }
      // Yield to event loop after each shard
      await new Promise(r => setTimeout(r, 0));
    } catch (e) {
      // Skip missing/empty shards
      // eslint-disable-next-line no-console
      console.warn('Index worker: shard error', url, e.message || e);
    }
  }

  // Build RBush in worker
  const tree = new RBush();
  const boxes = [];
  for (const [cellId, b] of cellMap.entries()) {
    boxes.push({ minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY, cellId, planes: Array.from(b.planes) });
  }
  tree.load(boxes);
  const json = tree.toJSON();
  postMessage({ type: 'indexReady', rtree: json, cells: boxes.length });
}

self.onmessage = async (e) => {
  const { type, payload } = e.data || {};
  try {
    if (type === 'build') {
      await buildIndexArrow(payload);
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (err) {
    postMessage({ type: 'error', error: String(err && err.message || err) });
  }
};

