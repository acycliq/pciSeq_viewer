// The screenshot tool: the map as the user sees it now, read from the window.
//
// cell_image and plane_image draw their picture from the data; this one copies the
// screen, so it shows whatever the map shows: the spots and cells drawn, their
// colours and glyphs, the plane and zoom, and any drawer lying over the map. The
// renderer says where the map is in the window and which part of the image it
// covers (compose.mapView, answered in src/app.js); the capture itself needs the
// window, which only the main process has.
//
// Wiring: main.js calls init with the window and hands take to tools.js as
// deps.screenshot.

const compose = require('./compose');

// the longest edge Claude reads an image at without shrinking it first; a bigger
// screenshot would only cost more to send
const MAX_EDGE = 1568;

let getWindow = () => null;

function init(d) {
  getWindow = d.getWindow;
}

// the picture and how to place a point of the image on it, in the shape every
// picture tool returns (see finishImage in run.js)
async function take() {
  const view = await compose.mapView();
  const win = getWindow();
  if (!win) throw new Error('the viewer window is not open');
  const captured = await win.webContents.capturePage(view.rect);
  if (captured.isEmpty()) throw new Error('the map could not be captured; the viewer window may be minimised');
  const image = fitToMaxEdge(captured);
  const [x0, , x1] = view.bbox;
  const scale = image.getSize().width / (x1 - x0);
  return {
    __image: { media_type: 'image/png', data: image.toPNG().toString('base64') },
    info: {
      plane: view.plane,
      bbox: view.bbox,
      scale: Math.round(scale * 1000) / 1000,
      to_place_a_point: 'a point (x, y) of the image is at ((x - bbox[0]) * scale, ' +
                        '(y - bbox[1]) * scale) in this picture',
      picture_is: 'the map as the user sees it now, captured from the screen, with any drawer that lies over it',
    },
  };
}

// a smaller copy when the longer edge is over MAX_EDGE, the image itself otherwise
function fitToMaxEdge(image) {
  const { width, height } = image.getSize();
  const longer = Math.max(width, height);
  if (longer <= MAX_EDGE) return image;
  const shrink = MAX_EDGE / longer;
  return image.resize({ width: Math.round(width * shrink), height: Math.round(height * shrink) });
}

module.exports = { init, take };
