// Voxel Viewer Left Drawer UI (mirrors main drawer styling)
import { EYE_OPEN_SVG, EYE_CLOSED_SVG } from '../../src/icons.js';

export function initVoxelDrawer({
  deckgl,
  createLayers,
  blockData,
  availableGenes,
  selectedGenes,
  geneColors,
  hiddenCells,
  updateHiddenCellsPanel,
  selectedCellClasses,
  cellIdToClass,
  classColors,
  classCounts
}) {
  // ==== Cell Classes ====
  const classesListEl = document.getElementById('voxelClassesList');
  const classFilterEl = document.getElementById('voxelClassFilter');
  const showAllClassesBtn = document.getElementById('voxelShowAllClassesBtn');
  const hideAllClassesBtn = document.getElementById('voxelHideAllClassesBtn');

  function renderClasses(filter = '') {
    if (!classesListEl) return;
    classesListEl.innerHTML = '';
    const lower = filter.toLowerCase();
    const classes = Array.from(classCounts.keys())
      .filter(name => name.toLowerCase().includes(lower))
      .sort((a, b) => (classCounts.get(b) - classCounts.get(a)) || a.localeCompare(b));

    classes.forEach(cls => {
      const row = document.createElement('div');
      row.className = 'cell-class-item';

      const dot = document.createElement('div');
      dot.className = 'cell-class-color';
      const hex = classColors.get(cls) || '#c0c0c0';
      dot.style.background = hex;

      const name = document.createElement('span');
      name.className = 'cell-class-name';
      name.textContent = cls;

      const count = document.createElement('span');
      count.className = 'cell-class-count';
      count.textContent = (classCounts.get(cls) || 0).toLocaleString();

      const eye = document.createElement('div');
      eye.className = 'cell-class-eye';
      const isVisible = selectedCellClasses.has(cls);
      if (!isVisible) row.classList.add('dim');
      eye.title = isVisible ? 'Hide' : 'Show';
      eye.innerHTML = isVisible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
      const toggleClass = () => {
        const nowVisible = selectedCellClasses.has(cls) ? (selectedCellClasses.delete(cls), false) : (selectedCellClasses.add(cls), true);
        eye.title = nowVisible ? 'Hide' : 'Show';
        eye.innerHTML = nowVisible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
        if (nowVisible) row.classList.remove('dim'); else row.classList.add('dim');
        deckgl.setProps({ layers: createLayers() });
      };
      eye.addEventListener('click', (e) => { e.stopPropagation(); toggleClass(); });
      row.addEventListener('click', toggleClass);

      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(count);
      row.appendChild(eye);
      classesListEl.appendChild(row);
    });
  }

  if (classFilterEl) classFilterEl.addEventListener('input', (e) => renderClasses(e.target.value));
  // Resizer for classes list (match main UI behavior)
  (function attachClassResizer() {
    const listEl = classesListEl;
    const handleEl = document.getElementById('cellClassesResizeHandle');
    if (!listEl || !handleEl) return;
    let isResizing = false, startY = 0, startH = 0;
    const minH = 100, maxH = 1200;
    try {
      const saved = window.localStorage && window.localStorage.getItem('voxel_cellClassesListHeight');
      if (saved) {
        const h = parseInt(saved, 10); if (!Number.isNaN(h)) listEl.style.maxHeight = h + 'px';
      }
    } catch {}
    handleEl.addEventListener('mousedown', (e) => {
      isResizing = true; startY = e.clientY; startH = listEl.offsetHeight; document.body.style.cursor = 'ns-resize'; document.body.style.userSelect = 'none'; e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return; const newH = Math.max(minH, Math.min(maxH, startH + (e.clientY - startY))); listEl.style.maxHeight = newH + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!isResizing) return; isResizing = false; document.body.style.cursor = ''; document.body.style.userSelect = '';
      try { window.localStorage && window.localStorage.setItem('voxel_cellClassesListHeight', String(listEl.offsetHeight)); } catch {}
    });
  })();
  if (showAllClassesBtn) showAllClassesBtn.addEventListener('click', () => {
    selectedCellClasses.clear();
    classCounts.forEach((_, cls) => selectedCellClasses.add(cls));
    deckgl.setProps({ layers: createLayers() });
    renderClasses(classFilterEl?.value || '');
  });
  if (hideAllClassesBtn) hideAllClassesBtn.addEventListener('click', () => {
    selectedCellClasses.clear();
    deckgl.setProps({ layers: createLayers() });
    renderClasses(classFilterEl?.value || '');
  });

  // ==== Genes ====
  const genesListEl = document.getElementById('voxelGenesList');
  const geneFilterEl = document.getElementById('voxelGeneFilter');
  const showAllGenesBtn = document.getElementById('voxelShowAllGenesBtn');
  const hideAllGenesBtn = document.getElementById('voxelHideAllGenesBtn');

  // Precompute totals for genes from blockData
  const geneCounts = (() => {
    const m = new Map();
    for (const b of blockData.geneData) {
      const g = b.gene_name;
      m.set(g, (m.get(g) || 0) + 1);
      availableGenes.add(g);
      if (!geneColors.has(g)) {
        try {
          if (typeof glyphSettings === 'function') {
            const settings = glyphSettings();
            const entry = settings.find(s => s.gene === g);
            if (entry && entry.color) geneColors.set(g, entry.color);
          }
        } catch {}
        if (!geneColors.has(g)) geneColors.set(g, '#ffffff');
      }
    }
    return m;
  })();

  function renderGenes(filter = '') {
    if (!genesListEl) return;
    genesListEl.innerHTML = '';
    const lower = filter.toLowerCase();
    const genes = [...availableGenes]
      .filter(g => g.toLowerCase().includes(lower))
      .map(g => ({ name: g, count: geneCounts.get(g) || 0 }))
      .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));

    genes.forEach(({ name: gene, count: total }) => {
      const row = document.createElement('div');
      row.className = 'cell-class-item';

      const swatch = document.createElement('div');
      swatch.className = 'cell-class-color';
      const hex = geneColors.get(gene) || '#ffffff';
      swatch.style.background = hex;

      const name = document.createElement('span');
      name.className = 'cell-class-name';
      name.textContent = gene;

      const count = document.createElement('span');
      count.className = 'cell-class-count';
      count.textContent = (total || 0).toLocaleString();

      const eye = document.createElement('div');
      eye.className = 'cell-class-eye';
      const visible = selectedGenes.has(gene);
      if (!visible) row.classList.add('dim');
      eye.title = visible ? 'Hide' : 'Show';
      eye.innerHTML = visible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
      const toggleGene = () => {
        if (selectedGenes.has(gene)) { selectedGenes.delete(gene); row.classList.add('dim'); eye.innerHTML = EYE_CLOSED_SVG; eye.title='Show'; }
        else { selectedGenes.add(gene); row.classList.remove('dim'); eye.innerHTML = EYE_OPEN_SVG; eye.title='Hide'; }
        deckgl.setProps({ layers: createLayers() });
      };
      eye.addEventListener('click', (e) => { e.stopPropagation(); toggleGene(); });
      row.addEventListener('click', toggleGene);

      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(count);
      row.appendChild(eye);
      genesListEl.appendChild(row);
    });
  }

  if (geneFilterEl) geneFilterEl.addEventListener('input', (e) => renderGenes(e.target.value));
  // Resizer for genes list (match main UI behavior)
  (function attachGeneResizer() {
    const listEl = genesListEl;
    const handleEl = document.getElementById('genesResizeHandle');
    if (!listEl || !handleEl) return;
    let isResizing = false, startY = 0, startH = 0;
    const minH = 100, maxH = 1200;
    try {
      const saved = window.localStorage && window.localStorage.getItem('voxel_genesListHeight');
      if (saved) { const h = parseInt(saved, 10); if (!Number.isNaN(h)) listEl.style.maxHeight = h + 'px'; }
    } catch {}
    handleEl.addEventListener('mousedown', (e) => {
      isResizing = true; startY = e.clientY; startH = listEl.offsetHeight; document.body.style.cursor = 'ns-resize'; document.body.style.userSelect = 'none'; e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return; const newH = Math.max(minH, Math.min(maxH, startH + (e.clientY - startY))); listEl.style.maxHeight = newH + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!isResizing) return; isResizing = false; document.body.style.cursor = ''; document.body.style.userSelect = '';
      try { window.localStorage && window.localStorage.setItem('voxel_genesListHeight', String(listEl.offsetHeight)); } catch {}
    });
  })();
  if (showAllGenesBtn) showAllGenesBtn.addEventListener('click', () => {
    availableGenes.forEach(g => selectedGenes.add(g));
    deckgl.setProps({ layers: createLayers() });
    renderGenes(geneFilterEl?.value || '');
  });
  if (hideAllGenesBtn) hideAllGenesBtn.addEventListener('click', () => {
    selectedGenes.clear();
    deckgl.setProps({ layers: createLayers() });
    renderGenes(geneFilterEl?.value || '');
  });

  // ==== Hidden Cells ====
  const hiddenCountEl = document.getElementById('voxelHiddenCellsCount');
  const hiddenListEl = document.getElementById('voxelHiddenCellsList');
  const hiddenShowAllBtn = document.getElementById('voxelHiddenCellsShowAll');

  function renderHidden() {
    if (!hiddenCountEl || !hiddenListEl) return;
    const ids = Array.from(hiddenCells).sort((a, b) => a - b);
    hiddenCountEl.textContent = `(${ids.length})`;
    hiddenListEl.innerHTML = '';
    ids.forEach(id => {
      const row = document.createElement('div');
      row.className = 'cell-class-item';

      // Color swatch based on the cell's class color
      const cls = cellIdToClass ? (cellIdToClass.get(id) || 'Unknown') : 'Unknown';
      const hex = classColors ? (classColors.get(cls) || '#c0c0c0') : '#c0c0c0';
      const swatch = document.createElement('div');
      swatch.className = 'cell-class-color';
      swatch.style.background = hex;

      const name = document.createElement('span');
      name.className = 'cell-class-name';
      name.textContent = `Cell ${id}`;

      const restore = document.createElement('button');
      restore.className = 'region-delete-btn';
      restore.title = 'Restore cell';
      restore.textContent = 'Restore';
      restore.addEventListener('click', (e) => {
        e.stopPropagation();
        if (hiddenCells.has(id)) {
          hiddenCells.delete(id);
          deckgl.setProps({ layers: createLayers() });
          renderHidden();
        }
      });
      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(restore);
      hiddenListEl.appendChild(row);
    });
  }
  if (hiddenShowAllBtn) hiddenShowAllBtn.addEventListener('click', () => {
    if (hiddenCells.size === 0) return;
    hiddenCells.clear();
    deckgl.setProps({ layers: createLayers() });
    renderHidden();
  });

  // Expose a renderer for external updates (e.g., Ctrl+Click hides)
  updateHiddenCellsPanel.current = renderHidden;

  // Initial renders
  renderClasses();
  renderGenes();
  renderHidden();

  return {
    rerenderHidden: renderHidden,
    rerenderGenes: () => renderGenes(geneFilterEl?.value || ''),
    rerenderClasses: () => renderClasses(classFilterEl?.value || '')
  };
}
