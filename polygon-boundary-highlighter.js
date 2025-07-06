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
        // Update the deck.gl instance to include hover handling
        const currentProps = this.deckglInstance.props;
        this.deckglInstance.setProps({
            ...currentProps,
            onHover: this.onHover
        });
    }

    /**
     * Handle hover events
     */
    onHover(info) {
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
                features: [polygonFeature]
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
        const currentLayers = this.deckglInstance.props.layers || [];

        // Remove existing highlight layer
        const layersWithoutHighlight = currentLayers.filter(layer =>
            layer.id !== this.highlightLayerId
        );

        // Add new highlight layer
        const highlightLayer = this.createHighlightLayer(polygonObject);
        const newLayers = [...layersWithoutHighlight, highlightLayer];

        this.deckglInstance.setProps({ layers: newLayers });
    }

    /**
     * Clear the highlight
     */
    clearHighlight() {
        const currentLayers = this.deckglInstance.props.layers || [];
        const layersWithoutHighlight = currentLayers.filter(layer =>
            layer.id !== this.highlightLayerId
        );

        this.deckglInstance.setProps({ layers: layersWithoutHighlight });
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