/**
 * Cell Lookup Module
 * Provides cell search functionality with smooth camera transitions.
 *
 * Wired up from src/app.js which calls window.cellLookup.setupUI() at startup.
 * Depends on:
 *   - window.appState.cellDataMap    Map<cellId, {position, classification, ...}>
 *   - window.appState.deckglInstance  the deck.gl Deck object
 *   - window.appState.polygonCache   Map<planeNum, GeoJSON>  (for pulse highlight)
 *   - window.appState.currentPlane   number                  (for pulse highlight)
 *   - window.config()                returns {imageWidth, imageHeight, voxelSize, totalPlanes, ...}
 *   - window.updatePlane(n)          switches the visible z-plane
 */

// Import the shared coordinate transformation function
import { transformToTileCoordinates } from '../../utils/coordinateTransform.js';

// Global cell data storage
let cellLookupData = new Map(); // cellId -> { x, y, z, bounds }
let isLookupInitialized = false;

/**
 * Initialize cell lookup by loading and indexing cell data
 */
async function initializeCellLookup() {
    if (isLookupInitialized) {
        return;
    }

    console.log('Initializing cell lookup system...');

    try {
        // Load cell data (Arrow-only)
        await loadCellData();
        isLookupInitialized = true;
        console.log('Cell lookup initialized with', cellLookupData.size, 'cells');
    } catch (error) {
        console.error('Failed to initialize cell lookup:', error);
        throw error;
    }
}

/**
 * Load and parse cell data from Arrow based on configuration
 */
async function loadCellData() {
    if (window.appState && window.appState.cellDataMap) {
        return loadFromArrowData();
    }
    throw new Error('Arrow cell data not available.');
}

/**
 * Load cell data from existing Arrow-loaded cellDataMap
 */
function loadFromArrowData() {
    const cellDataMap = window.appState.cellDataMap;

    for (const [cellId, cellData] of cellDataMap) {
        const x = cellData.position.x;
        const y = cellData.position.y;
        const z = cellData.position.z || 0;

        // Default bounds around cell center (Arrow doesn't include gaussian_contour)
        const bounds = { minX: x-50, maxX: x+50, minY: y-50, maxY: y+50 };

        cellLookupData.set(cellId, {
            x: x,
            y: y,
            z: z,
            bounds: bounds
        });
    }
}

// ---- the glide to a cell

// Zoom in on a point while it slides to the middle of the map. Interpolating the
// target and the zoom separately, each in a straight line, does not look like that:
// the zoom is a power of two, so the place you are heading for swings out of view
// and comes back at the end. Here the destination's distance from the centre, in
// screen pixels, shrinks steadily as the zoom changes, so it stays in sight all the
// way, as when you scroll the wheel with the pointer on it.
class ZoomToPoint extends deck.TransitionInterpolator {
    constructor() {
        super({ compare: ['target', 'zoom'], extract: ['target', 'zoom'], required: ['target', 'zoom'] });
    }

    interpolateProps(start, end, t) {
        const zoom = start.zoom + (end.zoom - start.zoom) * t;
        const startScale = Math.pow(2, start.zoom);
        const scale = Math.pow(2, zoom);
        // where the destination sits on screen at the start, relative to the centre
        const dx = (end.target[0] - start.target[0]) * startScale;
        const dy = (end.target[1] - start.target[1]) * startScale;
        return {
            zoom,
            target: [end.target[0] - dx * (1 - t) / scale, end.target[1] - dy * (1 - t) / scale, 0]
        };
    }
}

// slow start, slow stop
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Longer for a bigger change of zoom and for a longer way across the screen, within
// 0.8 and 3 seconds
function glideDuration(from, target, zoom) {
    const levels = Math.abs(zoom - from.zoom);
    const pixels = Math.hypot(target[0] - from.target[0], target[1] - from.target[1]) * Math.pow(2, from.zoom);
    return Math.max(800, Math.min(3000, 600 + 350 * levels + Math.min(1200, pixels / 3)));
}

// ---- the flight to a cell outside the window

// At the close-up a straight glide to a far cell shows nothing but tiles streaming
// past, and the user lands without knowing where on the section they went. So for
// a cell outside the window the view widens until both ends are in sight, crosses,
// and narrows again. This is van Wijk and Nuij (2003), the path behind the fly-to
// of map applications: w is the visible width in world units, u the distance
// covered along the line between the two centres, s the position along the path,
// and rho says how far out it goes. The perceived speed stays constant.
class FlyTo extends deck.TransitionInterpolator {
    constructor(screenWidth) {
        super({ compare: ['target', 'zoom'], extract: ['target', 'zoom'], required: ['target', 'zoom'] });
        this.screenWidth = screenWidth;
    }

    // the path between two view states, worked out once and reused every frame
    path(start, end) {
        const key = [start.zoom, ...start.target, end.zoom, ...end.target].join(',');
        if (this._path && this._path.key === key) return this._path;
        const rho = 1.414, rho2 = rho * rho;
        const w0 = this.screenWidth / Math.pow(2, start.zoom);
        const w1 = this.screenWidth / Math.pow(2, end.zoom);
        const u1 = Math.hypot(end.target[0] - start.target[0], end.target[1] - start.target[1]);
        let S, u, w;
        if (u1 < 1e-6) {
            // nothing to cross, a plain change of zoom
            const k = w1 < w0 ? -1 : 1;
            S = Math.abs(Math.log(w1 / w0)) / rho;
            u = () => 0;
            w = s => w0 * Math.exp(k * rho * s);
        } else {
            const r = i => {
                const b = (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho2 * rho2 * u1 * u1) / (2 * (i ? w1 : w0) * rho2 * u1);
                return Math.log(Math.sqrt(b * b + 1) - b);
            };
            const r0 = r(0), r1 = r(1);
            S = (r1 - r0) / rho;
            u = s => (w0 / rho2) * (Math.cosh(r0) * Math.tanh(rho * s + r0) - Math.sinh(r0));
            w = s => w0 * Math.cosh(r0) / Math.cosh(rho * s + r0);
        }
        this._path = { key, S, u, w, u1 };
        return this._path;
    }

    interpolateProps(start, end, t) {
        const { S, u, w, u1 } = this.path(start, end);
        const s = t * S;
        const f = u1 < 1e-6 ? t : u(s) / u1;
        return {
            zoom: Math.log2(this.screenWidth / w(s)),
            target: [start.target[0] + (end.target[0] - start.target[0]) * f,
                     start.target[1] + (end.target[1] - start.target[1]) * f, 0]
        };
    }
}

// S grows with the log of the distance, so this stays within 1.2 and 5 seconds for
// anything on a section. PACE is the knob: 1 felt too quick to follow, 1.5 was
// asked for.
const PACE = 1.5;
function flightDuration(S) {
    return PACE * Math.max(800, Math.min(3500, 500 + 300 * S));
}

/**
 * Search for a cell by ID and navigate to it
 */
async function searchAndNavigateToCell(cellId) {
    // Ensure lookup is initialized
    if (!isLookupInitialized) {
        await initializeCellLookup();
    }

    const cellNum = parseInt(cellId);
    if (isNaN(cellNum)) {
        throw new Error('Please enter a valid cell number');
    }

    const cellData = cellLookupData.get(cellNum);
    if (!cellData) {
        throw new Error(`Cell ${cellNum} not found in dataset`);
    }

    console.log('Navigating to cell', cellNum, 'at position', cellData.x, cellData.y);

    // Get image dimensions for coordinate transformation
    const config = window.config ? window.config() : {};
    const imageDimensions = {
        width: config.imageWidth,
        height: config.imageHeight,
        tileSize: 256
    };

    // CRITICAL: Transform coordinates from original image space to tile coordinate space
    const [transformedX, transformedY] = transformToTileCoordinates(cellData.x, cellData.y, imageDimensions);

    // Calculate plane number from Z coordinate
    const [xVoxelSize, yVoxelSize, zVoxelSize] = config.voxelSize; // [0.28, 0.28, 0.7]
    const planeNumber = Math.floor(cellData.z * xVoxelSize / zVoxelSize);

    // Switch to the calculated plane
    if (window.updatePlane && typeof window.updatePlane === 'function') {
        window.updatePlane(planeNumber);
    } else {
        console.warn('Could not switch plane - updatePlane function not available');
    }

    // CRITICAL: Use high zoom for close-up view of the cell
    const targetZoom = 8; // Maximum zoom for detailed cell view

    // Get current view state from deck.gl instance
    const deckInstance = window.appState?.deckglInstance;
    if (!deckInstance) {
        throw new Error('Deck.GL instance not available');
    }

    // Glide there. The glide is run by deck's controller, so the controller stays on
    // (it used to be switched off for the move, which is why the map jumped: no
    // controller, no transition). In uncontrolled mode a transition is started by
    // handing deck a new initialViewState that carries the transition.
    const from = deckInstance.viewManager.getViewState('ortho');
    const target = [transformedX, transformedY, 0];
    // a cell inside the window glides straight there; one outside flies, zooming
    // out and back in, so the user sees where on the section the map went
    const vp = deckInstance.getViewports()[0];
    const [sx, sy] = vp.project([transformedX, transformedY]);
    const offScreen = sx < 0 || sy < 0 || sx > vp.width || sy > vp.height;
    let interpolator, duration;
    if (offScreen) {
        interpolator = new FlyTo(vp.width);
        duration = flightDuration(interpolator.path(from, { target, zoom: targetZoom }).S);
    } else {
        interpolator = new ZoomToPoint();
        duration = glideDuration(from, target, targetZoom);
    }
    deckInstance.setProps({
        initialViewState: {
            ...from,
            target,
            zoom: targetZoom,
            transitionDuration: duration,
            transitionInterpolator: interpolator,
            transitionEasing: easeInOut
        }
    });
    // flash the cell's outline on arrival, whoever asked for the move (the lookup
    // box or the chat). It used to flash at once, before the map had got there.
    setTimeout(() => pulseCell(cellNum), duration + 100);

    return cellData;
}

/**
 * Flash a white outline on the target cell polygon for ~1.2s
 */
function pulseCell(cellId) {
    const deckInstance = window.appState?.deckglInstance;
    if (!deckInstance) return;

    // Find the polygon feature from the current plane's cached GeoJSON
    const currentPlane = window.appState?.currentPlane ?? 0;
    const geojson = window.appState?.polygonCache?.get(currentPlane);
    if (!geojson || !geojson.features) return;

    const feature = geojson.features.find(
        f => f.properties && parseInt(f.properties.label) === cellId
    );
    if (!feature) return;

    const pulseLayerId = 'cell-lookup-pulse';

    const pulseLayer = new deck.GeoJsonLayer({
        id: pulseLayerId,
        data: { type: 'FeatureCollection', features: [feature] },
        stroked: true,
        filled: false,
        getLineColor: [255, 255, 255, 200],
        getLineWidth: 4,
        lineWidthUnits: 'pixels',
        pickable: false,
        parameters: { depthTest: false }
    });

    // Inject pulse layer
    const currentLayers = deckInstance.props.layers || [];
    deckInstance.setProps({ layers: [...currentLayers, pulseLayer] });

    // Remove after 1.2s
    setTimeout(() => {
        const layers = deckInstance.props.layers || [];
        deckInstance.setProps({
            layers: layers.filter(l => l.id !== pulseLayerId)
        });
    }, 1200);
}

/**
 * Setup cell lookup UI event handlers
 */
function setupCellLookupUI() {
    const input = document.getElementById('cellSearchInput');

    function openBar() {
        input.style.display = 'block';
        input.classList.remove('error');
        input.value = '';
        // Force reflow then focus (so display:block takes effect first)
        input.offsetHeight;
        input.focus();
    }

    function closeBar() {
        input.style.display = 'none';
        input.classList.remove('error');
        input.value = '';
    }

    // Open if closed, close if open. Shared by Ctrl+F and the rail search button.
    function toggleBar() {
        if (input.style.display === 'block') {
            closeBar();
        } else {
            openBar();
        }
    }

    // Expose the toggle so the rail magnifying-glass button can trigger the same action.
    window.cellLookup.toggleSearch = toggleBar;

    // Ctrl+F toggles the bar
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            toggleBar();
        }
    });

    // Rail magnifying-glass button toggles the bar without toggling the drawer
    const searchBtn = document.getElementById('railSearchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBar();
        });
    }

    // Escape closes
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeBar();
        }
    });

    // Enter triggers search
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // Blur closes (click elsewhere dismisses)
    input.addEventListener('blur', () => {
        // Small delay so click events on the input itself aren't eaten
        setTimeout(() => {
            if (document.activeElement !== input) {
                closeBar();
            }
        }, 150);
    });

    async function performSearch() {
        const cellId = input.value.trim();
        if (!cellId) return;

        try {
            await searchAndNavigateToCell(cellId);
            closeBar();
        } catch (error) {
            // Shake + red border
            input.classList.remove('error');
            input.offsetHeight; // reflow to restart animation
            input.classList.add('error');
            input.select();
            console.log('Cell lookup error:', error.message);
        }
    }

    console.log('Cell lookup UI initialized - Press Ctrl+F to search');
}

// Export functions for use in main application
window.cellLookup = {
    initialize: initializeCellLookup,
    search: searchAndNavigateToCell,
    setupUI: setupCellLookupUI
};
