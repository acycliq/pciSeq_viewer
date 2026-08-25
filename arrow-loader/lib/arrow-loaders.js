// Facade to interact with the Arrow module worker

let worker = null;
let nextId = 1;
const pending = new Map();
let config = null;

function ensureWorker() {
  if (worker) return worker;
  // Resolve worker URL relative to this module file, not the document
  const workerUrl = new URL('../workers/arrow-worker.js', import.meta.url);
  const w = new Worker(workerUrl, { type: 'module' });
  w.onmessage = (e) => {
    const { id, ok, type, progress, ...rest } = e.data || {};
    const resolver = pending.get(id);
    if (!resolver) return;
    // Streaming handlers post many progress messages before their final reply.
    if (ok && progress) {
      if (resolver.onProgress) resolver.onProgress(rest);
      return;
    }
    pending.delete(id);
    if (ok) resolver.resolve(rest); else resolver.reject(new Error(rest.error || 'Worker error'));
  };
  w.onerror = (err) => {
    // A worker-level error (e.g. a failed import) is fatal: the worker is dead.
    // Reject everyone waiting, then drop it so the next call() spins up a fresh
    // worker instead of posting into a dead one and hanging forever.
    console.error('[arrow-loader] Worker error:', err);
    const error = new Error(err?.message || 'Arrow worker crashed');
    for (const [, { reject }] of pending) reject(error);
    pending.clear();
    try { w.terminate(); } catch {}
    if (worker === w) worker = null;
  };
  worker = w;
  return worker;
}

export function initArrow(configIn) {
  config = configIn || {};
  ensureWorker();
}

function call(type, payload, onProgress = null) {
  const w = ensureWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    try {
      w.postMessage({ id, type, payload });
    } catch (e) {
      pending.delete(id);
      reject(e);
    }
  });
}

export async function loadSpots() {
  const manifestUrl = config?.spotsManifest ? new URL(config.spotsManifest, window.location.href).href : null;
  if (!manifestUrl) throw new Error('spotsManifest not configured');
  const res = await call('loadSpots', { manifestUrl, includeLists: true });
  // Optionally fetch gene dict (id -> name)
  let geneDict = null;
  if (config?.spotsGeneDict) {
    try {
      const url = new URL(config.spotsGeneDict, window.location.href).href;
      const r = await fetch(url);
      if (r.ok) geneDict = await r.json();
    } catch {}
  }
  return { ...res, geneDict };
}

export async function loadCells() {
  const manifestUrl = config?.cellsManifest ? new URL(config.cellsManifest, window.location.href).href : null;
  if (!manifestUrl) throw new Error('cellsManifest not configured');
  return call('loadCells', { manifestUrl });
}

export async function loadBoundariesPlane(planeId) {
  const manifestUrl = config?.boundariesManifest ? new URL(config.boundariesManifest, window.location.href).href : null;
  if (!manifestUrl) throw new Error('boundariesManifest not configured');
  return call('loadBoundariesPlane', { manifestUrl, planeId });
}

// Build pre-transformed scatter (binary) cache for spots inside the worker and transfer typed arrays
// payload: { manifestUrl, img: { width, height, tileSize }, geneIdColors: { [id]: [r,g,b] } }
export async function buildSpotsScatterCache({ manifestUrl, img, geneIdColors }) {
  if (!manifestUrl) throw new Error('spots manifestUrl is required');
  const { positions, colors, planes, geneIds, scores, intensities, filterPairs, misreadFlags, scoreMin, scoreMax, intensityMin, intensityMax, hasIntensity } = await call('buildSpotsScatterCache', { manifestUrl, img, geneIdColors });
  return { positions, colors, planes, geneIds, scores, intensities, filterPairs, misreadFlags, scoreMin, scoreMax, intensityMin, intensityMax, hasIntensity };
}

// Stream the spots scatter cache shard by shard. onChunk receives one decoded
// shard at a time ({ n, positions, colors, geneIds, planes, scores, intensities,
// misreadFlags, scoreMin, scoreMax, intensityMin, intensityMax, plane, shardsDone,
// shardsTotal }); the returned promise resolves once every shard has been sent.
// payload: { manifestUrl, img, geneIdColors, concurrency }
export function streamSpotsScatter({ manifestUrl, img, geneIdColors, concurrency }, onChunk) {
  if (!manifestUrl) throw new Error('spots manifestUrl is required');
  return call('streamSpotsScatter', { manifestUrl, img, geneIdColors, concurrency }, onChunk);
}
