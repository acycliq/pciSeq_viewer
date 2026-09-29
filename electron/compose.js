// The main process's way to get a picture drawn. cell_image and plane_image work
// out WHAT to draw (which tiles, which polygons, at which pixel); the drawing
// itself needs a canvas, and only the renderer has one. So the main process sends
// the draw list over IPC, the renderer composes it invisibly (src/chatImageComposer.js)
// and sends the finished png back.
//
// One request at a time per id; a renderer that never answers times out rather
// than wedging the tool call.

let getWindow = () => null;
let nextId = 1;
const pending = new Map();

function init(d, ipcMain) {
  getWindow = d.getWindow;
  ipcMain.on('chat-compose-image-done', (_e, { id, dataUrl, error }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    if (error) p.reject(new Error(error));
    else p.resolve(dataUrl);
  });
}

// payload: { canvasW, canvasH, tiles: [{ b64, mime, dx, dy }], crop: { sx, sy, sw, sh },
//            outW, outH, autocontrast, polygons: [{ pts, stroke, fill, width }],
//            ring: { x, y, r, stroke, width } | null, labels: [{ x, y, text, ... }] }
function compose(payload, timeoutMs = 30000) {
  const win = getWindow();
  if (!win) return Promise.reject(new Error('the viewer window is not open'));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('the viewer did not draw the picture in time'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    win.webContents.send('chat-compose-image', { id, ...payload });
  });
}

module.exports = { init, compose };
