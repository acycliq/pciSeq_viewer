// Screenshots after each toggle that changes how the spots are drawn: all genes, first
// gene off, grey out misreads, hide misreads, all genes again. Compare with pixels.py.
// Usage: node toggles.mjs <port> <out dir> <label>

import { writeFileSync, mkdirSync } from 'node:fs';
import { connect, waitUntilInteractive, sleep, GENE_TOGGLE } from './lib/devtools.mjs';

const [port, outDir, label] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const app = await connect(port);
await waitUntilInteractive(app);

async function screenshot(name) {
    await sleep(1200);
    const reply = await app.send('Page.captureScreenshot', { format: 'png' });
    const file = `${outDir}/${label}_${name}.png`;
    writeFileSync(file, Buffer.from(reply.result.data, 'base64'));
    console.log(file);
}
const click = (id) => app.evaluate(`document.getElementById('${id}').click()`);

await screenshot('all');
await app.evaluate(GENE_TOGGLE); await screenshot('geneOff');
await app.evaluate(GENE_TOGGLE);
await click('greyOutMisreadsToggle'); await screenshot('greyOut');
await click('greyOutMisreadsToggle');
await click('hideMisreadsToggle'); await screenshot('hide');
await click('hideMisreadsToggle'); await screenshot('allAgain');
app.close();
