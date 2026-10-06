// The main process's way to ask the renderer for something and wait for the answer.
// cell_image and plane_image work out WHAT to draw (which tiles, which polygons, at
// which pixel); the drawing itself needs a canvas, and only the renderer has one. So
// the main process sends the draw list over IPC, the renderer composes it invisibly
// (src/chatImageComposer.js) and sends the finished png back. fly_to_cell goes the
// same way: only the renderer knows which cells the map has, so it does the lookup
// and the glide and says whether the cell was there (src/app.js).
//
// A request carries an id and the renderer answers on <channel>-done with the same
// id. One that never answers times out rather than wedging the tool call.

let getWindow = () => null;
let nextId = 1;
const pending = new Map();
const CHANNELS = ['chat-compose-image', 'chat-fly-to-cell'];

function init(d, ipcMain) {
  getWindow = d.getWindow;
  for (const channel of CHANNELS) {
    ipcMain.on(channel + '-done', (_e, { id, error, ...result }) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      clearTimeout(p.timer);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    });
  }
}

// resolves with whatever the renderer sent back besides id, rejects with its error
function ask(channel, payload, timeoutMs, tooLate) {
  const win = getWindow();
  if (!win) return Promise.reject(new Error('the viewer window is not open'));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(tooLate));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    win.webContents.send(channel, { id, ...payload });
  });
}

// payload: { canvasW, canvasH, tiles: [{ b64, mime, dx, dy }], crop: { sx, sy, sw, sh },
//            outW, outH, autocontrast, polygons: [{ pts, stroke, fill, width }],
//            ring: { x, y, r, stroke, width } | null, labels: [{ x, y, text, ... }] }
function compose(payload, timeoutMs = 30000) {
  return ask('chat-compose-image', payload, timeoutMs, 'the viewer did not draw the picture in time')
    .then(r => r.dataUrl);
}

// the renderer looks the cell up and starts the glide. A label the run does not
// have rejects with the message the lookup box would have shown.
function flyToCell(label, timeoutMs = 10000) {
  return ask('chat-fly-to-cell', { label }, timeoutMs, 'the viewer did not move the map in time');
}

module.exports = { init, compose, flyToCell };
