// Core: raster masks for cell polygons (per plane)
// Build a per-plane label mask using a 2D canvas. Each pixel stores the cellId (0 = background).

export function buildPlaneLabelMask(planeCells, bounds) {
  const W = (bounds.right - bounds.left) + 1;
  const H = (bounds.bottom - bounds.top) + 1;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx2d = canvas.getContext('2d', { willReadFrequently: true });

  const labels = new Uint32Array(W * H); // 0 = background, otherwise cellId

  for (const cell of planeCells) {
    if (!cell?.clippedBoundary || cell.clippedBoundary.length < 3) continue;

    ctx2d.clearRect(0, 0, W, H);
    ctx2d.beginPath();
    for (let i = 0; i < cell.clippedBoundary.length; i++) {
      const vx = cell.clippedBoundary[i][0] - bounds.left;
      const vy = cell.clippedBoundary[i][1] - bounds.top;
      if (i === 0) ctx2d.moveTo(vx, vy); else ctx2d.lineTo(vx, vy);
    }
    ctx2d.closePath();
    ctx2d.fillStyle = 'rgba(255,255,255,1)';
    ctx2d.fill('evenodd');

    const img = ctx2d.getImageData(0, 0, W, H).data;
    const id = cell.cellId || cell.cell_id || 0;
    if (!id) continue;
    for (let p = 0, i = 0; i < labels.length; i++, p += 4) {
      if (img[p + 3] > 0) labels[i] = id; // include boundary/partial coverage
    }
  }

  return { width: W, height: H, labels };
}

export function buildMasksByPlane(cellsByPlane, bounds, totalPlanes) {
  const maskByPlane = new Map();
  for (let planeId = 0; planeId < totalPlanes; planeId++) {
    const list = cellsByPlane.get(planeId) || [];
    const mask = buildPlaneLabelMask(list, bounds);
    maskByPlane.set(planeId, mask);
  }
  return maskByPlane;
}

