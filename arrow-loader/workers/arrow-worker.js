// Unified module worker for Arrow decoding (spots, cells, boundaries)
// Keep logs minimal; toggle via DEBUG flag

import { tableFromIPC } from 'https://cdn.jsdelivr.net/npm/apache-arrow@12.0.1/+esm';

const DEBUG = false;

function log(...args) { if (DEBUG) console.log('[arrow-worker]', ...args); }

async function fetchArrayBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status}`);
  return res.arrayBuffer();
}

function decodeFeather(buf) {
  return tableFromIPC(new Uint8Array(buf));
}

function getTypedColumn(table, name) {
  const col = table.getChild(name);
  if (!col) return null;
  if (col.data.length === 1) return col.data[0].values;
  const total = col.length;
  const sample = col.data[0].values;
  const Ctor = sample.constructor;
  const out = new Ctor(total);
  let off = 0;
  for (const chunk of col.data) { const v = chunk.values; out.set(v, off); off += v.length; }
  return out;
}

function getListColumnAsArrays(table, name) {
  const col = table.getChild(name);
  if (!col) return null;
  const out = new Array(col.length);
  for (let i = 0; i < col.length; i++) {
    const v = col.get(i);
    out[i] = (v && typeof v.toArray === 'function') ? v.toArray() : (v || []);
  }
  return out;
}

function uniqueTransferList(list) {
  const out = [];
  const seen = new Set();
  for (const buf of list) {
    if (!buf) continue;
    if (buf.byteLength === 0) continue; // empty typed arrays often share a singleton buffer
    if (!seen.has(buf)) { seen.add(buf); out.push(buf); }
  }
  return out;
}

function resolveShardUrls(manifestUrl, manifest) {
  const base = new URL(manifestUrl, self.location.href);
  const baseDir = base.href.substring(0, base.href.lastIndexOf('/') + 1);
  return manifest.shards.map(s => new URL(s.url, baseDir).href);
}

async function loadManifest(url) {
  // Expect absolute URL from main thread; fetch directly
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Manifest fetch failed ${url}: ${res.status}`);
  return res.json();
}

async function handleLoadSpots(cfg) {
  const { manifestUrl, includeLists = true } = cfg;
  const manifest = await loadManifest(manifestUrl);
  const shardUrls = resolveShardUrls(manifestUrl, manifest);
  const shards = [];
  const transfers = [];
  for (const url of shardUrls) {
    const buf = await fetchArrayBuffer(url);
    const table = decodeFeather(buf);
    const x = getTypedColumn(table, 'x');
    const y = getTypedColumn(table, 'y');
    const z = getTypedColumn(table, 'z');
    const plane_id = getTypedColumn(table, 'plane_id');
    const gene_id = getTypedColumn(table, 'gene_id');
    const parent_cell_id = getTypedColumn(table, 'parent_cell_id');
    const spot_id_col = table.getChild('spot_id'); // keep in table for now
    const omp_score = getTypedColumn(table, 'omp_score');
    const omp_intensity = getTypedColumn(table, 'omp_intensity');
    const payload = { x, y, z, plane_id, gene_id, parent_cell_id, omp_score, omp_intensity };
    if (includeLists) {
      payload.neighbour_array = getListColumnAsArrays(table, 'neighbour_array');
      payload.neighbour_prob = getListColumnAsArrays(table, 'neighbour_prob');
    }
    // collect transfers
    [x,y,z,plane_id,gene_id,parent_cell_id,omp_score,omp_intensity].forEach(a => a && transfers.push(a.buffer));
    shards.push(payload);
  }
  return { shards, transfers: uniqueTransferList(transfers) };
}

async function handleLoadCells(cfg) {
  const { manifestUrl, classDictUrl } = cfg;
  const manifest = await loadManifest(manifestUrl);
  const shardUrls = resolveShardUrls(manifestUrl, manifest);
  // Concatenate across shards (small columns)
  let Xs=[], Ys=[], Zs=[], classIds=[], cellIds=[];
  let classNameStrs=[]; let probStrs=[];
  for (const url of shardUrls) {
    const buf = await fetchArrayBuffer(url);
    const table = decodeFeather(buf);
    const X = getTypedColumn(table, 'X');
    const Y = getTypedColumn(table, 'Y');
    const Z = getTypedColumn(table, 'Z');
    const class_id = getTypedColumn(table, 'class_id');
    const cell_id = getTypedColumn(table, 'cell_id');
    const class_name_col = table.getChild('ClassName');
    const prob_col = table.getChild('Prob');
    Xs.push(X); Ys.push(Y); Zs.push(Z); classIds.push(class_id); cellIds.push(cell_id);
    if (class_name_col) {
      for (let i = 0; i < class_name_col.length; i++) {
        const v = class_name_col.get(i);
        classNameStrs.push(typeof v === 'string' ? v : (v ? String(v) : ''));
      }
    }
    if (prob_col) {
      for (let i = 0; i < prob_col.length; i++) {
        const v = prob_col.get(i);
        probStrs.push(typeof v === 'string' ? v : (v != null ? String(v) : ''));
      }
    }
  }
  // Flatten typed chunks
  function concatTyped(chunks) {
    if (chunks.length === 1) return chunks[0];
    const total = chunks.reduce((n,a)=>n+(a?a.length:0),0);
    const Ctor = chunks.find(Boolean)?.constructor || Float32Array;
    const out = new Ctor(total); let off=0;
    for (const a of chunks) { if (!a) continue; out.set(a, off); off += a.length; }
    return out;
  }
  const X = concatTyped(Xs), Y = concatTyped(Ys), Z = concatTyped(Zs);
  const class_id = concatTyped(classIds), cell_id = concatTyped(cellIds);
  const transfers = uniqueTransferList([X,Y,Z,class_id,cell_id].map(a=>a && a.buffer));
  let classDict = null;
  if (classDictUrl) {
    const res = await fetch(classDictUrl); if (res.ok) classDict = await res.json();
  }
  return { columns: { X, Y, Z, class_id, cell_id, class_name_str: classNameStrs, prob_str: probStrs }, classDict, transfers };
}

async function handleLoadBoundariesPlane(cfg) {
  const { manifestUrl, planeId } = cfg;
  const t0 = performance.now();
  const manifest = await loadManifest(manifestUrl);
  const t1 = performance.now();
  const shardUrls = resolveShardUrls(manifestUrl, manifest);
  // Select only the per-plane file to fetch (one file per plane)
  let targetUrl = null;
  if (manifest && Array.isArray(manifest.shards)) {
    const exact = manifest.shards.find(s => Number(s.plane) === Number(planeId));
    if (exact) {
      const base = new URL(manifestUrl, self.location.href);
      targetUrl = new URL(exact.url, base).href;
    }
  }
  if (!targetUrl) {
    const padded = String(planeId).padStart(2, '0');
    targetUrl = shardUrls.find(u => u.includes(`plane_${padded}`)) || shardUrls.find(u => u.endsWith(`_${padded}.feather`));
  }
  if (!targetUrl) throw new Error(`No Arrow shard found for plane ${planeId}`);
  // Collect polygons for planeId and build binary buffers
  const polyXs = []; // array of arrays
  const polyYs = [];
  const labels = [];
  let fetchedBytes = 0;
  let tFetch = 0, tDecode = 0;
  for (const url of [targetUrl]) {
    const f0 = performance.now();
    const buf = await fetchArrayBuffer(url);
    const f1 = performance.now();
    fetchedBytes += buf.byteLength || 0;
    tFetch += (f1 - f0);
    const d0 = performance.now();
    const table = decodeFeather(buf);
    const d1 = performance.now();
    tDecode += (d1 - d0);
    const planeCol = getTypedColumn(table, 'plane_id');
    const labelCol = getTypedColumn(table, 'label');
    const xListCol = table.getChild('x_list');
    const yListCol = table.getChild('y_list');
    const n = xListCol ? xListCol.length : 0;
    for (let i = 0; i < n; i++) {
      if (planeCol && planeCol[i] !== planeId) continue;
      let xs = xListCol.get(i); let ys = yListCol.get(i);
      xs = xs && xs.toArray ? xs.toArray() : (xs || []);
      ys = ys && ys.toArray ? ys.toArray() : (ys || []);
      if (xs.length < 2) continue;
      polyXs.push(xs); polyYs.push(ys); labels.push(labelCol ? labelCol[i] : -1);
    }
  }
  // Build positions/startIndices
  const a0 = performance.now();
  const numPolys = polyXs.length;
  let totalPts = 0; for (const xs of polyXs) totalPts += xs.length;
  const positions = new Float32Array(totalPts * 2);
  const startIndices = new Uint32Array(numPolys + 1);
  const outLabels = new Int32Array(numPolys);
  let off = 0;
  for (let i = 0; i < numPolys; i++) {
    startIndices[i] = off;
    const xs = polyXs[i], ys = polyYs[i];
    for (let j = 0; j < xs.length; j++) {
      positions[2*(off+j)+0] = xs[j];
      positions[2*(off+j)+1] = ys[j];
    }
    outLabels[i] = labels[i] || -1;
    off += xs.length;
  }
  startIndices[numPolys] = off;
  const a1 = performance.now();
  const transfers = uniqueTransferList([positions.buffer, startIndices.buffer, outLabels.buffer]);
  const timings = {
    fetchManifestMs: (t1 - t0),
    fetchShardsMs: tFetch,
    decodeShardsMs: tDecode,
    assembleBuffersMs: (a1 - a0),
    fetchedBytes
  };
  return { planeId, buffers: { length: numPolys, positions, startIndices, labels: outLabels }, timings, transfers };
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  try {
    if (type === 'loadSpots') {
      const { shards, transfers } = await handleLoadSpots(payload);
      self.postMessage({ id, ok: true, type, shards }, transfers);
    } else if (type === 'loadCells') {
      const { columns, classDict, transfers } = await handleLoadCells(payload);
      self.postMessage({ id, ok: true, type, columns, classDict }, transfers);
    } else if (type === 'loadBoundariesPlane') {
      const { planeId, buffers, transfers } = await handleLoadBoundariesPlane(payload);
      self.postMessage({ id, ok: true, type, planeId, buffers }, transfers);
    } else if (type === 'buildSpotsScatterCache') {
      // Build binary scatter cache for spots: positions (tile coords), colors (RGBA), geneIds, planes
      const { manifestUrl, img, geneIdColors } = payload || {};
      const manifest = await loadManifest(manifestUrl);
      const shardUrls = resolveShardUrls(manifestUrl, manifest);
      let total = 0;
      const shards = [];
      for (const url of shardUrls) {
        const buf = await fetchArrayBuffer(url);
        const table = decodeFeather(buf);
        const x = getTypedColumn(table, 'x');
        const y = getTypedColumn(table, 'y');
        const plane_id = getTypedColumn(table, 'plane_id');
        const gene_id = getTypedColumn(table, 'gene_id');
        const n = x ? x.length : 0;
        if (!n) continue;
        shards.push({ x, y, plane_id, gene_id, n });
        total += n;
      }
      const positions = new Float32Array(total * 3);
      const colors = new Uint8Array(total * 4);
      const geneIds = new Int32Array(total);
      const planes = new Int32Array(total);
      const width = img && img.width || 256;
      const height = img && img.height || 256;
      const tileSize = img && img.tileSize || 256;
      const maxDim = Math.max(width, height);
      const xAdj = width / maxDim;
      const yAdj = height / maxDim;
      let off = 0;
      for (const sh of shards) {
        const n = sh.n || 0;
        for (let i = 0; i < n; i++) {
          const X = sh.x[i];
          const Y = sh.y ? sh.y[i] : 0;
          const tx = X * (tileSize / width) * xAdj;
          const ty = Y * (tileSize / height) * yAdj;
          positions[3*off + 0] = tx;
          positions[3*off + 1] = ty;
          positions[3*off + 2] = 0;
          const gid = sh.gene_id ? sh.gene_id[i] : -1;
          geneIds[off] = gid | 0;
          planes[off] = sh.plane_id ? sh.plane_id[i] : 0;
          const col = (geneIdColors && geneIdColors[gid] && geneIdColors[gid].length === 3) ? geneIdColors[gid] : [255,255,255];
          colors[4*off + 0] = col[0] | 0;
          colors[4*off + 1] = col[1] | 0;
          colors[4*off + 2] = col[2] | 0;
          colors[4*off + 3] = 255;
          off++;
        }
      }
      const transfers = [positions.buffer, colors.buffer, geneIds.buffer, planes.buffer];
      self.postMessage({ id, ok: true, type, positions, colors, geneIds, planes }, transfers);
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, type, error: String(err && err.message || err) });
  }
};
