// Four checksums of the spot data as the app holds it: per gene, per cell, per spot
// and the GPU scatter cache. Identical numbers before and after a change prove the
// data did not change. Usage: node fingerprints.mjs <port>

import { connect, waitUntilInteractive } from './lib/devtools.mjs';

const app = await connect(process.argv[2]);
await waitUntilInteractive(app);
console.log(await app.evaluate(`(async () => {
    const state = window.appState;
    const table = state.spotTable;

    // FNV-1a over the bytes of every value, strings by character, numbers as doubles
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    let h = 2166136261;
    const mixU = (v) => { for (let k = 0; k < 4; k++) { h ^= (v >>> (8 * k)) & 0xff; h = Math.imul(h, 16777619) >>> 0; } };
    const mix = (v) => {
        if (typeof v === 'string') { for (let i = 0; i < v.length; i++) mixU(v.charCodeAt(i)); return; }
        if (v === null || v === undefined) { mixU(0xdeadbeef); return; }
        f64[0] = Number(v); mixU(u32[0]); mixU(u32[1]);
    };
    const mixArr = (a) => { if (!a) { mixU(0xabad1dea); return; } mixU(a.length); for (let i = 0; i < a.length; i++) mix(a[i]); };
    const mixSpot = (sp) => {
        mix(sp.spot_id); mix(sp.x); mix(sp.y); mix(sp.z); mix(sp.plane_id); mix(sp.gene); mix(sp.neighbour);
        mixArr(sp.neighbour_array); mix(sp.prob); mixArr(sp.prob_array); mix(sp.score); mix(sp.intensity); mix(sp.is_hard_misread);
    };

    // 1. per gene, genes sorted by name, spots in table order
    h = 2166136261;
    const genes = table.genes.slice().sort();
    const cells = new Set();
    const all = [];
    for (const gene of genes) {
        mix(gene);
        const spots = table.spotsOfGene(gene);
        mixU(spots.length);
        for (const sp of spots) { mixSpot(sp); if (sp.neighbour) cells.add(sp.neighbour); all.push(sp); }
    }
    const geneHash = h;

    // 2. per cell, cells sorted, spots sorted by id
    h = 2166136261;
    const cellLabels = [...cells].sort((a, b) => a - b);
    for (const label of cellLabels) {
        mix(label);
        const spots = table.spotsOfCell(label).slice().sort((a, b) => a.spot_id - b.spot_id);
        mixU(spots.length);
        for (const sp of spots) mixSpot(sp);
    }
    const cellHash = h;

    // 3. per spot by id: parents, probabilities, gene, coordinates
    h = 2166136261;
    all.sort((a, b) => a.spot_id - b.spot_id);
    for (const sp of all) {
        mix(sp.spot_id); mixArr(sp.neighbour_array); mixArr(sp.prob_array); mix(sp.gene); mix(sp.x); mix(sp.y); mix(sp.z); mix(sp.plane_id);
    }
    const parentHash = h;

    // 4. the spot buffers on the GPU, read back, order independent: one hash per row,
    // summed. The colour of a spot is the colour of its gene, so it comes from the gene style.
    const cache = state.arrowScatterCache;
    const column = (name) => cache[name].getData();
    const positions = column('positions'), geneIds = column('geneIds'), planes = column('planes');
    const pairs = column('filterPairs'), misreadFlags = column('misreadFlags');
    const { geneStyle } = await import('./src/glyphs/geneStyle.js');
    let cacheHash = 0;
    for (let i = 0; i < cache.length; i++) {
        h = 2166136261;
        mix(positions[3 * i]); mix(positions[3 * i + 1]); mix(positions[3 * i + 2]);
        const [r, g, b] = geneStyle(state.arrowGeneDict[geneIds[i]]).rgb;
        mixU(r | g << 8 | b << 16 | 255 << 24);
        mix(planes[i]); mix(geneIds[i]); mix(pairs[2 * i]); mix(pairs[2 * i + 1]); mix(misreadFlags[i]);
        cacheHash = (cacheHash + h) >>> 0;
    }

    const heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null;
    return JSON.stringify({ genes: genes.length, spots: all.length, cells: cellLabels.length, geneHash, cellHash, parentHash, cacheHash, heapMB });
})()`));
app.close();
