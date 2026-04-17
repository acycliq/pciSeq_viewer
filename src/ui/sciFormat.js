// Thin wrapper around d3.format for scientific notation (e.g. 1.30e-3)
const _fmt = d3.format('.2e');
export const sciFormat = v => _fmt(v);
