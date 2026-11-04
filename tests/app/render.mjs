// What the user feels, with real mouse and wheel input: frames per second and the worst
// frame while panning at low zoom and at deep zoom, zoom in and out, the layer rebuild
// at deep zoom, a gene toggle and a plane step. Usage: node render.mjs <port> [quick]
// "quick" measures the low-zoom pan only.

import {
    connect, waitUntilInteractive, windowCentre, sleep,
    installFrameCounter, resetFrameCounter, readFrameRate, PLANE_STEP, GENE_TOGGLE, TWO_FRAMES
} from './lib/devtools.mjs';

const [port, mode] = process.argv.slice(2);
const app = await connect(port);
await waitUntilInteractive(app);
await installFrameCounter(app);
const centre = await windowCentre(app);
const zoom = () => app.evaluate(`Number(window.appState.currentZoom ?? 0)`);
const timed = (action) => app.evaluate(`(async () => { const t0 = performance.now(); ${action}; await ${TWO_FRAMES}; return Math.round(performance.now() - t0); })()`);

// a drag of 60 steps across the window, with a slight wobble like a hand
async function pan(direction = 1) {
    const steps = 60, dx = 6 * direction;
    await resetFrameCounter(app);
    await app.mouse('mousePressed', centre.x - steps * dx / 2, centre.y, { button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= steps; i++) {
        await app.mouse('mouseMoved', centre.x - steps * dx / 2 + i * dx, centre.y + Math.round(Math.sin(i / 6) * 3), { button: 'left', buttons: 1 });
        await sleep(16);
    }
    await app.mouse('mouseReleased', centre.x + steps * dx / 2, centre.y, { button: 'left', buttons: 0, clickCount: 1 });
    await sleep(600);
    return readFrameRate(app);
}

async function wheel(deltaY, steps) {
    await resetFrameCounter(app);
    for (let i = 0; i < steps; i++) {
        await app.mouse('mouseWheel', centre.x, centre.y, { deltaX: 0, deltaY });
        await sleep(90);
    }
    await sleep(800);
    return readFrameRate(app);
}

const out = { spots: await app.evaluate(`window.appState.spotTable.length`), viewport: [centre.width, centre.height], zoomStart: await zoom() };
out.panLowZoom = await pan(1);
out.panLowZoomBack = await pan(-1);
if (mode !== 'quick') {
    out.zoomIn = await wheel(-120, 14);
    out.zoomAfterIn = await zoom();
    out.panDeepZoom = await pan(1);
    out.rebuildAtDeepZoomMs = await timed('window.updateAllLayers()');
    out.zoomOut = await wheel(120, 14);
    out.zoomAfterOut = await zoom();
    out.geneToggleOffMs = await timed(GENE_TOGGLE);
    await sleep(500);
    out.geneToggleOnMs = await timed(GENE_TOGGLE);
    await sleep(500);
    out.planeStepMs = await timed(PLANE_STEP(1));
    await sleep(1500);
    out.planeStepBackMs = await timed(PLANE_STEP(-1));
    out.heapMB = await app.evaluate(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null`);
}
console.log(JSON.stringify(out));
app.close();
