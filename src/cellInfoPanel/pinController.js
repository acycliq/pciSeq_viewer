/**
 * Pin Controller Module
 *
 * Manages the pin state for the cell info panel.
 * Ctrl toggles pin: pinned panel stays visible and interactive (scrollable).
 * Ctrl again or X button unpins and hides.
 *
 * Call init() once at startup to register the Ctrl key listener.
 */

let _panelPinned = false;

/**
 * Register the Ctrl key listener for pin toggling.
 * Must be called explicitly during app initialization.
 */
export function init() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Control') return;
        const panel = document.getElementById('cellInfoPanel');
        if (!panel) return;

        if (_panelPinned) {
            _panelPinned = false;
            panel.classList.remove('pinned');
            panel.classList.remove('visible');
        } else if (panel.classList.contains('visible')) {
            _panelPinned = true;
            panel.classList.add('pinned');
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
    const panel = document.getElementById('cellInfoPanel');
    if (panel) {
        panel.classList.remove('pinned');
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
