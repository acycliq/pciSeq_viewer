/**
 * The one place that answers "how is this gene drawn?": its colour and glyph.
 *
 * The table of styles is glyphSettings() in src/glyphs/glyphConfig.js, a classic
 * script, and Import, Gene Colours replaces that global with a new table
 * (src/geneColorImport.js). Nothing else reads the table: the map layers, the
 * drawer, the hover lines, the tooltip and the chat legend all call geneStyle(),
 * so a gene that is not in the table gets the default everywhere, from one line:
 * DEFAULT_GENE_STYLE (also defined in glyphConfig.js), or the style an import
 * file gives under the gene name "*".
 */

let defaultStyle = DEFAULT_GENE_STYLE;
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
    styles.default = { ...defaultStyle, rgb: hexToRgb(defaultStyle.color) };
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

// { color, glyphName } of a gene with no entry
export function defaultGeneStyle() {
    return defaultStyle;
}

// An import file's "*" entry
export function setDefaultGeneStyle(style) {
    defaultStyle = { color: style.color, glyphName: style.glyphName };
    styles = null;
}

export function resetDefaultGeneStyle() {
    defaultStyle = DEFAULT_GENE_STYLE;
    styles = null;
}

// Call after an import has replaced glyphSettings, so the next lookup rebuilds.
export function resetGeneStyles() {
    styles = null;
}
