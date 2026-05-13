/**
 * Tooltip diagnostics cache.
 *
 * Fetches per-cell tooltip data from the Electron main process and memoises
 * it for the lifetime of the current diagnostics-db connection. Designed for
 * use on every cell/spot hover.
 *
 * Cached fields:
 *   thetaHard          - theta_bar[c, k*]
 *   gammaAssignedVec   - gamma_bar[c, :, k*] of length nG
 *   assignedClassIdx   - k*, argmax of class_prob[c, :]
 *   classProbHard      - class_prob[c, k*]
 *   geneCountVec       - observed gene counts N_{c, g} of length nG
 *
 * The last three feed the spot-hover gamma chain log alongside the existing
 * tooltip rows. See notes/spot_hover_chain_spec.md.
 */

const CACHE_CAP = 1024;

// Cache lives until the diagnostics db disconnects (cleared via clearTooltipCache).
// If the db is hot-swapped while still connected, entries become stale; the
// workflow requires explicit disconnect before reconnecting to a different db.
const cache = new Map();

/**
 * Resolve tooltip data for an external cell label.
 *
 * Cache hits resolve on the next microtask. Cache misses round-trip through
 * IPC. Rejects when the IPC handler reports a known failure (e.g. cell not in
 * label_map, internal index out of range, row missing); callers turn the
 * rejection into a visible error row in the tooltip.
 *
 * @param {number|string} cellLabel External (segmentation) cell label.
 * @returns {Promise<{
 *   thetaHard: number,
 *   gammaAssignedVec: number[],
 *   assignedClassIdx: number,
 *   classProbHard: number,
 *   geneCountVec: number[]
 * }>}
 */
export async function getCellInfo(cellLabel) {
    const key = String(cellLabel);
    if (cache.has(key)) return cache.get(key);

    const resp = await window.electronAPI.tooltipGetCellInfo(cellLabel);
    if (!resp.success) {
        throw new Error(resp.error || 'tooltip-get-cell-info failed');
    }

    const info = {
        thetaHard:        resp.thetaHard,
        gammaAssignedVec: resp.gammaAssignedVec,
        assignedClassIdx: resp.assignedClassIdx,
        classProbHard:    resp.classProbHard,
        geneCountVec:     resp.geneCountVec
    };

    if (cache.size >= CACHE_CAP) {
        cache.delete(cache.keys().next().value);
    }
    cache.set(key, info);
    return info;
}

/**
 * Drop all cached entries. Call when the diagnostics database disconnects so
 * subsequent connections do not see stale data.
 */
export function clearTooltipCache() {
    cache.clear();
}
