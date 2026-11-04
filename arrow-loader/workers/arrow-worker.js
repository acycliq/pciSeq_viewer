// Unified module worker for Arrow decoding (spots, cells, boundaries)
// Keep logs minimal; toggle via DEBUG flag

import { tableFromIPC } from '../../lib/vendor/apache-arrow-12.0.1.esm.js';
import { readListColumn, listRow } from '../lib/listColumn.js';

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

// The raw columns of one spots shard. List columns come as { values, offsets },
// see arrow-loader/lib/listColumn.js. is_hard_misread is null in files written
// before that column existed.
function readSpotColumns(table) {
  return {
    x: getTypedColumn(table, 'x'),
    y: getTypedColumn(table, 'y'),
    z: getTypedColumn(table, 'z'),
    plane_id: getTypedColumn(table, 'plane_id'),
    gene_id: getTypedColumn(table, 'gene_id'),
    spot_id: getTypedColumn(table, 'spot_id'),
    omp_score: getTypedColumn(table, 'omp_score'),
    omp_intensity: getTypedColumn(table, 'omp_intensity'),
    is_hard_misread: getTypedColumn(table, 'is_hard_misread'),
    neighbour_array: readListColumn(table, 'neighbour_array'),
    neighbour_prob: readListColumn(table, 'neighbour_prob')
  };
}

// Every ArrayBuffer behind the columns, so postMessage moves them to the main
// thread instead of copying. Typed columns carry .buffer; list columns carry
// values and offsets.
function columnBuffers(columns) {
  const buffers = [];
  for (const column of Object.values(columns)) {
    if (!column) continue;
    if (column.buffer) {
      buffers.push(column.buffer);
    } else {
      buffers.push(column.values.buffer, column.offsets.buffer);
    }
  }
  return buffers;
}

// Hard-misread fallback for Arrow files without an is_hard_misread column:
// background (the last prob column) wins the argmax.
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

// Convert the raw columns of one spots shard into the flat typed arrays the
// point layer consumes (src/layers/spotPointLayer.js). Positions are
// pre-transformed to tile coordinates here so the main thread never touches
// per-row data. Colours are not per spot: the layer looks them up by gene id.
function buildScatterChunk(columns, img) {
  const { x, y, plane_id, gene_id, omp_score, omp_intensity, is_hard_misread, neighbour_prob } = columns;
  const n = x ? x.length : 0;

  const positions = new Float32Array(n * 3);
  const geneIds = new Float32Array(n); // float attributes on the GPU, see src/layers/spotPointLayer.js
  const planes = new Float32Array(n);
  const filterPairs = new Float32Array(n * 2); // score and intensity side by side, the filter reads both
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
    geneIds[i] = gid;
    planes[i] = plane_id ? plane_id[i] : 0;
    const s = omp_score ? omp_score[i] : 0;
    if (Number.isFinite(s)) { if (s < scoreMin) scoreMin = s; if (s > scoreMax) scoreMax = s; }
    const inten = omp_intensity ? omp_intensity[i] : 0;
    filterPairs[2*i] = s;
    filterPairs[2*i + 1] = inten;
    if (Number.isFinite(inten)) { intensityFiniteCount++; if (inten < intensityMin) intensityMin = inten; if (inten > intensityMax) intensityMax = inten; }
    misreadFlags[i] = is_hard_misread
      ? (is_hard_misread[i] ? 1 : 0)
      : (probIsHardMisread(listRow(neighbour_prob, i)) ? 1 : 0);
  }

  return { n, positions, geneIds, planes, filterPairs, misreadFlags, scoreMin, scoreMax, intensityMin, intensityMax, intensityFiniteCount };
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

// Streaming: one progress message per shard as it decodes, then a final done
// message. Shards go in manifest order (plane 0 upwards for per-plane shards);
// the main thread appends each chunk into a preallocated cache. Each message
// also carries the shard's raw columns, so the files are read once and the
// main thread builds the per-spot objects from them.
async function handleStreamSpotsScatter(id, type, cfg) {
  const { manifestUrl, img, concurrency } = cfg || {};
  const manifest = await loadManifest(manifestUrl);
  const shardUrls = resolveShardUrls(manifestUrl, manifest);
  const queue = shardUrls.map((url, index) => index);
  const shardsTotal = queue.length;
  let shardsDone = 0;

  async function drainQueue() {
    while (queue.length > 0) {
      const shardIndex = queue.shift();
      const buf = await fetchArrayBuffer(shardUrls[shardIndex]);
      const table = decodeFeather(buf);
      shardsDone++;
      if (table.numRows === 0) continue;
      const columns = readSpotColumns(table);
      const chunk = buildScatterChunk(columns, img);
      // Files written before the is_hard_misread column existed: the flag the
      // scatter chunk derived from the probabilities serves as the column.
      if (!columns.is_hard_misread) columns.is_hard_misread = chunk.misreadFlags;
      const transfers = uniqueTransferList([
        chunk.positions.buffer, chunk.geneIds.buffer, chunk.planes.buffer,
        chunk.filterPairs.buffer, chunk.misreadFlags.buffer,
        ...columnBuffers(columns)
      ]);
      self.postMessage({ id, ok: true, type, progress: true, shardIndex, shardsDone, shardsTotal, plane: manifest.shards[shardIndex].plane, ...chunk, columns }, transfers);
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
    if (type === 'loadCells') {
      const { columns, transfers } = await handleLoadCells(payload);
      self.postMessage({ id, ok: true, type, columns }, transfers);
    } else if (type === 'loadBoundariesPlane') {
      const { planeId, buffers, transfers } = await handleLoadBoundariesPlane(payload);
      self.postMessage({ id, ok: true, type, planeId, buffers }, transfers);
    } else if (type === 'streamSpotsScatter') {
      await handleStreamSpotsScatter(id, type, payload);
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, type, error: String(err && err.message || err) });
  }
};
