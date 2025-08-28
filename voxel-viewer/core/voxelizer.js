// Core: voxel generation from raster masks

// Generate stone, cell (interior), and boundary voxels from masks.
// Disjoint boundary: interior excludes boundary pixels.
export function generateVoxelsFromMasks({
  maskByPlane,
  bounds,
  maxX,
  maxZ,
  totalPlanes,
  planeIdToSliceY,
  colorById
}) {
  const stoneVoxels = [];
  const cellVoxels = [];
  const boundaryVoxels = [];

  let totalBlocks = 0;
  let holesCreated = 0;

  // Fill interior/background first using mask lookups
  for (let x = 0; x < maxX; x++) {
    for (let planeId = 0; planeId < totalPlanes; planeId++) {
      const y = planeIdToSliceY(planeId);
      const mask = maskByPlane.get(planeId);
      for (let z = 0; z < maxZ; z++) {
        totalBlocks++;
        const idx = z * mask.width + x;
        const id = mask.labels[idx] || 0;
        if (id) {
          holesCreated++;
          const cellRgb = colorById.get(id) || [200, 200, 200];
          cellVoxels.push({
            position: [x, y, z],
            blockData: 0,
            temperature: 0.5,
            humidity: 0.5,
            lighting: 5,
            voxelType: 2,
            voxelId: id,
            index: cellVoxels.length,
            planeId: planeId,
            rgb: cellRgb,
            cellId: id
          });
          continue;
        }
        stoneVoxels.push({
          position: [x, y, z],
          blockData: 0,
          temperature: 0.5,
          humidity: 0.5,
          lighting: 10,
          voxelType: 0,
          voxelId: 0,
          index: stoneVoxels.length,
          planeId: planeId
        });
      }
    }
  }

  // Derive boundary voxels (4-neighborhood)
  for (let planeId = 0; planeId < totalPlanes; planeId++) {
    const mask = maskByPlane.get(planeId);
    const W = mask.width, H = mask.height;
    const y = planeIdToSliceY(planeId);
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const idx = z * W + x;
        const id = mask.labels[idx];
        if (!id) continue;
        const leftId  = x > 0     ? mask.labels[idx - 1] : 0;
        const rightId = x < W - 1 ? mask.labels[idx + 1] : 0;
        const upId    = z > 0     ? mask.labels[idx - W] : 0;
        const downId  = z < H - 1 ? mask.labels[idx + W] : 0;
        const isBoundary = (leftId !== id) || (rightId !== id) || (upId !== id) || (downId !== id);
        if (isBoundary) {
          const cellRgb = colorById.get(id) || [200, 200, 200];
          boundaryVoxels.push({
            position: [x, y, z],
            blockData: 0,
            temperature: 0.5,
            humidity: 0.5,
            lighting: 5,
            voxelType: 3,
            voxelId: id,
            index: boundaryVoxels.length,
            rgb: cellRgb,
            planeId: planeId,
            cellId: id
          });
        }
      }
    }
  }

  return {
    stoneVoxels,
    cellVoxels,
    boundaryVoxels,
    stats: { totalBlocks, holesCreated }
  };
}

