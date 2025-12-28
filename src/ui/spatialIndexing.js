/**
 * Spatial Indexing Module
 *
 * Handles the creation and management of spatial indexes for cell boundaries.
 * Uses Web Workers for background processing of Arrow boundary data.
 */

import RBush from 'https://cdn.jsdelivr.net/npm/rbush@3.0.1/+esm';

/**
 * Process Arrow boundaries in main thread for spatial indexing
 * @param {string} manifestUrl - URL to the Arrow boundaries manifest
 * @param {Object} img - Image dimensions {width, height, tileSize}
 * @returns {Promise<Array>} Array of cell bounds objects
 */
export async function processArrowBoundariesForSpatialIndex(manifestUrl, img) {
    // Import Arrow dynamically
    const { tableFromIPC } = await import('https://cdn.jsdelivr.net/npm/apache-arrow@12.0.1/+esm');

    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);
    const shards = manifest.shards.map(s => ({
        url: new URL(s.url, baseDir).href,
        plane: Number(s.plane ?? -1)
    }));

    const cellMap = new Map();

    // Transform to tile space
    function toTileXY(x, y) {
        const { width, height, tileSize } = img;
        const maxDimension = Math.max(width, height);
        const xAdj = width / maxDimension;
        const yAdj = height / maxDimension;
        return [x * (tileSize / width) * xAdj, y * (tileSize / height) * yAdj];
    }

    // Process each shard
    for (const { url, plane } of shards) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue;

            const buffer = await response.arrayBuffer();
            const table = tableFromIPC(new Uint8Array(buffer));

            // Extract data from Arrow table
            const xListsCol = table.getChild('x_list');
            const yListsCol = table.getChild('y_list');
            const labelsCol = table.getChild('label');
            const planeCol = table.getChild('plane_id');

            if (!xListsCol || !yListsCol || !labelsCol) continue;

            const n = table.numRows;
            for (let i = 0; i < n; i++) {
                const xList = xListsCol.get(i)?.toArray();
                const yList = yListsCol.get(i)?.toArray();
                const label = Number(labelsCol.get(i));
                const planeId = planeCol ? Number(planeCol.get(i)) : (Number.isFinite(plane) ? plane : -1);

                if (!xList || !yList || xList.length < 2 || label < 0) continue;

                // Compute bounds in tile space
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (let k = 0; k < xList.length; k++) {
                    const [tx, ty] = toTileXY(Number(xList[k]), Number(yList[k]));
                    minX = Math.min(minX, tx);
                    maxX = Math.max(maxX, tx);
                    minY = Math.min(minY, ty);
                    maxY = Math.max(maxY, ty);
                }

                if (!cellMap.has(label)) {
                    cellMap.set(label, { minX, minY, maxX, maxY, planes: new Set() });
                }
                const acc = cellMap.get(label);
                acc.minX = Math.min(acc.minX, minX);
                acc.minY = Math.min(acc.minY, minY);
                acc.maxX = Math.max(acc.maxX, maxX);
                acc.maxY = Math.max(acc.maxY, maxY);
                if (Number.isFinite(planeId) && planeId >= 0) acc.planes.add(planeId);
            }
        } catch (e) {
            console.warn('Failed to process shard:', url, e.message);
        }
    }

    // Convert to array format for worker
    return Array.from(cellMap.entries()).map(([cellId, bounds]) => ({
        cellId,
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        planes: Array.from(bounds.planes)
    }));
}

/**
 * Start the spatial index worker
 * @param {Function} updateAllLayers - Callback to update layers when ready
 */
export function startSpatialIndexWorker(updateAllLayers) {
    const btn = document.getElementById('selectionToolBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Selection (Indexing)';
    }

    const cfg = window.config();
    const adv = window.advancedConfig ? window.advancedConfig() : null;

    if (!cfg.arrowBoundariesManifest) {
        throw new Error('arrowBoundariesManifest is not configured');
    }

    const manifest = new URL(cfg.arrowBoundariesManifest, window.location.href).href;
    const { imageWidth: width, imageHeight: height } = cfg;
    const tileSize = (adv && adv.visualization && adv.visualization.tileSize) ? adv.visualization.tileSize : 256;

    // Use absolute path to ensure correct resolution on GitHub Pages
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
    const workerUrl = new URL('modules/workers/spatial-index-worker.js', baseUrl);

    console.log('Starting spatial index worker:', workerUrl.href);
    console.log('Manifest URL:', manifest);

    const worker = new Worker(workerUrl);

    // Add onerror handler for worker creation failures
    worker.onerror = (error) => {
        console.error('Spatial index worker creation error:', error);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Selection Tool';
        }
    };

    // Add timeout fallback in case worker hangs
    const workerTimeout = setTimeout(() => {
        console.error('Spatial index worker timeout - terminating worker');
        worker.terminate();
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Selection Tool';
        }
    }, 45000); // 45 second timeout

    worker.onmessage = (ev) => {
        clearTimeout(workerTimeout);
        const { type, rtree, error } = ev.data || {};
        console.log('Worker message received:', type);

        if (type === 'indexReady' && rtree) {
            try {
                const tree = new RBush();
                tree.fromJSON(rtree);
                window.cellBoundaryIndexPromise = Promise.resolve({ spatialIndex: tree });
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Selection Tool';
                }
                console.log('Spatial index ready (worker)');
            } catch (e) {
                console.error('Failed to rehydrate spatial index:', e);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Selection Tool';
                }
            }
        } else if (type === 'error') {
            console.error('Index worker error:', error);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Selection Tool';
            }
        }
    };

    // Process Arrow boundaries in main thread, then send to worker for spatial indexing
    processArrowBoundariesForSpatialIndex(manifest, { width, height, tileSize })
        .then(cellBounds => {
            console.log(`Processed ${cellBounds.length} cells for spatial indexing`);
            worker.postMessage({ type: 'buildIndex', payload: { cellBounds } });
        })
        .catch(error => {
            console.error('Failed to process Arrow boundaries:', error);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Selection Tool';
            }
        });
}

/**
 * Setup the arrow-boundaries-ready event listener
 * @param {Function} updateAllLayers - Callback to update layers
 * @param {Object} state - Application state
 */
export function setupBoundariesReadyListener(updateAllLayers, state) {
    let markedReady = false;

    window.addEventListener('arrow-boundaries-ready', () => {
        updateAllLayers();

        if (!markedReady) {
            markedReady = true;

            // End-to-end ready mark (Arrow path)
            try {
                const Perf = window.Perf || { markInteractive: () => {} };
                Perf.markInteractive('arrow', { plane: state.currentPlane });
            } catch {}

            // Start spatial index worker (Arrow only) after READY
            try {
                startSpatialIndexWorker(updateAllLayers);
            } catch (e) {
                console.error('Failed to start spatial index worker:', e);
                const btn = document.getElementById('selectionToolBtn');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Selection Tool';
                }
            }
        }
    });
}