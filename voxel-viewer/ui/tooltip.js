// UI: Hover tooltip for chunk viewer (matching main viewer style)
import { toGlobalPos, VOXEL_TYPE_CELL, VOXEL_TYPE_BOUNDARY } from '../core/coords.js';

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
  if (!(info && info.picked && info.object)) {
    el.style.display = 'none';
    return;
  }

  const obj = info.object;

  // Case 1: Gene voxel tooltip (existing behavior)
  if (obj.gene_name) {
    const global = toGlobalPos(obj.position, window.voxelTransformedBounds);
    const coords = global ? `(${global.x.toFixed(2)}, ${global.y.toFixed(2)}, ${global.z.toFixed(2)})` : '';

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
                     ${colorInfo}${coords ? `<strong>Coords:</strong> ${coords}<br>` : ''}
                     <strong>Plane:</strong> ${obj.plane_id}<br>
                     ${parentInfo}`;

    el.innerHTML = content;
    el.style.display = 'block';
    el.style.left = info.x + 20 + 'px';
    el.style.top = info.y - 60 + 'px';
    return;
  }

  // Case 2: Cell voxel or boundary voxel tooltip
  if (obj.cellId !== undefined || obj.voxelType === VOXEL_TYPE_CELL || obj.voxelType === VOXEL_TYPE_BOUNDARY) {
    const typeLabel = obj.voxelType === VOXEL_TYPE_BOUNDARY ? 'Boundary voxel' : 'Cell voxel';
    const plane = obj.planeId !== undefined ? obj.planeId : '';

    const global = toGlobalPos(obj.position, window.voxelTransformedBounds);
    const posText = global ? `(${global.x.toFixed(2)}, ${global.y.toFixed(2)}, ${global.z.toFixed(2)})` : '';

    let colorInfo = '';
    if (obj.rgb) {
      const [r, g, b] = obj.rgb;
      const color = d3.rgb(r, g, b);
      colorInfo = `<strong>Color:</strong> ${color.formatHex().toUpperCase()}<br>`;
    }

    // Optional metadata: class and total gene counts (queried from opener if not present)
    let classInfo = '';
    let totalInfo = '';
    try {
      const cid = (obj.cellId !== undefined && obj.cellId !== null) ? obj.cellId : obj.voxelId;
      let cls = obj.className;
      let total = obj.totalGeneCount;
      if ((cls === undefined || total === undefined) && window.opener && typeof window.opener.getCellMeta === 'function') {
        const meta = window.opener.getCellMeta(cid);
        if (meta) {
          if (cls === undefined && meta.className !== undefined) cls = meta.className;
          if (total === undefined && meta.totalGeneCount !== undefined) total = meta.totalGeneCount.toFixed(2);
        }
      }
      if (cls !== undefined) classInfo = `<strong>Class:</strong> ${cls}<br>`;
      if (total !== undefined) totalInfo = `<strong>Total Gene Counts:</strong> ${total}<br>`;
    } catch { /* no-op */ }

    const content = `<strong>Cell:</strong> ${obj.cellId ?? obj.voxelId}<br>
                     ${classInfo}${totalInfo}
                     <strong>Type:</strong> ${typeLabel}<br>
                     ${colorInfo}${posText ? `<strong>Voxel Coords:</strong> ${posText}<br>` : ''}
                     ${plane !== '' ? `<strong>Plane:</strong> ${plane}<br>` : ''}`;

    el.innerHTML = content;
    el.style.display = 'block';
    el.style.left = info.x + 20 + 'px';
    el.style.top = info.y - 60 + 'px';
    return;
  }

  // Otherwise, hide
  el.style.display = 'none';
}

export function hideTooltip() {
  const el = ensureTooltipEl();
  el.style.display = 'none';
}
