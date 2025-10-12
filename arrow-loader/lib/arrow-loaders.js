// Facade to interact with the Arrow module worker

let worker = null;
let nextId = 1;
const pending = new Map();
let config = null;

export function initArrow(configIn) {
  config = configIn || {};
  if (!worker) {
    // Resolve worker URL relative to this module file, not the document
    const workerUrl = new URL('../workers/arrow-worker.js', import.meta.url);
    worker = new Worker(workerUrl, { type: 'module' });
    worker.onmessage = (e) => {
      const { id, ok, type, ...rest } = e.data || {};
      const resolver = pending.get(id);
      if (!resolver) return;
      pending.delete(id);
      if (ok) resolver.resolve(rest); else resolver.reject(new Error(rest.error || 'Worker error'));
    };
    worker.onerror = (err) => {
      // Surface errors to all pending callers
      console.error('[arrow-loader] Worker error:', err);
      for (const [, { reject }] of pending) reject(err);
      pending.clear();
    };
  }
}

function call(type, payload) {
  if (!worker) throw new Error('Arrow worker not initialized. Call initArrow(config) first.');
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
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
  const { positions, colors, planes, geneIds, scores, scoreMin } = await call('buildSpotsScatterCache', { manifestUrl, img, geneIdColors });
  return { positions, colors, planes, geneIds, scores, scoreMin };
}
