/**
 * Regions Manager Module
 *
 * Handles importing, storing, and managing anatomical region boundaries, the
 * first kind of annotation. They live in memory like layers in Photoshop: Save
 * writes them to a file, Open reads one back, and closing or loading another
 * dataset with changes not saved asks first (electron/annotations.js).
 */

import { state } from './state/stateManager.js';
import { EYE_OPEN_SVG, EYE_CLOSED_SVG, TRASH_SVG } from './icons.js';
import { cellOutlines } from './cellOutlines.js';

// where older versions kept the regions by themselves, one list for every run
const OLD_STORAGE_KEY = 'pciSeq_regions';

// changes since the last Save or Open
let dirty = false;

// worth asking about: changes, and something left to save
const hasUnsaved = () => dirty && state.regions.size > 0;

// two kinds of annotation share the list: a region is an outline (boundaries, in
// image pixels); a cell annotation is a set of cells (labels) drawn with their own
// outlines from every plane
const isRegion = r => (r.kind || 'region') === 'region';

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
    const parsedData = d3.csvParse(csvText);

    // Find x/y columns with normalization: trim + case-insensitive
    const columns = Array.isArray(parsedData.columns) ? parsedData.columns : [];
    const normalized = columns.map(c => ({ orig: c, norm: String(c).trim().toLowerCase() }));
    const xCol = (normalized.find(c => c.norm === 'x') || {}).orig;
    const yCol = (normalized.find(c => c.norm === 'y') || {}).orig;

    if (!xCol || !yCol) {
        console.warn('CSV file is missing "x" or "y" columns (case-insensitive, whitespace trimmed). Headers must include x and y.');
        return [];
    }

    // Trim and ignore empty/whitespace-only cells before number conversion
    // so legitimate 0 values remain valid but blanks don't become 0.
    return parsedData
        .map(row => {
            const sx = row[xCol] != null ? String(row[xCol]).trim() : '';
            const sy = row[yCol] != null ? String(row[yCol]).trim() : '';

            // Skip rows with missing/blank fields
            if (sx === '' || sy === '') return null;

            const x = Number(sx);
            const y = Number(sy);
            return (Number.isFinite(x) && Number.isFinite(y)) ? [x, y] : null;
        })
        .filter(d => d !== null);
}

/**
 * Central handler for updating all UI elements after a region change.
 */
function updateUIAfterRegionChange() {
    renderRegionsList();
    updateChartDropdowns();
    
    // Notify decoupled widgets (Glass Charts)
    window.dispatchEvent(new CustomEvent('regions-updated'));

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
 * on a black/dark background and keep a calmer mood while remaining legible.
 */
const REGION_COLOR_SET2 = ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f'];

// the Allen atlas regions (fit_allen_regions) all share one quiet colour and stay
// out of the palette, so dozens of them neither take the user's colours nor shuffle them
const ALLEN_COLOR = '#9ca3af';
const isAllen = r => r?.by === 'allen';

function djb2Hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return h >>> 0; // unsigned
}

function hexToRgb(hex) {
    // Prefer d3.rgb for robust color parsing (handles #RGB/#RRGGBB/named)
    try {
        const c = d3.rgb(hex);
        if (c && Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b)) {
            return [c.r, c.g, c.b];
        }
    } catch (e) {}
    // Fallback to accent-ish green on invalid input
    return [34, 197, 94];
}

/**
 * Build a stable color index assignment for current regions using Set2 subset.
 * Approach: iterate region names in alphabetical order; for each, try its hashed
 * base index, then linearly probe until a free index is found. This guarantees
 * the first up to N regions use distinct colors. Adding new regions may change
 * colors of later items alphabetically, but earlier ones remain stable.
 */
function buildRegionColorIndexMap() {
    const names = Array.from(state.regions.values()).filter(r => !isAllen(r)).map(r => r.name)
        .sort((a, b) => String(a).localeCompare(String(b)));
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
    if (isAllen(state.regions.get(name))) return ALLEN_COLOR;
    const mapping = buildRegionColorIndexMap();
    const idx = mapping.get(name);
    if (typeof idx === 'number') return REGION_COLOR_SET2[idx];

    // Fallback to pure hash if something goes wrong
    const key = String(name || 'region');
    return REGION_COLOR_SET2[djb2Hash(key) % REGION_COLOR_SET2.length];
}

function getRegionColorRgb(name) {
    return hexToRgb(getRegionColorHex(name));
}

/**
 * The swatch in the list: a cell annotation whose cells are all one class takes
 * that class's colour, like its outlines on the map; anything else its own colour
 */
function annotationColourHex(region) {
    if (!isRegion(region) && region.features?.length) {
        const classes = new Set(region.features.map(f => f.properties.cellClass));
        const rgb = classes.size === 1 && state.cellClassColors?.get([...classes][0]);
        if (rgb) return '#' + rgb.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    }
    return getRegionColorHex(region.name);
}

/**
 * Region CSVs picked with Open, as { name, text }: an x,y outline per file, the
 * region named after the file. They are added to the list.
 */
function addCsvRegions(files) {
    const imported = [];
    const errors = [];

    for (const file of files) {
        try {
            const boundaries = parseCSV(file.text);

            if (boundaries.length < 3) {
                errors.push(`${file.name}: needs columns x and y and at least 3 points`);
                continue;
            }

            const regionName = formatRegionName(file.name);

            // Store region
            state.regions.set(regionName, {
                name: regionName,
                boundaries: boundaries,
                visible: true, // Default to visible so imported regions are immediately outlined
                by: 'you'
            });

            imported.push(regionName);
        } catch (error) {
            errors.push(`${file.name}: ${error.message}`);
        }
    }

    if (imported.length) markChanged();

    // Update all relevant UI components
    updateUIAfterRegionChange();

    return { imported, errors };
}

/**
 * A region drawn by hand (src/ui/regionDrawer.js): named Region 1, 2, ... and the
 * name opened for editing straight away
 */
function addDrawnRegion(boundaries) {
    let n = 1;
    while (state.regions.has(`Region ${n}`)) n++;
    const name = `Region ${n}`;
    state.regions.set(name, { name, boundaries, visible: true, by: 'you' });
    markChanged();
    updateUIAfterRegionChange();
    startRename(name);
}

/**
 * The chat's fit_allen_regions tool: the Allen atlas regions fitted to the section.
 * Earlier allen regions go, the user's and the chat's stay; a name already taken
 * gets a number.
 */
function addAllenRegions({ regions }) {
    for (const [name, r] of [...state.regions]) if (r.by === 'allen') state.regions.delete(name);
    for (const r of regions) {
        let name = r.name;
        for (let n = 2; state.regions.has(name); n++) name = `${r.name} (${n})`;
        state.regions.set(name, { ...r, name, by: 'allen' });
    }
    markChanged();
    updateUIAfterRegionChange();
}

/**
 * Rename a region, keeping its place in the list. An empty name or one already
 * taken leaves it as it was.
 */
function renameRegion(oldName, newName) {
    newName = String(newName || '').trim();
    if (!newName || newName === oldName || state.regions.has(newName)) return false;
    const entries = Array.from(state.regions.entries()).map(([name, r]) =>
        name === oldName ? [newName, { ...r, name: newName }] : [name, r]);
    state.regions.clear();
    for (const [name, r] of entries) state.regions.set(name, r);
    markChanged();
    return true;
}

/**
 * Turn a row's name into a text box; Enter or clicking away keeps it, Esc does not
 */
function startRename(name) {
    const label = document.querySelector(`#regionsList [data-region="${CSS.escape(name)}"] .cell-class-name`);
    if (!label) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = name;
    input.className = 'region-rename-input';
    input.style.cssText = 'flex:1; min-width:0; font:inherit; color:inherit; background:transparent; border:1px solid currentColor; padding:0 2px;';
    let done = false;
    const finish = (keep) => {
        if (done) return;
        done = true;
        if (keep) renameRegion(name, input.value);
        updateUIAfterRegionChange();
    };
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
    label.replaceWith(input);
    input.focus();
    input.select();
}

/**
 * Delete a region
 */
function deleteRegion(regionName) {
    state.regions.delete(regionName);
    markChanged();
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
        markChanged();

        // DO NOT call renderRegionsList() here - it causes the checkbox to re-render
        // and trigger another change event. Only update the map layers.
        if (window.updateAllLayers) {
            window.updateAllLayers();
        }
    }
}

/**
 * Something changed: remember it is not saved, and give the main process the
 * current regions so it can write them if asked on close
 */
function markChanged() {
    dirty = true;
    syncAnnotationsToMain();
}

/**
 * Give the main process the current list, for the save on close and for the chat
 * tools. The cell outlines are left out, they are rebuilt from the labels.
 */
function syncAnnotationsToMain() {
    const list = Array.from(state.regions.values()).map(({ features, ...plain }) => plain);
    window.electronAPI?.annotationsChanged?.(list);
}

/**
 * The chat's outline_cells tool: a cell annotation, drawn once the outlines are in
 */
async function addCellAnnotation({ name, labels }) {
    let unique = String(name || 'Cells').trim() || 'Cells';
    for (let n = 2; state.regions.has(unique); n++) unique = `${name} ${n}`;
    const entry = { name: unique, kind: 'cells', labels: labels.map(Number), visible: true, by: 'chat', features: [] };
    state.regions.set(unique, entry);
    markChanged();
    updateUIAfterRegionChange();
    await loadOutlines(entry);
}

// fetch a cell annotation's outlines and redraw
async function loadOutlines(entry) {
    try {
        entry.features = await cellOutlines(entry.labels);
    } catch (error) {
        console.error(`Could not get the outlines for ${entry.name}:`, error);
    }
    renderRegionsList();
    if (window.updateAllLayers) window.updateAllLayers();
}

/**
 * Save button: the main process asks where and writes the file
 */
async function saveAnnotations() {
    const file = await window.electronAPI.saveAnnotations();
    if (file) dirty = false;
    return file;
}

/**
 * Open button: an annotations file replaces the list, region CSVs are added to it
 */
async function openAnnotations() {
    const res = await window.electronAPI.openAnnotations();
    if (!res) return null;
    if (res.csv) return addCsvRegions(res.csv);     // region CSVs are added to the list
    if (hasUnsaved() && !window.confirm('Your annotations are not saved. Replace them anyway?')) return null;
    state.regions.clear();
    for (const r of res.regions) state.regions.set(r.name, r);
    dirty = false;
    syncAnnotationsToMain();
    updateUIAfterRegionChange();
    for (const r of state.regions.values()) if (!isRegion(r)) loadOutlines(r);
    return res;
}

/**
 * Older versions kept the regions in localStorage by themselves. Take them once,
 * as changes not saved, so the user is asked to save them to a file.
 */
function takeOldStoredRegions() {
    try {
        const stored = localStorage.getItem(OLD_STORAGE_KEY);
        if (!stored) return;
        localStorage.removeItem(OLD_STORAGE_KEY);
        for (const r of JSON.parse(stored)) {
            state.regions.set(r.name, { name: r.name, boundaries: r.boundaries, visible: r.visible, by: 'you' });
        }
        if (state.regions.size) {
            markChanged();
            updateUIAfterRegionChange();
        }
    } catch (error) {
        console.error('Failed to read the old stored regions:', error);
    }
}

// changes not saved: hold the close or reload, the main process asks the user
window.addEventListener('beforeunload', (e) => {
    if (hasUnsaved()) {
        e.preventDefault();
        e.returnValue = '';
    }
});

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

    // nothing to save from an empty list
    const saveBtn = document.getElementById('saveAnnotationsBtn');
    if (saveBtn) saveBtn.disabled = state.regions.size === 0;

    if (state.regions.size === 0) {
        // CSS shows the "No annotations yet" message
        return;
    }

    // Eye SVGs are centralized in src/icons.js

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
        swatch.style.background = annotationColourHex(region);

        // Name
        const label = document.createElement('span');
        label.className = 'cell-class-name';
        label.textContent = (name && String(name).trim()) ? String(name) : '(unnamed region)';
        label.title = `${name} (double-click to rename)`;
        label.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(name); });

        // Count (boundary points) to match layout
        const cells = !isRegion(region);
        const count = cells ? region.labels.length : (Array.isArray(region.boundaries) ? region.boundaries.length : 0);
        const unit = cells ? 'cells' : 'points';
        const countEl = document.createElement('span');
        countEl.className = 'cell-class-count';
        const maker = region.by && region.by !== 'you' ? region.by : null;   // chat or allen
        countEl.textContent = (maker ? `${maker} \u00b7 ` : '') + count.toLocaleString();
        countEl.title = `${count} ${unit}` + (maker ? `, from ${maker === 'chat' ? 'the chat' : 'the Allen atlas'}` : '');

        // Eye icon toggle
        const eye = document.createElement('div');
        // Keep eye always visible; use icon swap + dimming to indicate state
        eye.className = 'cell-class-eye';
        eye.innerHTML = region.visible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
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
        deleteBtn.innerHTML = TRASH_SVG;
        const handleDelete = (e) => {
            e.stopPropagation();
            deleteRegion(name);
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

        item.title = `${name}: ${count.toLocaleString()} ${unit}`;

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


    // Keep eye element visible; only swap icon and adjust dim state on row
    eye.className = 'cell-class-eye';
    eye.innerHTML = isVisible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
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

        for (const [name, r] of state.regions) {
            if (!isRegion(r)) continue;
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
    return region && isRegion(region) ? region.boundaries : null;
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
    deleteRegion,
    toggleRegionVisibility,
    saveAnnotations,
    openAnnotations,
    takeOldStoredRegions,
    addDrawnRegion,
    addCellAnnotation,
    addAllenRegions,
    isAllen,
    syncAnnotationsToMain,
    isRegion,
    renderRegionsList,
    updateChartDropdowns,
    getRegionColorHex,
    getRegionColorRgb,
    getRegionBoundaries,
    getVisibleRegions
};