/**
 * Rectangular Selection Module with Marching Ants
 * 
 * Provides rectangular selection functionality with animated marching ants outline
 */

import { IMG_DIMENSIONS } from '../config/constants.js';

export class RectangularSelection {
    constructor(deckglInstance, state) {
        this.deckglInstance = deckglInstance;
        this.state = state;
        this.isActive = false;
        this.isSelecting = false;
        this.startPoint = null;
        this.endPoint = null;
        this.selectionOverlay = null;
        this.animationId = null;
        
        this.setupOverlay();
        this.bindEvents();
    }
    
    setupOverlay() {
        // Create canvas overlay for marching ants
        this.selectionOverlay = document.createElement('canvas');
        this.selectionOverlay.id = 'selection-overlay';
        this.selectionOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 1000;
            display: none;
        `;
        
        const mapContainer = document.getElementById('map');
        mapContainer.appendChild(this.selectionOverlay);
        
        this.ctx = this.selectionOverlay.getContext('2d');
        this.resizeOverlay();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeOverlay());
    }
    
    resizeOverlay() {
        const mapContainer = document.getElementById('map');
        const rect = mapContainer.getBoundingClientRect();
        
        this.selectionOverlay.width = rect.width;
        this.selectionOverlay.height = rect.height;
        this.selectionOverlay.style.width = rect.width + 'px';
        this.selectionOverlay.style.height = rect.height + 'px';
    }
    
    bindEvents() {
        const mapContainer = document.getElementById('map');
        
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        
        mapContainer.addEventListener('mousedown', this.onMouseDown);
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
        document.addEventListener('keydown', this.onKeyDown);
    }
    
    onKeyDown(event) {
        // No keyboard shortcuts - using UI button instead
        return;
    }
    
    toggleSelectionMode() {
        this.isActive = !this.isActive;
        const mapContainer = document.getElementById('map');
        
        if (this.isActive) {
            console.log('Rectangular selection mode ON - Hold Ctrl + Left Mouse button and drag to selec');
            this.showSelectionNotification();
        } else {
            this.clearSelection();
            console.log('Rectangular selection mode OFF');
            this.hideSelectionNotification();
        }
    }
    
    onMouseDown(event) {
        if (!this.isActive || event.button !== 0) return;
        
        // Require Ctrl key to be pressed for selection
        if (!event.ctrlKey) return;
        
        event.preventDefault();
        event.stopPropagation();
        
        const rect = event.target.getBoundingClientRect();
        this.startPoint = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        
        this.isSelecting = true;
        this.selectionOverlay.style.display = 'block';
        this.startAnimation();
    }
    
    onMouseMove(event) {
        if (!this.isSelecting) return;
        
        const rect = document.getElementById('map').getBoundingClientRect();
        this.endPoint = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        
        this.drawMarchingAnts();
    }
    
    onMouseUp(event) {
        if (!this.isSelecting) return;
        
        this.isSelecting = false;
        this.stopAnimation();
        
        // Process selection if rectangle is large enough
        const minSize = 10;
        const width = Math.abs(this.endPoint.x - this.startPoint.x);
        const height = Math.abs(this.endPoint.y - this.startPoint.y);
        
        if (width > minSize && height > minSize) {
            this.processSelection();
        }
        
        // Clear selection after 2 seconds
        setTimeout(() => this.clearSelection(), 2000);
    }
    
    startAnimation() {
        let dashOffset = 0;
        
        const animate = () => {
            if (!this.isSelecting && !this.animationId) return;
            
            dashOffset += 0.5;
            if (dashOffset > 16) dashOffset = 0;
            
            this.drawMarchingAnts(dashOffset);
            this.animationId = requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    drawMarchingAnts(dashOffset = 0) {
        if (!this.startPoint || !this.endPoint) return;
        
        this.ctx.clearRect(0, 0, this.selectionOverlay.width, this.selectionOverlay.height);
        
        const left = Math.min(this.startPoint.x, this.endPoint.x);
        const top = Math.min(this.startPoint.y, this.endPoint.y);
        const width = Math.abs(this.endPoint.x - this.startPoint.x);
        const height = Math.abs(this.endPoint.y - this.startPoint.y);
        
        // Draw marching ants border
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([8, 8]);
        this.ctx.lineDashOffset = dashOffset;
        this.ctx.strokeRect(left, top, width, height);
        
        // Draw white dashes on top for contrast
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([8, 8]);
        this.ctx.lineDashOffset = dashOffset + 8;
        this.ctx.strokeRect(left, top, width, height);
    }
    
    processSelection() {
        if (!this.startPoint || !this.endPoint) return;
        
        console.log('Processing rectangular selection...');
        
        // Convert screen coordinates to deck.gl tile coordinates
        const viewport = this.deckglInstance.getViewports()[0];
        
        const deckStart = viewport.unproject([this.startPoint.x, this.startPoint.y]);
        const deckEnd = viewport.unproject([this.endPoint.x, this.endPoint.y]);
        
        // Keep in tile coordinates - same as polygon data
        const bounds = {
            left: Math.min(deckStart[0], deckEnd[0]),
            right: Math.max(deckStart[0], deckEnd[0]),
            top: Math.min(deckStart[1], deckEnd[1]),
            bottom: Math.max(deckStart[1], deckEnd[1])
        };
        
        console.log('Selection bounding box:', bounds);
        
        // TEST: Check if cell 7113 boundary is clipped across all planes
        this.testCell7113IntersectionAllPlanes(bounds);
        
        // Extract spots within bounds
        const selectedSpots = this.extractSpotsInBounds(bounds);
        const selectedCells = this.extractCellsInBounds(bounds);
        
        this.outputResults(bounds, selectedSpots, selectedCells);
    }
    
    extractSpotsInBounds(bounds) {
        const spots = [];
        const maxOutput = 100;
        
        if (!this.state.geneDataMap) return spots;
        
        this.state.geneDataMap.forEach((geneSpots, geneName) => {
            for (const spot of geneSpots) {
                if (spots.length >= maxOutput) break;
                
                if (spot.x >= bounds.left && spot.x <= bounds.right &&
                    spot.y >= bounds.top && spot.y <= bounds.bottom) {
                    
                    // Get parent cell information
                    const parentCell = spot.neighbour ? this.state.cellDataMap.get(spot.neighbour) : null;
                    
                    spots.push({
                        gene: geneName,
                        x: spot.x,
                        y: spot.y,
                        z: spot.z || 0,
                        plane_id: spot.plane_id,
                        spot_id: spot.spot_id,
                        parent_cell_id: spot.neighbour || null,
                        parent_cell_X: parentCell ? parentCell.position.x : null,
                        parent_cell_Y: parentCell ? parentCell.position.y : null
                    });
                }
            }
            if (spots.length >= maxOutput) return;
        });
        
        return spots;
    }
    
    extractCellsInBounds(bounds) {
        const cells = [];
        const maxOutput = 50;
        
        if (!this.state.cellDataMap) return cells;
        
        this.state.cellDataMap.forEach((cellData, cellId) => {
            if (cells.length >= maxOutput) return;
            
            const pos = cellData.position;
            if (pos.x >= bounds.left && pos.x <= bounds.right &&
                pos.y >= bounds.top && pos.y <= bounds.bottom) {
                
                cells.push({
                    cell_id: cellId,
                    x: pos.x,
                    y: pos.y,
                    z: pos.z || 0,
                    cell_class: cellData.cellClass,
                    probability: cellData.probability
                });
            }
        });
        
        return cells;
    }
    
    testCell7113Intersection(bounds) {
        const targetPlane = 50;
        const targetCell = 7113;
        
        console.log(`=== TESTING CELL ${targetCell} ON PLANE ${targetPlane} ===`);
        
        // Check if we're on the right plane
        if (this.state.currentPlane !== targetPlane) {
            console.log(`❌ Not on target plane. Current plane: ${this.state.currentPlane}, Target plane: ${targetPlane}`);
            return;
        }
        
        // Get polygon data for current plane
        const geojson = this.state.polygonCache.get(targetPlane);
        if (!geojson || !geojson.features) {
            console.log(`❌ No polygon data for plane ${targetPlane}`);
            return;
        }
        
        // Find cell 7113 boundary
        const cell7113 = geojson.features.find(feature => 
            feature.properties.label === targetCell
        );
        
        if (!cell7113) {
            console.log(`❌ Cell ${targetCell} not found on plane ${targetPlane}`);
            return;
        }
        
        console.log(`✅ Found cell ${targetCell} on plane ${targetPlane}`);
        
        // Get cell boundary coordinates
        const cellCoords = cell7113.geometry.coordinates[0];
        console.log(`Cell ${targetCell} boundary coordinates:`, cellCoords.slice(0, 3)); // Show first 3 points
        
        // Create selection rectangle as a Turf polygon
        const selectionRectangle = turf.polygon([[
            [bounds.left, bounds.top],
            [bounds.right, bounds.top], 
            [bounds.right, bounds.bottom],
            [bounds.left, bounds.bottom],
            [bounds.left, bounds.top] // Close the polygon
        ]]);
        
        // Create cell boundary as a Turf polygon
        const cellPolygon = turf.polygon([cellCoords]);
        
        console.log('Selection rectangle:', selectionRectangle.geometry.coordinates[0]);
        console.log(`Cell ${targetCell} polygon has ${cellCoords.length} vertices`);
        
        try {
            // Check if polygons intersect
            const intersects = turf.booleanIntersects(cellPolygon, selectionRectangle);
            
            if (intersects) {
                console.log(`🎯 YES! Selection box CLIPS cell ${targetCell} boundary!`);
                
                // Get the clipped polygon boundary
                const intersection = turf.intersect(cellPolygon, selectionRectangle);
                
                if (intersection) {
                    console.log(`📐 CLIPPED BOUNDARY COORDINATES:`);
                    console.log('Intersection type:', intersection.geometry.type);
                    
                    if (intersection.geometry.type === 'Polygon') {
                        const clippedCoords = intersection.geometry.coordinates[0];
                        console.log(`Clipped polygon has ${clippedCoords.length} vertices:`);
                        console.log('Clipped coordinates:', clippedCoords);
                        
                        // Return the clipped coordinates for further use
                        return {
                            intersects: true,
                            clippedBoundary: clippedCoords,
                            originalBoundary: cellCoords,
                            cellId: targetCell,
                            plane: targetPlane
                        };
                    } else if (intersection.geometry.type === 'MultiPolygon') {
                        console.log(`Clipped result is MultiPolygon with ${intersection.geometry.coordinates.length} parts:`);
                        intersection.geometry.coordinates.forEach((poly, index) => {
                            console.log(`Part ${index + 1}:`, poly[0]);
                        });
                        
                        return {
                            intersects: true,
                            clippedBoundary: intersection.geometry.coordinates,
                            originalBoundary: cellCoords,
                            cellId: targetCell,
                            plane: targetPlane,
                            isMultiPolygon: true
                        };
                    }
                } else {
                    console.log(`⚠️ Polygons intersect but turf.intersect returned null`);
                }
            } else {
                console.log(`❌ NO intersection with cell ${targetCell} boundary`);
                return {
                    intersects: false,
                    cellId: targetCell,
                    plane: targetPlane
                };
            }
        } catch (error) {
            console.error('Error during polygon intersection:', error);
            return {
                intersects: false,
                error: error.message,
                cellId: targetCell,
                plane: targetPlane
            };
        }
        
        console.log('===================================');
    }
    
    async testCell7113IntersectionAllPlanes(bounds) {
        const targetCell = 7113;
        
        console.log(`=== TESTING CELL ${targetCell} ACROSS ALL PLANES ===`);
        
        // Wait for background index to complete
        let cellBoundaryIndex;
        try {
            cellBoundaryIndex = await window.cellBoundaryIndexPromise;
            console.log('✅ Using complete cell boundary index');
        } catch (error) {
            console.warn('⚠️ Background index failed, using fallback:', error);
            return this.testCell7113Intersection(bounds);
        }
        
        // Get all planes where cell 7113 has boundaries
        const cellPlanes = cellBoundaryIndex.get(targetCell);
        if (!cellPlanes || cellPlanes.length === 0) {
            console.log(`❌ Cell ${targetCell} not found in index - falling back to current plane test`);
            return this.testCell7113Intersection(bounds);
        }
        
        console.log(`✅ Cell ${targetCell} found on ${cellPlanes.length} planes: [${cellPlanes.join(', ')}]`);
        console.log(`🎯 Cell ${targetCell} range: planes ${Math.min(...cellPlanes)} to ${Math.max(...cellPlanes)}`);
        
        // Create selection rectangle once (reuse for all planes)
        const selectionRectangle = turf.polygon([[
            [bounds.left, bounds.top],
            [bounds.right, bounds.top], 
            [bounds.right, bounds.bottom],
            [bounds.left, bounds.bottom],
            [bounds.left, bounds.top] // Close the polygon
        ]]);
        
        const results = [];
        let totalIntersections = 0;
        
        // Test intersection on each plane where the cell exists
        const testPlaneIntersection = async (planeId) => {
            console.log(`--- Testing plane ${planeId} ---`);
            
            // Get polygon data for this plane (load if not cached)
            let geojson = this.state.polygonCache.get(planeId);
            if (!geojson || !geojson.features) {
                console.log(`⚠️ No polygon data cached for plane ${planeId} - loading dynamically`);
                try {
                    // Import loadPolygonData function dynamically
                    const { loadPolygonData } = await import('./dataLoaders.js');
                    
                    // Load polygon data for this plane
                    geojson = await loadPolygonData(
                        planeId, 
                        this.state.polygonCache, 
                        this.state.allCellClasses, 
                        this.state.cellDataMap
                    );
                    
                    console.log(`✅ Loaded polygon data for plane ${planeId}`);
                } catch (error) {
                    console.error(`❌ Failed to load polygon data for plane ${planeId}:`, error);
                    results.push({
                        intersects: false,
                        cellId: targetCell,
                        plane: planeId,
                        error: 'Failed to load polygon data'
                    });
                    return;
                }
            }
            
            // Find cell 7113 boundary on this plane
            const cellFeature = geojson.features.find(feature => 
                feature.properties.label === targetCell
            );
            
            if (!cellFeature) {
                console.log(`⚠️ Cell ${targetCell} not found in polygon data for plane ${planeId}`);
                results.push({
                    intersects: false,
                    cellId: targetCell,
                    plane: planeId,
                    error: 'Cell not found in polygon data'
                });
                return;
            }
            
            // Get cell boundary coordinates
            const cellCoords = cellFeature.geometry.coordinates[0];
            console.log(`Cell ${targetCell} on plane ${planeId}: ${cellCoords.length} vertices`);
            
            try {
                // Create cell boundary as a Turf polygon
                const cellPolygon = turf.polygon([cellCoords]);
                
                // Check if polygons intersect
                const intersects = turf.booleanIntersects(cellPolygon, selectionRectangle);
                
                if (intersects) {
                    console.log(`🎯 INTERSECTION on plane ${planeId}!`);
                    totalIntersections++;
                    
                    // Get the clipped polygon boundary
                    const intersection = turf.intersect(cellPolygon, selectionRectangle);
                    
                    if (intersection) {
                        console.log(`📐 Clipped boundary type: ${intersection.geometry.type}`);
                        
                        if (intersection.geometry.type === 'Polygon') {
                            const clippedCoords = intersection.geometry.coordinates[0];
                            console.log(`Plane ${planeId}: ${clippedCoords.length} clipped vertices`);
                            
                            results.push({
                                intersects: true,
                                clippedBoundary: clippedCoords,
                                originalBoundary: cellCoords,
                                cellId: targetCell,
                                plane: planeId
                            });
                        } else if (intersection.geometry.type === 'MultiPolygon') {
                            console.log(`Plane ${planeId}: MultiPolygon with ${intersection.geometry.coordinates.length} parts`);
                            
                            results.push({
                                intersects: true,
                                clippedBoundary: intersection.geometry.coordinates,
                                originalBoundary: cellCoords,
                                cellId: targetCell,
                                plane: planeId,
                                isMultiPolygon: true
                            });
                        }
                    } else {
                        console.log(`⚠️ Plane ${planeId}: Intersection detected but turf.intersect returned null`);
                        results.push({
                            intersects: true,
                            cellId: targetCell,
                            plane: planeId,
                            error: 'Intersection failed'
                        });
                    }
                } else {
                    console.log(`❌ No intersection on plane ${planeId}`);
                    results.push({
                        intersects: false,
                        cellId: targetCell,
                        plane: planeId
                    });
                }
            } catch (error) {
                console.error(`Error during intersection on plane ${planeId}:`, error);
                results.push({
                    intersects: false,
                    error: error.message,
                    cellId: targetCell,
                    plane: planeId
                });
            }
        };
        
        // Execute tests for all planes and wait for completion
        const testPromises = cellPlanes.map(planeId => testPlaneIntersection(planeId));
        await Promise.all(testPromises);
        
        // Update total intersections after all tests complete
        totalIntersections = results.filter(r => r.intersects).length;
        
        console.log(`🎯 SUMMARY: Cell ${targetCell} intersects on ${totalIntersections}/${cellPlanes.length} planes`);
        
        // Display summary of clipped boundaries
        if (totalIntersections > 0) {
            console.log(`📐 CLIPPED BOUNDARIES SUMMARY:`);
            results.filter(r => r.intersects && r.clippedBoundary).forEach(result => {
                if (result.isMultiPolygon) {
                    console.log(`Plane ${result.plane}: MultiPolygon with ${result.clippedBoundary.length} parts`);
                } else {
                    console.log(`Plane ${result.plane}: ${result.clippedBoundary.length} vertices`);
                }
            });
        }
        
        console.log('===========================================');
        
        return results;
    }
    
    outputResults(bounds, spots, cells) {
        console.log('Rectangular Selection Results:', {
            bounds: {
                left: bounds.left.toFixed(2),
                right: bounds.right.toFixed(2),
                top: bounds.top.toFixed(2),
                bottom: bounds.bottom.toFixed(2),
                note: 'Coordinates in tile space'
            },
            spots: {
                count: spots.length,
                data: spots
            },
            cells: {
                count: cells.length,
                data: cells
            }
        });
        
        if (spots.length === 100) {
            console.log('Spot output limited to 100 for performance');
        }
        if (cells.length === 50) {
            console.log('Cell output limited to 50 for performance');
        }
    }
    
    showSelectionNotification() {
        // Create or get existing notification element
        let notification = document.getElementById('selection-mode-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'selection-mode-notification';
            document.body.appendChild(notification);
        }
        
        notification.textContent = 'Selection Mode ON - Hold Ctrl + Left Mouse button and drag to select';
        notification.style.display = 'block';
    }
    
    hideSelectionNotification() {
        const notification = document.getElementById('selection-mode-notification');
        if (notification) {
            notification.style.display = 'none';
        }
    }
    
    clearSelection() {
        this.selectionOverlay.style.display = 'none';
        this.ctx.clearRect(0, 0, this.selectionOverlay.width, this.selectionOverlay.height);
        this.startPoint = null;
        this.endPoint = null;
        this.stopAnimation();
    }
    
    destroy() {
        this.clearSelection();
        this.hideSelectionNotification();
        
        const mapContainer = document.getElementById('map');
        mapContainer.removeEventListener('mousedown', this.onMouseDown);
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('keydown', this.onKeyDown);
        
        if (this.selectionOverlay) {
            this.selectionOverlay.remove();
        }
        
        // Remove notification element
        const notification = document.getElementById('selection-mode-notification');
        if (notification) {
            notification.remove();
        }
    }
}