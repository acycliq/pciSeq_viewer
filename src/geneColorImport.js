// Gene colour + glyph importer
// Accepts JSON array: [{ gene, color: '#RRGGBB', glyphName }]

import { state } from './state/stateManager.js';
import { buildGeneIconAtlas } from './data/dataLoaders.js';

const VALID_GLYPHS = new Set([
  'star6','star5','diamond','square','triangleUp','triangleDown','triangleRight','triangleLeft','cross','plus','asterisk','circle','point'
]);

function normalizeEntries(arr) {
  if (!Array.isArray(arr)) throw new Error('Invalid JSON format. Expected an array of {gene,color,glyphName}');
  const out = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const gene = String(it.gene || '').trim();
    const color = String(it.color || '').trim();
    const glyph = String(it.glyphName || 'circle').trim();
    if (!gene || !/^#?[0-9a-fA-F]{6}$/.test(color)) continue;
    const hex = color.startsWith('#') ? color : `#${color}`;
    const glyphName = VALID_GLYPHS.has(glyph) ? glyph : 'circle';
    out.push({ gene, color: hex, glyphName });
  }
  return out;
}

function overrideGlyphSettings(newEntries, replaceMode = false) {
  try {
    if (replaceMode) {
      // Replace mode: use only the imported entries
      window.glyphSettings = () => newEntries;
    } else {
      // Merge mode: overlay new entries on existing settings
      const base = (typeof window.glyphSettings === 'function') ? window.glyphSettings() : [];
      const map = new Map(base.map(s => [s.gene, s]));
      for (const e of newEntries) {
        map.set(e.gene, { gene: e.gene, color: e.color, glyphName: e.glyphName });
      }
      const merged = Array.from(map.values());
      window.glyphSettings = () => merged;
    }
  } catch (e) {
    // Fallback: define fresh
    window.glyphSettings = () => newEntries;
  }
}

export async function applyGeneScheme(entries, replaceMode = false) {
  const norm = normalizeEntries(entries);
  if (norm.length === 0) return { appliedCount: 0 };

  // Override glyphSettings used by atlas + gene drawer
  overrideGlyphSettings(norm, replaceMode);

  // Rebuild icon atlas/mapping from current gene set
  const genes = Array.from(state.geneDataMap.keys());
  const { atlas, mapping } = buildGeneIconAtlas(genes);
  state.geneIconAtlas = atlas;
  state.geneIconMapping = mapping;

  // Recolor low-zoom PointCloud directly in main thread
  try {
    const cache = window.appState?.arrowScatterCache;
    if (cache && cache.colors && cache.geneIds) {
      const hexToRgb = (hex) => { const c = d3.rgb(hex); return [c.r|0, c.g|0, c.b|0]; };
      const cfg = (typeof window.glyphSettings === 'function') ? window.glyphSettings() : [];
      const colorByGene = new Map(cfg.map(s => [s.gene, s.color]));
      const idToName = window.appState.arrowGeneDict || {};

      for (let i = 0; i < cache.geneIds.length; i++) {
        const geneId = cache.geneIds[i];
        const geneName = idToName[geneId];
        const hexColor = colorByGene.get(geneName) || '#ffffff';
        const rgb = hexToRgb(hexColor);
        cache.colors[4*i] = rgb[0];
        cache.colors[4*i + 1] = rgb[1];
        cache.colors[4*i + 2] = rgb[2];
        cache.colors[4*i + 3] = 255;
      }

      // Invalidate gene mask cache so alpha buffer rebuilds using new base colours
      try { if (window.appState._geneMaskCache) window.appState._geneMaskCache.buffer = null; } catch {}
    }
  } catch (e) {
    console.warn('Recolor PointCloud failed; low-zoom may show old colours until reload:', e);
  }

  // Update UI + layers
  try {
    await import('./geneDrawer.js').then(mod => { try { mod.populateGeneDrawer(); } catch {} });
  } catch {}
  if (typeof window.updateAllLayers === 'function') window.updateAllLayers();

  return { appliedCount: norm.length };
}

export function handleGeneColorFileUpload(event, statusEl) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  // Read replace mode flag set by button click handler
  const replaceMode = event.target.dataset.replaceMode === 'true';

  if (statusEl) { statusEl.textContent = 'Loading…'; statusEl.className = 'file-status'; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const arr = JSON.parse(reader.result);
      const { appliedCount } = await applyGeneScheme(arr, replaceMode);
      const mode = replaceMode ? 'replaced' : 'merged';
      if (appliedCount > 0) {
        if (statusEl) { statusEl.textContent = `Imported ${appliedCount} gene styles (${mode})`; statusEl.className = 'file-status success'; }
      } else {
        if (statusEl) { statusEl.textContent = 'No valid gene entries found'; statusEl.className = 'file-status error'; }
      }
    } catch (e) {
      if (statusEl) { statusEl.textContent = `Error: ${e.message || 'Invalid JSON'}`; statusEl.className = 'file-status error'; }
      console.error('Failed to import gene scheme:', e);
    } finally {
      try { event.target.value = ''; } catch {}
      if (statusEl) setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'file-status'; }, 5000);
    }
  };
  reader.onerror = () => { if (statusEl) { statusEl.textContent = 'Failed to read file'; statusEl.className = 'file-status error'; } };
  reader.readAsText(file);
}
