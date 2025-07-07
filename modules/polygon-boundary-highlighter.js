/**
 * Polygon Boundary Highlighter
 * Provides functionality to highlight polygon boundaries on mouseover
 */
class PolygonBoundaryHighlighter {
    constructor(deckglInstance, coordinateSystem, cellToSpotsIndex = null, geneToId = null) {
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
    }

    /**
     * Initialize the highlighter with the deck.gl instance
     */
    initialize() {
        // Store the original hover handler
        const currentProps = this.deckglInstance.props;
        this.originalHoverHandler = currentProps.onHover;
        
        // Update the deck.gl instance to include hover handling
        this.deckglInstance.setProps({
            ...currentProps,
            onHover: this.onHover
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
     * Clear the highlight and lines
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
        
        // Remove lines layer completely
        const existingLinesIndex = updatedLayers.findIndex(layer => 
            layer.id === this.linesLayerId
        );
        if (existingLinesIndex >= 0) {
            updatedLayers.splice(existingLinesIndex, 1);
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
     * Calculate polygon centroid from coordinates
     */
    calculatePolygonCentroid(polygonCoords) {
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
     * Transform spot coordinates to tile space (same as gene layers)
     */
    transformSpotCoordinates(x, y) {
        // Use the same transformation as gene layers with proper aspect ratio handling
        const imageDimensions = {
            width: 6411,
            height: 4412,
            tileSize: 256
        };
        
        const {width, height, tileSize} = imageDimensions;
        const maxDimension = Math.max(width, height);
        
        // Adjustment factors to handle aspect ratio (same as transformToTileCoordinates)
        const xAdjustment = width / maxDimension;
        const yAdjustment = height / maxDimension;
        
        return [
            x * (tileSize / width) * xAdjustment,
            y * (tileSize / height) * yAdjustment
        ];
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
        
        // Calculate cell centroid
        const centroid = this.calculatePolygonCentroid(polygonObject.geometry.coordinates);
        if (!centroid) return null;
        
        // Create line data from each spot to centroid
        // Transform spot coordinates to tile space to match gene markers
        const lineData = spots.map(spot => {
            // Transform using the same method as gene layers
            const sourcePosition = this.transformSpotCoordinates(spot.x, spot.y);
            
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
     * Cleanup method
     */
    destroy() {
        this.clearHighlight();
        this.hoveredPolygon = null;
    }
}

// Export for use in main application
window.PolygonBoundaryHighlighter = PolygonBoundaryHighlighter;