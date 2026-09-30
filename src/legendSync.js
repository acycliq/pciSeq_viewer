/**
 * Tells the main process what the map legend says, so the chat's tools can say it
 * too (electron/legend.js keeps it): the colour of each class, and the colour and
 * shape of each gene's spots. Call it whenever the class or gene colours change.
 */
import { state } from './state/stateManager.js';

const toHex = (rgb) => '#' + rgb.slice(0, 3)
    .map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

export function sendLegend() {
    if (!window.electronAPI?.setLegend) return;
    const classes = {};
    state.cellClassColors.forEach((rgb, name) => { classes[name] = toHex(rgb); });
    const genes = {};
    const glyphs = typeof window.glyphSettings === 'function' ? window.glyphSettings() : [];
    glyphs.forEach(g => { genes[g.gene] = { colour: g.color, shape: g.glyphName }; });
    window.electronAPI.setLegend({ classes, genes });
}
