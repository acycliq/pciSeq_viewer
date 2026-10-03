/**
 * Is the point (x, y) inside the polygon? poly is [[x, y], ...], closed or not.
 * Ray casting: count how many edges a ray going right from the point crosses.
 * The charts use it to keep the cells whose centroid is inside a region; the chat
 * tools have the same test in the main process (electron/annotations.js).
 */
export function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
