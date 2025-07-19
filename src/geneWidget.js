// Import dependencies
import { state } from './stateManager.js';
import { elements } from './domElements.js';

// === GENE WIDGET FUNCTIONS ===

function createGeneGlyph(glyphName, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    canvas.className = 'gene-glyph';
    
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(0, 0, 20, 20);
    
    const p = {x: 10, y: 10};
    const r = ['star5','star6'].includes(glyphName) ? 9 : 7;
    
    ctxPath(glyphName, ctx, p, r);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    return canvas;
}

function populateGeneWidget() {
    const geneList = elements.geneList;
    geneList.innerHTML = '';
    
    const genes = Array.from(state.geneDataMap.keys()).sort();
    
    genes.forEach(gene => {
        const cfg = glyphSettings().find(d => d.gene === gene) ||
                   glyphSettings().find(d => d.gene === 'Generic');
        
        const item = document.createElement('div');
        item.className = 'gene-item';
        item.dataset.gene = gene;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'gene-checkbox';
        checkbox.checked = state.selectedGenes.has(gene);
        checkbox.addEventListener('change', () => toggleGene(gene, checkbox.checked));
        
        const glyph = createGeneGlyph(cfg.glyphName, cfg.color);
        
        const name = document.createElement('span');
        name.className = 'gene-name';
        const spotCount = state.geneDataMap.get(gene)?.length || 0;
        name.textContent = `${gene} (${spotCount.toLocaleString()})`;
        
        item.appendChild(checkbox);
        item.appendChild(glyph);
        item.appendChild(name);
        
        geneList.appendChild(item);
    });
    
    updateToggleAllButton();
}

function toggleGene(gene, isVisible) {
    if (isVisible) {
        state.selectedGenes.add(gene);
    } else {
        state.selectedGenes.delete(gene);
    }
    window.updateAllLayers();
    updateToggleAllButton();
}

function updateToggleAllButton() {
    const totalGenes = state.geneDataMap.size;
    const selectedGenes = state.selectedGenes.size;
    const btn = elements.toggleAllGenes;
    
    if (selectedGenes === totalGenes) {
        btn.textContent = 'Unselect All';
        btn.className = 'toggle-all-btn unselect';
    } else {
        btn.textContent = 'Select All';
        btn.className = 'toggle-all-btn';
    }
}

function toggleAllGenes() {
    const totalGenes = state.geneDataMap.size;
    const selectedGenes = state.selectedGenes.size;
    const shouldSelectAll = selectedGenes < totalGenes;
    
    if (shouldSelectAll) {
        // Select all genes
        state.geneDataMap.forEach((_, gene) => {
            state.selectedGenes.add(gene);
        });
    } else {
        // Unselect all genes
        state.selectedGenes.clear();
    }
    
    // Update all checkboxes in the widget
    const checkboxes = elements.geneList.querySelectorAll('.gene-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = shouldSelectAll;
    });
    
    window.updateAllLayers();
    updateToggleAllButton();
}

function showGeneWidget() {
    elements.geneWidget.classList.remove('hidden');
    elements.geneWidgetBackdrop.classList.remove('hidden');
    populateGeneWidget();
    setupDragFunctionality();
}

function setupDragFunctionality() {
    const widget = elements.geneWidget;
    const header = widget.querySelector('.gene-widget-header');
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    
    function dragStart(e) {
        // Don't drag if clicking on buttons
        if (e.target.tagName === 'BUTTON') return;
        
        if (e.target === header || header.contains(e.target)) {
            isDragging = true;
            widget.classList.add('dragging');
            
            // Get current position
            const rect = widget.getBoundingClientRect();
            
            if (e.type === 'touchstart') {
                initialX = e.touches[0].clientX - rect.left;
                initialY = e.touches[0].clientY - rect.top;
            } else {
                initialX = e.clientX - rect.left;
                initialY = e.clientY - rect.top;
            }
        }
    }
    
    function dragEnd(e) {
        if (isDragging) {
            isDragging = false;
            widget.classList.remove('dragging');
        }
    }
    
    function drag(e) {
        if (!isDragging) return;
        
        e.preventDefault();
        
        if (e.type === 'touchmove') {
            currentX = e.touches[0].clientX - initialX;
            currentY = e.touches[0].clientY - initialY;
        } else {
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
        }
        
        // Constrain to viewport
        const maxX = window.innerWidth - widget.offsetWidth;
        const maxY = window.innerHeight - widget.offsetHeight;
        
        const newX = Math.max(0, Math.min(currentX, maxX));
        const newY = Math.max(0, Math.min(currentY, maxY));
        
        widget.style.left = newX + 'px';
        widget.style.top = newY + 'px';
        widget.style.transform = 'none';
    }
    
    // Mouse events
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    
    // Touch events for mobile
    header.addEventListener('touchstart', dragStart);
    document.addEventListener('touchmove', drag);
    document.addEventListener('touchend', dragEnd);
}

function hideGeneWidget() {
    elements.geneWidget.classList.add('hidden');
    elements.geneWidgetBackdrop.classList.add('hidden');
    elements.geneWidget.classList.remove('dragging');
    
    // Reset position for next time
    elements.geneWidget.style.left = '20px';
    elements.geneWidget.style.top = '20px';
    elements.geneWidget.style.transform = 'translateX(0)';
}

function filterGenes(searchTerm) {
    const items = elements.geneList.querySelectorAll('.gene-item');
    items.forEach(item => {
        const geneName = item.dataset.gene.toLowerCase();
        const matches = geneName.includes(searchTerm.toLowerCase());
        item.style.display = matches ? 'flex' : 'none';
    });
}

function undockGeneWidget() {
    // Hide the floating widget
    hideGeneWidget();
    
    // Open the separate gene panel window
    const genePanelWindow = window.open('genes_datatable.html', 'genePanel', 
        'width=500,height=600,scrollbars=yes,resizable=yes');
    
    if (genePanelWindow) {
        // Store reference for communication
        state.genePanelWin = genePanelWindow;
        
        // Send gene list when window is ready
        genePanelWindow.addEventListener('load', () => {
            const genes = Array.from(state.geneDataMap.keys());
            const chosen = Array.from(state.selectedGenes);
            genePanelWindow.postMessage({
                type: 'geneList',
                genes: genes,
                chosen: chosen
            }, '*');
        });
    }
}

// Expose functions globally for event handlers
window.showGeneWidget = showGeneWidget;
window.hideGeneWidget = hideGeneWidget;
window.filterGenes = filterGenes;
window.toggleAllGenes = toggleAllGenes;
window.undockGeneWidget = undockGeneWidget;

export {
    createGeneGlyph,
    populateGeneWidget,
    toggleGene,
    updateToggleAllButton,
    toggleAllGenes,
    showGeneWidget,
    setupDragFunctionality,
    hideGeneWidget,
    filterGenes,
    undockGeneWidget
};