// Core: Build scene indices used across the chunk viewer
// - cellsByPlane: Map<planeId, Cell[]>
// - colorById:   Map<cellId, [r,g,b]>

function parseHexToRgb(hex) {
  try {
    if (typeof d3 !== 'undefined' && d3.rgb) {
      const c = d3.rgb(hex);
      return [c.r, c.g, c.b];
    }
  } catch (_) {}
  // Minimal fallback parser (#rrggbb)
  if (typeof hex === 'string') {
    const m = hex.trim().replace('#', '');
    if (m.length === 6) {
      const r = parseInt(m.slice(0, 2), 16);
      const g = parseInt(m.slice(2, 4), 16);
      const b = parseInt(m.slice(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b];
    }
  }
  return [200, 200, 200];
}

export function buildSceneIndex(dataset) {
  const cellsByPlane = new Map();
  const colorById = new Map();

  const cells = (dataset && dataset.cells && dataset.cells.data) ? dataset.cells.data : [];

  for (const cell of cells) {
    const plane = cell.plane;
    if (!cellsByPlane.has(plane)) cellsByPlane.set(plane, []);
    cellsByPlane.get(plane).push(cell);

    const id = cell.cellId || cell.cell_id;
    if (id && !colorById.has(id)) {
      const rgb = cell.cellColor ? parseHexToRgb(cell.cellColor) : [200, 200, 200];
      colorById.set(id, rgb);
    }
  }

  const planeCount = cellsByPlane.size; // informational

  return {
    cellsByPlane,
    colorById,
    planeCount
  };
}

