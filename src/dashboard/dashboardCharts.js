/**
 * Dashboard Charts Module
 * Renders η, θ, γ diagnostic charts in the dashboard modal.
 * Reads data from diagnostics.db via electronAPI IPC.
 */

(function () {
    'use strict';

    const modalBg = document.getElementById('dashboardModal');
    const closeBtn = document.getElementById('dashboardClose');
    if (!modalBg) return;

    let loaded = false;

    function open() {
        modalBg.classList.add('active');
        if (!loaded) loadDashboard();
    }
    function close() { modalBg.classList.remove('active'); }

    if (closeBtn) closeBtn.addEventListener('click', close);
    modalBg.addEventListener('click', (e) => { if (e.target === modalBg) close(); });

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            modalBg.classList.contains('active') ? close() : open();
        }
        if (e.key === 'Escape') close();
    });

    // ─── Shared helpers ───

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
    }

    function showMsg(id, msg) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        const div = document.createElement('div');
        div.style.cssText = 'color:#888;font-size:12px;padding:8px;';
        div.textContent = msg;
        el.appendChild(div);
    }

    /** Single shared tooltip, reused across all charts */
    const tooltip = (function () {
        const div = document.createElement('div');
        div.className = 'chart-tooltip';
        div.style.position = 'absolute';
        div.style.opacity = '0';
        document.body.appendChild(div);
        return d3.select(div);
    })();

    function showTooltip(evt, html) {
        tooltip.html(html)
            .style('left', (evt.pageX + 10) + 'px')
            .style('top', (evt.pageY - 10) + 'px')
            .style('opacity', 1);
    }
    function moveTooltip(evt) {
        tooltip.style('left', (evt.pageX + 10) + 'px')
            .style('top', (evt.pageY - 10) + 'px');
    }
    function hideTooltip() { tooltip.style('opacity', 0); }

    /** Resolve class color from appState */
    function classColor(classIdx, classNames) {
        const cc = window.appState && window.appState.classColors;
        if (!cc) return null;
        const c = cc[classIdx] || (classNames && cc[classNames[classIdx]]);
        if (!c) return null;
        return typeof c === 'string' ? c : `rgb(${c[0]},${c[1]},${c[2]})`;
    }

    /** Gamma diverging color: blue (< 1) ← white (= 1) → red (> 1) */
    function gammaColor(gamma) {
        const dev = Math.abs(gamma - 1.0);
        const t = Math.min(1, dev);
        if (gamma >= 1.0) {
            return `rgb(${Math.round(200 + 55 * t)}, ${Math.round(120 * (1 - t))}, ${Math.round(80 * (1 - t))})`;
        }
        return `rgb(${Math.round(80 * (1 - t))}, ${Math.round(120 * (1 - t))}, ${Math.round(200 + 55 * t)})`;
    }

    /**
     * Create chart scaffolding: clears container, adds title, creates SVG with clip path.
     * Returns { svg, clipG, width, height, rootSvg } or null if container missing.
     */
    function createChartScaffold(containerId, titleText, margin) {
        const el = document.getElementById(containerId);
        if (!el) return null;
        el.innerHTML = '';

        if (titleText) {
            const title = document.createElement('div');
            title.className = 'dashboard-chart-title';
            title.textContent = titleText;
            el.appendChild(title);
        }

        const containerW = el.clientWidth || 500;
        const containerH = (el.clientHeight || 220) - 18;
        const width = containerW - margin.left - margin.right;
        const height = containerH - margin.top - margin.bottom;

        const rootSvg = d3.select(el).append('svg').attr('width', containerW).attr('height', containerH);
        const clipId = `clip-${containerId}`;
        rootSvg.append('defs').append('clipPath').attr('id', clipId)
            .append('rect').attr('width', width).attr('height', height);
        const svg = rootSvg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        const clipG = svg.append('g').attr('clip-path', `url(#${clipId})`);

        return { el, svg, clipG, width, height, rootSvg };
    }

    /** Add zoom rect with scroll-bleed prevention and double-click reset */
    function addZoom(svg, width, height, scaleExtent, translateExtent, onZoom) {
        const zoom = d3.zoom().scaleExtent(scaleExtent).translateExtent(translateExtent).on('zoom', onZoom);
        const zoomRect = svg.insert('rect', ':first-child')
            .attr('width', width).attr('height', height)
            .style('fill', 'transparent').style('cursor', 'grab');
        zoomRect.call(zoom);
        zoomRect.node().addEventListener('wheel', e => { e.preventDefault(); }, { passive: false });
        zoomRect.on('dblclick.zoom', () => { zoomRect.transition().duration(300).call(zoom.transform, d3.zoomIdentity); });
        return zoom;
    }

    /** Style axes in dark theme */
    function styleAxes(svg) {
        svg.selectAll('.domain, .tick line').style('stroke', '#555');
    }

    const AXIS_TEXT_STYLE = { fill: '#e5e5e5', 'font-size': '9px' };
    function applyAxisTextStyle(selection) {
        selection.selectAll('text').style('fill', AXIS_TEXT_STYLE.fill).style('font-size', AXIS_TEXT_STYLE['font-size']);
    }

    // ─── Dashboard loading ───

    async function loadDashboard() {
        if (!window.electronAPI || !window.electronAPI.getDashboardData) {
            showMsg('dash-eta-chart', 'Diagnostics not available');
            return;
        }
        const result = await window.electronAPI.getDashboardData();
        if (!result || !result.success) {
            showMsg('dash-eta-chart', result ? result.error : 'No data');
            return;
        }
        loaded = true;

        try { renderEtaChart('dash-eta-chart', result); } catch (e) { console.warn('eta chart', e); }
        try { renderEtaScatter('dash-eta-scatter', result); } catch (e) { console.warn('eta scatter', e); }
        try { renderThetaBar('dash-theta-bar', result); } catch (e) { console.warn('theta bar', e); }
        try { renderThetaScatter('dash-theta-scatter', result); } catch (e) { console.warn('theta scatter', e); }
        try { initGammaSection('dash-gamma-scatter', result); } catch (e) { console.warn('gamma init', e); }
    }

    // ─── η bar chart ───
    function renderEtaChart(containerId, data) {
        const eta = data.eta_bar;
        const genes = data.gene_names;
        const N = eta.length;
        if (N === 0) { showMsg(containerId, 'No eta data'); return; }

        const margin = { top: 4, right: 8, bottom: 50, left: 45 };
        const s = createChartScaffold(containerId, 'η per gene', margin);
        if (!s) return;

        const yMax = Math.max(1.0, d3.max(eta) || 1.0);
        const baseX = d3.scaleLinear().domain([-0.5, N - 0.5]).range([0, s.width]);
        const y = d3.scaleLinear().domain([0, yMax]).nice().range([s.height, 0]);
        let x = baseX.copy();

        s.clipG.append('line').attr('x1', 0).attr('x2', s.width)
            .attr('y1', y(1.0)).attr('y2', y(1.0)).style('stroke', '#555').style('stroke-dasharray', '4,4');
        const barsG = s.clipG.append('g');

        function barWidth() { return Math.max(1, (x(1) - x(0)) * 0.85); }

        function updateBars() {
            const bw = barWidth();
            const bars = barsG.selectAll('.bar').data(d3.range(N), d => d);
            bars.enter().append('rect').attr('class', 'bar')
                .on('mouseover', (evt, d) => showTooltip(evt, `${escapeHtml(genes[d])}: ${eta[d] != null ? eta[d].toFixed(3) : '-'}`))
                .on('mousemove', moveTooltip).on('mouseout', hideTooltip)
                .merge(bars)
                .attr('x', d => x(d) - bw / 2).attr('y', d => y(eta[d]))
                .attr('width', bw).attr('height', d => Math.max(0, s.height - y(eta[d])))
                .style('fill', d => eta[d] >= 1.0 ? '#ef4444' : '#3b82f6');
            bars.exit().remove();
        }
        updateBars();

        const xAxisG = s.svg.append('g').attr('transform', `translate(0,${s.height})`);
        const yAxisG = s.svg.append('g');

        function updateAxes() {
            const lo = Math.max(0, Math.floor(x.invert(0)));
            const hi = Math.min(N - 1, Math.ceil(x.invert(s.width)));
            const visible = hi - lo + 1;
            const step = visible <= 50 ? 1 : Math.max(1, Math.floor(visible / 10));
            const tickVals = []; for (let i = lo; i <= hi; i += step) tickVals.push(i);
            applyAxisTextStyle(xAxisG.call(d3.axisBottom(x).tickValues(tickVals).tickFormat(i => genes[i] || '')))
                .attr('transform', 'rotate(-45)').style('text-anchor', 'end');
            applyAxisTextStyle(yAxisG.call(d3.axisLeft(y).ticks(5)));
            styleAxes(s.svg);
        }
        updateAxes();

        addZoom(s.svg, s.width, s.height, [1, N / 3], [[-s.width / 2, 0], [s.width + s.width / 2, s.height]],
            (event) => { x = event.transform.rescaleX(baseX); updateBars(); updateAxes(); });
    }

    // ─── η scatter (observed vs expected) ───
    function renderEtaScatter(containerId, data) {
        const eta = data.eta_bar;
        const genes = data.gene_names;
        const counts = data.gene_total_spots;
        if (!counts || counts.length === 0) { showMsg(containerId, 'No spot count data'); return; }

        const pts = [];
        for (let i = 0; i < eta.length; i++) {
            const obs = counts[i] || 0;
            if (obs > 0 && isFinite(eta[i]) && eta[i] > 0) pts.push({ gene: genes[i], eta: eta[i], observed: obs, expected: obs / eta[i] });
        }
        if (pts.length === 0) { showMsg(containerId, 'No data'); return; }

        const margin = { top: 4, right: 8, bottom: 50, left: 45 };
        const s = createChartScaffold(containerId, 'Observed vs Expected (per gene)', margin);
        if (!s) return;

        const baseX = d3.scaleLinear().domain([0, d3.max(pts, d => d.expected)]).nice().range([0, s.width]);
        const baseY = d3.scaleLinear().domain([0, d3.max(pts, d => d.observed)]).nice().range([s.height, 0]);
        let x = baseX.copy(), y = baseY.copy();

        const diagLine = s.clipG.append('line').style('stroke', '#888').style('stroke-dasharray', '4,4');
        function updateDiag() {
            const lo = Math.max(x.domain()[0], y.domain()[0]);
            const hi = Math.min(x.domain()[1], y.domain()[1]);
            diagLine.attr('x1', x(lo)).attr('x2', x(hi)).attr('y1', y(lo)).attr('y2', y(hi));
        }
        updateDiag();

        const pointsG = s.clipG.append('g');
        function updatePoints() {
            const circles = pointsG.selectAll('circle').data(pts);
            circles.enter().append('circle').attr('r', 3).style('fill', '#60a5fa').style('opacity', 0.85)
                .on('mouseover', (evt, d) => showTooltip(evt, `${escapeHtml(d.gene)}<br/>η: ${d.eta.toFixed(3)}<br/>obs: ${Math.round(d.observed).toLocaleString()}<br/>exp: ${Math.round(d.expected).toLocaleString()}`))
                .on('mousemove', moveTooltip).on('mouseout', hideTooltip)
                .merge(circles).attr('cx', d => x(d.expected)).attr('cy', d => y(d.observed));
            circles.exit().remove();
        }
        updatePoints();

        const xAxisG = s.svg.append('g').attr('transform', `translate(0,${s.height})`);
        const yAxisG = s.svg.append('g');
        function updateAxes() {
            applyAxisTextStyle(xAxisG.call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('~s'))));
            applyAxisTextStyle(yAxisG.call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('~s'))));
            styleAxes(s.svg);
        }
        updateAxes();

        const padX = s.width / 2, padY = s.height / 2;
        addZoom(s.svg, s.width, s.height, [1, 50], [[-padX, -padY], [s.width + padX, s.height + padY]],
            (event) => { x = event.transform.rescaleX(baseX); y = event.transform.rescaleY(baseY); updateAxes(); updatePoints(); updateDiag(); });
    }

    // ─── θ per cell bar chart ───
    function renderThetaBar(containerId, data) {
        const { cell_labels, theta, assigned_class_idx, class_names } = data;
        const N = cell_labels.length;
        if (N === 0) { showMsg(containerId, 'No theta data'); return; }

        const margin = { top: 4, right: 8, bottom: 24, left: 45 };
        const s = createChartScaffold(containerId, 'θ per cell', margin);
        if (!s) return;

        const yMax = Math.max(1.0, d3.max(theta) || 1.0);
        const baseX = d3.scaleLinear().domain([-0.5, N - 0.5]).range([0, s.width]);
        const y = d3.scaleLinear().domain([0, yMax]).nice().range([s.height, 0]);
        let x = baseX.copy();

        s.clipG.append('line').attr('x1', 0).attr('x2', s.width)
            .attr('y1', y(1.0)).attr('y2', y(1.0)).style('stroke', '#555').style('stroke-dasharray', '4,4');
        const barsG = s.clipG.append('g');

        function barWidth() { return Math.max(1, (x(1) - x(0)) * 0.85); }

        function updateBars() {
            const bw = barWidth();
            const bars = barsG.selectAll('.bar').data(d3.range(N), d => d);
            bars.enter().append('rect').attr('class', 'bar')
                .on('mouseover', (evt, d) => showTooltip(evt, `Cell: ${escapeHtml(cell_labels[d])}<br/>θ: ${theta[d].toFixed(3)}<br/>Class: ${escapeHtml(class_names[assigned_class_idx[d]] || '')}`))
                .on('mousemove', moveTooltip).on('mouseout', hideTooltip)
                .merge(bars)
                .attr('x', d => x(d) - bw / 2).attr('y', d => y(theta[d]))
                .attr('width', bw).attr('height', d => Math.max(0, s.height - y(theta[d])))
                .style('fill', d => classColor(assigned_class_idx[d], class_names) || '#60a5fa');
            bars.exit().remove();
        }
        updateBars();

        const xAxisG = s.svg.append('g').attr('transform', `translate(0,${s.height})`);
        const yAxisG = s.svg.append('g');
        function updateAxes() {
            const lo = Math.max(0, Math.floor(x.invert(0)));
            const hi = Math.min(N - 1, Math.ceil(x.invert(s.width)));
            const visible = hi - lo + 1;
            const step = visible <= 30 ? 1 : Math.max(1, Math.floor(visible / 10));
            const tickVals = []; for (let i = lo; i <= hi; i += step) tickVals.push(i);
            applyAxisTextStyle(xAxisG.call(d3.axisBottom(x).tickValues(tickVals).tickFormat(i => cell_labels[i] != null ? escapeHtml(cell_labels[i]) : '')))
                .attr('transform', visible <= 30 ? 'rotate(-45)' : '').style('text-anchor', visible <= 30 ? 'end' : 'middle');
            applyAxisTextStyle(yAxisG.call(d3.axisLeft(y).ticks(5)));
            styleAxes(s.svg);
        }
        updateAxes();

        addZoom(s.svg, s.width, s.height, [1, N / 3], [[-s.width / 2, 0], [s.width + s.width / 2, s.height]],
            (event) => { x = event.transform.rescaleX(baseX); updateBars(); updateAxes(); });
    }

    // ─── θ scatter (observed vs expected) ───
    function renderThetaScatter(containerId, data) {
        const { cell_labels, theta, total_gene_count, assigned_class_idx, class_names } = data;
        const N = cell_labels.length;
        if (N === 0) { showMsg(containerId, 'No theta data'); return; }

        const pts = [];
        for (let i = 0; i < N; i++) {
            const t = theta[i], obs = total_gene_count[i];
            if (isFinite(t) && t > 0 && isFinite(obs) && obs > 0)
                pts.push({ cell_label: cell_labels[i], theta: t, observed: obs, expected: obs / t, classIdx: assigned_class_idx[i] });
        }
        if (pts.length === 0) { showMsg(containerId, 'No valid data'); return; }

        const margin = { top: 4, right: 8, bottom: 24, left: 45 };
        const s = createChartScaffold(containerId, 'Observed vs Expected gene count (per cell)', margin);
        if (!s) return;

        const baseX = d3.scaleLinear().domain([0, d3.max(pts, d => d.expected)]).nice().range([0, s.width]);
        const baseY = d3.scaleLinear().domain([0, d3.max(pts, d => d.observed)]).nice().range([s.height, 0]);
        let x = baseX.copy(), y = baseY.copy();

        const diagLine = s.clipG.append('line').style('stroke', '#888').style('stroke-dasharray', '4,4');
        function updateDiag() {
            const lo = Math.max(x.domain()[0], y.domain()[0]);
            const hi = Math.min(x.domain()[1], y.domain()[1]);
            diagLine.attr('x1', x(lo)).attr('x2', x(hi)).attr('y1', y(lo)).attr('y2', y(hi));
        }
        updateDiag();

        const pointsG = s.clipG.append('g');
        function updatePoints() {
            const circles = pointsG.selectAll('circle').data(pts);
            circles.enter().append('circle').attr('r', 2.5).style('opacity', 0.85)
                .on('mouseover', (evt, d) => showTooltip(evt, `Cell: ${escapeHtml(d.cell_label)}<br/>θ: ${d.theta.toFixed(2)}<br/>obs: ${Math.round(d.observed).toLocaleString()}<br/>exp: ${Math.round(d.expected).toLocaleString()}`))
                .on('mousemove', moveTooltip).on('mouseout', hideTooltip)
                .merge(circles).attr('cx', d => x(d.expected)).attr('cy', d => y(d.observed))
                .style('fill', d => classColor(d.classIdx, class_names) || '#93c5fd');
            circles.exit().remove();
        }
        updatePoints();

        const xAxisG = s.svg.append('g').attr('transform', `translate(0,${s.height})`);
        const yAxisG = s.svg.append('g');
        function updateAxes() {
            applyAxisTextStyle(xAxisG.call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('~s'))));
            applyAxisTextStyle(yAxisG.call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('~s'))));
            styleAxes(s.svg);
        }
        updateAxes();

        const padX = s.width / 2, padY = s.height / 2;
        addZoom(s.svg, s.width, s.height, [1, 50], [[-padX, -padY], [s.width + padX, s.height + padY]],
            (event) => { x = event.transform.rescaleX(baseX); y = event.transform.rescaleY(baseY); updateAxes(); updatePoints(); updateDiag(); });
    }

    // ─── γ scatter with class dropdown ───
    function initGammaSection(containerId, data) {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '';

        const classNames = data.class_names;
        if (!classNames || classNames.length === 0) { showMsg(containerId, 'No class data'); return; }

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; align-items:center; gap:8px; margin:4px 0 2px 4px;';

        const title = document.createElement('span');
        title.className = 'dashboard-chart-title';
        title.textContent = 'γ per cell';

        const select = document.createElement('select');
        select.id = 'dash-gamma-class-select';
        select.style.cssText = 'font-size:10px; padding:2px 6px; background:#2a2a2a; color:#e5e5e5; border:1px solid #555; border-radius:3px;';

        classNames.forEach((name, idx) => {
            if (name === 'Zero') return;
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = name;
            select.appendChild(opt);
        });

        header.appendChild(title);
        header.appendChild(select);
        el.appendChild(header);

        const chartDiv = document.createElement('div');
        chartDiv.id = 'dash-gamma-chart';
        chartDiv.style.cssText = 'width:100%; height:calc(100% - 22px);';
        el.appendChild(chartDiv);

        select.addEventListener('change', () => { loadGamma(parseInt(select.value, 10)); });
        if (select.options.length > 0) loadGamma(parseInt(select.options[0].value, 10));
    }

    async function loadGamma(classIdx) {
        if (!window.electronAPI || !window.electronAPI.getDashboardGamma) return;
        showMsg('dash-gamma-chart', 'Loading...');

        const result = await window.electronAPI.getDashboardGamma(classIdx);
        if (!result || !result.success) {
            showMsg('dash-gamma-chart', result ? result.error : 'Failed');
            return;
        }
        renderGammaScatter(result);
    }

    function renderGammaScatter(payload) {
        const { cell_labels: ptLabels, gene_names: ptGenes, gamma: ptGamma, cell_x_idx: ptXIdx, unique_cell_labels: uniqueLabels } = payload;
        const nPoints = ptGamma.length;
        const nCells = uniqueLabels.length;
        if (nCells === 0 || nPoints === 0) { showMsg('dash-gamma-chart', 'No cells assigned to this class'); return; }

        const data = [];
        for (let i = 0; i < nPoints; i++) {
            data.push({ cellIdx: ptXIdx[i], cell_label: ptLabels[i], gene: ptGenes[i], gamma: ptGamma[i] });
        }

        const margin = { top: 4, right: 8, bottom: 24, left: 45 };
        const s = createChartScaffold('dash-gamma-chart', '', margin);
        if (!s) return;

        const yMax = Math.max(2.0, d3.max(data, d => d.gamma) || 2.0);
        const baseX = d3.scaleLinear().domain([-0.5, nCells - 0.5]).range([0, s.width]);
        const baseY = d3.scaleLinear().domain([0, yMax]).nice().range([s.height, 0]);
        let x = baseX.copy(), y = baseY.copy();

        const refLine = s.clipG.append('line').attr('x1', 0).attr('x2', s.width)
            .attr('y1', baseY(1.0)).attr('y2', baseY(1.0)).style('stroke', '#555').style('stroke-dasharray', '4,4');

        const pointsG = s.clipG.append('g');
        function updatePoints() {
            const circles = pointsG.selectAll('circle').data(data);
            circles.enter().append('circle').attr('r', 2.5).style('opacity', 0.7).style('cursor', 'pointer')
                .on('mouseover', (evt, d) => showTooltip(evt, `Gene: ${escapeHtml(d.gene)}<br/>Cell: ${escapeHtml(d.cell_label)}<br/>γ: ${d.gamma.toFixed(3)}`))
                .on('mousemove', moveTooltip).on('mouseout', hideTooltip)
                .merge(circles).attr('cx', d => x(d.cellIdx)).attr('cy', d => y(d.gamma))
                .style('fill', d => gammaColor(d.gamma));
            circles.exit().remove();
        }
        updatePoints();

        const xAxisG = s.svg.append('g').attr('transform', `translate(0,${s.height})`);
        const yAxisG = s.svg.append('g');
        function updateAxes() {
            const lo = Math.max(0, Math.floor(x.invert(0)));
            const hi = Math.min(nCells - 1, Math.ceil(x.invert(s.width)));
            const visible = hi - lo + 1;
            const step = visible <= 20 ? 1 : Math.max(1, Math.floor(visible / 10));
            const tickVals = []; for (let i = lo; i <= hi; i += step) tickVals.push(i);
            applyAxisTextStyle(xAxisG.call(d3.axisBottom(x).tickValues(tickVals).tickFormat(i => (i >= 0 && i < nCells) ? escapeHtml(uniqueLabels[i]) : '')))
                .attr('transform', visible <= 20 ? 'rotate(-45)' : '').style('text-anchor', visible <= 20 ? 'end' : 'middle');
            applyAxisTextStyle(yAxisG.call(d3.axisLeft(y).ticks(5)));
            styleAxes(s.svg);
        }
        updateAxes();

        const padX = s.width / 2, padY = s.height / 2;
        addZoom(s.svg, s.width, s.height, [1, Math.max(3, nCells / 3)], [[-padX, -padY], [s.width + padX, s.height + padY]],
            (event) => { x = event.transform.rescaleX(baseX); y = event.transform.rescaleY(baseY); updatePoints(); updateAxes(); refLine.attr('y1', y(1.0)).attr('y2', y(1.0)); });
    }

})();