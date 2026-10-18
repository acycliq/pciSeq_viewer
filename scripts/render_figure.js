// Renders the chat figures (electron/figures/*.svg) to PNG, the only picture
// format the chat panel accepts. It runs in Electron so that the text is drawn by
// the same Chromium that draws the docs. Run it after changing an SVG:
//
//   npx electron scripts/render_figure.js
//
// Developer tool only: it is not part of the packaged app.

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const FIGURES_DIR = path.join(__dirname, '..', 'electron', 'figures');
const SCALE = 2;   // twice the SVG size, so the figure stays sharp when enlarged

async function renderOne(svgPath) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const width = Number(svg.match(/width="(\d+)"/)[1]);
  const height = Number(svg.match(/height="(\d+)"/)[1]);

  const win = new BrowserWindow({
    show: false,
    width: width * SCALE,
    height: height * SCALE,
    useContentSize: true,
    webPreferences: { offscreen: true, zoomFactor: SCALE },
  });
  // an offscreen window hands over each frame it paints; the first one after the
  // page has loaded is the finished figure
  const painted = new Promise(resolve => {
    win.webContents.on('paint', (event, dirty, frame) => {
      if (loaded && !frame.isEmpty()) resolve(frame);
    });
  });
  let loaded = false;
  const html = `<html><body style="margin:0">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  loaded = true;
  win.webContents.invalidate();
  const image = await painted;
  const pngPath = svgPath.replace(/\.svg$/, '.png');
  fs.writeFileSync(pngPath, image.toPNG());
  console.log(`wrote ${pngPath} (${image.getSize().width}x${image.getSize().height})`);
  win.destroy();
}

app.whenReady().then(async () => {
  const svgs = fs.readdirSync(FIGURES_DIR).filter(f => f.endsWith('.svg'));
  for (const f of svgs) await renderOne(path.join(FIGURES_DIR, f));
  app.quit();
});
