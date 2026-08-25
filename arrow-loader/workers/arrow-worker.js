// Unified module worker for Arrow decoding (spots, cells, boundaries)
// Keep logs minimal; toggle via DEBUG flag

import { tableFromIPC } from '../../lib/vendor/apache-arrow-12.0.1.esm.js';

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

// Hard-misread fallback for Arrow files without an is_hard_misread column:
// background (the last prob column) wins the argmax. Mirrors the JS-side
// isHardMisread in src/misreads/misreadUtils.js.
function probIsHardMisread(p) {
  if (!p || p.length === 0) return false;
  const last = p.length - 1;
  let maxIdx = 0;
  for (let i = 1; i <= last; i++) {
    if (p[i] > p[maxIdx]) maxIdx = i;
  }
  return maxIdx === last;
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
    const spot_id = getTypedColumn(table, 'spot_id'); // Use actual spot_id from Arrow files
    const omp_score = getTypedColumn(table, 'omp_score');
    const omp_intensity = getTypedColumn(table, 'omp_intensity');
    const is_hard_misread = getTypedColumn(table, 'is_hard_misread');
    const neighbour_array = getListColumnAsArrays(table, 'neighbour_array');
    const neighbour_prob = getListColumnAsArrays(table, 'neighbour_prob');
    const payload = { x, y, z, plane_id, gene_id, spot_id, neighbour_array, neighbour_prob, omp_score, omp_intensity, is_hard_misread };
    // collect transfers
    [x,y,z,plane_id,gene_id,spot_id,omp_score,omp_intensity,is_hard_misread].forEach(a => a && transfers.push(a.buffer));
    shards.push(payload);
  }
  return { shards, transfers: uniqueTransferList(transfers) };
}

async function handleLoadCells(cfg) {
  const { manifestUrl } = cfg; // No more classDictUrl needed
  const manifest = await loadManifest(manifestUrl);
  const shardUrls = resolveShardUrls(manifestUrl, manifest);
  // Concatenate across shards (small columns)
  let Xs=[], Ys=[], Zs=[], cellIds=[];
  let classNameLists=[], probLists=[];
  let geneNameLists=[], geneCountLists=[];

  for (const url of shardUrls) {
    const buf = await fetchArrayBuffer(url);
    const table = decodeFeather(buf);
    const X = getTypedColumn(table, 'X');
    const Y = getTypedColumn(table, 'Y');
    const Z = getTypedColumn(table, 'Z');
    const cell_id = getTypedColumn(table, 'cell_id');

    // Handle list columns
    const class_name_col = table.getChild('class_name');
    const prob_col = table.getChild('prob');
    const gene_names_col = table.getChild('gene_names');
    const gene_counts_col = table.getChild('gene_counts');

    Xs.push(X); Ys.push(Y); Zs.push(Z); cellIds.push(cell_id);

    // Extract list data from Arrow list columns
    if (class_name_col) {
      for (let i = 0; i < class_name_col.length; i++) {
        const listValue = class_name_col.get(i);
        // Convert Arrow List to JavaScript array
        const jsArray = listValue ? Array.from(listValue) : [];
        classNameLists.push(jsArray);
      }
    }

    if (prob_col) {
      for (let i = 0; i < prob_col.length; i++) {
        const listValue = prob_col.get(i);
        // Convert Arrow List to JavaScript array
        const jsArray = listValue ? Array.from(listValue) : [];
        probLists.push(jsArray);
      }
    }

    if (gene_names_col) {
      for (let i = 0; i < gene_names_col.length; i++) {
        const listValue = gene_names_col.get(i);
        // Convert Arrow List to JavaScript array
        const jsArray = listValue ? Array.from(listValue) : [];
        geneNameLists.push(jsArray);
      }
    }

    if (gene_counts_col) {
      for (let i = 0; i < gene_counts_col.length; i++) {
        const listValue = gene_counts_col.get(i);
        // Convert Arrow List to JavaScript array
        const jsArray = listValue ? Array.from(listValue) : [];
        geneCountLists.push(jsArray);
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
  const cell_id = concatTyped(cellIds);
  const transfers = uniqueTransferList([X,Y,Z,cell_id].map(a=>a && a.buffer));

  return { columns: { X, Y, Z, cell_id, class_name: classNameLists, prob: probLists, gene_names: geneNameLists, gene_counts: geneCountLists }, transfers };
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

// Convert one decoded spots table into the flat typed arrays the binary
// ScatterplotLayer consumes. Positions are pre-transformed to tile coordinates
// here so the main thread never touches per-row data.
function buildScatterChunk(table, img, geneIdColors) {
  const x = getTypedColumn(table, 'x');
  const y = getTypedColumn(table, 'y');
  const n = x ? x.length : 0;
  const plane_id = getTypedColumn(table, 'plane_id');
  const gene_id = getTypedColumn(table, 'gene_id');
  const omp_score = getTypedColumn(table, 'omp_score');
  const omp_intensity = getTypedColumn(table, 'omp_intensity');
  const is_hard_misread = getTypedColumn(table, 'is_hard_misread');
  // Only needed to derive the misread flag when the column is absent.
  const neighbour_prob = is_hard_misread ? null : getListColumnAsArrays(table, 'neighbour_prob');

  const positions = new Float32Array(n * 3);
  const colors = new Uint8Array(n * 4);
  const geneIds = new Int32Array(n);
  const planes = new Int32Array(n);
  const scores = new Float32Array(n);
  const intensities = new Float32Array(n);
  const misreadFlags = new Uint8Array(n);

  const width = img && img.width || 256;
  const height = img && img.height || 256;
  const tileSize = img && img.tileSize || 256;
  const maxDim = Math.max(width, height);
  const xAdj = width / maxDim;
  const yAdj = height / maxDim;
  let scoreMin = Infinity, scoreMax = -Infinity;
  let intensityMin = Infinity, intensityMax = -Infinity;
  let intensityFiniteCount = 0;

  for (let i = 0; i < n; i++) {
    positions[3*i + 0] = x[i] * (tileSize / width) * xAdj;
    positions[3*i + 1] = (y ? y[i] : 0) * (tileSize / height) * yAdj;
    positions[3*i + 2] = 0;
    const gid = gene_id ? gene_id[i] : -1;
    geneIds[i] = gid | 0;
    planes[i] = plane_id ? plane_id[i] : 0;
    const s = omp_score ? omp_score[i] : 0;
    scores[i] = s;
    if (Number.isFinite(s)) { if (s < scoreMin) scoreMin = s; if (s > scoreMax) scoreMax = s; }
    const inten = omp_intensity ? omp_intensity[i] : 0;
    intensities[i] = inten;
    if (Number.isFinite(inten)) { intensityFiniteCount++; if (inten < intensityMin) intensityMin = inten; if (inten > intensityMax) intensityMax = inten; }
    const col = (geneIdColors && geneIdColors[gid] && geneIdColors[gid].length === 3) ? geneIdColors[gid] : [255,255,255];
    colors[4*i + 0] = col[0] | 0;
    colors[4*i + 1] = col[1] | 0;
    colors[4*i + 2] = col[2] | 0;
    colors[4*i + 3] = 255;
    misreadFlags[i] = is_hard_misread
      ? (is_hard_misread[i] ? 1 : 0)
      : (probIsHardMisread(neighbour_prob ? neighbour_prob[i] : null) ? 1 : 0);
  }

  return { n, positions, colors, geneIds, planes, scores, intensities, misreadFlags, scoreMin, scoreMax, intensityMin, intensityMax, intensityFiniteCount };
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

// One-shot: decode every shard, concatenate, reply once with the full cache.
async function handleBuildSpotsScatterCache(cfg) {
  const { manifestUrl, img, geneIdColors } = cfg || {};
  const manifest = await loadManifest(manifestUrl);
  const shardUrls = resolveShardUrls(manifestUrl, manifest);
  const chunks = [];
  let total = 0;
  for (const url of shardUrls) {
    const chunk = buildScatterChunk(decodeFeather(await fetchArrayBuffer(url)), img, geneIdColors);
    if (!chunk.n) continue;
    chunks.push(chunk);
    total += chunk.n;
  }

  const positions = new Float32Array(total * 3);
  const colors = new Uint8Array(total * 4);
  const geneIds = new Int32Array(total);
  const planes = new Int32Array(total);
  const scores = new Float32Array(total);
  const intensities = new Float32Array(total);
  const misreadFlags = new Uint8Array(total);
  let scoreMin = Infinity, scoreMax = -Infinity;
  let intensityMin = Infinity, intensityMax = -Infinity;
  let intensityFiniteCount = 0;
  let off = 0;
  for (const c of chunks) {
    positions.set(c.positions, off * 3);
    colors.set(c.colors, off * 4);
    geneIds.set(c.geneIds, off);
    planes.set(c.planes, off);
    scores.set(c.scores, off);
    intensities.set(c.intensities, off);
    misreadFlags.set(c.misreadFlags, off);
    scoreMin = Math.min(scoreMin, c.scoreMin);
    scoreMax = Math.max(scoreMax, c.scoreMax);
    intensityMin = Math.min(intensityMin, c.intensityMin);
    intensityMax = Math.max(intensityMax, c.intensityMax);
    intensityFiniteCount += c.intensityFiniteCount;
    off += c.n;
  }

  // Determine if intensity exists and only build 2D filter pairs when present
  const hasIntensity = intensityFiniteCount > 0;
  let filterPairs = null;
  const transfers = [positions.buffer, colors.buffer, geneIds.buffer, planes.buffer, scores.buffer, misreadFlags.buffer];
  if (hasIntensity) {
    filterPairs = new Float32Array(total * 2);
    for (let i = 0; i < total; i++) { filterPairs[2*i] = scores[i]; filterPairs[2*i+1] = intensities[i]; }
    transfers.push(intensities.buffer, filterPairs.buffer);
  }
  return {
    positions, colors, geneIds, planes, scores, misreadFlags, hasIntensity,
    intensities: hasIntensity ? intensities : undefined,
    filterPairs: hasIntensity ? filterPairs : undefined,
    scoreMin: finiteOr(scoreMin, 0), scoreMax: finiteOr(scoreMax, 1),
    intensityMin: finiteOr(intensityMin, 0), intensityMax: finiteOr(intensityMax, 1),
    transfers
  };
}

// Shards nearest the current plane first, then alternating outwards, so the
// plane the user is looking at lands on screen before the rest of the stack.
function orderShardsCentreOut(manifest, currentPlane) {
  const entries = manifest.shards.map((s, index) => ({ index, plane: s.plane }));
  entries.sort((a, b) => Math.abs(a.plane - currentPlane) - Math.abs(b.plane - currentPlane));
  return entries.map(e => e.index);
}

// Streaming: one progress message per shard as it decodes, then a final done
// message. The main thread appends each chunk into a preallocated cache.
async function handleStreamSpotsScatter(id, type, cfg) {
  const { manifestUrl, img, geneIdColors, currentPlane, concurrency } = cfg || {};
  const manifest = await loadManifest(manifestUrl);
  const shardUrls = resolveShardUrls(manifestUrl, manifest);
  const queue = orderShardsCentreOut(manifest, currentPlane || 0);
  const shardsTotal = queue.length;
  let shardsDone = 0;

  async function drainQueue() {
    while (queue.length > 0) {
      const shardIndex = queue.shift();
      const buf = await fetchArrayBuffer(shardUrls[shardIndex]);
      const chunk = buildScatterChunk(decodeFeather(buf), img, geneIdColors);
      shardsDone++;
      if (!chunk.n) continue;
      const transfers = [chunk.positions.buffer, chunk.colors.buffer, chunk.geneIds.buffer, chunk.planes.buffer, chunk.scores.buffer, chunk.intensities.buffer, chunk.misreadFlags.buffer];
      self.postMessage({ id, ok: true, type, progress: true, shardsDone, shardsTotal, plane: manifest.shards[shardIndex].plane, ...chunk }, transfers);
    }
  }

  // Overlap file reads: several fetches in flight while one shard decodes.
  const workers = [];
  for (let i = 0; i < Math.max(1, concurrency || 1); i++) workers.push(drainQueue());
  await Promise.all(workers);
  self.postMessage({ id, ok: true, type, done: true, shardsTotal });
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  try {
    if (type === 'loadSpots') {
      const { shards, transfers } = await handleLoadSpots(payload);
      self.postMessage({ id, ok: true, type, shards }, transfers);
    } else if (type === 'loadCells') {
      const { columns, transfers } = await handleLoadCells(payload);
      self.postMessage({ id, ok: true, type, columns }, transfers);
    } else if (type === 'loadBoundariesPlane') {
      const { planeId, buffers, transfers } = await handleLoadBoundariesPlane(payload);
      self.postMessage({ id, ok: true, type, planeId, buffers }, transfers);
    } else if (type === 'buildSpotsScatterCache') {
      const { transfers, ...result } = await handleBuildSpotsScatterCache(payload);
      self.postMessage({ id, ok: true, type, ...result }, transfers);
    } else if (type === 'streamSpotsScatter') {
      await handleStreamSpotsScatter(id, type, payload);
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, type, error: String(err && err.message || err) });
  }
};
