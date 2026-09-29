/**
 * Draws the pictures cell_image and plane_image ask for, on an invisible canvas.
 *
 * The main process decides everything (which tiles, where they sit, which polygons
 * in which colour at which output pixel); this only executes the draw list and
 * hands back a png. Kept dumb on purpose, so the picture logic lives in one place
 * (electron/run.js).
 */

async function composeOne(p) {
  // 1. the tile mosaic at its native size
  const mosaic = document.createElement('canvas');
  mosaic.width = p.canvasW;
  mosaic.height = p.canvasH;
  const mctx = mosaic.getContext('2d');
  mctx.fillStyle = '#000';
  mctx.fillRect(0, 0, p.canvasW, p.canvasH);
  for (const t of p.tiles) {
    const bytes = Uint8Array.from(atob(t.b64), c => c.charCodeAt(0));
    const img = await createImageBitmap(new Blob([bytes], { type: t.mime }));
    mctx.drawImage(img, t.dx, t.dy);
    img.close();
  }

  // 2. crop and resample to the output size
  const out = document.createElement('canvas');
  out.width = p.outW;
  out.height = p.outH;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mosaic, p.crop.sx, p.crop.sy, p.crop.sw, p.crop.sh, 0, 0, p.outW, p.outH);

  // 3. a light autocontrast for the whole-plane view, which is dark. The same idea
  // as PIL's: clip a small tail at each end and stretch linearly.
  if (p.autocontrast) {
    const im = ctx.getImageData(0, 0, p.outW, p.outH);
    const d = im.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
    const total = d.length / 4;
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.002) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.0005) { hi = v; break; } }
    if (hi > lo) {
      const scale = 255 / (hi - lo);
      for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const v = (d[i + c] - lo) * scale;
          d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
      ctx.putImageData(im, 0, 0);
    }
  }

  // 4. the overlays, already in output pixels
  for (const poly of p.polygons || []) {
    ctx.beginPath();
    poly.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (poly.fill) { ctx.fillStyle = poly.fill; ctx.fill(); }
    ctx.strokeStyle = poly.stroke;
    ctx.lineWidth = poly.width;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  if (p.ring) {
    ctx.beginPath();
    ctx.arc(p.ring.x, p.ring.y, p.ring.r, 0, 2 * Math.PI);
    ctx.strokeStyle = p.ring.stroke;
    ctx.lineWidth = p.ring.width;
    ctx.stroke();
  }
  return out.toDataURL('image/png');
}

export function initChatImageComposer() {
  if (!window.electronAPI || !window.electronAPI.onComposeImage) return;
  window.electronAPI.onComposeImage(async (p) => {
    try {
      const dataUrl = await composeOne(p);
      window.electronAPI.composeImageDone({ id: p.id, dataUrl });
    } catch (e) {
      window.electronAPI.composeImageDone({ id: p.id, error: e.message });
    }
  });
}
