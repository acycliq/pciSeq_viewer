// At deep zoom the icon layer must hold exactly the spots a scan of every row finds
// inside the viewport. Checked after a pan, a plane step, a gene toggle and a further
// zoom. Usage: node icon-layer.mjs <port>

import { connect, waitUntilInteractive, windowCentre, sleep, PLANE_STEP, GENE_TOGGLE } from './lib/devtools.mjs';

const app = await connect(process.argv[2]);
await waitUntilInteractive(app);
const centre = await windowCentre(app);

const compare = (label) => app.evaluate(`(() => {
    const state = window.appState;
    const viewport = state.deckglInstance.getViewports()[0];
    const corner0 = viewport.unproject([0, viewport.height]), corner1 = viewport.unproject([viewport.width, 0]);
    // tile units to image pixels, the inverse of transformToTileCoordinates
    const cfg = window.config(), maxDim = Math.max(cfg.imageWidth, cfg.imageHeight);
    const toImage = (x, y) => [x * maxDim / 256, y * maxDim / 256];
    const low = toImage(Math.min(corner0[0], corner1[0]), Math.min(corner0[1], corner1[1]));
    const high = toImage(Math.max(corner0[0], corner1[0]), Math.max(corner0[1], corner1[1]));

    const table = state.spotTable, shown = table.geneMask(state.selectedGenes);
    let count = 0, idSum = 0;
    for (let row = 0; row < table.length; row++) {
        if (!shown[table.geneId[row]]) continue;
        const x = table.x[row], y = table.y[row];
        if (x < low[0] || x > high[0] || y < low[1] || y > high[1]) continue;
        if (state.hideMisreads && table.isHardMisread[row]) continue;
        count++; idSum += table.spotId[row];
    }
    const layerSpots = state.lastIconLayers?.[0]?.props.data || [];
    const layerIdSum = layerSpots.reduce((sum, spot) => sum + spot.spot_id, 0);
    return JSON.stringify({ label: '${label}', zoom: Math.round(state.currentZoom * 100) / 100,
        scan: { count, idSum }, layer: { count: layerSpots.length, idSum: layerIdSum },
        same: count === layerSpots.length && idSum === layerIdSum });
})()`);

async function wheel(steps) {
    for (let i = 0; i < steps; i++) { await app.mouse('mouseWheel', centre.x, centre.y, { deltaX: 0, deltaY: -120 }); await sleep(90); }
    await sleep(1500);
}
async function pan() {
    await app.mouse('mousePressed', centre.x - 180, centre.y, { button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 60; i++) { await app.mouse('mouseMoved', centre.x - 180 + i * 6, centre.y, { button: 'left', buttons: 1 }); await sleep(16); }
    await app.mouse('mouseReleased', centre.x + 180, centre.y, { button: 'left', buttons: 0, clickCount: 1 });
    await sleep(1200);
}

// Right after a wheel zoom the layer still holds the wider set from mid-zoom until the
// next interaction, so the comparisons start after a pan.
await wheel(14);
await pan(); console.log(await compare('after pan'));
await app.evaluate(PLANE_STEP(1)); await sleep(1200); console.log(await compare('after plane step'));
await app.evaluate(GENE_TOGGLE); await sleep(1200); console.log(await compare('after gene toggle'));
await wheel(3); await pan(); console.log(await compare('after more zoom and a pan'));
app.close();
