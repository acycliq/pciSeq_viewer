// Two screenshots: the initial view and after six wheel steps in. Compare them with
// pixels.py; the fraction of lit pixels is stable between runs, single pixels are not
// (spots overlap and their draw order varies). Usage: node screenshots.mjs <port> <out dir> <label>

import { writeFileSync, mkdirSync } from 'node:fs';
import { connect, waitUntilInteractive, windowCentre, sleep } from './lib/devtools.mjs';

const [port, outDir, label] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const app = await connect(port);
await waitUntilInteractive(app);

async function screenshot(name) {
    const reply = await app.send('Page.captureScreenshot', { format: 'png' });
    const file = `${outDir}/${label}_${name}.png`;
    writeFileSync(file, Buffer.from(reply.result.data, 'base64'));
    console.log(file);
}

await screenshot('initial');
const centre = await windowCentre(app);
for (let i = 0; i < 6; i++) {
    await app.mouse('mouseWheel', centre.x, centre.y, { deltaX: 0, deltaY: -120 });
    await sleep(150);
}
await sleep(1500);
await screenshot('zoomed');
app.close();
