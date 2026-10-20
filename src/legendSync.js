/**
 * Tells the main process what the map legend says, so the chat's tools can say it
 * too (electron/legend.js keeps it): the colour of each class, the colour and
 * shape of each gene's spots, and the defaults for a class or a gene that has no
 * entry. Call it whenever the class or gene colours change.
 */
import { state } from './state/stateManager.js';
import { rgbToHex, defaultClassColour } from './classColour.js';

export function sendLegend() {
    if (!window.electronAPI?.setLegend) return;
    const classes = {};
    state.cellClassColors.forEach((rgb, name) => { classes[name] = rgbToHex(rgb); });
    const defaultClass = rgbToHex(defaultClassColour());
    const genes = {};
    const glyphs = typeof window.glyphSettings === 'function' ? window.glyphSettings() : [];
    glyphs.forEach(g => { genes[g.gene] = { colour: g.color, shape: g.glyphName }; });
    const defaultGene = { colour: DEFAULT_GENE_STYLE.color, shape: DEFAULT_GENE_STYLE.glyphName };
    window.electronAPI.setLegend({ classes, defaultClass, genes, defaultGene });
}
