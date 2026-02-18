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


import { transformToTileCoordinates } from '../../utils/coordinateTransform.js';
import { IMG_DIMENSIONS } from '../../config/constants.js';
// Track Ctrl key state globally (deck.gl Deck-level onClick doesn't reliably expose srcEvent)
let _ctrlKeyDown = false;
document.addEventListener('keydown', (e) => { if (e.key === 'Control') _ctrlKeyDown = true; });
document.addEventListener('keyup', (e) => { if (e.key === 'Control') _ctrlKeyDown = false; });
window.addEventListener('blur', () => { _ctrlKeyDown = false; }); // Reset on window blur

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
     * Calculate polygon centroid - uses actual cell coordinates from cellData (X, Y columns)
     * NO FALLBACK - if coordinates unavailable, returns null
     */
    calculatePolygonCentroid(polygonCoords, cellLabel = null) {
        // Get actual cell coordinates from cellData.tsv (X, Y columns)
        if (!cellLabel || !this.cellDataMap || !this.cellDataMap.has(cellLabel)) {
            console.warn(`Cell centroid unavailable: cellLabel=${cellLabel}, cellDataMap exists=${!!this.cellDataMap}`);
            return null;
        }

        const cellData = this.cellDataMap.get(cellLabel);

        // Check for nested position structure (current data format)
        if (cellData && cellData.position &&
            cellData.position.x !== undefined && cellData.position.y !== undefined) {
            // Transform cell coordinates to tile space (same transformation as gene spots)
            return transformToTileCoordinates(cellData.position.x, cellData.position.y, IMG_DIMENSIONS);
        }

        // Log error if coordinates unavailable - NO FALLBACK
        console.warn(`Could not get X, Y coordinates for cell ${cellLabel}. cellData structure:`, cellData);
        return null;
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
     * Handle click events for diagnostics only (Ctrl+Click).
     * Plain clicks no longer toggle line pinning here.
     */
    onClick(info) {
        // Call original click handler if it exists
        if (this.originalClickHandler) {
            this.originalClickHandler(info);
        }

        // Only handle Ctrl+Click for polygons (diagnostics)
        if (info.layer && info.layer.id.includes('polygons-') && info.object) {
            const cellLabel = info.object.properties.label;
            if (_ctrlKeyDown) {
                if (window.appState && window.appState.checkCellConnected) {
                    window.openCheckCellModal(cellLabel);
                }
            }
        }
    }

    /**
     * Cleanup method
     */
    destroy() {
        this.clearHighlight();
        this.hoveredPolygon = null;
    }
}

// Export for use in main application (keeping window export for backward compatibility)
window.PolygonBoundaryHighlighter = PolygonBoundaryHighlighter;
