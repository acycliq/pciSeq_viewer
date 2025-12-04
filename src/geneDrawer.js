/**
 * Gene Drawer Management
 * Drawer list of genes with counts and eye toggles
 */

import { state } from './stateManager.js';
import { EYE_OPEN_SVG, EYE_CLOSED_SVG } from './icons.js';
import { debounce } from './utils.js';
import { handleGeneColorFileUpload } from './geneColorImport.js';

export function populateGeneDrawer() {
    const listEl = document.getElementById('genesList');
    if (!listEl) return;

    if (!state.geneDataMap || state.geneDataMap.size === 0) {
        listEl.innerHTML = '<div class="loading-message">No genes available</div>';
        return;
    }

    // Build array of { name, count }
    const entries = Array.from(state.geneDataMap.entries()).map(([gene, spots]) => ({
        name: gene,
        count: Array.isArray(spots) ? spots.length : 0
    }));
    // Sort by count desc, then name asc
    entries.sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));

    listEl.innerHTML = '';

    // Build quick color map from glyph settings (same used in loaders)
    let colorByGene = null;
    try {
        const settings = glyphSettings();
        colorByGene = new Map(settings.map(s => [s.gene, s.color]));
    } catch (e) {
        colorByGene = new Map();
    }

    for (const { name, count } of entries) {
        const item = document.createElement('div');
        item.className = 'cell-class-item'; // reuse chip styles
        item.dataset.gene = name;

        const visible = state.selectedGenes.has(name);
        if (!visible) item.classList.add('dim');

        // Color swatch (use gene color from glyph config if available)
        const swatch = document.createElement('div');
        swatch.className = 'cell-class-color';
        const hex = colorByGene.get(name) || '#ffffff';
        swatch.style.background = hex;

        const label = document.createElement('span');
        label.className = 'cell-class-name';
        label.textContent = name;
        label.title = name;

        const countEl = document.createElement('span');
        countEl.className = 'cell-class-count';
        countEl.textContent = (count || 0).toLocaleString();
        item.title = `${name}: ${count.toLocaleString()} spots`;

        // Eye icon (thin stroke like pciSeq_3d)
        const eye = document.createElement('div');
        eye.className = `cell-class-eye ${visible ? 'visible' : 'hidden'}`;
        eye.innerHTML = visible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;

        // Click to toggle
        const toggle = () => toggleGeneVisibility(name);
        item.addEventListener('click', toggle);
        eye.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

        item.appendChild(swatch);
        item.appendChild(label);
        item.appendChild(countEl);
        item.appendChild(eye);
        listEl.appendChild(item);
    }

    // Update tri-state checkbox based on current selection
    try { updateGenesToggleAllCheckboxState(); } catch {}
}

function toggleGeneVisibility(gene) {
    if (state.selectedGenes.has(gene)) {
        state.selectedGenes.delete(gene);
    } else {
        state.selectedGenes.add(gene);
    }

    // Update eye and dim class quickly
    const listEl = document.getElementById('genesList');
    const item = listEl && listEl.querySelector(`[data-gene="${CSS.escape(gene)}"]`);
    if (item) {
        const eye = item.querySelector('.cell-class-eye');
        const visible = state.selectedGenes.has(gene);
        if (eye) eye.innerHTML = visible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
        if (visible) item.classList.remove('dim'); else item.classList.add('dim');
    }

    // Update master checkbox state (tri-state)
    try { updateGenesToggleAllCheckboxState(); } catch {}

    if (typeof window.updateAllLayers === 'function') window.updateAllLayers();
}

export function initGeneDrawer() {
    // Collapsible behavior uses same handler as classes (already bound), so just set up local controls

    // Master tri-state checkbox (GitHub-style)
    const toggleAll = document.getElementById('genesToggleAll');
    if (toggleAll) {
        // Initialize state
        try { updateGenesToggleAllCheckboxState(); } catch {}

        toggleAll.addEventListener('change', () => {
            const listEl = document.getElementById('genesList');
            const selectAll = Boolean(toggleAll.checked);

            if (selectAll) {
                state.selectedGenes.clear();
                state.geneDataMap.forEach((_, gene) => state.selectedGenes.add(gene));
                if (listEl) listEl.querySelectorAll('.cell-class-item').forEach(it => it.classList.remove('dim'));
            } else {
                state.selectedGenes.clear();
                if (listEl) listEl.querySelectorAll('.cell-class-item').forEach(it => it.classList.add('dim'));
            }

            // After bulk action, clear indeterminate and sync aria
            updateGenesToggleAllCheckboxState();

            if (typeof window.updateAllLayers === 'function') window.updateAllLayers();
        });
    }

    // Repurposed: Import gene colours + glyphs
    const importBtn = document.getElementById('importGeneColorsBtn');
    const fileInput = document.getElementById('geneColorFileInput');
    const statusEl = document.getElementById('geneColorFileStatus');
    if (importBtn && fileInput) {
        importBtn.addEventListener('click', (e) => {
            // Store ctrl/cmd state for file upload handler
            fileInput.dataset.replaceMode = (e.ctrlKey || e.metaKey) ? 'true' : 'false';
            fileInput.click();
        });
        fileInput.addEventListener('change', (e) => handleGeneColorFileUpload(e, statusEl));
    }

    const filterInput = document.getElementById('geneFilter');
    if (filterInput) {
        const debounced = debounce((term) => {
            const listEl = document.getElementById('genesList');
            if (!listEl) return;
            const t = String(term || '').toLowerCase().trim();
            listEl.querySelectorAll('.cell-class-item').forEach(it => {
                const name = it.dataset.gene || '';
                it.style.display = name.toLowerCase().includes(t) ? 'flex' : 'none';
            });
        }, 200);
        filterInput.addEventListener('input', (e) => debounced(e.target.value));
    }

    // Resizer
    const listEl = document.getElementById('genesList');
    const handleEl = document.getElementById('genesResizeHandle');
    if (listEl && handleEl) {
        let isResizing = false, startY = 0, startH = 0;
        const minH = 100, maxH = 1200;

        try {
            const saved = window.localStorage && window.localStorage.getItem('genesListHeight');
            if (saved) {
                const h = parseInt(saved, 10);
                if (!Number.isNaN(h)) listEl.style.maxHeight = h + 'px';
            }
        } catch {}

        handleEl.addEventListener('mousedown', (e) => {
            isResizing = true; startY = e.clientY; startH = listEl.offsetHeight;
            document.body.style.cursor = 'ns-resize'; document.body.style.userSelect = 'none'; e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newH = Math.max(minH, Math.min(maxH, startH + (e.clientY - startY)));
            listEl.style.maxHeight = newH + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (!isResizing) return; isResizing = false;
            document.body.style.cursor = ''; document.body.style.userSelect = '';
            try { window.localStorage && window.localStorage.setItem('genesListHeight', String(listEl.offsetHeight)); } catch {}
        });
    }
}

function updateGenesToggleAllCheckboxState() {
    const cb = document.getElementById('genesToggleAll');
    if (!cb) return;
    const total = state.geneDataMap ? state.geneDataMap.size : 0;
    const selected = state.selectedGenes ? state.selectedGenes.size : 0;
    const all = total > 0 && selected === total;
    const none = selected === 0;

    cb.indeterminate = !all && !none;
    cb.checked = all;
    cb.setAttribute('aria-checked', cb.indeterminate ? 'mixed' : (all ? 'true' : 'false'));
    // Enable/disable if no data
    cb.disabled = total === 0;
}
