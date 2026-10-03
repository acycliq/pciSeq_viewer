/**
 * WidgetManager: where the floating panels (the charts, the gene and class panels) open.
 *
 * A panel opens in the map area, clear of the drawer and of the bar at the bottom,
 * in the first free spot next to the panels already open, looking left to right and
 * top to bottom. When no free spot is left it overlaps the others, stepped down and
 * right so every title bar stays in view.
 *
 * Where the open panels are is read from the page itself, so dragging and resizing a
 * panel needs no bookkeeping here.
 */

const RAIL = 32;        // the strip with the drawer's toggle, there when the drawer is shut
const TOP_CLEAR = 56;   // room for the readout and the buttons along the top of the map

class WidgetManager {
    constructor() {
        this.widgets = new Map();   // widgetId -> element
        this.margin = 16;           // from the edges of the free area
        this.spacing = 12;          // between panels
        this.step = 24;             // how finely the free area is searched
        this.cascade = 32;          // offset per open panel when they have to overlap
    }

    /**
     * Place a panel and start keeping track of it
     * @param {string} id - Widget element ID
     * @param {Object} options - { preferredWidth, preferredHeight, side, at }
     *   side: 'left' (default) or 'right', the side the search for a free spot starts from
     *   at: { x, y, width, height } to put it back where the user left it
     */
    register(id, options = {}) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`WidgetManager: Element ${id} not found`);
            return;
        }
        const { preferredWidth = 400, preferredHeight = 500, side = 'left', at = null } = options;

        const width = Math.min(at?.width ?? preferredWidth, window.innerWidth - this.margin * 2);
        const height = Math.min(at?.height ?? preferredHeight, window.innerHeight - this.margin * 2);
        const spot = at ? this.clamp(at.x, at.y, width, height)
                        : this.findBestPosition(width, height, side, id);

        this.widgets.set(id, element);
        element.style.position = 'fixed';
        element.style.right = 'auto';
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        this.moveTo(element, spot.x, spot.y);
        return { width, height, ...spot };
    }

    /**
     * The part of the window panels may open in: right of the drawer, below the
     * readout at the top, above the bar at the bottom
     */
    freeArea() {
        const drawer = document.getElementById('controlsPanel');
        const drawerOpen = drawer && !drawer.classList.contains('collapsed');
        const bar = document.querySelector('.main-controls');
        return {
            left: (drawerOpen ? drawer.getBoundingClientRect().right : RAIL) + this.margin,
            top: TOP_CLEAR,
            right: window.innerWidth - this.margin,
            bottom: (bar ? bar.getBoundingClientRect().top : window.innerHeight) - this.margin,
        };
    }

    // where the other open panels are right now. From offsetLeft and friends, not
    // getBoundingClientRect, which is a little off while a panel's opening animation
    // is still scaling it
    openRects(exceptId) {
        const rects = [];
        for (const [id, el] of this.widgets) {
            if (id === exceptId || el.classList.contains('hidden')) continue;
            rects.push({ left: el.offsetLeft, top: el.offsetTop,
                         right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight });
        }
        return rects;
    }

    /**
     * The first free spot for a panel of this size, or a stepped overlap when there is none
     */
    findBestPosition(width, height, side, id) {
        const area = this.freeArea();
        const others = this.openRects(id);
        const gap = this.spacing;
        const isFree = (x, y) => others.every(r =>
            x + width + gap <= r.left || x >= r.right + gap ||
            y + height + gap <= r.top || y >= r.bottom + gap);

        const xs = [];
        for (let x = area.left; x + width <= area.right; x += this.step) xs.push(x);
        if (side === 'right') xs.reverse();
        for (let y = area.top; y + height <= area.bottom; y += this.step) {
            for (const x of xs) {
                if (isFree(x, y)) return { x, y };
            }
        }
        const shift = others.length * this.cascade;
        return this.clamp(area.left + shift, area.top + shift, width, height);
    }

    // keep a panel of this size inside the window
    clamp(x, y, width, height) {
        return {
            x: Math.max(this.margin, Math.min(x, window.innerWidth - width - this.margin)),
            y: Math.max(this.margin, Math.min(y, window.innerHeight - height - this.margin)),
        };
    }

    moveTo(element, x, y) {
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
    }

    /**
     * Move a panel (a drag), kept inside the window
     */
    reposition(id, x, y) {
        const element = this.widgets.get(id);
        if (!element) return;
        const spot = this.clamp(x, y, element.offsetWidth, element.offsetHeight);
        this.moveTo(element, spot.x, spot.y);
    }

    /**
     * Stop keeping track of a panel (it was closed)
     */
    unregister(id) {
        this.widgets.delete(id);
    }

    /**
     * The window changed size: pull the open panels back inside it
     */
    handleResize() {
        for (const element of this.widgets.values()) {
            if (element.classList.contains('hidden')) continue;
            const spot = this.clamp(element.offsetLeft, element.offsetTop, element.offsetWidth, element.offsetHeight);
            this.moveTo(element, spot.x, spot.y);
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
