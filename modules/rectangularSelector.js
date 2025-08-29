/**
 * Rectangular Selector
 * 
 * A streamlined rectangular selection tool for the transcriptomics viewer.
 * Provides essential functionality for selecting spots and cell boundaries
 * within a rectangular area with consistent pixel coordinate output.
 * 
 * CRITICAL MULTI-PLANE REQUIREMENT:
 * This tool MUST return ALL spots from ALL planes within the selection box,
 * and ALL clipped cell boundaries from ALL cells across ALL planes where 
 * the cell boundary intersects with the selection rectangle. This is a core
 * requirement for the transcriptomics analysis workflow - DO NOT simplify 
 * away the multi-plane functionality without sound justification.
 * The 3D nature of the dataset requires cross-plane analysis capabilities.
 */

import { transformToTileCoordinates, transformFromTileCoordinates } from '../utils/coordinateTransform.js';
import { IMG_DIMENSIONS } from '../config/constants.js';

/**
 * Get cell class color using the global color scheme
 * @param {string} className - Cell class name
 * @returns {string} Hex color code
 */
function getCellClassColor(className) {
    // Use the same logic as main UI's getCellClassColor function
    if (typeof classColorsCodes === 'function') {
        const colorConfig = classColorsCodes();
        const classEntry = colorConfig.find(entry => entry.className === className);
        if (classEntry && classEntry.color) {
            // Return hex color (chunk viewer expects hex, main UI uses RGB arrays elsewhere)
            return classEntry.color;
        } else {
            console.log(`No color found for ${className}, using fallback gray`);
        }
    } else {
        console.warn('classColorsCodes function not available');
    }
    // Fallback to gray if no color found
    return '#C0C0C0';
}

export class RectangularSelector {
    constructor(deckglInstance, state) {
        this.deck = deckglInstance;
        this.state = state;
        this.isActive = false;
        this.isSelecting = false;
        this.startPos = null;
        this.endPos = null;
        
        this.bindEvents();
    }
    
    bindEvents() {
        const container = document.getElementById('map');
        container.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }
    
    toggle() {
        this.isActive = !this.isActive;
        console.log('Selection mode:', this.isActive ? 'ON' : 'OFF');
        try {
            const container = document.getElementById('map');
            if (container) {
                container.style.cursor = this.isActive ? 'crosshair' : 'default';
            }
            
            // Update button appearance
            const button = document.getElementById('selectionToolBtn');
            if (button) {
                if (this.isActive) {
                    // Active state: blue background
                    button.style.background = '#3b82f6';
                    button.style.borderColor = '#60a5fa';
                } else {
                    // Inactive state: restore original dark background
                    button.style.background = '#1f2937';
                    button.style.borderColor = '#334155';
                }
            }
        } catch {}
    }
    
    onMouseDown(e) {
        if (!this.isActive || !e.ctrlKey) return;
        
        this.isSelecting = true;
        const rect = e.target.getBoundingClientRect();
        this.startPos = [e.clientX - rect.left, e.clientY - rect.top];
        this.endPos = this.startPos;
    }
    
    onMouseMove(e) {
        if (!this.isSelecting) return;
        
        const rect = document.getElementById('map').getBoundingClientRect();
        this.endPos = [e.clientX - rect.left, e.clientY - rect.top];
        this.drawSelection();
    }
    
    onMouseUp(e) {
        if (!this.isSelecting) return;
        
        this.isSelecting = false;
        this.processSelection();
        this.clearSelection();
    }
    
    drawSelection() {
        let overlay = document.getElementById('selection-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'selection-overlay';
            overlay.style.cssText = `
                position: absolute;
                border: 2px dashed white;
                background: rgba(255,255,255,0.1);
                pointer-events: none;
                z-index: 1000;
            `;
            document.getElementById('map').appendChild(overlay);
        }
        
        const left = Math.min(this.startPos[0], this.endPos[0]);
        const top = Math.min(this.startPos[1], this.endPos[1]);
        const width = Math.abs(this.endPos[0] - this.startPos[0]);
        const height = Math.abs(this.endPos[1] - this.startPos[1]);
        
        overlay.style.left = left + 'px';
        overlay.style.top = top + 'px';
        overlay.style.width = width + 'px';
        overlay.style.height = height + 'px';
        overlay.style.display = 'block';
    }
    
    async processSelection() {
        // Pre-open a window synchronously to avoid popup blockers; set URL after data is ready
        const windowFeatures = 'width=1200,height=800,toolbar=no,menubar=no,scrollbars=no,resizable=yes';
        let preOpenedWin = null;
        try { preOpenedWin = window.open('about:blank', 'chunkViewer', windowFeatures); } catch {}

        const viewport = this.deck.getViewports()[0];
        const bounds = this.getSelectionBounds(viewport);
        
        const spots = this.getSpotsInBounds(bounds);
        const clippedCells = await this.getClippedCellsInBounds(bounds);
        
        // Convert bounds from tile coordinates to pixel coordinates
        const [pixelLeft, pixelTop] = transformFromTileCoordinates(bounds.left, bounds.top, IMG_DIMENSIONS);
        const [pixelRight, pixelBottom] = transformFromTileCoordinates(bounds.right, bounds.bottom, IMG_DIMENSIONS);
        
        // Calculate stack depth in pixel coordinates
        const userConfig = window.config();
        const [xVoxel, yVoxel, zVoxel] = userConfig.voxelSize;
        const stackDepth = userConfig.totalPlanes * (zVoxel / xVoxel);
        
        // Convert cell boundaries from tile coordinates to pixel coordinates
        const clippedCellsInPixels = clippedCells.map(cell => ({
            ...cell,
            clippedBoundary: cell.clippedBoundary ? cell.clippedBoundary.map(([x, y]) => {
                const [pixelX, pixelY] = transformFromTileCoordinates(x, y, IMG_DIMENSIONS);
                return [pixelX, pixelY];
            }) : null,
            originalBoundary: cell.originalBoundary ? cell.originalBoundary.map(([x, y]) => {
                const [pixelX, pixelY] = transformFromTileCoordinates(x, y, IMG_DIMENSIONS);
                return [pixelX, pixelY];
            }) : null
        }));
        
        const selectionResults = {
            bounds: {
                left: pixelLeft,
                right: pixelRight,
                top: pixelTop,
                bottom: pixelBottom,
                depth: stackDepth,
                note: 'Coordinates in pixel space'
            },
            spots: {
                count: spots.length,
                data: spots
            },
            cells: {
                count: clippedCellsInPixels.length,
                note: 'Clipped cell boundaries that intersect with selection',
                data: clippedCellsInPixels
            }
        };
        
        console.log('Rectangular Selection Results:', selectionResults);
        
        // 🚀 AUTOMATIC PIPELINE: Launch chunk viewer (ensure opener data is set before navigating)
        try {
            window.lastSelectionResults = selectionResults;
            const url = `voxel-viewer/voxel-viewer.html?source=selection&auto=true`;
            if (preOpenedWin) {
                preOpenedWin.location.href = url;
                preOpenedWin.focus();
            } else {
                this.launchChunkViewer(selectionResults);
            }
        } catch (e) {
            console.error('Failed to launch chunk viewer:', e);
        }
    }
    
    getSelectionBounds(viewport) {
        const start = viewport.unproject(this.startPos);
        const end = viewport.unproject(this.endPos);
        
        return {
            left: Math.min(start[0], end[0]),
            right: Math.max(start[0], end[0]),
            top: Math.min(start[1], end[1]),
            bottom: Math.max(start[1], end[1])
        };
    }
    
    getSpotsInBounds(bounds) {
        const spots = [];
        
        if (!this.state.geneDataMap) return spots;
        
        this.state.geneDataMap.forEach((geneSpots, geneName) => {
            geneSpots.forEach(spot => {
                // Transform spot coordinates to tile coordinates to match bounds
                const [tileX, tileY] = transformToTileCoordinates(spot.x, spot.y, IMG_DIMENSIONS);
                
                if (tileX >= bounds.left && tileX <= bounds.right &&
                    tileY >= bounds.top && tileY <= bounds.bottom) {
                    
                    // Get parent cell information
                    const parentCell = spot.neighbour ? this.state.cellDataMap.get(spot.neighbour) : null;
                    
                    spots.push({
                        gene: geneName,
                        x: spot.x, // Keep original coordinates
                        y: spot.y,
                        z: spot.z || 0,
                        plane_id: spot.plane_id,
                        spot_id: spot.spot_id,
                        parent_cell_id: spot.neighbour || null,
                        parent_cell_X: parentCell ? parentCell.position.x : null,
                        parent_cell_Y: parentCell ? parentCell.position.y : null,
                        parent_cell_Z: parentCell ? parentCell.position.z : null
                    });
                }
            });
        });
        
        return spots;
    }
    
    getCellsInBounds(bounds) {
        const currentPlane = this.state.currentPlane;
        const geojson = this.state.polygonCache.get(currentPlane);
        
        if (!geojson?.features) return [];
        
        const cells = [];
        
        geojson.features.forEach(feature => {
            const coords = feature.geometry.coordinates[0];
            if (!coords || coords.length < 4) return;
            
            const cellBounds = this.getCellBounds(coords);
            
            if (this.boundsOverlap(bounds, cellBounds)) {
                cells.push({
                    cellId: feature.properties.label,
                    plane: currentPlane,
                    coordinates: coords
                });
            }
        });
        
        return cells;
    }
    
    getCellBounds(coords) {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        coords.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        });
        
        return { left: minX, right: maxX, top: minY, bottom: maxY };
    }
    
    boundsOverlap(bounds1, bounds2) {
        return bounds1.left <= bounds2.right &&
               bounds1.right >= bounds2.left &&
               bounds1.top <= bounds2.bottom &&
               bounds1.bottom >= bounds2.top;
    }
    
    async getClippedCellsInBounds(bounds) {
        // Try to use background index for multi-plane cell lookup
        let indexData;
        try {
            indexData = await window.cellBoundaryIndexPromise;
        } catch (error) {
            console.log('Background index not available, using current plane only');
            return this.getCurrentPlaneClippedCells(bounds);
        }
        // If Arrow mode disabled indexing, or index not ready, fallback gracefully
        if (!indexData || !indexData.spatialIndex) {
            console.log('Spatial index not ready, using current plane only');
            return this.getCurrentPlaneClippedCells(bounds);
        }
        
        // Use spatial index to find candidate cells
        const candidates = indexData.spatialIndex.search({
            minX: bounds.left,
            minY: bounds.top,
            maxX: bounds.right,
            maxY: bounds.bottom
        });
        
        console.log(`Found ${candidates.length} candidate cells in selection area`);
        
        if (candidates.length === 0) return [];
        
        // Test each candidate cell across all its planes
        const allResults = [];
        
        for (const candidate of candidates) {
            const cellResults = await this.clipCellAcrossPlanes(
                candidate.cellId, 
                candidate.planes, 
                bounds
            );
            allResults.push(...cellResults.filter(r => r.intersects));
        }
        
        console.log(`Multi-plane clipping: ${allResults.length} intersecting cell boundaries found`);
        return allResults;
    }
    
    async clipCellAcrossPlanes(cellId, cellPlanes, bounds) {
        const results = [];
        
        // Create selection rectangle once
        const selectionRectangle = turf.polygon([[
            [bounds.left, bounds.top],
            [bounds.right, bounds.top], 
            [bounds.right, bounds.bottom],
            [bounds.left, bounds.bottom],
            [bounds.left, bounds.top]
        ]]);
        
        // Test intersection on each plane where the cell exists
        for (const planeId of cellPlanes) {
            // Get polygon data for this plane
            let geojson = this.state.polygonCache.get(planeId);
            if (!geojson || !geojson.features) {
                try {
                    // Load polygon data if not cached
                    const { loadPolygonData } = await import('./dataLoaders.js');
                    geojson = await loadPolygonData(
                        planeId, 
                        this.state.polygonCache, 
                        this.state.allCellClasses, 
                        this.state.cellDataMap
                    );
                } catch (error) {
                    console.error(`Failed to load polygon data for plane ${planeId}`);
                    results.push({
                        intersects: false,
                        cellId: cellId,
                        plane: planeId,
                        error: 'Failed to load polygon data'
                    });
                    continue;
                }
            }
            
            // Find cell boundary on this plane
            const cellFeature = geojson.features.find(feature => 
                parseInt(feature.properties.label) === cellId
            );
            
            if (!cellFeature) {
                results.push({
                    intersects: false,
                    cellId: cellId,
                    plane: planeId,
                    error: 'Cell not found in polygon data'
                });
                continue;
            }
            
            // Get cell boundary coordinates
            const cellCoords = cellFeature.geometry.coordinates[0];
            
            try {
                // Check if cell has enough coordinates to form a valid polygon
                if (cellCoords.length < 4) {
                    results.push({
                        intersects: false,
                        cellId: cellId,
                        plane: planeId,
                        warning: 'Insufficient coordinates for polygon'
                    });
                    continue;
                }
                
                // Create cell boundary as a Turf polygon
                const cellPolygon = turf.polygon([cellCoords]);
                
                // Check if polygons intersect
                const intersects = turf.booleanIntersects(cellPolygon, selectionRectangle);
                
                if (intersects) {
                    // Get the clipped polygon boundary
                    const intersection = turf.intersect(cellPolygon, selectionRectangle);
                    
                    if (intersection) {
                        // Get cell class from feature properties (already computed by main UI)
                        const cellClassName = cellFeature.properties.cellClass;
                        const cellColor = getCellClassColor(cellClassName || 'Generic');
                        console.log(`Cell ${cellId}: cellClass=${cellClassName || 'missing'}, color=${cellColor}`);
                        
                        results.push({
                            intersects: true,
                            clippedBoundary: intersection.geometry.coordinates[0],
                            originalBoundary: cellCoords,
                            cellId: cellId,
                            plane: planeId,
                            cellColor: cellColor  // Add cell color as hex code
                        });
                    } else {
                        results.push({
                            intersects: true,
                            cellId: cellId,
                            plane: planeId,
                            error: 'Intersection failed'
                        });
                    }
                } else {
                    results.push({
                        intersects: false,
                        cellId: cellId,
                        plane: planeId
                    });
                }
            } catch (error) {
                console.error(`Error during intersection on plane ${planeId} for cell ${cellId}:`, error);
                results.push({
                    intersects: false,
                    error: error.message,
                    cellId: cellId,
                    plane: planeId
                });
            }
        }
        
        return results;
    }
    
    getCurrentPlaneClippedCells(bounds) {
        console.log('Fallback: Testing cells on current plane only');
        
        const currentPlane = this.state.currentPlane;
        const geojson = this.state.polygonCache.get(currentPlane);
        
        if (!geojson || !geojson.features) {
            console.log(`No polygon data for current plane ${currentPlane}`);
            return [];
        }
        
        const results = [];
        const selectionRectangle = turf.polygon([[
            [bounds.left, bounds.top],
            [bounds.right, bounds.top], 
            [bounds.right, bounds.bottom],
            [bounds.left, bounds.bottom],
            [bounds.left, bounds.top]
        ]]);
        
        // Test all cells on current plane
        geojson.features.forEach(feature => {
            const cellId = parseInt(feature.properties.label);
            if (isNaN(cellId)) return;
            
            const cellCoords = feature.geometry.coordinates[0];
            
            if (cellCoords.length < 4) {
                console.warn(`Cell ${cellId} has insufficient coordinates`);
                return;
            }
            
            const cellPolygon = turf.polygon([cellCoords]);
            
            try {
                const intersects = turf.booleanIntersects(cellPolygon, selectionRectangle);
                
                if (intersects) {
                    const intersection = turf.intersect(cellPolygon, selectionRectangle);
                    
                    if (intersection) {
                        const cellClassName = feature.properties.cellClass;
                        const cellColor = getCellClassColor(cellClassName || 'Generic');
                        results.push({
                            intersects: true,
                            clippedBoundary: intersection.geometry.coordinates[0],
                            originalBoundary: cellCoords,
                            cellId: cellId,
                            plane: currentPlane,
                            cellColor: cellColor
                        });
                    }
                }
            } catch (error) {
                console.error(`Error testing cell ${cellId}:`, error);
            }
        });
        
        console.log(`Current plane fallback: ${results.length} intersecting cells found on plane ${currentPlane}`);
        return results;
    }
    
    clearSelection() {
        const overlay = document.getElementById('selection-overlay');
        if (overlay) overlay.style.display = 'none';
    }
    
    launchChunkViewer(selectionData) {
        // Store data for chunk viewer access
        window.lastSelectionResults = selectionData;
        
        console.log('🚀 Launching chunk viewer with selection data');
        console.log(`Data: ${selectionData.spots.count} spots, ${selectionData.cells.count} cells`);
        
        // Auto-launch chunk viewer in new window
        const url = `voxel-viewer/voxel-viewer.html?source=selection&auto=true`;
        const windowFeatures = 'width=1200,height=800,toolbar=no,menubar=no,scrollbars=no,resizable=yes';
        
        try {
            const chunkWindow = window.open(url, 'chunkViewer', windowFeatures);
            
            if (chunkWindow) {
                chunkWindow.focus();
                console.log('✅ Chunk viewer window opened successfully');
            } else {
                console.warn('⚠️ Popup blocked - chunk viewer not opened');
                console.log('💡 Please enable popups and try again');
            }
        } catch (error) {
            console.error('❌ Failed to open chunk viewer:', error);
        }
    }
}
