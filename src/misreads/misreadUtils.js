// Hard misread: background column (last entry in prob_array) has the highest probability.
// prob_array may be an Arrow vector — normalise to a plain array first.

function toArray(p) {
    if (typeof p.toArray === 'function') return p.toArray();
    if (Array.isArray(p)) return p;
    return Array.from(p);
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