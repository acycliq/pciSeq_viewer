/**
 * Utility to format cell coordinates consistently across the app.
 * Provides a single source of truth for extracting and formatting X, Y, Z.
 * Z coordinates are in isotropic units.
 */

export function getFormattedCellCoordinates(cell, asHtml = false) {
    if (!cell) return asHtml ? '' : '(x: ?, y: ?)';

    const pos = cell.position || {};
    const x = pos.x !== undefined ? pos.x : '?';
    const y = pos.y !== undefined ? pos.y : '?';
    const z = pos.z !== undefined ? pos.z : null;

    const formatNum = (n) => (typeof n === 'number' && !Number.isNaN(n)) ? Math.round(n) : n;

    const parts = ['x: ' + formatNum(x), 'y: ' + formatNum(y)];
    if (z !== null && z !== undefined && !Number.isNaN(z)) {
        parts.push('z: ' + formatNum(z));
    }

    const str = '(' + parts.join(', ') + ')';

    if (asHtml) {
        return ' <span style="font-weight:400; color:#9ca3af; font-size:12px; margin-left:8px;">' + str + '</span>';
    }
    return str;
}