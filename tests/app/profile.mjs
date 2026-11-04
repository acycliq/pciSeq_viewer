// Where the CPU time goes for a plane step, a gene toggle and the layer rebuild at
// deep zoom, with the time until the change is on screen. Usage: node profile.mjs <port>

import { connect, waitUntilInteractive, windowCentre, sleep, PLANE_STEP, GENE_TOGGLE, TWO_FRAMES } from './lib/devtools.mjs';
import { startProfiler, stopProfiler } from './lib/cpuProfile.mjs';

const app = await connect(process.argv[2]);
await waitUntilInteractive(app);
const centre = await windowCentre(app);

async function profiled(name, action) {
    await startProfiler(app);
    const timing = JSON.parse(await app.evaluate(`(async () => {
        const t0 = performance.now();
        ${action};
        const syncMs = Math.round(performance.now() - t0);
        await ${TWO_FRAMES};
        return JSON.stringify({ syncMs, onScreenMs: Math.round(performance.now() - t0) });
    })()`));
    const { sampledMs, top } = await stopProfiler(app);
    console.log(`\n### ${name}: ${JSON.stringify(timing)}, sampled ${sampledMs} ms`);
    for (const line of top) console.log('   ' + line);
    await sleep(700);
}

console.log(`spots ${await app.evaluate('window.appState.spotTable.length')}, plane ${await app.evaluate('window.appState.currentPlane')}`);
await profiled('plane +1', PLANE_STEP(1));
await profiled('plane -1', PLANE_STEP(-1));
await profiled('gene toggle off', GENE_TOGGLE);
await profiled('gene toggle on', GENE_TOGGLE);
for (let i = 0; i < 14; i++) {
    await app.mouse('mouseWheel', centre.x, centre.y, { deltaX: 0, deltaY: -120 });
    await sleep(90);
}
await sleep(1500);
console.log(`\nzoom ${await app.evaluate('window.appState.currentZoom')}, icon spots in view ${await app.evaluate('window.appState.lastIconLayers?.[0]?.props.data.length ?? 0')}`);
await profiled('deep zoom rebuild', 'window.updateAllLayers()');
await profiled('deep zoom plane +1', PLANE_STEP(1));
app.close();
