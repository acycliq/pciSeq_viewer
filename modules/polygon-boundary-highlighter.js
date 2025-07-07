/**
 * Polygon Boundary Highlighter
 * Provides functionality to highlight polygon boundaries on mouseover
 */
class PolygonBoundaryHighlighter {
    constructor(deckglInstance, coordinateSystem) {
        this.deckglInstance = deckglInstance;
        this.coordinateSystem = coordinateSystem;
        this.hoveredPolygon = null;
        this.highlightLayerId = 'polygon-highlight';
        this.highlightColor = [255, 255, 255, 255]; // White highlight
        this.highlightWidth = 3;
        
        // Throttling for performance
        this.lastUpdateTime = 0;
        this.throttleDelay = 100; // 10fps (100ms) - much less frequent updates
        this.pendingUpdate = null;

        // Bind methods to preserve 'this' context
        this.onHover = this.onHover.bind(this);
        this.createHighlightLayer = this.createHighlightLayer.bind(this);
        this.updateHighlight = this.updateHighlight.bind(this);
        this.clearHighlight = this.clearHighlight.bind(this);
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
     * Update the highlight to show the hovered polygon
     */
    updateHighlight(polygonObject) {
        // Update the existing highlight layer's data instead of recreating it
        const currentLayers = this.deckglInstance.props.layers || [];
        const existingHighlightIndex = currentLayers.findIndex(layer => 
            layer.id === this.highlightLayerId
        );

        if (existingHighlightIndex >= 0) {
            // Update existing layer
            const updatedLayers = [...currentLayers];
            updatedLayers[existingHighlightIndex] = this.createHighlightLayer(polygonObject);
            this.deckglInstance.setProps({ layers: updatedLayers });
        } else {
            // Add new highlight layer
            const highlightLayer = this.createHighlightLayer(polygonObject);
            const newLayers = [...currentLayers, highlightLayer];
            this.deckglInstance.setProps({ layers: newLayers });
        }
    }

    /**
     * Clear the highlight
     */
    clearHighlight() {
        // Instead of removing the layer, make it invisible with empty data
        const currentLayers = this.deckglInstance.props.layers || [];
        const existingHighlightIndex = currentLayers.findIndex(layer => 
            layer.id === this.highlightLayerId
        );

        if (existingHighlightIndex >= 0) {
            const updatedLayers = [...currentLayers];
            updatedLayers[existingHighlightIndex] = this.createHighlightLayer(null);
            this.deckglInstance.setProps({ layers: updatedLayers });
        }
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
     * Cleanup method
     */
    destroy() {
        this.clearHighlight();
        this.hoveredPolygon = null;
    }
}

// Export for use in main application
window.PolygonBoundaryHighlighter = PolygonBoundaryHighlighter;