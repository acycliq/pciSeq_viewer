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
                visible: false // Start hidden
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

    container.innerHTML = '';

    if (state.regions.size === 0) {
        // CSS will show "No regions imported" message
        return;
    }

    for (const [name, region] of state.regions) {
        console.log('[Regions] Rendering region:', name, 'visible:', region.visible);
        const item = document.createElement('div');
        item.className = 'region-item';

        const checkbox = document.createElement('input');
        const checkboxId = `region-checkbox-${name.replace(/\s+/g, '-')}`;
        checkbox.id = checkboxId;
        checkbox.type = 'checkbox';
        checkbox.checked = region.visible;
        console.log('[Regions] Checkbox for', name, 'set to:', checkbox.checked);
        checkbox.addEventListener('change', (e) => {
            console.log('[Regions] Checkbox change event for', name, ':', e.target.checked);
            toggleRegionVisibility(name, e.target.checked);
        });

        const label = document.createElement('label');
        label.htmlFor = checkboxId;
        label.textContent = name;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'region-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete region';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Delete region "${name}"?`)) {
                deleteRegion(name);
            }
        });

        item.appendChild(checkbox);
        item.appendChild(label);
        item.appendChild(deleteBtn);

        container.appendChild(item);
    }
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
    getRegionBoundaries,
    getVisibleRegions
};

