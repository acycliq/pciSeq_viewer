/**
* Polygon Interactions Module
*
* Keep here mouse events and interactive behaviors for cell polygons:
* - Hover highlighting with white outlines
* - Click-to-pin functionality for persistent cell selection
* - Cell-to-spot line visualization on hover/pin
* - Event delegation and throttling for performance
* - UI notifications for pin/unpin actions
* Keep here mouse events and interactive behaviors for cell polygons.
*
* This module handles all polygon-related mouse interactions and visual feedback
* to provide smooth, responsive user experience with large datasets.
* When you hover over a cell polygon, it gets a white outline and shows lines
* connecting to all the gene spots inside that cell. Click on a cell to pin
* those lines so they stay visible even when you move to other planes.
*
* The hover events are throttled because otherwise the UI gets laggy with
* lots of polygons. Also handles the little notification messages when
* you pin/unpin cells.
*/


import { transformToTileCoordinates } from '../utils/coordinateTransform.js';
import { IMG_DIMENSIONS } from '../config/constants.js';
export class PolygonBoundaryHighlighter {
    constructor(deckglInstance, coordinateSystem, cellToSpotsIndex = null, geneToId = null, cellDataMap = null) {
        this.deckglInstance = deckglInstance;
        this.coordinateSystem = coordinateSystem;
        this.hoveredPolygon = null;
        this.highlightLayerId = 'polygon-highlight';
        this.linesLayerId = 'cell-spot-lines';
        this.highlightColor = [255, 255, 255, 255]; // White highlight
        this.highlightWidth = 3;
        
        // Cell-to-spot connections
        this.cellToSpotsIndex = cellToSpotsIndex;
        this.geneToId = geneToId;
        this.cellDataMap = cellDataMap;
        
        // Pinned lines state
        this.pinnedCell = null; // Cell label that's pinned
        this.pinnedLineLayer = null; // Cached line layer for pinned cell
        
        // Throttling for performance
        this.lastUpdateTime = 0;
        this.throttleDelay = 100; // 10fps (100ms) - much less frequent updates
        this.pendingUpdate = null;

        // Bind methods to preserve 'this' context
        this.onHover = this.onHover.bind(this);
        this.createHighlightLayer = this.createHighlightLayer.bind(this);
        this.createLineLayer = this.createLineLayer.bind(this);
        this.updateHighlight = this.updateHighlight.bind(this);
        this.clearHighlight = this.clearHighlight.bind(this);
        this.calculatePolygonCentroid = this.calculatePolygonCentroid.bind(this);
        this.getGeneColor = this.getGeneColor.bind(this);
        this.onClick = this.onClick.bind(this);
        this.pinCellLines = this.pinCellLines.bind(this);
        this.unpinCellLines = this.unpinCellLines.bind(this);
    }

    /**
     * Initialize the highlighter with the deck.gl instance
     */
    initialize() {
        // Store the original hover and click handlers
        const currentProps = this.deckglInstance.props;
        this.originalHoverHandler = currentProps.onHover;
        this.originalClickHandler = currentProps.onClick;
        
        // Update the deck.gl instance to include hover and click handling
        this.deckglInstance.setProps({
            ...currentProps,
            onHover: this.onHover,
            onClick: this.onClick
        });
    }

    /**
     * Handle hover events with throttling
     */
    onHover(info) {
        const { object, layer } = info;
        const now = performance.now();

        // Always call the original hover handler immediately (for tooltips)
        if (this.originalHoverHandler) {
            this.originalHoverHandler(info);
        }

        // Throttle highlight updates for performance
        if (now - this.lastUpdateTime < this.throttleDelay) {
            // Schedule a pending update
            if (this.pendingUpdate) {
                clearTimeout(this.pendingUpdate);
            }
            this.pendingUpdate = setTimeout(() => {
                this.processHover(info);
            }, this.throttleDelay);
            return;
        }

        this.processHover(info);
        this.lastUpdateTime = now;
    }

    /**
     * Process hover events (throttled)
     */
    processHover(info) {
        const { object, layer } = info;

        // Only handle polygon layers (not tile layers)
        if (layer && layer.id.includes('polygons-') && object) {
            // Check if we're hovering over a different polygon
            if (this.hoveredPolygon !== object) {
                this.hoveredPolygon = object;
                this.updateHighlight(object);
            }
        } else {
            // Clear highlight when not hovering over a polygon
            if (this.hoveredPolygon) {
                this.hoveredPolygon = null;
                this.clearHighlight();
            }
        }
    }

    /**
     * Create a highlight layer for the hovered polygon
     */
    createHighlightLayer(polygonFeature) {
        const { GeoJsonLayer } = deck;

        return new GeoJsonLayer({
            id: this.highlightLayerId,
            data: {
                type: 'FeatureCollection',
                features: polygonFeature ? [polygonFeature] : []
            },
            pickable: false,
            stroked: true,
            filled: false,
            getLineColor: this.highlightColor,
            getLineWidth: this.highlightWidth,
            lineWidthUnits: 'pixels',
            coordinateSystem: this.coordinateSystem,
            // Render on top of other layers
            parameters: {
                depthTest: false
            }
        });
    }

    /**
     * Update the highlight to show the hovered polygon and cell-to-spot lines
     */
    updateHighlight(polygonObject) {
        const currentLayers = this.deckglInstance.props.layers || [];
        let updatedLayers = [...currentLayers];
        
        // Handle polygon highlight layer
        const existingHighlightIndex = updatedLayers.findIndex(layer => 
            layer.id === this.highlightLayerId
        );
        
        const highlightLayer = this.createHighlightLayer(polygonObject);
        if (existingHighlightIndex >= 0) {
            updatedLayers[existingHighlightIndex] = highlightLayer;
        } else {
            updatedLayers.push(highlightLayer);
        }
        
        // Handle cell-to-spot lines layer
        const existingLinesIndex = updatedLayers.findIndex(layer => 
            layer.id === this.linesLayerId
        );
        
        const lineLayer = this.createLineLayer(polygonObject);
        if (lineLayer) {
            if (existingLinesIndex >= 0) {
                updatedLayers[existingLinesIndex] = lineLayer;
            } else {
                updatedLayers.push(lineLayer);
            }
        } else if (existingLinesIndex >= 0) {
            // Remove line layer if no spots found
            updatedLayers.splice(existingLinesIndex, 1);
        }
        
        this.deckglInstance.setProps({ layers: updatedLayers });
    }

    /**
     * Clear the highlight and lines (unless pinned)
     */
    clearHighlight() {
        const currentLayers = this.deckglInstance.props.layers || [];
        let updatedLayers = [...currentLayers];
        
        // Clear polygon highlight layer
        const existingHighlightIndex = updatedLayers.findIndex(layer => 
            layer.id === this.highlightLayerId
        );
        if (existingHighlightIndex >= 0) {
            updatedLayers[existingHighlightIndex] = this.createHighlightLayer(null);
        }
        
        // Only remove lines layer if not pinned
        if (!this.pinnedCell) {
            const existingLinesIndex = updatedLayers.findIndex(layer => 
                layer.id === this.linesLayerId
            );
            if (existingLinesIndex >= 0) {
                updatedLayers.splice(existingLinesIndex, 1);
            }
        } else {
            // Keep the pinned line layer
            const existingLinesIndex = updatedLayers.findIndex(layer => 
                layer.id === this.linesLayerId
            );
            if (existingLinesIndex >= 0 && this.pinnedLineLayer) {
                updatedLayers[existingLinesIndex] = this.pinnedLineLayer;
            }
        }
        
        this.deckglInstance.setProps({ layers: updatedLayers });
    }

    /**
     * Update highlight color
     */
    setHighlightColor(color) {
        this.highlightColor = color;
        if (this.hoveredPolygon) {
            this.updateHighlight(this.hoveredPolygon);
        }
    }

    /**
     * Update highlight width
     */
    setHighlightWidth(width) {
        this.highlightWidth = width;
        if (this.hoveredPolygon) {
            this.updateHighlight(this.hoveredPolygon);
        }
    }

    /**
     * Calculate polygon centroid - uses actual cell coordinates from cellData if available,
     * otherwise falls back to polygon vertex average
     */
    calculatePolygonCentroid(polygonCoords, cellLabel = null) {
        // Try to use actual cell coordinates from cellData.tsv first
        if (cellLabel && this.cellDataMap && this.cellDataMap.has(cellLabel)) {
            const cellData = this.cellDataMap.get(cellLabel);
            if (cellData && cellData.X !== undefined && cellData.Y !== undefined) {
                // Transform cell coordinates to tile space (same transformation as gene spots)
                return transformToTileCoordinates(cellData.X, cellData.Y, IMG_DIMENSIONS);
            }
        }
        
        // Fallback to polygon vertex average if cellData not available
        if (!polygonCoords || polygonCoords.length === 0) return null;
        
        let sumX = 0, sumY = 0;
        const points = polygonCoords[0]; // Get the outer ring
        
        for (const [x, y] of points) {
            sumX += x;
            sumY += y;
        }
        
        return [sumX / points.length, sumY / points.length];
    }


    /**
     * Get gene color based on gene name
     */
    getGeneColor(geneName) {
        // Try to get color from glyphSettings if available
        if (typeof glyphSettings === 'function') {
            const settings = glyphSettings();
            const geneSetting = settings.find(s => s.gene === geneName);
            if (geneSetting && geneSetting.color) {
                // Convert hex to RGB array
                const hex = geneSetting.color.replace('#', '');
                return [
                    parseInt(hex.substr(0, 2), 16),
                    parseInt(hex.substr(2, 2), 16),
                    parseInt(hex.substr(4, 2), 16),
                    200 // Alpha for line transparency
                ];
            }
        }
        
        // Fallback to white with transparency
        return [255, 255, 255, 150];
    }

    /**
     * Create line layer for cell-to-spot connections
     */
    createLineLayer(polygonObject) {
        if (!this.cellToSpotsIndex || !polygonObject?.properties?.label) {
            return null;
        }

        const { LineLayer } = deck;
        const cellLabel = polygonObject.properties.label;
        
        // Get all spots for this cell
        const spots = this.cellToSpotsIndex.get(cellLabel) || [];
        if (spots.length === 0) return null;
        
        // Calculate cell centroid using actual cell coordinates if available
        const centroid = this.calculatePolygonCentroid(polygonObject.geometry.coordinates, cellLabel);
        if (!centroid) return null;
        
        // Create line data from each spot to centroid
        // Transform spot coordinates to tile space to match gene markers
        const lineData = spots.map(spot => {
            // Transform using the same method as gene layers
            const sourcePosition = transformToTileCoordinates(spot.x, spot.y, IMG_DIMENSIONS);
            
            return {
                sourcePosition: centroid,
                targetPosition: sourcePosition,
                color: this.getGeneColor(spot.gene)
            };
        });

        console.log(`Creating line layer with ${lineData.length} connections for cell ${cellLabel}`);

        return new LineLayer({
            id: this.linesLayerId,
            data: lineData,
            pickable: false,
            getSourcePosition: d => d.sourcePosition,
            getTargetPosition: d => d.targetPosition,
            getColor: d => d.color, // Use gene-specific colors
            getWidth: 1.5, // Thin elegant lines
            widthUnits: 'pixels',
            coordinateSystem: this.coordinateSystem
        });
    }

    /**
     * Handle click events for pinning cell lines
     */
    onClick(info) {
        // Call original click handler if it exists
        if (this.originalClickHandler) {
            this.originalClickHandler(info);
        }

        // Only handle polygon clicks
        if (info.layer && info.layer.id.includes('polygons-') && info.object) {
            const cellLabel = info.object.properties.label;
            
            if (this.pinnedCell === cellLabel) {
                // Unpin if clicking the same cell
                console.log(`Unpinning cell ${cellLabel}`);
                this.unpinCellLines();
            } else {
                // Pin the new cell
                console.log(`Pinning cell ${cellLabel}`);
                this.pinCellLines(info.object);
            }
        }
    }

    /**
     * Pin cell lines to persist across plane changes
     */
    pinCellLines(polygonObject) {
        const cellLabel = polygonObject.properties.label;
        this.pinnedCell = cellLabel;
        
        // Create the line layer for this cell
        const lineLayer = this.createLineLayer(polygonObject);
        if (lineLayer) {
            this.pinnedLineLayer = lineLayer;
            
            // Add the pinned line layer
            const currentLayers = this.deckglInstance.props.layers || [];
            const existingLinesIndex = currentLayers.findIndex(layer => 
                layer.id === this.linesLayerId
            );
            
            let updatedLayers = [...currentLayers];
            if (existingLinesIndex >= 0) {
                updatedLayers[existingLinesIndex] = lineLayer;
            } else {
                updatedLayers.push(lineLayer);
            }
            
            this.deckglInstance.setProps({ layers: updatedLayers });
            
            // Show pin notification near the cell
            this.showPinNotification(`Cell ${cellLabel} pinned`, 'pin', polygonObject);
        }
    }

    /**
     * Unpin cell lines
     */
    unpinCellLines() {
        const cellLabel = this.pinnedCell;
        this.pinnedCell = null;
        this.pinnedLineLayer = null;
        
        // Remove the pinned lines layer
        const currentLayers = this.deckglInstance.props.layers || [];
        const existingLinesIndex = currentLayers.findIndex(layer => 
            layer.id === this.linesLayerId
        );
        
        if (existingLinesIndex >= 0) {
            const updatedLayers = [...currentLayers];
            updatedLayers.splice(existingLinesIndex, 1);
            this.deckglInstance.setProps({ layers: updatedLayers });
        }
        
        // Show unpin notification
        if (cellLabel) {
            this.showPinNotification(`Cell ${cellLabel} unpinned`, 'unpin');
        }
    }

    /**
     * Show pin/unpin notification
     */
    showPinNotification(message, type) {
        // Create or get existing notification element
        let notification = document.getElementById('pin-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'pin-notification';
            notification.style.cssText = `
                position: fixed;
                top: 50px;
                right: 20px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                font-weight: bold;
                z-index: 10000;
                transition: opacity 0.3s ease;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(notification);
        }
        
        // Set message and color based on type
        notification.textContent = message;
        notification.style.background = type === 'pin' ? 
            'rgba(34, 139, 34, 0.9)' : // Green for pin
            'rgba(220, 53, 69, 0.9)';  // Red for unpin
        
        // Show notification
        notification.style.opacity = '1';
        
        // Hide after 2 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
        }, 2000);
    }

    /**
     * Cleanup method
     */
    destroy() {
        this.clearHighlight();
        this.unpinCellLines();
        this.hoveredPolygon = null;
        
        // Remove notification if it exists
        const notification = document.getElementById('pin-notification');
        if (notification) {
            notification.remove();
        }
    }
}

// Export for use in main application (keeping window export for backward compatibility)
window.PolygonBoundaryHighlighter = PolygonBoundaryHighlighter;