/**
 * Cell Class Drawer Management
 * Handles the always-visible cell class list in the controls drawer
 * with ranking by count and eye icon toggles (pciSeq_3d style)
 */

import { state } from './stateManager.js';
import { debounce } from './utils.js';
import { applyClassColorScheme } from './classColorImport.js';
import { EYE_OPEN_SVG, EYE_CLOSED_SVG } from './icons.js';

/**
 * Populate the cell class list, ranked by count
 */
export function populateCellClassDrawer() {
    const listContainer = document.getElementById('cellClassesList');

    if (!listContainer) return;

    // Check if cell data is loaded
    if (!state.allCellClasses || state.allCellClasses.size === 0) {
        listContainer.innerHTML = '<div class="loading-message">No cell classes available</div>';
        return;
    }

    // Count cells per class (match pciSeq_3d semantics: count by primary class)
    const cellCounts = new Map();

    if (state.cellDataMap && state.cellDataMap.size > 0) {
        state.cellDataMap.forEach(cell => {
            // Prefer explicit primaryClass set at load time
            let primary = cell?.primaryClass;
            if (!primary) {
                const names = Array.isArray(cell?.classification?.className) ? cell.classification.className : null;
                primary = names && names.length ? String(names[0]).trim() : null;
            }
            if (!primary) primary = 'Unknown';

            cellCounts.set(primary, (cellCounts.get(primary) || 0) + 1);
        });
    }

    // Convert to array and sort by count (descending)
    const sortedClasses = Array.from(state.allCellClasses)
        .map(className => ({
            name: className,
            count: cellCounts.get(className) || 0
        }))
        .sort((a, b) => b.count - a.count); // Highest count first

    // Build list HTML
    listContainer.innerHTML = '';

    sortedClasses.forEach(({ name, count }) => {
        const item = document.createElement('div');
        item.className = 'cell-class-item';
        item.dataset.cellClass = name;

        // Eye icon (SVG - matching pciSeq_3d glyphicon style)
        const isVisible = state.selectedCellClasses.has(name);
        if (!isVisible) item.classList.add('dim');
        const eye = document.createElement('div');
        // Keep the eye always visible; swap SVG and dim the row for state
        eye.className = 'cell-class-eye';

        // Use centralized eye SVGs
        eye.innerHTML = isVisible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
        eye.title = isVisible ? 'Hide' : 'Show';

        // Color swatch
        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'cell-class-color';
        const color = state.cellClassColors.get(name) || [192, 192, 192];
        colorSwatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

        // Class name
        const nameSpan = document.createElement('span');
        nameSpan.className = 'cell-class-name';
        nameSpan.textContent = name;
        nameSpan.title = name; // Tooltip for long names

        // Cell count
        const countSpan = document.createElement('span');
        countSpan.className = 'cell-class-count';
        countSpan.textContent = count.toLocaleString();
        countSpan.title = `${count} cells`;

        // Add click handler for eye icon
        eye.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCellClassVisibility(name);
        });

        // Add click handler for whole item (also toggles)
        item.addEventListener('click', () => { toggleCellClassVisibility(name); });

        // pciSeq_3d order: [Color] [Name] [Count] [Eye]
        item.appendChild(colorSwatch);
        item.appendChild(nameSpan);
        item.appendChild(countSpan);
        item.appendChild(eye);

        listContainer.appendChild(item);
    });

    // Update tri-state master checkbox state after population
    try { updateClassesToggleAllCheckboxState(); } catch {}
}

/**
 * Toggle cell class visibility
 */
function toggleCellClassVisibility(className) {
    const isVisible = state.selectedCellClasses.has(className);

    if (isVisible) {
        state.selectedCellClasses.delete(className);
    } else {
        state.selectedCellClasses.add(className);
    }

    // Update the eye icon
    updateEyeIcon(className, !isVisible);

    // Update dim class on item for visual parity with pciSeq_3d
    const listContainer = document.getElementById('cellClassesList');
    if (listContainer) {
        const item = listContainer.querySelector(`[data-cell-class="${className}"]`);
        if (item) {
            if (isVisible) item.classList.add('dim'); else item.classList.remove('dim');
        }
    }

    // Update tri-state master checkbox state
    try { updateClassesToggleAllCheckboxState(); } catch {}

    // Update layers
    if (typeof window.updateAllLayers === 'function') {
        window.updateAllLayers();
    }
}

/**
 * Update a single eye icon without re-rendering the whole list
 */
function updateEyeIcon(className, isVisible) {
    const listContainer = document.getElementById('cellClassesList');
    if (!listContainer) return;

    const item = listContainer.querySelector(`[data-cell-class="${className}"]`);
    if (!item) return;

    const eye = item.querySelector('.cell-class-eye');
    if (!eye) return;

    // Keep the eye element visible; just swap the icon using centralized SVGs
    eye.className = 'cell-class-eye';
    eye.innerHTML = isVisible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
    eye.title = isVisible ? 'Hide' : 'Show';
}

/**
 * Show all cell classes (pciSeq_3d style)
 */
function showAllCellClasses() {
    state.allCellClasses.forEach(className => {
        state.selectedCellClasses.add(className);
    });

    // Update all eye icons
    const listContainer = document.getElementById('cellClassesList');
    if (listContainer) {
        const items = listContainer.querySelectorAll('.cell-class-item');
        items.forEach(item => {
            const className = item.dataset.cellClass;
            updateEyeIcon(className, true);
            item.classList.remove('dim');
        });
    }

    // Sync master checkbox
    try { updateClassesToggleAllCheckboxState(); } catch {}

    // Update layers
    if (typeof window.updateAllLayers === 'function') {
        window.updateAllLayers();
    }
}

/**
 * Hide all cell classes (pciSeq_3d style)
 */
function hideAllCellClasses() {
    state.selectedCellClasses.clear();

    // Update all eye icons
    const listContainer = document.getElementById('cellClassesList');
    if (listContainer) {
        const items = listContainer.querySelectorAll('.cell-class-item');
        items.forEach(item => {
            const className = item.dataset.cellClass;
            updateEyeIcon(className, false);
            item.classList.add('dim');
        });
    }

    // Sync master checkbox
    try { updateClassesToggleAllCheckboxState(); } catch {}

    // Update layers
    if (typeof window.updateAllLayers === 'function') {
        window.updateAllLayers();
    }
}

/**
 * Filter cell classes by name (debounced search - pciSeq_3d style)
 */
function filterCellClasses(searchTerm) {
    const listContainer = document.getElementById('cellClassesList');
    if (!listContainer) return;

    const term = searchTerm.toLowerCase().trim();
    const items = listContainer.querySelectorAll('.cell-class-item');

    items.forEach(item => {
        const className = item.dataset.cellClass;
        if (!className) return;

        const matches = className.toLowerCase().includes(term);
        item.style.display = matches ? 'flex' : 'none';
    });
}

/**
 * Setup collapsible sections
 */
export function setupCollapsibleSections() {
    const headers = document.querySelectorAll('.collapsible-header');

    headers.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            if (!content || !content.classList.contains('section-content')) return;

            const isCollapsed = header.classList.contains('collapsed');

            if (isCollapsed) {
                // Expand
                header.classList.remove('collapsed');
                content.classList.remove('collapsed');
            } else {
                // Collapse
                header.classList.add('collapsed');
                content.classList.add('collapsed');
            }
        });
    });
}

/**
 * Initialize the cell class drawer (pciSeq_3d style)
 */
export function initCellClassDrawer() {
    // Setup collapsible sections
    setupCollapsibleSections();

    // Set initial collapsed state: expand Genes and Cell Classes; collapse others
    try {
        const keepOpen = new Set(['genesHeader', 'cellClassesHeader']);
        const headers = document.querySelectorAll('.collapsible-header');
        headers.forEach(header => {
            const content = header.nextElementSibling;
            if (!content || !content.classList.contains('section-content')) return;
            if (keepOpen.has(header.id)) {
                header.classList.remove('collapsed');
                content.classList.remove('collapsed');
            } else {
                header.classList.add('collapsed');
                content.classList.add('collapsed');
            }
        });
    } catch {}

    // Master tri-state checkbox (GitHub-style)
    const toggleAll = document.getElementById('classesToggleAll');
    if (toggleAll) {
        // Initialize state
        try { updateClassesToggleAllCheckboxState(); } catch {}

        toggleAll.addEventListener('change', () => {
            const listContainer = document.getElementById('cellClassesList');
            const selectAll = Boolean(toggleAll.checked);
            if (selectAll) {
                state.allCellClasses.forEach(c => state.selectedCellClasses.add(c));
                if (listContainer) listContainer.querySelectorAll('.cell-class-item').forEach(it => it.classList.remove('dim'));
            } else {
                state.selectedCellClasses.clear();
                if (listContainer) listContainer.querySelectorAll('.cell-class-item').forEach(it => it.classList.add('dim'));
            }

            updateClassesToggleAllCheckboxState();
            if (typeof window.updateAllLayers === 'function') window.updateAllLayers();
        });
    }

    // Repurpose: Import Colour Scheme button
    const importBtn = document.getElementById('importClassColorsBtn');
    const fileInput = document.getElementById('classColorFileInput');
    const statusEl = document.getElementById('classColorFileStatus');
    if (importBtn && fileInput) {
        importBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            if (statusEl) { statusEl.textContent = 'Loading…'; statusEl.className = 'file-status'; }
            reader.onload = () => {
                try {
                    const json = JSON.parse(reader.result);
                    const { appliedCount, notFoundClasses, pending } = applyClassColorScheme(json);
                    if (pending) {
                        if (statusEl) {
                            statusEl.textContent = `Colour scheme loaded (${Object.keys(json).length}). Will apply when classes are available.`;
                            statusEl.className = 'file-status success';
                        }
                    } else if (appliedCount > 0) {
                        if (statusEl) {
                            statusEl.textContent = `Imported ${appliedCount} custom colours`;
                            statusEl.className = 'file-status success';
                        }
                        // Refresh UI and layers
                        try { populateCellClassDrawer(); } catch {}
                        if (typeof window.updateAllLayers === 'function') window.updateAllLayers();
                        if (notFoundClasses && notFoundClasses.length) {
                            console.warn('Classes not found in data:', notFoundClasses);
                        }
                    } else {
                        if (statusEl) {
                            statusEl.textContent = 'No matching classes found';
                            statusEl.className = 'file-status error';
                        }
                    }
                } catch (err) {
                    if (statusEl) {
                        statusEl.textContent = `Error: ${err.message || 'Invalid JSON'}`;
                        statusEl.className = 'file-status error';
                    }
                    console.error('Failed to load colour scheme:', err);
                } finally {
                    try { e.target.value = ''; } catch {}
                    if (statusEl) setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'file-status'; }, 5000);
                }
            };
            reader.onerror = () => {
                if (statusEl) { statusEl.textContent = 'Failed to read file'; statusEl.className = 'file-status error'; }
            };
            reader.readAsText(file);
        });
    }

    // Setup filter input with debouncing (pciSeq_3d style)
    const filterInput = document.getElementById('cellClassFilter');
    if (filterInput) {
        const debouncedFilter = debounce((term) => {
            filterCellClasses(term);
        }, 200);

        filterInput.addEventListener('input', (e) => {
            debouncedFilter(e.target.value);
        });
    }

    // Setup resizable class list (pciSeq_3d style)
    setupCellClassListResize();

    // Shortcut: '/' focuses the filter input (pciSeq_3d style)
    window.addEventListener('keydown', (e) => {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const activeTag = document.activeElement && document.activeElement.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
            e.preventDefault();
            const input = document.getElementById('cellClassFilter');
            if (input) {
                input.focus();
                input.select();
            }
        }
    });

    // Populate will be called after data loads
    console.log('Cell class drawer initialized (pciSeq_3d style)');
}

// Make the cell class list vertically resizable with a drag handle
function setupCellClassListResize() {
    const listEl = document.getElementById('cellClassesList');
    const handleEl = document.getElementById('cellClassesResizeHandle');
    if (!listEl || !handleEl) return;

    const minHeight = 100;
    const maxHeight = 1200;

    // Load saved height
    try {
        const saved = window.localStorage && window.localStorage.getItem('cellClassesListHeight');
        if (saved) {
            const h = parseInt(saved, 10);
            if (!Number.isNaN(h)) listEl.style.maxHeight = h + 'px';
        }
    } catch {}

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
        try {
            const h = listEl.offsetHeight;
            window.localStorage && window.localStorage.setItem('cellClassesListHeight', String(h));
        } catch {}
    });
}

function updateClassesToggleAllCheckboxState() {
    const cb = document.getElementById('classesToggleAll');
    if (!cb) return;
    const total = state.allCellClasses ? state.allCellClasses.size : 0;
    const selected = state.selectedCellClasses ? state.selectedCellClasses.size : 0;
    const all = total > 0 && selected === total;
    const none = selected === 0;

    cb.indeterminate = !all && !none;
    cb.checked = all;
    cb.setAttribute('aria-checked', cb.indeterminate ? 'mixed' : (all ? 'true' : 'false'));
    cb.disabled = total === 0;
}
