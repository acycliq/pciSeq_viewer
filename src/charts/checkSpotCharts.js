/**
 * Check Spot Charts Module
 * Handles D3.js rendering and table generation for the Spot Inspector
 */

export function renderTable(container, data) {
  if (!container) return;
  
  const labels = data.neighborLabels;
  const nCells = labels.length - 1;
  const mvn = data.mvn.slice(0, nCells);
  const attn = data.attention.slice(0, nCells);
  const expr = data.exprFluct.slice(0, nCells);
  const cellIneff = data.cellInefficiency ? data.cellInefficiency.slice(0, nCells) : null;
  const misread = data.misread;

  const tableStyle = 'border-collapse: collapse; width: auto; min-width: 500px; font-family: inherit; font-size: 11px; margin-top: 10px; border: 1px solid rgba(255,255,255,0.05);';
  const thStyle = 'background: rgba(0,0,0,0.2); color: #94a3b8; padding: 10px 15px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.1); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;';
  const tdStyle = 'padding: 8px 15px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.05); font-family: "SF Mono", "Monaco", "Inconsolata", monospace;';
  const nameTdStyle = 'padding: 8px 15px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); font-weight: 600; font-family: inherit;';

  let html = `
    <table style="${tableStyle}">
      <thead>
        <tr>
          <th style="${thStyle} text-align:left">Name</th>
          <th style="${thStyle}">mvn_loglik</th>
          <th style="${thStyle}">attention</th>
          <th style="${thStyle}">expr_fluct</th>
          <th style="${thStyle}">cell_inefficiency</th>
          <th style="${thStyle}">sum</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (let i = 0; i < nCells; i++) {
    const sum = mvn[i] + attn[i] + expr[i] + (cellIneff ? cellIneff[i] : 0);
    html += `
      <tr class="check-spot-row-hover">
        <td style="${nameTdStyle}">${labels[i]}</td>
        <td style="${tdStyle}">${mvn[i].toFixed(3)}</td>
        <td style="${tdStyle}">${attn[i].toFixed(3)}</td>
        <td style="${tdStyle}">${expr[i].toFixed(3)}</td>
        <td style="${tdStyle}">${cellIneff ? cellIneff[i].toFixed(3) : 'Null'}</td>
        <td style="${tdStyle} font-weight:bold; color:#fff">${sum.toFixed(3)}</td>
      </tr>
    `;
  }

  html += `
      <tr class="check-spot-row-hover">
        <td style="${nameTdStyle}">misread</td>
        <td style="${tdStyle} color:#4b5563">Null</td>
        <td style="${tdStyle} color:#4b5563">Null</td>
        <td style="${tdStyle} color:#4b5563">Null</td>
        <td style="${tdStyle} color:#4b5563">Null</td>
        <td style="${tdStyle} font-weight:bold; color:#fff">${misread.toFixed(3)}</td>
      </tr>
    </tbody>
    </table>
  `;

  container.innerHTML = html;

  if (!document.getElementById('check-spot-table-css')) {
    const style = document.createElement('style');
    style.id = 'check-spot-table-css';
    style.textContent = '.check-spot-row-hover:hover { background: rgba(255,255,255,0.05); }';
    document.head.appendChild(style);
  }
}

export function renderScores(container, data) {
  const d3 = window.d3;
  if (!d3) { container.innerHTML = '<div style="padding:20px;text-align:center;color:#db5c5c;">D3.js not loaded</div>'; return; }
  container.innerHTML = '';
  
  const labels = data.neighborLabels;
  const nCells = labels.length - 1;
  const mvn = data.mvn.slice(0, nCells);
  const attn = data.attention.slice(0, nCells);
  const expr = data.exprFluct.slice(0, nCells);
  const cellIneff = data.cellInefficiency ? data.cellInefficiency.slice(0, nCells) : null;
  const misread = data.misread;

  const containerWidth = container.clientWidth || 400;
  const margin = { top: 60, right: 20, bottom: 160, left: 50 };
  const width = containerWidth;
  const height = 450;
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('font-family', '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
      .style('text-rendering', 'geometricPrecision');

  svg.append('text')
      .attr('x', margin.left)
      .attr('y', 25)
      .style('font-size', '14px')
      .style('font-weight', '600')
      .style('fill', '#e5e7eb')
      .text(`Spot ${data.spotId} ${data.geneName}`);

  svg.append('text')
      .attr('x', margin.left)
      .attr('y', 42)
      .style('font-size', '13px')
      .style('fill', '#9ca3af')
      .text('Score Decomposition (Higher is better)');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(labels).range([0, w]).padding(0.3);
  const stackedSums = mvn.map((v, i) => v + attn[i] + expr[i] + (cellIneff ? cellIneff[i] : 0));
  const allValues = [...mvn, ...attn, ...expr, ...(cellIneff || []), misread, ...stackedSums];
  const yMin = d3.min(allValues);
  const yMax = d3.max(allValues);
  const y = d3.scaleLinear().domain([Math.min(0, yMin * 1.1), Math.max(0, yMax * 1.1)]).range([h, 0]);

  g.append('g').attr('class', 'grid').call(d3.axisLeft(y).tickSize(-w).tickFormat('')).call(g => g.select('.domain').remove()).call(g => g.selectAll('.tick line').attr('stroke', '#374151').attr('stroke-dasharray', '2,2'));
  g.append('g').call(d3.axisLeft(y).ticks(5)).call(g => g.select('.domain').remove()).selectAll('text').style('fill', '#9ca3af').style('font-size', '11px');

  g.append('text').attr('transform', 'rotate(-90)').attr('y', -35).attr('x', -h / 2).attr('text-anchor', 'middle').style('fill', '#9ca3af').style('font-size', '12px').text('Log-Likelihood');
  g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x)).call(g => g.select('.domain').attr('stroke', '#4b5563')).selectAll('text').attr('transform', 'rotate(-45)').style('text-anchor', 'end').attr('dx', '-0.5em').attr('dy', '0.5em').style('fill', '#d1d5db').style('font-size', '12px');

  const colors = { mvn: '#1f77b4', attn: '#ff7f0e', expr: '#2ca02c', cellIneff: '#9467bd', misread: '#db5c5c' };

  const drawSegment = (dataArray, bottomArray, colorClass, colorHex) => {
      const labelsMap = { mvn: 'MVN LogLik', attn: 'Attention', expr: 'Expr Fluctuation', cellIneff: 'Cell Inefficiency' };
      g.selectAll(`.bar-${colorClass}`)
          .data(dataArray)
          .enter().append('rect')
          .attr('x', (d, i) => x(labels[i]))
          .attr('width', x.bandwidth())
          .attr('y', (d, i) => Math.min(y(bottomArray[i]), y(bottomArray[i] + d)))
          .attr('height', (d, i) => Math.abs(y(bottomArray[i]) - y(bottomArray[i] + d)))
          .attr('fill', colorHex)
          .attr('stroke', '#fff').attr('stroke-width', 0.5).attr('stroke-opacity', 0.2)
          .on('mouseover', (e, d) => showTooltip(e, `<strong>${labelsMap[colorClass] || colorClass}</strong><br>${d.toFixed(3)}`))
          .on('mousemove', moveTooltip)
          .on('mouseout', hideTooltip);
  };

  const zeros = new Array(nCells).fill(0);
  drawSegment(mvn, zeros, 'mvn', colors.mvn);
  drawSegment(attn, mvn, 'attn', colors.attn);
  const mvnPlusAttn = mvn.map((v, i) => v + attn[i]);
  drawSegment(expr, mvnPlusAttn, 'expr', colors.expr);
  if (cellIneff) {
    const mvnPlusAttnPlusExpr = mvn.map((v, i) => v + attn[i] + expr[i]);
    drawSegment(cellIneff, mvnPlusAttnPlusExpr, 'cellIneff', colors.cellIneff);
  }

  const misreadX = x(labels[nCells]);
  if (misreadX !== undefined) {
      g.append('rect')
          .attr('x', misreadX).attr('width', x.bandwidth())
          .attr('y', Math.min(y(0), y(misread)))
          .attr('height', Math.abs(y(misread) - y(0)))
          .attr('fill', colors.misread)
          .attr('stroke', '#fff').attr('stroke-width', 0.5).attr('stroke-opacity', 0.2)
          .on('mouseover', (e) => showTooltip(e, `<strong>Misread Density</strong><br>${misread.toFixed(3)}`))
          .on('mousemove', moveTooltip)
          .on('mouseout', hideTooltip);
  }

  const legend = svg.append('g').attr('transform', `translate(${margin.left}, ${h + margin.top + 70})`);
  const legendItems = [
      { label: 'MVN (Spatial)', color: colors.mvn },
      { label: 'Attention', color: colors.attn },
      { label: 'Expr. Fluctuation', color: colors.expr },
      { label: cellIneff ? 'Cell Inefficiency' : 'Cell Inefficiency (N/A)', color: colors.cellIneff },
      { label: 'Misread Density', color: colors.misread }
  ];

  legendItems.forEach((item, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const lg = legend.append('g').attr('transform', `translate(${col * 140}, ${row * 20})`);
      lg.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', item.color);
      lg.append('text').attr('x', 16).attr('y', 9).text(item.label).style('font-size', '12px').style('fill', '#d1d5db');
  });
}

function showTooltip(e, html) {
    const tt = document.getElementById('checkSpotTooltip');
    if (!tt) return;
    tt.innerHTML = html;
    tt.style.display = 'block';
    moveTooltip(e);
}

function moveTooltip(e) {
    const tt = document.getElementById('checkSpotTooltip');
    if (!tt) return;
    const panel = document.getElementById('checkSpotPanel');
    const rect = panel.getBoundingClientRect();
    tt.style.left = (e.clientX - rect.left) + 'px';
    tt.style.top = (e.clientY - rect.top) + 'px';
}

function hideTooltip() {
    const tt = document.getElementById('checkSpotTooltip');
    if (tt) tt.style.display = 'none';
}

export function renderProbs(container, data) {
  const d3 = window.d3;
  if (!d3) { container.innerHTML = '<div style="padding:20px;text-align:center;color:#db5c5c;">D3.js not loaded</div>'; return; }
  container.innerHTML = '';
  
  const labels = data.neighborLabels;
  const probs = data.probabilities;
  const containerWidth = container.clientWidth || 400;
  const margin = { top: 60, right: 20, bottom: 80, left: 50 };
  const width = containerWidth;
  const height = 300;
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('font-family', '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
      .style('text-rendering', 'geometricPrecision');

  svg.append('text').attr('x', margin.left).attr('y', 35).style('font-size', '14px').style('font-weight', '600').style('fill', '#e5e7eb').text('Assignment Probabilities');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(labels).range([0, w]).padding(0.4);
  const y = d3.scaleLinear().domain([0, 1.05]).range([h, 0]);

  g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat('')).call(g => g.select('.domain').remove()).call(g => g.selectAll('.tick line').attr('stroke', '#374151').attr('stroke-dasharray', '2,2'));
  g.append('g').call(d3.axisLeft(y).ticks(5)).call(g => g.select('.domain').remove()).call(g => g.selectAll('.tick line').attr('stroke', '#4b5563')).selectAll('text').style('fill', '#9ca3af').style('font-size', '11px');
  g.append('text').attr('transform', 'rotate(-90)').attr('y', -35).attr('x', -h / 2).attr('text-anchor', 'middle').style('fill', '#9ca3af').style('font-size', '12px').text('Probability');
  g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x)).call(g => g.select('.domain').attr('stroke', '#4b5563')).selectAll('text').attr('transform', 'rotate(-45)').style('text-anchor', 'end').attr('dx', '-0.5em').attr('dy', '0.5em').style('fill', '#d1d5db').style('font-size', '12px');

  const chartData = probs.map((p, i) => ({ prob: p, label: labels[i], isMisread: i === labels.length - 1 }));
  g.selectAll('.bar-prob').data(chartData).enter().append('rect').attr('x', d => x(d.label)).attr('width', x.bandwidth()).attr('y', d => y(d.prob)).attr('height', d => h - y(d.prob)).attr('fill', d => d.isMisread ? '#db5c5c' : '#1f77b4').attr('opacity', 0.9).on('mouseover', (e, d) => showTooltip(e, `<strong>${d.label}</strong><br>Probability: ${(d.prob * 100).toFixed(1)}%`)).on('mousemove', moveTooltip).on('mouseout', hideTooltip);

  const maxProb = Math.max(...probs);
  const maxIndex = probs.indexOf(maxProb);
  if (maxProb > 0.5) {
      const targetX = x(labels[maxIndex]) + x.bandwidth() / 2;
      const targetY = y(maxProb);
      g.append('text').attr('x', targetX).attr('y', targetY - 20).attr('text-anchor', 'middle').style('fill', '#4b5563').style('font-size', '11px').text('Most probable');
      g.append('path').attr('d', `M ${targetX} ${targetY - 18} L ${targetX} ${targetY - 5}`).attr('stroke', '#4b5563').attr('stroke-width', 1).attr('marker-end', 'url(#arrowhead)');
  }

  if (svg.select('#arrowhead').empty()) {
      svg.append('defs').append('marker').attr('id', 'arrowhead').attr('viewBox', '0 0 10 10').attr('refX', 5).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto').append('path').attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#4b5563');
  }
}
