/**
 * Colormap Utility
 * Provides continuous color mapping for value visualization
 */

/**
 * Map a normalized value [0,1] to turbo RGB (deep blue to red)
 * @param {number} t - Value in [0,1]
 * @returns {number[]} [r, g, b] each 0-255
 */
export function colormap(t) {
    t = Math.max(0, Math.min(1, t));
    const c = d3.rgb(d3.interpolateTurbo(t));
    return [c.r, c.g, c.b];
}

/**
 * Normalize a value to [0,1] given min and max
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number} Normalized value clamped to [0,1]
 */
export function normalize(value, min, max) {
    if (max <= min) return 0;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Render a color gradient on a canvas and update legend labels
 * @param {Object} opts
 * @param {string} opts.title - Legend title
 * @param {number} opts.min - Minimum value
 * @param {number} opts.max - Maximum value
 */
export function updateColorLegend(opts) {
    const container = document.getElementById('colorLegendBar');
    const canvas = document.getElementById('colorLegendCanvas');
    const minLabel = document.getElementById('colorLegendMin');
    const maxLabel = document.getElementById('colorLegendMax');
    const titleLabel = document.getElementById('colorLegendTitle');

    if (!container || !canvas) return;

    if (!opts) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    minLabel.textContent = opts.min.toFixed(1);
    maxLabel.textContent = opts.max.toFixed(1);
    titleLabel.textContent = opts.title;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    for (let x = 0; x < w; x++) {
        const t = x / (w - 1);
        const [r, g, b] = colormap(t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, 0, 1, canvas.height);
    }
}