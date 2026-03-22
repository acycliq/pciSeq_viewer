/**
 * Dashboard Charts Module
 * Renders η, θ, γ diagnostic charts in a dedicated dashboard page.
 */

(function () {
    'use strict';

    console.log('pciSeq Dashboard Charts Module Loading...');

    // Detect if we are in the standalone diagnostics.html page
    // With app:// protocol, 'diagnostics.html' is parsed as the hostname, not the path
    const isStandalone = window.location.hostname === 'diagnostics.html'
        || window.location.pathname.endsWith('diagnostics.html');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    let loaded = false;

    // Local color caches, populated via IPC broadcasts from the main window
    let geneColorMap = {};   // geneName → color string
    let classColorMap = {};  // classIdx or className → color string/array

    async function init() {
        console.log('Dashboard init: isStandalone =', isStandalone);
        
        if (isStandalone) {
            // Setup listeners for live color updates from main window
            if (window.electronAPI) {
                window.electronAPI.onImportGeneColors((data) => {
                    console.log('Dashboard: Received live gene color update');
                    if (Array.isArray(data)) {
                        geneColorMap = {};
                        data.forEach(s => { if (s.gene && s.color) geneColorMap[s.gene] = s.color; });
                    }
                    if (loaded) loadDashboard();
                });

                window.electronAPI.onImportClassColors((data) => {
                    console.log('Dashboard: Received live class color update');
                    if (data && typeof data === 'object') {
                        classColorMap = data;
                    }
                    if (loaded) loadDashboard();
                });
            }

            try {
                await loadDashboard();
            } catch (err) {
                console.error('Failed to load dashboard:', err);
                showMsg('dash-eta-chart', `Critical error: ${err.message}`);
            }
            
            if (loadingOverlay) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => loadingOverlay.remove(), 500);
            }
        } else {
            // Setup keyboard shortcut for the main window (to open standalone)
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                    e.preventDefault();
                    console.log('Dashboard hotkey: Opening diagnostics.html');
                    launchDashboardWindow();
                }
            });
            console.log('Dashboard hotkey registered (Ctrl+D)');
        }
    }

    function launchDashboardWindow() {
        if (window.electronAPI && window.electronAPI.openDiagnosticsWindow) {
            window.electronAPI.openDiagnosticsWindow()
                .then(res => console.log('Dashboard window opened:', res))
                .catch(err => console.error('Failed to open dashboard via IPC:', err));
        } else {
            console.error('electronAPI.openDiagnosticsWindow not available');
            // Fallback for non-electron environments if needed
            const url = `diagnostics.html`;
            const features = 'width=1400,height=900,menubar=no,toolbar=no,location=no,status=no';
            const win = window.open(url, 'pciSeqDiagnostics', features);
            if (win) win.focus();
        }
    }

    // ─── Shared helpers (only needed in standalone/chart context) ───

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
    }

    function showMsg(id, msg) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = '';
        const div = document.createElement('div');
        div.style.cssText = 'color:#888;font-size:12px;padding:20px;text-align:center;width:100%;';
        div.textContent = msg;
        el.appendChild(div);
    }

    // Tooltip is lazily created only when charts are rendered
    let tooltip = null;
    function ensureTooltip() {
        if (tooltip) return;
        const div = document.createElement('div');
        div.className = 'chart-tooltip';
        div.style.position = 'absolute';
        div.style.opacity = '0';
        document.body.appendChild(div);
        tooltip = d3.select(div);
    }

    function showTooltip(evt, html) {
        ensureTooltip();
        tooltip.html(html)
            .style('left', (evt.pageX + 15) + 'px')
            .style('top', (evt.pageY - 10) + 'px')
            .style('opacity', 1);
    }
    function moveTooltip(evt) {
        tooltip.style('left', (evt.pageX + 15) + 'px')
            .style('top', (evt.pageY - 10) + 'px');
    }
    function hideTooltip() { tooltip.style('opacity', 0); }

    // Build gene color lookup map once from glyphSettings
    let glyphColorMap = null;
    function buildGlyphColorMap() {
        if (glyphColorMap) return;
        glyphColorMap = {};
        if (typeof window.glyphSettings === 'function') {
            const settings = window.glyphSettings();
            if (Array.isArray(settings)) {
                for (const s of settings) {
                    if (s.gene && s.color) glyphColorMap[s.gene] = s.color;
                }
            }
        }
    }

    function getGeneColor(geneName) {
        if (geneColorMap[geneName]) return geneColorMap[geneName];
        buildGlyphColorMap();
        return glyphColorMap[geneName] || glyphColorMap['Generic'] || '#3b82f6';
    }

    function classColor(classIdx, classNames) {
        const cc = classColorMap;
        if (!cc || Object.keys(cc).length === 0) return '#3b82f6';

        const c = cc[classIdx] || (classNames && cc[classNames[classIdx]]);
        if (!c) return '#3b82f6';
        return typeof c === 'string' ? c : `rgb(${c[0]},${c[1]},${c[2]})`;
    }

    function gammaColor(gamma) {
        const dev = Math.abs(gamma - 1.0);
        const t = Math.min(1, dev * 1.5);
        if (gamma >= 1.0) {
            return `rgb(${Math.round(220 + 35 * t)}, ${Math.round(100 * (1 - t))}, ${Math.round(80 * (1 - t))})`;
        }
        return `rgb(${Math.round(80 * (1 - t))}, ${Math.round(100 * (1 - t))}, ${Math.round(220 + 35 * t)})`;
    }

    function createChartScaffold(containerId, margin) {
        const el = document.getElementById(containerId);
        if (!el) return null;
        el.innerHTML = '';

        const containerW = el.clientWidth || 600;
        const containerH = el.clientHeight || 300;
        const width = containerW - margin.left - margin.right;
        const height = containerH - margin.top - margin.bottom;

        const rootSvg = d3.select(el).append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${containerW} ${containerH}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');

        const clipId = `clip-${containerId}`;
        rootSvg.append('defs').append('clipPath').attr('id', clipId)
            .append('rect').attr('width', width).attr('height', height);

        const svg = rootSvg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        const clipG = svg.append('g').attr('clip-path', `url(#${clipId})`);

        return { el, svg, clipG, width, height, rootSvg };
    }

    function addZoom(svg, width, height, scaleExtent, translateExtent, onZoom) {
        const zoom = d3.zoom().scaleExtent(scaleExtent).translateExtent(translateExtent).on('zoom', onZoom);
        const zoomRect = svg.insert('rect', ':first-child')
            .attr('width', width).attr('height', height)
            .style('fill', 'transparent').style('cursor', 'grab');
        zoomRect.call(zoom);
        zoomRect.node().addEventListener('wheel', e => { e.preventDefault(); }, { passive: false });
        zoomRect.on('dblclick.zoom', () => { zoomRect.transition().duration(400).call(zoom.transform, d3.zoomIdentity); });
        return zoom;
    }

    function styleAxes(svg) {
        svg.selectAll('.domain').style('stroke', '#333');
        svg.selectAll('.tick line').style('stroke', '#222');
        svg.selectAll('.tick text').style('fill', '#888').style('font-size', '10px');
    }

    // ─── Data Loading ───

    async function loadDashboard() {
        console.log('Loading dashboard data...');
        
        if (!window.electronAPI) {
            console.error('window.electronAPI is missing. Preload script failed?');
            showMsg('dash-eta-chart', 'System Error: electronAPI missing');
            return;
        }

        if (!window.electronAPI.getDashboardData) {
            console.error('getDashboardData is missing from electronAPI');
            showMsg('dash-eta-chart', 'System Error: diagnostics API missing');
            return;
        }

        const result = await window.electronAPI.getDashboardData();
        console.log('Dashboard data received:', result);

        if (!result || !result.success) {
            showMsg('dash-eta-chart', result ? result.error : 'Failed to retrieve diagnostics data from database');
            return;
        }
        loaded = true;

        // Update Summary Stats
        const statsEl = document.getElementById('dash-summary-stats');
        if (statsEl) {
            statsEl.innerHTML = `
                <span>Genes: <b>${result.nG}</b></span>
                <span>Cells: <b>${result.cell_labels.length.toLocaleString()}</b></span>
            `;
        }

        try { renderEtaChart('dash-eta-chart', result); } catch (e) { console.error('eta chart error:', e); }
        try { renderEtaScatter('dash-eta-scatter', result); } catch (e) { console.error('eta scatter error:', e); }
        try { renderThetaBar('dash-theta-bar', result); } catch (e) { console.error('theta bar error:', e); }
        try { renderThetaScatter('dash-theta-scatter', result); } catch (e) { console.error('theta scatter error:', e); }
        try { initGammaSection('dash-gamma-class-select', 'dash-gamma-chart', result); } catch (e) { console.error('gamma section error:', e); }
    }

    // ─── Chart Renderers ───

    function renderEtaChart(containerId, data) {
        const eta = data.eta_bar;
        const genes = data.gene_names;
        const N = eta.length;
        if (N === 0) { showMsg(containerId, 'No η data'); return; }

        const margin = { top: 10, right: 10, bottom: 60, left: 50 };
        const s = createChartScaffold(containerId, margin);
        if (!s) return;

        const yMax = Math.max(1.2, d3.max(eta) || 1.2);
        const baseX = d3.scaleLinear().domain([-0.5, N - 0.5]).range([0, s.width]);
        const y = d3.scaleLinear().domain([0, yMax]).nice().range([s.height, 0]);
        let x = baseX.copy();

        s.clipG.append('line').attr('x1', 0).attr('x2', s.width)
            .attr('y1', y(1.0)).attr('y2', y(1.0)).style('stroke', '#444').style('stroke-dasharray', '4,4');

        const barsG = s.clipG.append('g');
        function updateBars() {
            const bw = Math.max(1, (x(1) - x(0)) * 0.8);
            const bars = barsG.selectAll('.bar').data(d3.range(N), d => d);
            bars.enter().append('rect').attr('class', 'bar')
                .style('cursor', 'pointer')
                .on('mouseover', (evt, d) => showTooltip(evt, `<b>${escapeHtml(genes[d])}</b><br/>η: ${eta[d].toFixed(4)}`))
                .on('mousemove', moveTooltip).on('mouseout', hideTooltip)
                .merge(bars)
                .attr('x', d => x(d) - bw / 2).attr('y', d => y(eta[d]))
                .attr('width', bw).attr('height', d => Math.max(0, s.height - y(eta[d])))
                .style('fill', d => getGeneColor(genes[d]));
            bars.exit().remove();
        }

        const xAxisG = s.svg.append('g').attr('transform', `translate(0,${s.height})`);
        const yAxisG = s.svg.append('g');

        function updateAxes() {
            const lo = Math.max(0, Math.floor(x.invert(0)));
            const hi = Math.min(N - 1, Math.ceil(x.invert(s.width)));
            const visible = hi - lo + 1;
            const step = visible <= 60 ? 1 : Math.max(1, Math.floor(visible / 15));
            const tickVals = []; for (let i = lo; i <= hi; i += step) tickVals.push(i);

            xAxisG.call(d3.axisBottom(x).tickValues(tickVals).tickFormat(i => genes[i] || ''))
                .selectAll('text').style('text-anchor', 'end').attr('dx', '-.8em').attr('dy', '.15em').attr('transform', 'rotate(-45)');
            yAxisG.call(d3.axisLeft(y).ticks(6));
            styleAxes(s.svg);
        }

        updateBars(); updateAxes();
        addZoom(s.svg, s.width, s.height, [1, N / 5], [[0, 0], [s.width, s.height]], (event) => {
            x = event.transform.rescaleX(baseX); updateBars(); updateAxes();
        });
    }

    function renderEtaScatter(containerId, data) {
        const eta = data.eta_bar, genes = data.gene_names, counts = data.gene_total_spots;
        if (!counts) { showMsg(containerId, 'No count data'); return; }

        const pts = [];
        for (let i = 0; i < eta.length; i++) {
            if (counts[i] > 0) pts.push({ gene: genes[i], eta: eta[i], observed: counts[i], expected: counts[i] / eta[i] });
        }

        const margin = { top: 20, right: 30, bottom: 40, left: 60 };
        const s = createChartScaffold(containerId, margin);
        if (!s) return;

        const maxVal = d3.max(pts, d => Math.max(d.observed, d.expected)) || 1000;
        const baseX = d3.scaleLog().domain([1, maxVal]).range([0, s.width]);
        const baseY = d3.scaleLog().domain([1, maxVal]).range([s.height, 0]);
        let x = baseX.copy(), y = baseY.copy();

        const diag = s.clipG.append('line').attr('x1', x(1)).attr('y1', y(1)).attr('x2', x(maxVal)).attr('y2', y(maxVal))
            .style('stroke', '#444').style('stroke-dasharray', '2,2');

        const dotsG = s.clipG.append('g');
        function updatePoints() {
            const dots = dotsG.selectAll('circle').data(pts);
            dots.enter().append('circle').attr('r', 4).style('opacity', 0.6)
                .on('mouseover', (evt, d) => showTooltip(evt, `<b>${escapeHtml(d.gene)}</b><br/>Obs: ${d.observed}<br/>Exp: ${Math.round(d.expected)}<br/>η: ${d.eta.toFixed(3)}`))
                .on('mousemove', moveTooltip).on('mouseout', hideTooltip)
                .merge(dots).attr('cx', d => x(Math.max(1, d.expected))).attr('cy', d => y(Math.max(1, d.observed)))
                .style('fill', d => getGeneColor(d.gene));
            dots.exit().remove();
        }

        const xAxisG = s.svg.append('g').attr('transform', `translate(0,${s.height})`);
        const yAxisG = s.svg.append('g');
        function updateAxes() {
            xAxisG.call(d3.axisBottom(x).ticks(5, d3.format('~s')));
            yAxisG.call(d3.axisLeft(y).ticks(5, d3.format('~s')));
            styleAxes(s.svg);
        }

        updatePoints(); updateAxes();
        addZoom(s.svg, s.width, s.height, [0.5, 20], [[-s.width, -s.height], [2*s.width, 2*s.height]], (event) => {
            x = event.transform.rescaleX(baseX); y = event.transform.rescaleY(baseY);
            updatePoints(); updateAxes();
            diag.attr('x1', x(1)).attr('y1', y(1)).attr('x2', x(maxVal)).attr('y2', y(maxVal));
        });
    }

    function renderThetaBar(containerId, data) {
        const { cell_labels, theta, assigned_class_idx, class_names } = data;
        const N = theta.length;
        const margin = { top: 10, right: 10, bottom: 40, left: 50 };
        const s = createChartScaffold(containerId, margin);
        if (!s) return;

        const yMax = Math.max(1.5, d3.max(theta) || 1.5);
        const baseX = d3.scaleLinear().domain([-0.5, N - 0.5]).range([0, s.width]);
        const y = d3.scaleLinear().domain([0, yMax]).nice().range([s.height, 0]);
        let x = baseX.copy();

        s.clipG.append('line').attr('x1', 0).attr('x2', s.width).attr('y1', y(1)).attr('y2', y(1))
            .style('stroke', '#444').style('stroke-dasharray', '4,4');

        const barsG = s.clipG.append('g');
        function updateBars() {
            const bw = Math.max(0.5, (x(1) - x(0)) * 0.9);
            const bars = barsG.selectAll('.bar').data(d3.range(N), d => d);
            bars.enter().append('rect').attr('class', 'bar')
                .on('mouseover', (evt, d) => showTooltip(evt, `Cell: ${cell_labels[d]}<br/>θ: ${theta[d].toFixed(3)}<br/>Class: ${class_names[assigned_class_idx[d]]}`))
                .on('mousemove', moveTooltip).on('mouseout', hideTooltip)
                .merge(bars).attr('x', d => x(d) - bw / 2).attr('y', d => y(theta[d]))
                .attr('width', bw).attr('height', d => Math.max(0, s.height - y(theta[d])))
                .style('fill', d => classColor(assigned_class_idx[d], class_names));
            bars.exit().remove();
        }

        const xAxisG = s.svg.append('g').attr('transform', `translate(0,${s.height})`);
        const yAxisG = s.svg.append('g');
        function updateAxes() {
            xAxisG.call(d3.axisBottom(x).ticks(10).tickFormat(''));
            yAxisG.call(d3.axisLeft(y).ticks(6));
            styleAxes(s.svg);
        }

        updateBars(); updateAxes();
        addZoom(s.svg, s.width, s.height, [1, N / 10], [[0,0],[s.width, s.height]], (event) => {
            x = event.transform.rescaleX(baseX); updateBars(); updateAxes();
        });
    }

    function renderThetaScatter(containerId, data) {
        const { theta, total_gene_count, assigned_class_idx, class_names } = data;
        const pts = [];
        for (let i = 0; i < theta.length; i++) {
            if (total_gene_count[i] > 0) pts.push({ theta: theta[i], obs: total_gene_count[i], exp: total_gene_count[i] / theta[i], cIdx: assigned_class_idx[i] });
        }

        const margin = { top: 20, right: 30, bottom: 40, left: 60 };
        const s = createChartScaffold(containerId, margin);
        if (!s) return;

        const maxVal = d3.max(pts, d => Math.max(d.obs, d.exp)) || 100;
        const baseX = d3.scaleLog().domain([1, maxVal]).range([0, s.width]);
        const baseY = d3.scaleLog().domain([1, maxVal]).range([s.height, 0]);
        let x = baseX.copy(), y = baseY.copy();

        const diag = s.clipG.append('line').attr('x1', x(1)).attr('y1', y(1)).attr('x2', x(maxVal)).attr('y2', y(maxVal))
            .style('stroke', '#444').style('stroke-dasharray', '2,2');

        const dotsG = s.clipG.append('g');
        function updatePoints() {
            const dots = dotsG.selectAll('circle').data(pts);
            dots.enter().append('circle').attr('r', 3).style('opacity', 0.5)
                .on('mouseover', (evt, d) => showTooltip(evt, `Obs Count: ${Math.round(d.obs)}<br/>Exp Count: ${Math.round(d.exp)}<br/>θ: ${d.theta.toFixed(2)}`))
                .on('mousemove', moveTooltip).on('mouseout', hideTooltip)
                .merge(dots).attr('cx', d => x(Math.max(1, d.exp))).attr('cy', d => y(Math.max(1, d.obs)))
                .style('fill', d => classColor(d.cIdx, class_names));
            dots.exit().remove();
        }

        const xAxisG = s.svg.append('g').attr('transform', `translate(0,${s.height})`);
        const yAxisG = s.svg.append('g');
        function updateAxes() {
            xAxisG.call(d3.axisBottom(x).ticks(5, d3.format('~s')));
            yAxisG.call(d3.axisLeft(y).ticks(5, d3.format('~s')));
            styleAxes(s.svg);
        }

        updatePoints(); updateAxes();
        addZoom(s.svg, s.width, s.height, [0.5, 20], [[-s.width, -s.height], [2*s.width, 2*s.height]], (event) => {
            x = event.transform.rescaleX(baseX); y = event.transform.rescaleY(baseY);
            updatePoints(); updateAxes();
            diag.attr('x1', x(1)).attr('y1', y(1)).attr('x2', x(maxVal)).attr('y2', y(maxVal));
        });
    }

    async function initGammaSection(selectId, chartId, data) {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '';
        data.class_names.forEach((name, i) => {
            if (name === 'Zero') return;
            const opt = document.createElement('option');
            opt.value = i; opt.textContent = name;
            select.appendChild(opt);
        });

        const load = async () => {
            showMsg(chartId, 'Loading class data...');
            const res = await window.electronAPI.getDashboardGamma(parseInt(select.value));
            if (res && res.success) renderGammaScatter(chartId, res);
            else showMsg(chartId, 'No data for this class');
        };

        select.addEventListener('change', load);
        load();
    }

    function renderGammaScatter(containerId, payload) {
        const { cell_labels, gene_names, gamma, cell_x_idx, unique_cell_labels } = payload;
        const nCells = unique_cell_labels.length;
        const margin = { top: 10, right: 10, bottom: 50, left: 50 };
        const s = createChartScaffold(containerId, margin);
        if (!s) return;

        const yMax = Math.max(2.5, d3.max(gamma) || 2.5);
        const baseX = d3.scaleLinear().domain([-0.5, nCells - 0.5]).range([0, s.width]);
        const baseY = d3.scaleLinear().domain([0, yMax]).range([s.height, 0]);
        let x = baseX.copy(), y = baseY.copy();

        const refLine = s.clipG.append('line').attr('x1', 0).attr('x2', s.width).attr('y1', y(1)).attr('y2', y(1))
            .style('stroke', '#444').style('stroke-dasharray', '4,4');

        const dotsG = s.clipG.append('g');
        function updatePoints() {
            const dots = dotsG.selectAll('circle').data(d3.range(gamma.length));
            dots.enter().append('circle').attr('r', 3.5).style('opacity', 0.7).style('cursor', 'pointer')
                .on('mouseover', (evt, i) => showTooltip(evt, `<b>${gene_names[i]}</b><br/>Cell: ${cell_labels[i]}<br/>γ: ${gamma[i].toFixed(3)}`))
                .on('mousemove', moveTooltip).on('mouseout', hideTooltip)
                .merge(dots).attr('cx', i => x(cell_x_idx[i])).attr('cy', i => y(gamma[i]))
                .style('fill', i => gammaColor(gamma[i]));
            dots.exit().remove();
        }

        const xAxisG = s.svg.append('g').attr('transform', `translate(0,${s.height})`);
        const yAxisG = s.svg.append('g');
        function updateAxes() {
            const lo = Math.max(0, Math.floor(x.invert(0))), hi = Math.min(nCells-1, Math.ceil(x.invert(s.width)));
            const step = Math.max(1, Math.floor((hi-lo+1)/15));
            const ticks = []; for(let i=lo; i<=hi; i+=step) ticks.push(i);
            xAxisG.call(d3.axisBottom(x).tickValues(ticks).tickFormat(i => unique_cell_labels[i]));
            yAxisG.call(d3.axisLeft(y).ticks(8));
            styleAxes(s.svg);
        }

        updatePoints(); updateAxes();
        addZoom(s.svg, s.width, s.height, [1, nCells/5], [[0,0],[s.width, s.height]], (event) => {
            x = event.transform.rescaleX(baseX); y = event.transform.rescaleY(baseY);
            updatePoints(); updateAxes();
            refLine.attr('y1', y(1)).attr('y2', y(1));
        });
    }

    // Run init
    init().catch(err => console.error('Unhandled init error:', err));

})();