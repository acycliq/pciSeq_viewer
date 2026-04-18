// Computes hard misread status on-the-fly from prob_array.
//
// This is a deliberate fallback for Arrow files that predate the is_hard_misread
// column (added in pciSeq feature/gene_indexed_rho). Hard misread is defined as
// argmax(prob_array) == last column (background wins), which is independent of
// whether rho_g is treated as random or fixed — so this fallback is valid across
// all branches.
//
// Used in src/data/dataLoaders.js when is_hard_misread column is absent.
// Ask Dimitri if you want to delete this fallback.

function toArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Array.from(val);
}

export function isHardMisread(spot) {
    if (!spot.prob_array) return false;
    const p = toArray(spot.prob_array);
    if (p.length === 0) return false;
    const last = p.length - 1;
    let maxIdx = 0;
    for (let i = 1; i <= last; i++) {
        if (p[i] > p[maxIdx]) maxIdx = i;
    }
    return maxIdx === last;
}
