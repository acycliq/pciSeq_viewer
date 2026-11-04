// Where the CPU time goes during the load, from the moment the app's modules have run
// until the viewer is interactive. Usage: node profile-load.mjs <port>

import { connect, waitForAppState, waitUntilInteractive } from './lib/devtools.mjs';
import { startProfiler, stopProfiler } from './lib/cpuProfile.mjs';

const app = await connect(process.argv[2]);
// the window navigates from about:blank to the viewer first; profiling starts after that
await waitForAppState(app);
await startProfiler(app);
const started = Date.now();
await waitUntilInteractive(app);
const { sampledMs, top } = await stopProfiler(app, 14);
console.log(`load profiled for ${((Date.now() - started) / 1000).toFixed(1)} s, sampled ${sampledMs} ms`);
for (const line of top) console.log('   ' + line);
app.close();
