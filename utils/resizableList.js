/**
 * Resizable List Utility
 *
 * Provides reusable drag-to-resize functionality for list elements.
 * Used by genes list, cell classes list, and regions list.
 */

/**
 * Setup resizable list with drag handle
 * @param {Object} options - Configuration options
 * @param {string} options.listId - ID of the list element
 * @param {string} options.handleId - ID of the resize handle element
 * @param {string} options.storageKey - localStorage key for persisting height
 * @param {number} [options.minHeight=100] - Minimum height in pixels
 * @param {number} [options.maxHeight=1200] - Maximum height in pixels
 */
export function setupResizableList(options) {
    const {
        listId,
        handleId,
        storageKey,
        minHeight = 100,
        maxHeight = 1200
    } = options;

    const listEl = document.getElementById(listId);
    const handleEl = document.getElementById(handleId);

    if (!listEl || !handleEl) {
        console.warn(`Resizable list setup failed: missing elements (${listId}, ${handleId})`);
        return;
    }

    // Load saved height from localStorage
    loadSavedHeight(listEl, storageKey);

    // Setup resize interaction
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    handleEl.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = listEl.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const deltaY = e.clientY - startY;
        const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
        listEl.style.maxHeight = newHeight + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        saveHeight(listEl, storageKey);
    });
}

/**
 * Load saved height from localStorage
 * @param {HTMLElement} listEl - The list element
 * @param {string} storageKey - localStorage key
 */
function loadSavedHeight(listEl, storageKey) {
    try {
        const saved = window.localStorage && window.localStorage.getItem(storageKey);
        if (saved) {
            const h = parseInt(saved, 10);
            if (!Number.isNaN(h)) {
                listEl.style.maxHeight = h + 'px';
            }
        }
    } catch (e) {
        // localStorage not available
    }
}

/**
 * Save current height to localStorage
 * @param {HTMLElement} listEl - The list element
 * @param {string} storageKey - localStorage key
 */
function saveHeight(listEl, storageKey) {
    try {
        const h = listEl.offsetHeight;
        window.localStorage && window.localStorage.setItem(storageKey, String(h));
    } catch (e) {
        // localStorage not available
    }
}