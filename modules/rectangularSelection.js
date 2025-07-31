/**
 * Rectangular Selection Plugin
 * 
 * Independent rectangular selection tool with marching ants animation
 * Can be plugged into any deck.gl-based application
 */

import { transformToTileCoordinates } from '../utils/coordinateTransform.js';
import { IMG_DIMENSIONS } from '../config/constants.js';

export class RectangularSelection {
    constructor(options = {}) {
        // Required dependencies
        this.deckglInstance = options.deckglInstance;
        this.coordinateTransform = options.coordinateTransform;
        this.imageDimensions = options.imageDimensions;
        
        // Data providers (injected dependencies)
        this.dataProvider = options.dataProvider;
        this.polygonProvider = options.polygonProvider;
        this.indexProvider = options.indexProvider;
        
        // For backward compatibility, expose state directly
        this.state = options.dataProvider?.state;
        
        // Configuration
        this.config = {
            maxSpotResults: options.maxSpotResults || 100,
            maxCellResults: options.maxCellResults || 50,
            minSelectionSize: options.minSelectionSize || 10,
            clearDelay: options.clearDelay || 2000,
            containerId: options.containerId || 'map',
            requireCtrlKey: options.requireCtrlKey !== false,
            ...options.config
        };
        
        // Event handlers
        this.onSelectionComplete = options.onSelectionComplete || (() => {});
        this.onSelectionStart = options.onSelectionStart || (() => {});
        this.onSelectionEnd = options.onSelectionEnd || (() => {});
        
        // Internal state
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
        
        const mapContainer = document.getElementById(this.config.containerId);
        mapContainer.appendChild(this.selectionOverlay);
        
        this.ctx = this.selectionOverlay.getContext('2d');
        this.resizeOverlay();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeOverlay());
    }
    
    resizeOverlay() {
        const mapContainer = document.getElementById(this.config.containerId);
        const rect = mapContainer.getBoundingClientRect();
        
        this.selectionOverlay.width = rect.width;
        this.selectionOverlay.height = rect.height;
        this.selectionOverlay.style.width = rect.width + 'px';
        this.selectionOverlay.style.height = rect.height + 'px';
    }
    
    bindEvents() {
        const mapContainer = document.getElementById(this.config.containerId);
        
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
        const mapContainer = document.getElementById(this.config.containerId);
        
        if (this.isActive) {
            console.log('Rectangular selection mode ON - Hold Ctrl + Left Mouse button and drag to select');
            this.showSelectionNotification();
        } else {
            this.clearSelection();
            console.log('Rectangular selection mode OFF');
            this.hideSelectionNotification();
        }
    }
    
    onMouseDown(event) {
        if (!this.isActive || event.button !== 0) return;
        
        // Require Ctrl key to be pressed for selection (if configured)
        if (this.config.requireCtrlKey && !event.ctrlKey) return;
        
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
        
        const rect = document.getElementById(this.config.containerId).getBoundingClientRect();
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
        const width = Math.abs(this.endPoint.x - this.startPoint.x);
        const height = Math.abs(this.endPoint.y - this.startPoint.y);
        
        if (width > this.config.minSelectionSize && height > this.config.minSelectionSize) {
            this.processSelection();
        }
        
        // Clear selection after configured delay
        setTimeout(() => this.clearSelection(), this.config.clearDelay);
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
        
        // Use single coordinate system: deck/tile coordinates for everything
        const bounds = {
            left: Math.min(deckStart[0], deckEnd[0]),
            right: Math.max(deckStart[0], deckEnd[0]),
            top: Math.min(deckStart[1], deckEnd[1]),
            bottom: Math.max(deckStart[1], deckEnd[1])
        };
        
        console.log('Selection bounding box (tile coordinates):', bounds);
        
        // Test all cells that intersect with selection using spatial index
        this.testAllCellsIntersection(bounds);
        
        // Extract spots within bounds (spots will be transformed to tile coordinates)
        const selectedSpots = this.extractSpotsInBounds(bounds);
        const selectedCells = this.extractCellsInBounds(bounds);
        
        this.outputResults(bounds, selectedSpots, selectedCells);
    }
    
    extractSpotsInBounds(bounds) {
        const spots = [];
        const maxOutput = this.config.maxSpotResults;
        
        if (!this.state.geneDataMap) return spots;
        
        this.state.geneDataMap.forEach((geneSpots, geneName) => {
            for (const spot of geneSpots) {
                if (spots.length >= maxOutput) break;
                
                // Transform spot coordinates from world/pixel space to tile coordinates
                const [tileX, tileY] = transformToTileCoordinates(spot.x, spot.y, IMG_DIMENSIONS);
                
                if (tileX >= bounds.left && tileX <= bounds.right &&
                    tileY >= bounds.top && tileY <= bounds.bottom) {
                    
                    // Get parent cell information
                    const parentCell = spot.neighbour ? this.state.cellDataMap.get(spot.neighbour) : null;
                    
                    spots.push({
                        gene: geneName,
                        x: spot.x, // Keep original coordinates in output
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
        const maxOutput = this.config.maxCellResults;
        
        if (!this.state.cellDataMap) return cells;
        
        this.state.cellDataMap.forEach((cellData, cellId) => {
            if (cells.length >= maxOutput) return;
            
            const pos = cellData.position;
            
            // Transform cell coordinates from world/pixel space to tile coordinates
            const [tileX, tileY] = transformToTileCoordinates(pos.x, pos.y, IMG_DIMENSIONS);
            
            if (tileX >= bounds.left && tileX <= bounds.right &&
                tileY >= bounds.top && tileY <= bounds.bottom) {
                
                cells.push({
                    cell_id: cellId,
                    x: pos.x, // Keep original coordinates in output
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
    
    async testCellIntersectionAllPlanes(cellId, cellPlanes, bounds) {
        console.log(`=== TESTING CELL ${cellId} ACROSS ${cellPlanes.length} PLANES ===`);
        console.log(`🎯 Cell ${cellId} planes: [${cellPlanes.join(', ')}]`);
        console.log(`🎯 Cell ${cellId} range: planes ${Math.min(...cellPlanes)} to ${Math.max(...cellPlanes)}`);
        
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
            // Get polygon data for this plane (load if not cached)
            let geojson = this.state.polygonCache.get(planeId);
            if (!geojson || !geojson.features) {
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
                } catch (error) {
                    console.error(`❌ Failed to load polygon data for plane ${planeId}:`, error);
                    results.push({
                        intersects: false,
                        cellId: cellId,
                        plane: planeId,
                        error: 'Failed to load polygon data'
                    });
                    return;
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
                return;
            }
            
            // Get cell boundary coordinates
            const cellCoords = cellFeature.geometry.coordinates[0];
            
            try {
                // Check if cell has enough coordinates to form a valid polygon
                if (cellCoords.length < 4) {
                    console.warn(`⚠️ Cell ${cellId} on plane ${planeId} has only ${cellCoords.length} coordinates - describes a line, not a ring. Skipping intersection test.`);
                    results.push({
                        intersects: false,
                        cellId: cellId,
                        plane: planeId,
                        warning: 'Insufficient coordinates for polygon (line geometry)'
                    });
                    return;
                }
                
                // Create cell boundary as a Turf polygon
                const cellPolygon = turf.polygon([cellCoords]);
                
                // Check if polygons intersect
                const intersects = turf.booleanIntersects(cellPolygon, selectionRectangle);
                
                if (intersects) {
                    totalIntersections++;
                    
                    // Get the clipped polygon boundary
                    const intersection = turf.intersect(cellPolygon, selectionRectangle);
                    
                    if (intersection) {
                        if (intersection.geometry.type === 'Polygon') {
                            const clippedCoords = intersection.geometry.coordinates[0];
                            
                            results.push({
                                intersects: true,
                                clippedBoundary: clippedCoords,
                                originalBoundary: cellCoords,
                                cellId: cellId,
                                plane: planeId
                            });
                        } else if (intersection.geometry.type === 'MultiPolygon') {
                            results.push({
                                intersects: true,
                                clippedBoundary: intersection.geometry.coordinates,
                                originalBoundary: cellCoords,
                                cellId: cellId,
                                plane: planeId,
                                isMultiPolygon: true
                            });
                        }
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
                console.error(`❌ Error during intersection on plane ${planeId} for cell ${cellId}:`, error.message);
                console.error(`📍 Offending coordinates (${cellCoords.length} points):`, cellCoords);
                console.error(`🔍 First few points:`, cellCoords.slice(0, 5));
                console.error(`🔍 Last few points:`, cellCoords.slice(-5));
                results.push({
                    intersects: false,
                    error: error.message,
                    cellId: cellId,
                    plane: planeId
                });
            }
        };
        
        // Execute tests for all planes and wait for completion
        const testPromises = cellPlanes.map(planeId => testPlaneIntersection(planeId));
        await Promise.all(testPromises);
        
        // Update total intersections after all tests complete
        totalIntersections = results.filter(r => r.intersects).length;
        
        console.log(`🎯 Cell ${cellId} intersects on ${totalIntersections}/${cellPlanes.length} planes`);
        
        return results;
    }
    
    async testCell7113IntersectionAllPlanes(bounds) {
        const targetCell = 7113;
        
        console.log(`=== TESTING CELL ${targetCell} ACROSS ALL PLANES ===`);
        
        // Wait for background index to complete
        let indexData;
        try {
            indexData = await window.cellBoundaryIndexPromise;
            console.log('✅ Using complete cell boundary index');
        } catch (error) {
            console.warn('⚠️ Background index failed, using fallback:', error);
            return this.testCell7113Intersection(bounds);
        }
        
        // Handle both old and new index data structures
        const cellBoundaryIndex = indexData.cellBoundaryIndex || indexData;
        const cellPlanes = cellBoundaryIndex.get(targetCell);
        
        if (!cellPlanes || cellPlanes.length === 0) {
            console.log(`❌ Cell ${targetCell} not found in index - falling back to current plane test`);
            return this.testCell7113Intersection(bounds);
        }
        
        // Use the generic function
        const results = await this.testCellIntersectionAllPlanes(targetCell, cellPlanes, bounds);
        
        // Display summary for cell 7113
        const totalIntersections = results.filter(r => r.intersects).length;
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
    
    async testAllCellsIntersection(bounds) {
        console.log(`=== TESTING ALL CELLS IN SELECTION AREA ===`);
        
        // Wait for background index to complete
        let indexData;
        try {
            indexData = await window.cellBoundaryIndexPromise;
            console.log('✅ Using complete cell boundary and spatial index');
        } catch (error) {
            console.warn('⚠️ Background index failed, skipping multi-cell testing:', error);
            return [];
        }
        
        // Check if spatial index is available
        if (!indexData.spatialIndex) {
            console.log('⚠️ Spatial index not ready, falling back to current plane only');
            return this.testCurrentPlaneCellsOnly(bounds);
        }
        
        const spatialIndex = indexData.spatialIndex;
        const cellBoundaryIndex = indexData.cellBoundaryIndex;
        
        // Use spatial index to find candidate cells
        const candidates = spatialIndex.search({
            minX: bounds.left,
            minY: bounds.top,
            maxX: bounds.right,
            maxY: bounds.bottom
        });
        
        console.log(`🗺️ Spatial query found ${candidates.length} candidate cells in selection area`);
        
        if (candidates.length === 0) {
            console.log('❌ No cells found in selection area');
            return [];
        }
        
        // Test each candidate cell across all its planes
        const allResults = [];
        const startTime = performance.now();
        
        for (const candidate of candidates) {
            console.log(`--- Testing cell ${candidate.cellId} (${candidate.planes.length} planes) ---`);
            
            const cellResults = await this.testCellIntersectionAllPlanes(
                candidate.cellId, 
                candidate.planes, 
                bounds
            );
            
            // Add results for this cell
            allResults.push(...cellResults.filter(r => r.intersects));
        }
        
        const endTime = performance.now();
        const testTime = (endTime - startTime) / 1000;
        
        // Summary statistics
        const intersectingCells = new Set(allResults.map(r => r.cellId));
        const totalIntersections = allResults.length;
        
        console.log(`🎯 MULTI-CELL INTERSECTION SUMMARY:`);
        console.log(`   • Tested ${candidates.length} candidate cells`);
        console.log(`   • Found ${intersectingCells.size} cells with intersections`);
        console.log(`   • Total intersections: ${totalIntersections} across all planes`);
        console.log(`   • Processing time: ${testTime.toFixed(2)}s`);
        
        // Group results by cell for summary
        const cellSummary = {};
        intersectingCells.forEach(cellId => {
            const cellResults = allResults.filter(r => r.cellId === cellId);
            const planeCount = cellResults.length;
            const clippedCount = cellResults.filter(r => r.clippedBoundary).length;
            
            cellSummary[cellId] = {
                totalPlanes: planeCount,
                clippedPlanes: clippedCount
            };
            
            console.log(`   • Cell ${cellId}: ${clippedCount}/${planeCount} planes with clipped boundaries`);
        });
        
        console.log('==========================================');
        
        return allResults;
    }
    
    async testCurrentPlaneCellsOnly(bounds) {
        console.log('🔄 Fallback: Testing cells on current plane only');
        
        const currentPlane = this.state.currentPlane;
        const geojson = this.state.polygonCache.get(currentPlane);
        
        if (!geojson || !geojson.features) {
            console.log(`❌ No polygon data for current plane ${currentPlane}`);
            return [];
        }
        
        const results = [];
        const selectionRectangle = turf.polygon([[
            [bounds.left, bounds.top],
            [bounds.right, bounds.top], 
            [bounds.right, bounds.bottom],
            [bounds.left, bounds.bottom],
            [bounds.left, bounds.top] // Close the polygon
        ]]);
        
        // Test all cells on current plane
        geojson.features.forEach(feature => {
            const cellId = parseInt(feature.properties.label);
            if (isNaN(cellId)) return;
            
            const cellCoords = feature.geometry.coordinates[0];
            
            // Check if cell has enough coordinates to form a valid polygon
            if (cellCoords.length < 4) {
                console.warn(`⚠️ Cell ${cellId} on plane ${currentPlane} has only ${cellCoords.length} coordinates - describes a line, not a ring. Skipping intersection test.`);
                return;
            }
            
            const cellPolygon = turf.polygon([cellCoords]);
            
            try {
                const intersects = turf.booleanIntersects(cellPolygon, selectionRectangle);
                
                if (intersects) {
                    const intersection = turf.intersect(cellPolygon, selectionRectangle);
                    
                    if (intersection) {
                        if (intersection.geometry.type === 'Polygon') {
                            results.push({
                                intersects: true,
                                clippedBoundary: intersection.geometry.coordinates[0],
                                originalBoundary: cellCoords,
                                cellId: cellId,
                                plane: currentPlane
                            });
                        } else if (intersection.geometry.type === 'MultiPolygon') {
                            results.push({
                                intersects: true,
                                clippedBoundary: intersection.geometry.coordinates,
                                originalBoundary: cellCoords,
                                cellId: cellId,
                                plane: currentPlane,
                                isMultiPolygon: true
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`Error testing cell ${cellId}:`, error);
            }
        });
        
        console.log(`📄 Current plane fallback: ${results.length} intersecting cells found on plane ${currentPlane}`);
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
        
        if (spots.length === this.config.maxSpotResults) {
            console.log(`Spot output limited to ${this.config.maxSpotResults} for performance`);
        }
        if (cells.length === this.config.maxCellResults) {
            console.log(`Cell output limited to ${this.config.maxCellResults} for performance`);
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
        
        const mapContainer = document.getElementById(this.config.containerId);
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