/**
 * Spot Hover Handler Module
 *
 * Drives the info panel (bottom-right) from spot hover, mirroring
 * cellHoverHandler but for the per-spot gene-probability distribution exported
 * by spot_caller (gene_array / gene_probs). Only wired to the pickable spot
 * IconLayer, which exists at deep zoom (>= SPOT_PICKABLE_MIN_ZOOM); at low zoom
 * spots render as a non-pickable PointCloud and this never fires.
 */

import { updateSpot, freezeOnSpot } from '../cellInfoPanel/index.js';
import { isFrozen } from '../cellInfoPanel/panelState.js';

// Warn only once when a shard breaks the contiguity contract, not on every hover.
let _warnedNonContiguous = false;

/**
 * Look up a spot's gene distribution from the CSR arrays carried on the loaded
 * arrow shards (spot_gene_ids / spot_gene_probs / spot_gene_offsets). Returns
 * { names: string[], probs: number[] } sorted high->low (as exported), or null
 * if the dataset has no per-spot distribution (non-spot_caller data).
 * @param {number} spotId
 */
export function getSpotDistribution(spotId) {
    const app = window.appState;
    const shards = app && app.arrowSpotShards;
    const geneDict = (app && app.arrowGeneDict) || {};
    if (!Array.isArray(shards)) return null;

    for (const sh of shards) {
        const ids = sh.spot_id;
        if (!ids || ids.length === 0) continue;
        const first = ids[0];
        const last = ids[ids.length - 1];
        if (spotId < first || spotId > last) continue;      // not in this shard
        if (!sh.spot_gene_ids || !sh.spot_gene_offsets) return null;  // no distribution in data

        // Row indexing below requires spot_id to be a contiguous ascending arange
        // within the shard (spot_caller export contract). The endpoint check is
        // O(1) and catches filtered/gapped ids that would silently return the
        // wrong spot's distribution.
        if (last - first !== ids.length - 1) {
            if (!_warnedNonContiguous) {
                _warnedNonContiguous = true;
                console.warn('spot_id is not a contiguous arange within a shard; per-spot gene distributions disabled');
            }
            return null;
        }

        const row = spotId - first;                         // spot_id is a contiguous arange
        const start = sh.spot_gene_offsets[row];
        const end = sh.spot_gene_offsets[row + 1];
        const names = [];
        const probs = [];
        for (let k = start; k < end; k++) {
            const gid = sh.spot_gene_ids[k];
            names.push(geneDict[gid] != null ? String(geneDict[gid]) : String(gid));
            probs.push(sh.spot_gene_probs[k]);
        }
        return { names, probs };
    }
    return null;
}

/**
 * Build the panel's spot data shape. Reuses the donut's {ClassName, Prob}
 * contract so the same renderer draws gene slices instead of class slices.
 * @param {Object} d - spot object from the IconLayer (spot_id, gene, x, y, plane_id, ...)
 */
function buildSpotInfoData(d) {
    const dist = getSpotDistribution(d.spot_id);
    const names = dist ? dist.names : [];
    const probs = dist ? dist.probs : [];
    // top of the (already sorted) distribution; fall back to the called gene
    const topGene = names.length ? names[0] : (d.gene || 'Unknown');
    const topProb = probs.length ? probs[0] : null;
    return {
        spot_id: d.spot_id,
        gene: d.gene,
        x: d.x,
        y: d.y,
        plane_id: d.plane_id,
        topGene,
        topProb,
        ClassName: names,   // gene names -> donut slice labels
        Prob: probs         // gene probs  -> donut slice values
    };
}

/**
 * Hover: refresh the panel with the hovered spot's gene distribution.
 * Frozen panel ignores hover; empty map keeps the last spot (panel never clears).
 */
export function handleSpotHover(info) {
    if (typeof isFrozen === 'function' && isFrozen()) return;
    if (!info || !info.picked || !info.object) return;
    updateSpot(buildSpotInfoData(info.object));
}

/**
 * Click (non-Ctrl): maximize + freeze on the clicked spot so the user can move
 * onto the panel and inspect the donut/table without it changing. Ctrl+click is
 * reserved for the checkSpot diagnostics handler and is ignored here.
 */
export function handleSpotClick(info) {
    if (!info || !info.object) return;
    const evt = info.srcEvent || info.sourceEvent;
    const ctrl = evt ? !!(evt.ctrlKey || evt.metaKey) : false;
    if (ctrl) return;   // diagnostics handled by the layer's own onClick
    freezeOnSpot(buildSpotInfoData(info.object));
}
