/**
 * check_spot Bridge Module
 * Reads spot diagnostics via Electron IPC and renders charts.
 */

import { state } from './state/stateManager.js';

export async function setupCheckSpotBridge() {
  const closeBtn = document.getElementById('checkSpotClose');
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal());

  if (window.electronAPI?.onCheckSpotState) {
    window.electronAPI.onCheckSpotState((st) => {
      state.checkSpotConnected = !!st.enabled;
    });
  }

  if (window.electronAPI?.getCheckSpotState) {
    try {
      const st = await window.electronAPI.getCheckSpotState();
      state.checkSpotConnected = !!st.enabled;
    } catch {}
  }
}

export function openCheckSpotModal(spotId) {
  const panel = document.getElementById('checkSpotPanel');
  if (!panel) return;
  panel.dataset.spotId = String(spotId);
  document.getElementById('checkSpotInfo').textContent = '';
  document.getElementById('checkSpotScores').innerHTML = '';
  document.getElementById('checkSpotProbs').innerHTML = '';
  document.getElementById('checkSpotTable').innerHTML = '';
  document.getElementById('checkSpotLoading').style.display = 'block';
  
  // Slide in
  panel.classList.remove('collapsed');
  
  queryAndRender(Number(spotId));
}

function closeModal() {
  const panel = document.getElementById('checkSpotPanel');
  if (panel) panel.classList.add('collapsed');
}

async function queryAndRender(spotId) {
  try {
    const res = await window.electronAPI.checkSpotQuery(spotId);
    const loading = document.getElementById('checkSpotLoading');
    if (loading) loading.style.display = 'none';
    if (!res.success) {
      showNotification('check_spot error: ' + (res.error || 'failed'), 'error');
      return;
    }
    const title = document.getElementById('checkSpotTitle');
    if (title) title.textContent = `check_spot - Spot ${res.spotId}`;
    const info = document.getElementById('checkSpotInfo');
    if (info) {
      info.textContent = `Gene ${res.geneName} at (x=${res.x}, y=${res.y}, z=${res.z})`;
    }
    renderScores(document.getElementById('checkSpotScores'), res);
    renderProbs(document.getElementById('checkSpotProbs'), res);
    renderTable(document.getElementById('checkSpotTable'), res);
  } catch (e) {
    const loading = document.getElementById('checkSpotLoading');
    if (loading) loading.style.display = 'none';
    showNotification('check_spot error: ' + e.message, 'error');
  }
}

function renderTable(container, data) {
  if (!container) return;
  
  const labels = data.neighborLabels;
  const nCells = labels.length - 1;
  const mvn = data.mvn.slice(0, nCells);
  const attn = data.attention.slice(0, nCells);
  const expr = data.exprFluct.slice(0, nCells);
  const misread = data.misread;

  // Inline styles for a "pretty" table that doesn't stretch
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
          <th style="${thStyle}">sum</th>
        </tr>
      </thead>
      <tbody>
  `;

  // Rows for Neighbor Cells
  for (let i = 0; i < nCells; i++) {
    const sum = mvn[i] + attn[i] + expr[i];
    html += `
      <tr class="check-spot-row-hover">
        <td style="${nameTdStyle}">${labels[i]}</td>
        <td style="${tdStyle}">${mvn[i].toFixed(3)}</td>
        <td style="${tdStyle}">${attn[i].toFixed(3)}</td>
        <td style="${tdStyle}">${expr[i].toFixed(3)}</td>
        <td style="${tdStyle} font-weight:bold; color:#fff">${sum.toFixed(3)}</td>
      </tr>
    `;
  }

  // Row for Misread
  html += `
      <tr class="check-spot-row-hover">
        <td style="${nameTdStyle}">misread</td>
        <td style="${tdStyle} color:#4b5563">NaN</td>
        <td style="${tdStyle} color:#4b5563">NaN</td>
        <td style="${tdStyle} color:#4b5563">NaN</td>
        <td style="${tdStyle} font-weight:bold; color:#fff">${misread.toFixed(3)}</td>
      </tr>
    </tbody>
    </table>
  `;

  container.innerHTML = html;

  // Add a small hover style if not already in stylesheet
  if (!document.getElementById('check-spot-table-css')) {
    const style = document.createElement('style');
    style.id = 'check-spot-table-css';
    style.textContent = `
      .check-spot-row-hover:hover { background: rgba(255,255,255,0.05); }
    `;
    document.head.appendChild(style);
  }
}

function renderScores(container, data) {
  const d3 = window.d3;
  if (!d3) { container.innerHTML = '<div style="padding:20px;text-align:center;color:#ef4444;">D3.js not loaded</div>'; return; }
  container.innerHTML = '';
  
  // Data prep
  const labels = data.neighborLabels; // e.g. ["Cell 10", "Cell 20", ..., "Misread"]
  const nCells = labels.length - 1;
  const mvn = data.mvn.slice(0, nCells);
  const attn = data.attention.slice(0, nCells);
  const expr = data.exprFluct.slice(0, nCells);
  const misread = data.misread;

  // Chart Dimensions - Sidebar Friendly
  const containerWidth = container.clientWidth || 400;
  const margin = { top: 60, right: 20, bottom: 140, left: 50 }; // Large bottom margin for legend
  const width = containerWidth;
  const height = 450; // Taller to fit legend
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('font-family', '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
      .style('text-rendering', 'geometricPrecision');

  // Title and Subtitle
  svg.append('text')
      .attr('x', margin.left)
      .attr('y', 25)
      .style('font-size', '14px') // Slightly smaller
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

  // Scales
  const x = d3.scaleBand()
      .domain(labels)
      .range([0, w])
      .padding(0.3);

  // Calculate Y domain
  const stackedSums = mvn.map((v, i) => v + attn[i] + expr[i]); 
  const allValues = [...mvn, ...attn, ...expr, misread, ...stackedSums];
  const yMin = d3.min(allValues);
  const yMax = d3.max(allValues);
  const yDomain = [Math.min(0, yMin * 1.1), Math.max(0, yMax * 1.1)];

  const y = d3.scaleLinear()
      .domain(yDomain)
      .range([h, 0]);

  // Gridlines
  g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).tickSize(-w).tickFormat('')).call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').attr('stroke', '#374151').attr('stroke-dasharray', '2,2'));

  // Y-Axis
  g.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .call(g => g.select('.domain').remove())
      .selectAll('text').style('fill', '#9ca3af').style('font-size', '11px');

  // Y-Axis Label
  g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -35)
      .attr('x', -h / 2)
      .attr('text-anchor', 'middle')
      .style('fill', '#9ca3af')
      .style('font-size', '12px')
      .text('Log-Likelihood');

  // X-Axis
  g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x))
      .call(g => g.select('.domain').attr('stroke', '#4b5563'))
      .selectAll('text')
          .attr('transform', 'rotate(-45)')
          .style('text-anchor', 'end')
          .attr('dx', '-0.5em')
          .attr('dy', '0.5em')
          .style('fill', '#d1d5db')
          .style('font-size', '12px');

  // Colors
  const colors = { mvn: '#1f77b4', attn: '#ff7f0e', expr: '#2ca02c', misread: '#d62728' };

  // Helper to draw a rect segment
  const drawSegment = (dataArray, bottomArray, colorClass, colorHex) => {
      const labelsMap = { mvn: 'MVN LogLik', attn: 'Attention', expr: 'Expr Fluctuation' };
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

  // Draw Stacked Bars
  const zeros = new Array(nCells).fill(0);
  drawSegment(mvn, zeros, 'mvn', colors.mvn);
  drawSegment(attn, mvn, 'attn', colors.attn);
  const mvnPlusAttn = mvn.map((v, i) => v + attn[i]);
  drawSegment(expr, mvnPlusAttn, 'expr', colors.expr);

  // Misread Bar
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

  // Legend (Bottom - Flow Layout)
  const legend = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${h + margin.top + 50})`);

  const legendItems = [
      { label: 'MVN (Spatial)', color: colors.mvn },
      { label: 'Attention', color: colors.attn },
      { label: 'Expr. Fluctuation', color: colors.expr },
      { label: 'Misread Density', color: colors.misread }
  ];

  // Draw legend items in a 2x2 grid
  legendItems.forEach((item, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const lg = legend.append('g').attr('transform', `translate(${col * 140}, ${row * 20})`);
      
      lg.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', item.color);
      lg.append('text').attr('x', 16).attr('y', 9).text(item.label)
        .style('font-size', '12px').style('fill', '#d1d5db');
  });
}

// Tooltip Helpers
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
    // Calculate relative position within the panel
    const panel = document.getElementById('checkSpotPanel');
    const rect = panel.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
}

function hideTooltip() {
    const tt = document.getElementById('checkSpotTooltip');
    if (tt) tt.style.display = 'none';
}

function renderProbs(container, data) {
  const d3 = window.d3;
  if (!d3) { container.innerHTML = '<div style="padding:20px;text-align:center;color:#ef4444;">D3.js not loaded</div>'; return; }
  container.innerHTML = '';
  
  const labels = data.neighborLabels;
  const probs = data.probabilities;
  
  // Dimensions - Sidebar Friendly
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

  // Title
  svg.append('text')
      .attr('x', margin.left)
      .attr('y', 35)
      .style('font-size', '14px')
      .style('font-weight', '600')
      .style('fill', '#e5e7eb')
      .text('Assignment Probabilities');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Scales
  const x = d3.scaleBand()
      .domain(labels)
      .range([0, w])
      .padding(0.4); // slightly thinner bars

  const y = d3.scaleLinear()
      .domain([0, 1.05]) // Fixed 0-1 scale for probability
      .range([h, 0]);

  // Gridlines
  g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y)
          .ticks(5)
          .tickSize(-w)
          .tickFormat('')
      )
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line')
          .attr('stroke', '#374151')
          .attr('stroke-dasharray', '2,2')
      );

  // Y-Axis
  g.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').attr('stroke', '#4b5563'))
      .selectAll('text')
          .style('fill', '#9ca3af')
          .style('font-size', '11px');

  // Y-Axis Label
  g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -35)
      .attr('x', -h / 2)
      .attr('text-anchor', 'middle')
      .style('fill', '#9ca3af')
      .style('font-size', '12px')
      .text('Probability');

  // X-Axis
  g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x))
      .call(g => g.select('.domain').attr('stroke', '#4b5563'))
      .selectAll('text')
          .attr('transform', 'rotate(-45)')
          .style('text-anchor', 'end')
          .attr('dx', '-0.5em')
          .attr('dy', '0.5em')
          .style('fill', '#d1d5db')
          .style('font-size', '12px');

  // X-Axis Label
  g.append('text')
      .attr('x', w / 2)
      .attr('y', h + 60)
      .attr('text-anchor', 'middle')
      .style('fill', '#9ca3af')
      .style('font-size', '12px')
      .text('Candidate');

  // Colors
  const colors = {
      cell: '#1f77b4',   // Blue
      misread: '#d62728' // Red
  };

  // Bind data with labels for easy tooltip access
  const chartData = probs.map((p, i) => ({ prob: p, label: labels[i], isMisread: i === labels.length - 1 }));

  // Draw Bars
  g.selectAll('.bar-prob')
      .data(chartData)
      .enter().append('rect')
      .attr('x', d => x(d.label))
      .attr('width', x.bandwidth())
      .attr('y', d => y(d.prob))
      .attr('height', d => h - y(d.prob))
      .attr('fill', d => d.isMisread ? colors.misread : colors.cell)
      .attr('opacity', 0.9)
      .on('mouseover', (e, d) => showTooltip(e, `<strong>${d.label}</strong><br>Probability: ${(d.prob * 100).toFixed(1)}%`))
      .on('mousemove', moveTooltip)
      .on('mouseout', hideTooltip);

  // "Most probable" Annotation
  const maxProb = Math.max(...probs);
  const maxIndex = probs.indexOf(maxProb);
  
  if (maxProb > 0.5) {
      const targetX = x(labels[maxIndex]) + x.bandwidth() / 2;
      const targetY = y(maxProb);
      
      // Annotation Text
      g.append('text')
          .attr('x', targetX)
          .attr('y', targetY - 20)
          .attr('text-anchor', 'middle')
          .style('fill', '#4b5563') // Dark gray like in reference
          .style('font-size', '11px')
          .text('Most probable');

      // Simple Arrow
      g.append('path')
          .attr('d', `M ${targetX} ${targetY - 18} L ${targetX} ${targetY - 5}`)
          .attr('stroke', '#4b5563')
          .attr('stroke-width', 1)
          .attr('marker-end', 'url(#arrowhead)'); // Define marker below
  }

  // Define Arrow Marker (if not exists)
  if (svg.select('#arrowhead').empty()) {
      svg.append('defs').append('marker')
          .attr('id', 'arrowhead')
          .attr('viewBox', '0 0 10 10')
          .attr('refX', 5)
          .attr('refY', 5)
          .attr('markerWidth', 6)
          .attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path')
          .attr('d', 'M 0 0 L 10 5 L 0 10 z')
          .attr('fill', '#4b5563');
  }
}

function showNotification(message, type = 'success') {
  let notification = document.getElementById('appNotification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'appNotification';
    notification.style.cssText = `
      position: fixed; right: 20px; bottom: 20px;
      background: rgba(0, 0, 0, 0.9); color: white; padding: 12px 20px; border-radius: 8px;
      font-family: Arial, sans-serif; font-size: 13px; z-index: 10001; max-width: 400px; transition: opacity 0.3s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(notification);
  }
  notification.textContent = message;
  const colors = { error: 'rgba(220, 53, 69, 0.9)', info: 'rgba(59, 130, 246, 0.9)', success: 'rgba(34, 139, 34, 0.9)' };
  notification.style.background = colors[type] || colors.success;
  notification.style.opacity = '1';
  setTimeout(() => { notification.style.opacity = '0'; }, 4000);
}

