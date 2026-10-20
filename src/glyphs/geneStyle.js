/**
 * The one place that answers "how is this gene drawn?": its colour and glyph.
 *
 * The table of styles is glyphSettings() in src/glyphs/glyphConfig.js, a classic
 * script, and Import, Gene Colours replaces that global with a new table
 * (src/geneColorImport.js). Nothing else reads the table: the map layers, the
 * drawer, the hover lines, the tooltip and the chat legend all call geneStyle(),
 * so a gene that is not in the table gets DEFAULT_GENE_STYLE (also defined in
 * glyphConfig.js) everywhere, from one line.
 */

let styles = null;   // gene name -> { color, glyphName, rgb }, built on first use

function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16)
    ];
}

function buildStyles() {
    styles = new Map();
    for (const s of glyphSettings()) {
        styles.set(s.gene, { color: s.color, glyphName: s.glyphName, rgb: hexToRgb(s.color) });
    }
    styles.default = { ...DEFAULT_GENE_STYLE, rgb: hexToRgb(DEFAULT_GENE_STYLE.color) };
}

// { color: '#rrggbb', glyphName, rgb: [r, g, b] }
export function geneStyle(name) {
    if (!styles) buildStyles();
    return styles.get(name) || styles.default;
}

// true when the gene has its own entry, false when it is drawn with the default
export function hasGeneStyle(name) {
    if (!styles) buildStyles();
    return styles.has(name);
}

// Call after an import has replaced glyphSettings, so the next lookup rebuilds.
export function resetGeneStyles() {
    styles = null;
}
