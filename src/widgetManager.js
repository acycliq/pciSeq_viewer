/**
 * WidgetManager - Smart positioning system for floating widgets
 *
 * Features:
 * - Cascade layout (diagonal stacking)
 * - Viewport bounds checking
 * - Collision detection
 * - Responsive sizing
 */

class WidgetManager {
    constructor() {
        this.widgets = new Map(); // widgetId -> { element, width, height, x, y }
        this.cascade = { x: 60, y: 60 }; // Starting position
        this.offset = 40; // Cascade offset for each new widget
        this.spacing = 20; // Minimum spacing between widgets
        this.margin = 20; // Margin from viewport edges
    }

    /**
     * Register a widget with smart positioning
     * @param {string} id - Widget element ID
     * @param {Object} options - { preferredWidth, preferredHeight, side }
     */
    register(id, options = {}) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`WidgetManager: Element ${id} not found`);
            return;
        }

        const {
            preferredWidth = 400,
            preferredHeight = 500,
            side = 'left' // 'left' or 'right'
        } = options;

        // Calculate responsive dimensions
        const viewport = this.getViewportSize();
        const maxWidth = viewport.width - (this.margin * 2);
        const maxHeight = viewport.height - (this.margin * 2);

        const width = Math.min(preferredWidth, maxWidth * 0.9); // Max 90% of viewport
        const height = Math.min(preferredHeight, maxHeight * 0.9);

        // Find non-overlapping position
        const position = this.findBestPosition(width, height, side);

        // Store widget info
        this.widgets.set(id, {
            element,
            width,
            height,
            x: position.x,
            y: position.y,
            side
        });

        // Apply positioning
        this.applyPosition(id);

        return { width, height, x: position.x, y: position.y };
    }

    /**
     * Find best position for a widget
     */
    findBestPosition(width, height, side) {
        const viewport = this.getViewportSize();

        // Try cascade position first
        let x, y;

        if (side === 'right') {
            // Right-aligned widgets cascade from top-right
            x = viewport.width - width - this.cascade.x;
            y = this.cascade.y;
        } else {
            // Left-aligned widgets cascade from top-left
            x = this.cascade.x;
            y = this.cascade.y;
        }

        // Check if position is valid (not overlapping, within viewport)
        const iterations = 20; // Max attempts to find position
        for (let i = 0; i < iterations; i++) {
            if (this.isPositionValid(x, y, width, height)) {
                // Update cascade for next widget
                this.cascade.x += this.offset;
                this.cascade.y += this.offset;

                // Reset cascade if too far down/right
                if (this.cascade.y + height > viewport.height - this.margin) {
                    this.cascade.x = 60;
                    this.cascade.y = 60;
                }

                return { x, y };
            }

            // Try next cascade position
            x += this.offset;
            y += this.offset;

            // Wrap around if we hit the edge
            if (side === 'right') {
                if (x < this.margin) {
                    x = viewport.width - width - 60;
                    y += this.offset * 2;
                }
            } else {
                if (x + width > viewport.width - this.margin) {
                    x = 60;
                    y += this.offset * 2;
                }
            }
        }

        // Fallback: center of screen
        return {
            x: (viewport.width - width) / 2,
            y: (viewport.height - height) / 2
        };
    }

    /**
     * Check if position is valid (within bounds, no overlap)
     */
    isPositionValid(x, y, width, height) {
        const viewport = this.getViewportSize();

        // Check viewport bounds
        if (x < this.margin ||
            y < this.margin ||
            x + width > viewport.width - this.margin ||
            y + height > viewport.height - this.margin) {
            return false;
        }

        // Check overlap with existing visible widgets
        for (const [id, widget] of this.widgets) {
            if (widget.element.classList.contains('hidden')) continue;

            const overlap = !(
                x + width + this.spacing < widget.x ||
                x > widget.x + widget.width + this.spacing ||
                y + height + this.spacing < widget.y ||
                y > widget.y + widget.height + this.spacing
            );

            if (overlap) return false;
        }

        return true;
    }

    /**
     * Apply position to widget element
     */
    applyPosition(id) {
        const widget = this.widgets.get(id);
        if (!widget) return;

        const { element, width, height, x, y } = widget;

        // Apply styles
        element.style.position = 'fixed';
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        element.style.right = 'auto'; // Clear any right positioning
    }

    /**
     * Reposition widget (e.g., after drag or window resize)
     */
    reposition(id, x, y) {
        const widget = this.widgets.get(id);
        if (!widget) return;

        // Constrain to viewport
        const viewport = this.getViewportSize();
        x = Math.max(this.margin, Math.min(x, viewport.width - widget.width - this.margin));
        y = Math.max(this.margin, Math.min(y, viewport.height - widget.height - this.margin));

        widget.x = x;
        widget.y = y;

        this.applyPosition(id);
    }

    /**
     * Reset cascade position (call when closing widgets)
     */
    resetCascade() {
        this.cascade = { x: 60, y: 60 };
    }

    /**
     * Unregister widget when closed
     */
    unregister(id) {
        this.widgets.delete(id);

        // If no widgets open, reset cascade
        const visibleWidgets = Array.from(this.widgets.values())
            .filter(w => !w.element.classList.contains('hidden'));

        if (visibleWidgets.length === 0) {
            this.resetCascade();
        }
    }

    /**
     * Get viewport size
     */
    getViewportSize() {
        return {
            width: window.innerWidth,
            height: window.innerHeight
        };
    }

    /**
     * Handle window resize - reposition all widgets to fit
     */
    handleResize() {
        const viewport = this.getViewportSize();

        for (const [id, widget] of this.widgets) {
            // Constrain to new viewport size
            const maxWidth = viewport.width - (this.margin * 2);
            const maxHeight = viewport.height - (this.margin * 2);

            // Resize if needed
            if (widget.width > maxWidth) {
                widget.width = maxWidth * 0.9;
            }
            if (widget.height > maxHeight) {
                widget.height = maxHeight * 0.9;
            }

            // Reposition if outside bounds
            if (widget.x + widget.width > viewport.width - this.margin) {
                widget.x = viewport.width - widget.width - this.margin;
            }
            if (widget.y + widget.height > viewport.height - this.margin) {
                widget.y = viewport.height - widget.height - this.margin;
            }

            this.applyPosition(id);
        }
    }
}

// Create global instance
export const widgetManager = new WidgetManager();

// Handle window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        widgetManager.handleResize();
    }, 250); // Debounce resize events
});