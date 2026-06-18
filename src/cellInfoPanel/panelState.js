/**
 * Panel State Module
 *
 * Owns the two independent state axes of the cell info panel:
 *   - minimized : panel is collapsed to a strip (header only) vs. full control
 *   - frozen    : content is locked (click-to-freeze) and ignores hover updates
 *
 * Also caches the last cell rendered (`lastCell`) so the panel always has
 * something to show when maximized or when the cursor is over empty map.
 *
 * This module is intentionally render-agnostic: it only flips flags and CSS
 * classes. The orchestrator (index.js) owns the actual donut/table/legend
 * rendering and reacts to these flags.
 */

let _minimized = false;   // collapsed to strip
let _frozen = false;      // content locked against hover
let _lastCell = null;     // last cell data passed to the panel

function panelEl() {
    return document.getElementById('cellInfoPanel');
}

/** Cache the most recently seen cell data. */
export function setLastCell(cellData) {
    _lastCell = cellData;
}

/** The most recently seen cell data, or null if none yet. */
export function getLastCell() {
    return _lastCell;
}

export function isMinimized() {
    return _minimized;
}

export function isFrozen() {
    return _frozen;
}

/** Collapse the panel to its header strip. */
export function minimize() {
    _minimized = true;
    const panel = panelEl();
    if (panel) panel.classList.add('minimized');
    syncToggleButton();
}

/** Expand the panel to the full control. Does not itself render. */
export function maximize() {
    _minimized = false;
    const panel = panelEl();
    if (panel) panel.classList.remove('minimized');
    syncToggleButton();
}

/** Lock content against hover updates (click-to-freeze). */
export function freeze() {
    _frozen = true;
    const panel = panelEl();
    if (panel) panel.classList.add('frozen');
}

/** Resume hover-driven updates. Content already on screen is left as-is. */
export function unfreeze() {
    _frozen = false;
    const panel = panelEl();
    if (panel) panel.classList.remove('frozen');
}

/**
 * Update the toggle button's icon/label to reflect minimized state.
 * Minimized -> shows "maximize"; maximized -> shows "minimize".
 */
function syncToggleButton() {
    const btn = document.getElementById('cellInfoToggle');
    if (!btn) return;
    btn.textContent = _minimized ? '□' : '–'; // □ vs – (en dash)
    btn.title = _minimized ? 'Maximize' : 'Minimize';
    btn.setAttribute('aria-label', _minimized ? 'Maximize panel' : 'Minimize panel');
}

/**
 * Initialize panel state: make the panel permanently present and sync the
 * toggle button. The minimize/maximize click wiring lives in index.js so it
 * can trigger a re-render on maximize.
 */
export function init() {
    const panel = panelEl();
    if (panel) panel.classList.add('visible'); // always visible from here on
    minimize(); // start collapsed to the strip; expands on click or maximize
}