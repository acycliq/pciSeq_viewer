// UI: Hover tooltip for chunk viewer (matching main viewer style)

let tooltipElement = null;

function ensureTooltipEl() {
  if (!tooltipElement) {
    tooltipElement = document.createElement('div');
    tooltipElement.id = 'chunk-tooltip';
    tooltipElement.style.cssText = `
      position: absolute;
      pointer-events: none;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      display: none;
      white-space: nowrap;
      z-index: 1000;
      max-width: 300px;
      border: none;
      outline: none;
      box-shadow: none;
      margin: 0;
      font-family: inherit;`;
    document.body.appendChild(tooltipElement);
  }
  return tooltipElement;
}

export function showTooltip(info) {
  const el = ensureTooltipEl();
  if (!(info && info.picked && info.object && info.object.gene_name)) {
    el.style.display = 'none';
    return;
  }

  const obj = info.object;
  const coords = `(${obj.original_coords.x.toFixed(2)}, ${obj.original_coords.y.toFixed(2)}, ${obj.original_coords.z.toFixed(2)})`;

  let spotInfo = '';
  if (obj.spot_id !== undefined) {
    spotInfo = `<strong>Spot ID:</strong> ${obj.spot_id}<br>`;
  }

  let colorInfo = '';
  if (obj.rgb) {
    const [r, g, b] = obj.rgb;
    const color = d3.rgb(r, g, b);
    colorInfo = `<strong>Color:</strong> ${color.formatHex().toUpperCase()}<br>`;
  }

  let parentInfo = '';
  if (obj.parent_cell_id !== undefined && obj.parent_cell_id !== null) {
    const parentLabel = obj.parent_cell_id === 0 ? 'Background' : obj.parent_cell_id;
    parentInfo = `<strong>Parent Cell:</strong> ${parentLabel}<br>`;
    if (obj.parent_cell_X !== undefined && obj.parent_cell_Y !== undefined && obj.parent_cell_X !== null && obj.parent_cell_Y !== null) {
      const parentZInfo = obj.parent_cell_Z !== undefined && obj.parent_cell_Z !== null ? `, ${obj.parent_cell_Z.toFixed(2)}` : '';
      parentInfo += `<strong>Parent Coords:</strong> (${obj.parent_cell_X.toFixed(2)}, ${obj.parent_cell_Y.toFixed(2)}${parentZInfo})<br>`;
    }
  }

  const content = `${spotInfo}<strong>Gene:</strong> ${obj.gene_name}<br>
                   ${colorInfo}<strong>Coords:</strong> ${coords}<br>
                   <strong>Plane:</strong> ${obj.plane_id}<br>
                   ${parentInfo}`;

  el.innerHTML = content;
  el.style.display = 'block';
  el.style.left = info.x + 20 + 'px';
  el.style.top = info.y - 60 + 'px';
}

export function hideTooltip() {
  const el = ensureTooltipEl();
  el.style.display = 'none';
}

