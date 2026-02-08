// UI: Hidden Cells Panel

export function initHiddenCellsPanel({ hiddenCells, deckgl, createLayers }) {
  const panel = document.getElementById('hiddenCellsPanel');
  const countEl = document.getElementById('hiddenCellsCount');
  const listEl = document.getElementById('hiddenCellsList');
  const showAllBtn = document.getElementById('hiddenCellsShowAll');

  if (!panel || !countEl || !listEl || !showAllBtn) {
    console.warn('Hidden cells panel DOM not found');
    return { updatePanel: () => {} };
  }

  function restoreCell(id) {
    if (hiddenCells.has(id)) {
      hiddenCells.delete(id);
      deckgl.setProps({ layers: createLayers() });
      updatePanel();
    }
  }

  showAllBtn.addEventListener('click', () => {
    if (hiddenCells.size === 0) return;
    hiddenCells.clear();
    deckgl.setProps({ layers: createLayers() });
    updatePanel();
  });

  function updatePanel() {
    const arr = Array.from(hiddenCells);
    if (arr.length === 0) {
      panel.classList.add('hidden');
      countEl.textContent = '(0)';
      listEl.innerHTML = '';
      return;
    }

    panel.classList.remove('hidden');
    countEl.textContent = `(${arr.length})`;
    listEl.innerHTML = '';

    arr.sort((a, b) => a - b).forEach(id => {
      const row = document.createElement('div');
      row.className = 'hidden-cell-row';

      const label = document.createElement('span');
      label.className = 'hidden-cell-id';
      label.textContent = `Cell ${id}`;

      const btn = document.createElement('button');
      btn.className = 'restore-cell-btn';
      btn.textContent = 'Restore';
      btn.addEventListener('click', () => restoreCell(id));

      row.appendChild(label);
      row.appendChild(btn);
      listEl.appendChild(row);
    });
  }

  // Initial render (hidden by default until something is hidden)
  updatePanel();

  return { updatePanel };
}

