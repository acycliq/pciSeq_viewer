/**
 * The scaled z and the plane.
 *
 * pciSeq works in coordinates where z is stretched to the units of x,
 * z = z_plane * voxelSize[2] / voxelSize[0]. That z is what the spot files and the
 * cell centroids carry, so it is NOT a plane number. These two go between the two.
 *
 * Plane p is the stretch from p up to p + 1, so a z goes to its plane by floor,
 * never round. pciSeq gives a spot with z_plane 21.56 the plane_id 21, and a cell
 * centroid at plane 21.56 is on plane 21 too. With round the Python tools said 22
 * while the Centroid Plane here said 21 (pciSeq_3d e427077).
 *
 * The 1e-4 keeps a z sitting exactly on a plane from landing one below when
 * z / ratio comes out as 56.99999 in floating point.
 *
 * The source of the rule is plane_of in pciSeq/src/core/utils/geometry.py (pciSeq_3d
 * repo). The main process has a twin, planeOfZ in electron/run.js. Keep all three the
 * same; tests/planes.check.js here and tests/test_geometry.py there check the same
 * numbers.
 */

// the plane a scaled z is on
export function planeOf(z, voxelSize) {
    const [vx, , vz] = voxelSize;
    return Math.floor(z * vx / vz + 1e-4);
}

// the scaled z where a plane starts
export function planeToZ(plane, voxelSize) {
    const [vx, , vz] = voxelSize;
    return plane * vz / vx;
}
