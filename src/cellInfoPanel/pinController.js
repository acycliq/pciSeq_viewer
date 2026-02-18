/**
 * Pin Controller Module
 *
 * Manages pin state for the cell info panel with two modes:
 * - Soft pin (Shift): panel stays visible and keeps updating on hover
 * - Hard pin (Click): panel stays visible and does NOT update on hover
 *
 * Call init() once at startup to register the Shift key listener.
 */

let _panelPinned = false;   // any pin (soft or hard)
let _panelFrozen = false;   // hard pin (frozen against hover updates)

/**
 * Register the Ctrl key listener for pin toggling.
 * Must be called explicitly during app initialization.
 */
export function init() {
    document.addEventListener('keyup', (e) => {
        if (e.key !== 'Shift') return;
        const panel = document.getElementById('cellInfoPanel');
        if (!panel) return;

        // Ignore when typing in inputs/textareas or contentEditable elements
        const t = e.target;
        const tag = (t && t.tagName) ? t.tagName.toLowerCase() : '';
        const isEditable = (t && (t.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'));
        if (isEditable) return;

        if (_panelPinned && _panelFrozen) {
            // Convert hard pin to soft pin (resume hover updates, remain visible)
            _panelFrozen = false;
            panel.classList.add('pinned');
            panel.classList.add('visible');
            panel.classList.remove('frozen');
            return;
        }

        if (_panelPinned) {
            // Unpin (return to hover-driven behavior)
            _panelPinned = false;
            _panelFrozen = false;
            panel.classList.remove('pinned');
            panel.classList.remove('frozen');
            return;
        }

        // Soft pin: pin and keep updating on hover (only if currently visible)
        if (panel.classList.contains('visible')) {
            _panelPinned = true;
            _panelFrozen = false;
            panel.classList.add('pinned');
            panel.classList.add('visible');
            panel.classList.remove('frozen');
        }
    });
}

/**
 * Show the cell info panel (adds 'visible' class).
 */
export function show() {
    const panel = document.getElementById('cellInfoPanel');
    if (panel) {
        panel.classList.add('visible');
    }
}

/**
 * Hide the cell info panel (blocked when pinned).
 */
export function hide() {
    if (_panelPinned) return;
    const panel = document.getElementById('cellInfoPanel');
    if (panel) {
        panel.classList.remove('visible');
    }
}

/**
 * Always hides the panel and clears pin state.
 * Used by the X close button.
 */
export function forceHide() {
    _panelPinned = false;
    _panelFrozen = false;
    const panel = document.getElementById('cellInfoPanel');
    if (panel) {
        panel.classList.remove('pinned');
        panel.classList.remove('frozen');
        panel.classList.remove('visible');
    }
}

/**
 * Check whether the panel is currently pinned.
 * @returns {boolean}
 */
export function isPinned() {
    return _panelPinned;
}

/**
 * Whether the panel is hard-pinned (frozen against hover updates)
 */
export function isFrozen() {
    return _panelPinned && _panelFrozen;
}

/**
 * Programmatically pin the panel (hard pin) and ensure it's visible.
 */
export function pin() {
    _panelPinned = true;
    _panelFrozen = true;
    const panel = document.getElementById('cellInfoPanel');
    if (panel) {
        panel.classList.add('pinned');
        panel.classList.add('visible');
        panel.classList.add('frozen');
    }
}
