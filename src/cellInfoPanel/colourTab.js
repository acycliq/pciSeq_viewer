/**
 * Colour Tab Module
 *
 * The bottom-right panel's second tab (spot mode). Shows a spot's OBSERVED colours
 * (R x C grid) next to a gene's BLED CODE, so you can eyeball how well the call
 * explains the raw signal. For a high-prob spot the two grids match in pattern
 * (up to a brightness scale). A typeahead swaps which gene's bled code is shown.
 *
 * Data sources:
 *   - bled codes:  app://arrow_spots/bled_codes.bin  (G*R*C float32), loaded once.
 *   - colours_meta: app://arrow_spots/colours_meta.json { R, C, G, n_spots }.
 *   - observed:    electronAPI.readSpotColours(spot_id) -> one spot's R*C floats.
 *
 * Bled is scaled by the least-squares brightness b = sum(o*m)/sum(m*m) (>=0), the
 * same fit the model uses, so observed and b*bled are directly comparable. Both
 * grids share one colour scale.
 */

import { debounce } from '../../utils/common.js';
import { escapeHtml } from '../../utils/domSafe.js';

const SPOTS_BASE = 'app://arrow_spots/';

let _activeTab = 'genes';
let _spot = null;            // current spot { spot_id, topGene, ... }
let _selectedGene = null;    // gene whose bled code is shown
let _observed = null;        // { R, C, values:number[] } for the current spot
let _bled = null;            // { R, C, G, values: Float32Array } loaded once
let _geneNames = [];
let _nameToId = new Map();
let _fetchToken = 0;         // guards against a stale observed read overwriting a newer one

async function ensureBledLoaded() {
    if (_bled) return _bled;
    const [metaRes, binRes] = await Promise.all([
        fetch(SPOTS_BASE + 'colours_meta.json'),
        fetch(SPOTS_BASE + 'bled_codes.bin')
    ]);
    if (!metaRes.ok || !binRes.ok) {
        throw new Error('bled_codes / colours_meta not found (re-export from spot_caller)');
    }
    const meta = await metaRes.json();
    const buf = await binRes.arrayBuffer();
    _bled = { R: meta.R, C: meta.C, G: meta.G, values: new Float32Array(buf) };

    // Gene name <-> id from the already-loaded gene dict (id -> name).
    const dict = (window.appState && window.appState.arrowGeneDict) || {};
    _nameToId = new Map();
    _geneNames = [];
    for (const [idStr, name] of Object.entries(dict)) {
        _nameToId.set(String(name), Number(idStr));
        _geneNames.push(String(name));
    }
    _geneNames.sort((a, b) => a.localeCompare(b));
    return _bled;
}

export function initColourTab() {
    document.querySelectorAll('.cell-info-tab').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    const search = document.getElementById('bledGeneSearch');
    if (search) {
        const deb = debounce((term) => renderGeneList(term), 200);
        search.addEventListener('input', (e) => deb(e.target.value));
        search.addEventListener('focus', (e) => renderGeneList(e.target.value));
        search.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const first = document.querySelector('#bledGeneList .bled-gene-item');
                if (first) selectGene(first.dataset.gene);
            } else if (e.key === 'Escape') {
                closeGeneList();
            }
        });
        // close the list when focus leaves the picker
        search.addEventListener('blur', () => setTimeout(closeGeneList, 150));
    }
}

function switchTab(tab) {
    _activeTab = tab;
    document.querySelectorAll('.cell-info-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const genes = document.getElementById('cellInfoTabGenes');
    const colours = document.getElementById('cellInfoTabColours');
    if (genes) genes.classList.toggle('active', tab === 'genes');
    if (colours) colours.classList.toggle('active', tab === 'colours');
    if (tab === 'colours') refreshColours();
}

/** Called by the panel when the current spot changes (hover / click-to-freeze). */
export function setColourSpot(spotData) {
    _spot = spotData;
    if (spotData && spotData.topGene) _selectedGene = spotData.topGene;
    if (_activeTab === 'colours') refreshColours();
}

// Observed read is throttled: hover fires fast, and each read hits disk via IPC.
const _debouncedObserved = debounce(async (spotId, token) => {
    try {
        const res = await window.electronAPI.readSpotColours(spotId);
        if (token !== _fetchToken) return;               // a newer spot superseded this read
        if (!res || !res.success) {
            _observed = null;
            setHeatmapMessage('obsHeatmap', (res && res.error) || 'no colours');
            return;
        }
        _observed = { R: res.R, C: res.C, values: res.values };
        drawBoth();
    } catch (e) {
        _observed = null;
        setHeatmapMessage('obsHeatmap', String(e && e.message || e));
    }
}, 120);

async function refreshColours() {
    if (!_spot) return;
    try {
        await ensureBledLoaded();
    } catch (e) {
        setHeatmapMessage('bledHeatmap', String(e.message || e));
        setHeatmapMessage('obsHeatmap', '');
        return;
    }
    if (!_selectedGene) _selectedGene = _spot.topGene;
    const search = document.getElementById('bledGeneSearch');
    if (search && document.activeElement !== search) search.value = _selectedGene || '';
    _fetchToken++;
    setHeatmapMessage('obsHeatmap', 'loading...');
    _debouncedObserved(_spot.spot_id, _fetchToken);
    drawBoth();                                          // draw bled now; observed follows
}

function bledFor(geneName) {
    if (!_bled) return null;
    const id = _nameToId.get(geneName);
    if (id == null) return null;
    const { R, C, values } = _bled;
    const start = id * R * C;
    return { R, C, values: values.subarray(start, start + R * C) };
}

// least-squares brightness b = sum(o*m)/sum(m*m), clamped >= 0 (matches model._brightness)
function brightness(obs, bled) {
    let num = 0, den = 0;
    for (let i = 0; i < obs.length; i++) { num += obs[i] * bled[i]; den += bled[i] * bled[i]; }
    return den > 0 ? Math.max(0, num / den) : 0;
}

function drawBoth() {
    const title = document.getElementById('bledHmTitle');
    if (title) title.textContent = _selectedGene ? `Bled Code: ${_selectedGene}` : 'Bled Code';

    const bled = bledFor(_selectedGene);
    let bledScaled = null;
    if (bled) {
        let b = 1;
        if (_observed && _observed.values.length === bled.values.length) {
            b = brightness(_observed.values, bled.values);
        }
        bledScaled = { R: bled.R, C: bled.C, values: Array.from(bled.values, v => v * b) };
    }

    // shared colour domain across both grids
    let lo = Infinity, hi = -Infinity;
    const scan = (g) => { if (g) for (const v of g.values) { if (v < lo) lo = v; if (v > hi) hi = v; } };
    scan(_observed); scan(bledScaled);
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (lo === hi) hi = lo + 1e-6;
    const interp = d3.interpolateViridis || d3.interpolateBlues;
    const scale = d3.scaleSequential(interp).domain([lo, hi]);

    if (_observed) renderHeatmap('obsHeatmap', _observed, scale);
    if (bledScaled) renderHeatmap('bledHeatmap', bledScaled, scale);
    else setHeatmapMessage('bledHeatmap', 'pick a gene');
}

function renderHeatmap(id, grid, scale) {
    const el = document.getElementById(id);
    if (!el) return;
    const { R, C, values } = grid;
    let html = '<div class="hm-grid" style="grid-template-columns: auto repeat(' + C + ', 1fr);">';
    html += '<div class="hm-corner"></div>';
    for (let c = 0; c < C; c++) html += '<div class="hm-collabel">' + (c + 1) + '</div>';
    for (let r = 0; r < R; r++) {
        html += '<div class="hm-rowlabel">' + (r + 1) + '</div>';
        for (let c = 0; c < C; c++) {
            const v = values[r * C + c];
            html += '<div class="hm-cell" style="background:' + scale(v) + ';" '
                 + 'title="R' + (r + 1) + ' C' + (c + 1) + ': ' + v.toFixed(3) + '"></div>';
        }
    }
    html += '</div>';
    el.innerHTML = html;
}

function setHeatmapMessage(id, msg) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = msg ? '<div class="hm-msg">' + escapeHtml(msg) + '</div>' : '';
}

function renderGeneList(term) {
    const listEl = document.getElementById('bledGeneList');
    if (!listEl) return;
    const t = String(term || '').toLowerCase().trim();
    const matches = (t ? _geneNames.filter(n => n.toLowerCase().startsWith(t)) : _geneNames).slice(0, 50);
    if (!matches.length) {
        listEl.innerHTML = '<div class="bled-gene-empty">no match</div>';
        listEl.classList.add('open');
        return;
    }
    listEl.innerHTML = matches.map(n =>
        '<div class="bled-gene-item' + (n === _selectedGene ? ' sel' : '') +
        '" data-gene="' + n.replace(/"/g, '&quot;') + '">' + escapeHtml(n) + '</div>'
    ).join('');
    listEl.classList.add('open');
    listEl.querySelectorAll('.bled-gene-item').forEach(it => {
        it.addEventListener('mousedown', (e) => { e.preventDefault(); selectGene(it.dataset.gene); });
    });
}

function selectGene(name) {
    _selectedGene = name;
    const search = document.getElementById('bledGeneSearch');
    if (search) search.value = name;
    closeGeneList();
    drawBoth();
}

function closeGeneList() {
    const listEl = document.getElementById('bledGeneList');
    if (listEl) listEl.classList.remove('open');
}
