import { WidgetBase } from '../../ui/widgetBase.js';
import { loadDiagnosticsMeta } from '../../data/diagnosticsLoader.js';
import { state } from '../../state/stateManager.js';
import { preparePerPlaneData } from './perPlaneData.js';
import { renderPerPlane } from './perPlaneRenderer.js';

class PerPlaneWidget extends WidgetBase {
    constructor() {
        super('perPlaneWidget', 'Misreads per Plane', {
            width: 600, height: 400, minWidth: 400, minHeight: 280, side: 'right',
        });
        this.resizeRaf    = null;
        this.selectedGene = null;
        this.geneSelect   = null;
        this._meta        = null;
    }

    create() {
        super.create();
        this.geneSelect = document.createElement('select');
        this.geneSelect.className = 'glass-select';
        this.geneSelect.innerHTML = '<option value="">-- Select gene --</option>';
        this.geneSelect.addEventListener('change', () => this._update());
        this.addToolbarControl(this.geneSelect);
    }

    async onShow() {
        this._meta = await loadDiagnosticsMeta();
        this._populateGenes();
        this._update();
    }

    onResize() {
        if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
        this.resizeRaf = requestAnimationFrame(() => this._update());
    }

    _populateGenes() {
        const current = this.geneSelect.value;
        const genes = Array.from(state.geneDataMap.keys()).sort();
        this.geneSelect.innerHTML = '<option value="">-- Select gene --</option>';
        genes.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = g;
            this.geneSelect.appendChild(opt);
        });
        if (current && state.geneDataMap.has(current)) this.geneSelect.value = current;
    }

    _update() {
        const gene = this.geneSelect?.value;
        if (!gene) {
            this.contentContainer.innerHTML =
                '<div class="glass-loader">Select a gene to view misreads per plane.</div>';
            return;
        }
        const data = preparePerPlaneData(this._meta || new Map(), gene);
        renderPerPlane(this.contentContainer, data, gene);
    }
}

let _instance = null;

export function showPerPlaneWidget() {
    if (!_instance) _instance = new PerPlaneWidget();
    _instance.show();
}

export function hidePerPlaneWidget() {
    if (_instance) _instance.hide();
}