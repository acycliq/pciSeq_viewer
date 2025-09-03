// UI: Genes panel (build list, toggle, search, select all, show/hide)

export function initGenesPanel({
  availableGenes,
  selectedGenes,
  blockData,
  createLayers,
  deckgl,
  geneColors
}) {
  function createGeneGlyph(color) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    canvas.className = 'gene-glyph';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(2, 2, 12, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, 12, 12);
    return canvas;
  }

  function updateToggleAllButton() {
    const toggleAllBtn = document.getElementById('toggleAllGenes');
    if (!toggleAllBtn) return;
    const totalGenes = availableGenes.size;
    const selected = selectedGenes.size;
    if (selected === totalGenes) {
      toggleAllBtn.textContent = 'Unselect All';
      toggleAllBtn.className = 'toggle-all-btn unselect';
    } else {
      toggleAllBtn.textContent = 'Select All';
      toggleAllBtn.className = 'toggle-all-btn';
    }
  }

  function toggleGene(gene, isVisible) {
    if (isVisible) selectedGenes.add(gene); else selectedGenes.delete(gene);
    updateToggleAllButton();
    deckgl.setProps({ layers: createLayers() });
  }

  function filterGeneList(searchTerm) {
    const geneItems = document.querySelectorAll('.gene-item');
    const lower = (searchTerm || '').toLowerCase();
    geneItems.forEach(item => {
      const geneName = item.dataset.gene.toLowerCase();
      item.style.display = geneName.includes(lower) ? 'flex' : 'none';
    });
  }

  function buildGeneControls() {
    const geneList = document.getElementById('geneList');
    if (!geneList) return;
    geneList.innerHTML = '';
    const sortedGenes = [...availableGenes].sort();
    sortedGenes.forEach(gene => {
      const geneItem = document.createElement('div');
      geneItem.className = 'gene-item';
      geneItem.dataset.gene = gene;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'gene-checkbox';
      checkbox.id = `gene-${gene}`;
      checkbox.checked = selectedGenes.has(gene);
      checkbox.addEventListener('change', () => toggleGene(gene, checkbox.checked));
      const glyph = createGeneGlyph(geneColors.get(gene));
      const nameSpan = document.createElement('span');
      nameSpan.className = 'gene-name';
      const count = blockData.geneData.filter(b => b.gene_name === gene).length;
      nameSpan.textContent = `${gene} (${count.toLocaleString()})`;
      geneItem.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          toggleGene(gene, checkbox.checked);
        }
      });
      geneItem.appendChild(checkbox);
      geneItem.appendChild(nameSpan);
      geneItem.appendChild(glyph);
      geneList.appendChild(geneItem);
    });
    updateToggleAllButton();
  }

  // Wire header buttons and Genes launcher
  const closeBtn = document.getElementById('geneWidgetClose');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    const widget = document.getElementById('chunkGeneWidget');
    widget.classList.add('hidden');
    const geneBtn = document.getElementById('genePanelBtn');
    if (geneBtn) geneBtn.style.display = '';
  });

  const collapseBtn = document.getElementById('geneWidgetCollapse');
  if (collapseBtn) collapseBtn.addEventListener('click', () => {
    const widget = document.getElementById('chunkGeneWidget');
    const collapsed = widget.classList.toggle('collapsed');
    collapseBtn.textContent = collapsed ? '+' : '−';
    collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
  });

  const genesBtn = document.getElementById('genePanelBtn');
  if (genesBtn) genesBtn.addEventListener('click', () => {
    const widget = document.getElementById('chunkGeneWidget');
    const nowHidden = widget.classList.toggle('hidden');
    if (!nowHidden) {
      if (collapseBtn && widget.classList.contains('collapsed')) {
        widget.classList.remove('collapsed');
        collapseBtn.textContent = '−';
        collapseBtn.title = 'Collapse';
      }
      genesBtn.style.display = 'none';
    } else {
      genesBtn.style.display = '';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const widget = document.getElementById('chunkGeneWidget');
      if (widget && !widget.classList.contains('hidden')) {
        widget.classList.add('hidden');
        const geneBtn = document.getElementById('genePanelBtn');
        if (geneBtn) geneBtn.style.display = '';
      }
    }
  });

  const searchInput = document.getElementById('geneSearch');
  if (searchInput) searchInput.addEventListener('input', (e) => filterGeneList(e.target.value));

  const toggleAllBtn = document.getElementById('toggleAllGenes');
  if (toggleAllBtn) toggleAllBtn.addEventListener('click', () => {
    const total = availableGenes.size;
    const selected = selectedGenes.size;
    const selectAll = selected < total;
    if (selectAll) {
      availableGenes.forEach(g => selectedGenes.add(g));
    } else {
      selectedGenes.clear();
    }
    // sync checkboxes
    availableGenes.forEach(gene => {
      const cb = document.getElementById(`gene-${gene}`);
      if (cb) cb.checked = selectedGenes.has(gene);
    });
    updateToggleAllButton();
    deckgl.setProps({ layers: createLayers() });
  });

  buildGeneControls();
  updateToggleAllButton();

  // expose minimal API if needed
  return { buildGeneControls, updateToggleAllButton };
}

