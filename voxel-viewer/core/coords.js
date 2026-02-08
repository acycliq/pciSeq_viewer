// Coordinate helpers and shared constants for the voxel viewer

// Voxel type identifiers
export const VOXEL_TYPE_STONE    = 0;
export const VOXEL_TYPE_GENE     = 1;
export const VOXEL_TYPE_CELL     = 2;
export const VOXEL_TYPE_BOUNDARY = 3;

/**
 * Compute the integer-aligned bounds used during voxelization.
 * Ensures voxel centers (i + 0.5) fall strictly inside float bounds.
 */
export function computeTransformedBounds(sel) {
  if (!sel) return null;
  return {
    left: Math.ceil(sel.left - 0.5),
    top: Math.ceil(sel.top - 0.5)
  };
}

/**
 * Convert a planeId to viewer depth using anisotropy (z/x voxel size ratio).
 */
export function planeIdToDepth(planeId, voxelSize) {
  const [xVoxel, , zVoxel] = voxelSize;
  return planeId * (zVoxel / xVoxel);
}

/**
 * Convert viewer coordinates [X, Y, Z] back to global coordinate space
 * consistent with how we present coordinates in tooltips.
 */
export function toGlobalPos(position, transformedBounds) {
  if (!Array.isArray(position) || !transformedBounds) return null;
  const x = position[0] + transformedBounds.left;  // X in global pixel space
  const y = position[2] + transformedBounds.top;    // Y in global pixel space
  const z = position[1];                            // Depth already in plane-based units
  return { x, y, z };
}

