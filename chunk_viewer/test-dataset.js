/**
 * Test/Demo Dataset Generator
 * Creates sample data in the specified structure for testing the minecraft-layer
 * with biological/spatial data instead of Minecraft blocks
 */

function generateTestDataset() {
  // Define bounds in pixel coordinates with depth for entire stack
  const bounds = {
    left: 0,
    right: 1000,
    top: 0,
    bottom: 800,
    depth: 120,  // ENTIRE STACK DEPTH in pixel coordinates
    note: "Coordinates in pixel space"
  };

  // Generate sample spots data across ALL planes
  const geneNames = ["ACTB", "GAPDH", "CD68", "KRT19", "DAPI", "PECAM1", "VIM", "PTPRC"];
  const numPlanes = 6;  // Total number of planes in the stack
  const spotsPerPlane = 25;  // Average spots per plane
  const spots = [];
  
  // Generate spots for each plane
  for (let planeId = 0; planeId < numPlanes; planeId++) {
    const spotsInThisPlane = spotsPerPlane + Math.floor((Math.random() - 0.5) * 10); // Vary count per plane
    
    for (let i = 0; i < spotsInThisPlane; i++) {
      const x = Math.random() * (bounds.right - bounds.left) + bounds.left;
      const y = Math.random() * (bounds.bottom - bounds.top) + bounds.top;
      // Z coordinate is isotropic (continuous depth position)
      const z = (planeId / (numPlanes - 1)) * bounds.depth + (Math.random() - 0.5) * 8; // Small variation within plane
      const gene = geneNames[Math.floor(Math.random() * geneNames.length)];
      
      // Some spots belong to cells, others don't
      const hasParentCell = Math.random() > 0.3;
      const parent_cell_id = hasParentCell ? Math.floor(Math.random() * 50) + 1 : null;
      const parent_cell_X = hasParentCell ? x + (Math.random() - 0.5) * 20 : null;
      const parent_cell_Y = hasParentCell ? y + (Math.random() - 0.5) * 20 : null;
      const parent_cell_Z = hasParentCell ? z + (Math.random() - 0.5) * 5 : null;
      
      spots.push({
        gene: gene,
        x: x,
        y: y,
        z: z,
        plane_id: planeId,  // Which plane this spot belongs to (anisotropic)
        spot_id: `plane${planeId}_spot_${i.toString().padStart(3, '0')}`,
        parent_cell_id: parent_cell_id,
        parent_cell_X: parent_cell_X,
        parent_cell_Y: parent_cell_Y,
        parent_cell_Z: parent_cell_Z
      });
    }
  }

  // Generate sample cell boundaries across ALL planes
  const uniqueCells = 12;  // Fewer cells but much larger
  const cells = [];
  
  for (let cellId = 1; cellId <= uniqueCells; cellId++) {
    const baseCenterX = Math.random() * (bounds.right - bounds.left) + bounds.left;
    const baseCenterY = Math.random() * (bounds.bottom - bounds.top) + bounds.top;
    const baseRadius = 60 + Math.random() * 80; // Much larger: 60-140 pixel radius
    
    // Each cell appears on multiple planes (realistic for 3D cells)
    const planesForThisCell = Math.floor(Math.random() * 4) + 2; // 2-5 planes per cell
    const startPlane = Math.floor(Math.random() * (numPlanes - planesForThisCell));
    
    for (let p = 0; p < planesForThisCell; p++) {
      const plane = startPlane + p;
      
      // Cell shape varies slightly between planes
      const centerX = baseCenterX + (Math.random() - 0.5) * 10;
      const centerY = baseCenterY + (Math.random() - 0.5) * 10;
      const radius = baseRadius * (0.8 + Math.random() * 0.4); // Vary size between planes
      
      // Generate irregular polygon boundary (approximating cell shape)
      const numVertices = 6 + Math.floor(Math.random() * 6); // 6-11 vertices
      const originalBoundary = [];
      const clippedBoundary = [];
      
      for (let j = 0; j < numVertices; j++) {
        const angle = (j / numVertices) * 2 * Math.PI;
        const r = radius * (0.7 + Math.random() * 0.6); // Vary radius for irregularity
        const x = centerX + r * Math.cos(angle);
        const y = centerY + r * Math.sin(angle);
        
        originalBoundary.push([x, y]);
        
        // Clip to bounds for clippedBoundary
        const clippedX = Math.max(bounds.left, Math.min(bounds.right, x));
        const clippedY = Math.max(bounds.top, Math.min(bounds.bottom, y));
        clippedBoundary.push([clippedX, clippedY]);
      }
      
      // Close the polygon
      originalBoundary.push(originalBoundary[0]);
      clippedBoundary.push(clippedBoundary[0]);
      
      cells.push({
        intersects: true,
        clippedBoundary: clippedBoundary,
        originalBoundary: originalBoundary,
        cellId: cellId,
        plane: plane
      });
    }
  }

  return {
    bounds: bounds,
    spots: {
      count: spots.length,
      data: spots
    },
    cells: {
      count: cells.length,
      note: "Clipped cell boundaries that intersect with selection",
      data: cells
    }
  };
}

// Export the function for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateTestDataset };
} else if (typeof window !== 'undefined') {
  window.generateTestDataset = generateTestDataset;
}

// Generate and log sample dataset when run directly
if (typeof require !== 'undefined' && require.main === module) {
  const dataset = generateTestDataset();
  console.log(JSON.stringify(dataset, null, 2));
}