// The cell hover lines: for three cells of the current plane, the number of lines the
// highlighter builds must equal the number of spots of the cell.
// Usage: node hover.mjs <port>

import { connect, waitUntilInteractive } from './lib/devtools.mjs';

const app = await connect(process.argv[2]);
await waitUntilInteractive(app);
console.log(await app.evaluate(`(async () => {
    const state = window.appState;
    while (!state.polygonCache.get(state.currentPlane)) await new Promise(resolve => setTimeout(resolve, 500));
    const results = [];
    for (const feature of state.polygonCache.get(state.currentPlane).features) {
        const label = feature.properties.label;
        const spots = state.spotTable.spotsOfCell(label).length;
        if (spots === 0) continue;
        const layer = state.polygonHighlighter.createLineLayer(feature);
        results.push({ label, spotsOfCell: spots, lines: layer ? layer.props.data.length : null });
        if (results.length === 3) break;
    }
    return JSON.stringify({ plane: state.currentPlane, results, allMatch: results.every(r => r.lines === r.spotsOfCell) });
})()`));
app.close();
