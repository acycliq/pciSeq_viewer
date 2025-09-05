// Spatial Index Worker (RBush spatial indexing only)
// Receives processed cell boundary data from main thread and builds RBush spatial index
// Posts back a serialized RBush tree via toJSON for main-thread rehydration.

// Import RBush only - Arrow processing will be done in main thread
importScripts('https://unpkg.com/rbush@3.0.1/rbush.min.js');

// Simple function to build RBush spatial index from pre-processed cell data
function buildSpatialIndex(cellBounds) {
  const tree = new RBush();
  const boxes = [];
  
  for (const cellData of cellBounds) {
    boxes.push({
      minX: cellData.minX,
      minY: cellData.minY,
      maxX: cellData.maxX,
      maxY: cellData.maxY,
      cellId: cellData.cellId,
      planes: cellData.planes
    });
  }
  
  tree.load(boxes);
  return tree.toJSON();
}

self.onmessage = async (e) => {
  const { type, payload } = e.data || {};
  try {
    if (type === 'buildIndex') {
      // Receive pre-processed cell bounds data and build RBush index
      const rtreeJson = buildSpatialIndex(payload.cellBounds);
      postMessage({ type: 'indexReady', rtree: rtreeJson, cells: payload.cellBounds.length });
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (err) {
    postMessage({ type: 'error', error: String(err && err.message || err) });
  }
};

