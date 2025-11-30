/**
 * Regions Manager Module
 *
 * Handles importing, storing, and managing anatomical region boundaries
 */

import { state } from './stateManager.js';

const STORAGE_KEY = 'pciSeq_regions';

// Initialize regions in state
if (!state.regions) {
    state.regions = new Map(); // Map of regionName -> {name, boundaries, visible}
}

// Flag to prevent re-entrant calls to toggleRegionVisibility
// let isTogglingVisibility = false;

/**
 * Format region name from filename
 * ca1.csv -> CA1
 * dentate_gyrus.csv -> Dentate Gyrus
 */
function formatRegionName(filename) {
    // Remove .csv extension
    let name = filename.replace(/\.csv$/i, '');

    // Replace underscores and hyphens with spaces
    name = name.replace(/[_-]/g, ' ');

    // Capitalize each word
    name = name.split(' ').map(word => {
        // Special handling for common abbreviations
        const upper = word.toUpperCase();
        if (['CA1', 'CA2', 'CA3', 'DG'].includes(upper)) {
            return upper;
        }
        // Regular capitalization
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');

    return name;
}

/**
 * Parse CSV file content to extract x,y coordinates
 * Expected format:
 * x,y
 * 1070,2410
 * 1465,2916
 */
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const coordinates = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Skip header row (if it contains 'x' and 'y')
        if (line.toLowerCase().includes('x') && line.toLowerCase().includes('y')) {
            continue;
        }

        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 2) {
            const x = parseFloat(parts[0]);
            const y = parseFloat(parts[1]);

            if (!isNaN(x) && !isNaN(y)) {
                coordinates.push([x, y]);
            }
        }
    }

    return coordinates;
}

/**
 * Central handler for updating all UI elements after a region change.
 */
function updateUIAfterRegionChange() {
    renderRegionsList();
    updateChartDropdowns();
    if (window.updateAllLayers) {
        window.updateAllLayers();
    }
}

/**
 * Region color palette (d3.schemeSet2) adapted for dark backgrounds.
 *
 * Source palette (d3.schemeSet2, 8 colors):
 *   #66c2a5, #fc8d62, #8da0cb, #e78ac3, #a6d854, #ffd92f, #e5c494, #b3b3b3
 * Changes: Dropped #e5c494 (brownish) and #b3b3b3 (gray) to improve contrast
 * on a black/dark background and keep a calmer "zen" mood while remaining legible.
 */
const REGION_COLOR_SET2 = ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f'];

function djb2Hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return h >>> 0; // unsigned
}

function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return [34, 197, 94]; // fallback to accent-ish green
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/**
 * Build a stable color index assignment for current regions using Set2 subset.
 * Approach: iterate region names in alphabetical order; for each, try its hashed
 * base index, then linearly probe until a free index is found. This guarantees
 * the first up to N regions use distinct colors. Adding new regions may change
 * colors of later items alphabetically, but earlier ones remain stable.
 */
function buildRegionColorIndexMap() {
    const names = Array.from(state.regions.keys()).sort((a, b) => String(a).localeCompare(String(b)));
    const used = new Set();
    const mapping = new Map();
    const N = REGION_COLOR_SET2.length;
    for (const n of names) {
        let idx = djb2Hash(String(n || 'region')) % N;
        const start = idx;
        // linear probe to find free slot
        while (used.has(idx)) {
            idx = (idx + 1) % N;
            if (idx === start) break; // all used; will reuse
        }
        used.add(idx);
        mapping.set(n, idx);
    }
    return mapping;
}

function getRegionColorHex(name) {
    try {
        const mapping = buildRegionColorIndexMap();
        const idx = mapping.get(name);
        if (typeof idx === 'number') return REGION_COLOR_SET2[idx];
    } catch {}
    // Fallback to pure hash if something goes wrong
    const key = String(name || 'region');
    return REGION_COLOR_SET2[djb2Hash(key) % REGION_COLOR_SET2.length];
}

function getRegionColorRgb(name) {
    return hexToRgb(getRegionColorHex(name));
}

/**
 * Import regions from CSV files
 */
async function importRegions(files) {
    const imported = [];
    const errors = [];

    for (const file of files) {
        try {
            const text = await file.text();
            const boundaries = parseCSV(text);

            if (boundaries.length < 3) {
                errors.push(`${file.name}: Need at least 3 points to form a region`);
                continue;
            }

            const regionName = formatRegionName(file.name);

            // Store region
            state.regions.set(regionName, {
                name: regionName,
                boundaries: boundaries,
                visible: true // Default to visible so imported regions are immediately outlined
            });

            imported.push(regionName);
        } catch (error) {
            errors.push(`${file.name}: ${error.message}`);
        }
    }

    // Save to localStorage
    saveRegionsToStorage();

    // Update all relevant UI components
    updateUIAfterRegionChange();

    return { imported, errors };
}

/**
 * Delete a region
 */
function deleteRegion(regionName) {
    state.regions.delete(regionName);
    saveRegionsToStorage();
    updateUIAfterRegionChange();
}

/**
 * Toggle region visibility
 */
function toggleRegionVisibility(regionName, visible) {
    // DEBUG: Trace any call that attempts to turn a region OFF.
    if (visible === false) {
        console.log(`[Debug] A request was made to turn OFF region "${regionName}". Tracing the source...`);
        console.trace('Source of OFF request');
    }

    const region = state.regions.get(regionName);
    if (region) {
        region.visible = visible;
        saveRegionsToStorage();

        // DO NOT call renderRegionsList() here - it causes the checkbox to re-render
        // and trigger another change event. Only update the map layers.
        if (window.updateAllLayers) {
            window.updateAllLayers();
        }
    }
}

/**
 * Save regions to localStorage
 */
function saveRegionsToStorage() {
    try {
        const regionsArray = Array.from(state.regions.entries()).map(([name, data]) => ({
            name: data.name,
            boundaries: data.boundaries,
            visible: data.visible
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(regionsArray));
    } catch (error) {
        console.error('Failed to save regions to localStorage:', error);
    }
}

/**
 * Load regions from localStorage
 */
function loadRegionsFromStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const regionsArray = JSON.parse(stored);
            state.regions.clear();

            regionsArray.forEach(region => {
                state.regions.set(region.name, {
                    name: region.name,
                    boundaries: region.boundaries,
                    visible: region.visible
                });
            });

            // On initial load, a full UI update is correct.
            updateUIAfterRegionChange();
        }
    } catch (error) {
        console.error('Failed to load regions from localStorage:', error);
    }
}

/**
 * Render regions list in the drawer
 */
function renderRegionsList() {
    console.log('[Regions] renderRegionsList called, regions count:', state.regions.size);
    const container = document.getElementById('regionsList');
    if (!container) return;

    // Align Regions list visuals with Genes/Cell Classes
    try { container.classList.add('cell-class-list'); } catch {}

    container.innerHTML = '';

    if (state.regions.size === 0) {
        // CSS will show "No regions imported" message
        return;
    }

    // Eye SVGs (same thin-stroke style used elsewhere)
    const eyeOpenSvg = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7z" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>`;
    const eyeClosedSvg = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7z" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
          <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="1.5"/>
        </svg>`;

    for (const [name, region] of state.regions) {
        console.log('[Regions] Rendering region:', name, 'visible:', region.visible);

        // Row container: reuse unified chip-like item
        const item = document.createElement('div');
        item.className = 'cell-class-item';
        item.dataset.region = name;
        if (!region.visible) item.classList.add('dim');

        // Color swatch (use region color from curated d3.schemeSet2 subset)
        const swatch = document.createElement('div');
        swatch.className = 'cell-class-color';
        try { swatch.style.background = getRegionColorHex(name); } catch { swatch.style.background = 'var(--drawer-accent)'; }

        // Name
        const label = document.createElement('span');
        label.className = 'cell-class-name';
        label.textContent = (name && String(name).trim()) ? String(name) : '(unnamed region)';
        label.title = name;

        // Count (boundary points) to match layout
        const count = Array.isArray(region.boundaries) ? region.boundaries.length : 0;
        const countEl = document.createElement('span');
        countEl.className = 'cell-class-count';
        countEl.textContent = count.toLocaleString();
        countEl.title = `${count} points`;

        // Eye icon toggle
        const eye = document.createElement('div');
        // Keep eye always visible; use icon swap + dimming to indicate state
        eye.className = 'cell-class-eye';
        eye.innerHTML = region.visible ? eyeOpenSvg : eyeClosedSvg;
        eye.title = region.visible ? 'Hide' : 'Show';

        const toggle = () => {
            const newVisible = !region.visible;
            toggleRegionVisibility(name, newVisible);
            region.visible = newVisible;
            updateRegionEyeIcon(name, newVisible);
        };
        item.addEventListener('click', toggle);
        eye.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

        // Delete icon (always visible, thin-stroke trash)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'region-delete-btn';
        deleteBtn.title = 'Delete region';
        deleteBtn.setAttribute('aria-label', `Delete region ${name || ''}`);
        deleteBtn.setAttribute('tabindex', '0');
        deleteBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M3 6h18" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <path d="M8 6V4h8v2" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <rect x="6" y="6" width="12" height="14" rx="2" ry="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <path d="M10 10v6M14 10v6" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>`;
        const handleDelete = (e) => {
            e.stopPropagation();
            if (confirm(`Delete region "${name}"?`)) {
                deleteRegion(name);
            }
        };
        deleteBtn.addEventListener('click', handleDelete);
        deleteBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                handleDelete(e);
            }
        });

        // Assemble: [swatch][name][count][eye][delete]
        item.appendChild(swatch);
        item.appendChild(label);
        item.appendChild(countEl);
        item.appendChild(eye);
        item.appendChild(deleteBtn);

        item.title = `${name}: ${count.toLocaleString()} points`;

        container.appendChild(item);
    }
}

// Update a single region row's UI (eye + dim) without full re-render
function updateRegionEyeIcon(name, isVisible) {
    const container = document.getElementById('regionsList');
    if (!container) return;
    const item = container.querySelector(`[data-region="${CSS.escape(name)}"]`);
    if (!item) return;

    const eye = item.querySelector('.cell-class-eye');
    if (!eye) return;

    const eyeOpenSvg = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7z" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>`;
    const eyeClosedSvg = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7z" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
          <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="1.5"/>
        </svg>`;

    // Keep eye element visible; only swap icon and adjust dim state on row
    eye.className = 'cell-class-eye';
    eye.innerHTML = isVisible ? eyeOpenSvg : eyeClosedSvg;
    eye.title = isVisible ? 'Hide' : 'Show';

    if (isVisible) item.classList.remove('dim'); else item.classList.add('dim');
}

/**
 * Update chart dropdowns with available regions
 */
function updateChartDropdowns() {
    const dropdowns = [
        document.getElementById('classesByZRegionSelect'),
        document.getElementById('classPercentageRegionSelect')
    ];

    dropdowns.forEach(dropdown => {
        if (!dropdown) return;

        // Save current selection
        const currentValue = dropdown.value;

        // Rebuild options
        dropdown.innerHTML = '<option value="">All cells</option>';

        for (const [name] of state.regions) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            dropdown.appendChild(option);
        }

        // Restore selection if still valid
        if (currentValue && state.regions.has(currentValue)) {
            dropdown.value = currentValue;
        }
    });
}

/**
 * Get boundaries for a specific region
 */
function getRegionBoundaries(regionName) {
    if (!regionName) return null;
    const region = state.regions.get(regionName);
    return region ? region.boundaries : null;
}

/**
 * Get all visible regions
 */
function getVisibleRegions() {
    console.log('[Regions] getVisibleRegions called, total regions:', state.regions.size);
    const visible = [];
    for (const [name, region] of state.regions) {
        console.log('[Regions] Checking region:', name, 'visible:', region.visible);
        if (region.visible) {
            visible.push(region);
        }
    }
    console.log('[Regions] Visible regions found:', visible.length);
    return visible;
}

export {
    importRegions,
    deleteRegion,
    toggleRegionVisibility,
    loadRegionsFromStorage,
    saveRegionsToStorage,
    renderRegionsList,
    updateChartDropdowns,
    getRegionColorHex,
    getRegionColorRgb,
    getRegionBoundaries,
    getVisibleRegions
};
