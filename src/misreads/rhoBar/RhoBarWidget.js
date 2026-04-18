import { WidgetBase } from '../../ui/widgetBase.js';
import { loadDiagnosticsMeta } from '../../data/diagnosticsLoader.js';
import { prepareRhoData } from './rhoBarData.js';
import { renderRhoBar } from './rhoBarRenderer.js';

class RhoBarWidget extends WidgetBase {
    constructor() {
        super('rhoBarWidget', 'rho per Gene', {
            width: 600, height: 500, minWidth: 400, minHeight: 300, side: 'right',
        });
        this.resizeRaf  = null;
        this.data       = null;
        this._order     = 'desc';
        this._orderChk  = null;
    }

    create() {
        super.create();

        const chkLabel = document.createElement('label');
        chkLabel.style.cssText = 'display:flex;align-items:center;gap:4px;color:rgba(255,255,255,0.7);font-size:11px;cursor:pointer;';
        this._orderChk = document.createElement('input');
        this._orderChk.type = 'checkbox';
        this._orderChk.checked = true;
        this._orderChk.addEventListener('change', () => {
            this._order = this._orderChk.checked ? 'desc' : 'asc';
            if (this.data) renderRhoBar(this.contentContainer, this.data, this._order, this.isPosterior);
        });
        chkLabel.append(this._orderChk, 'Decreasing');
        this.addToolbarControl(chkLabel);
    }

    async onShow() {
        this._order = 'desc';
        this._orderChk.checked = true;

        const meta = await loadDiagnosticsMeta();
        const { data, isPosterior } = prepareRhoData(meta);
        this.data       = data;
        this.isPosterior = isPosterior;
        renderRhoBar(this.contentContainer, this.data, this._order, this.isPosterior);
    }

    onResize() {
        if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
        this.resizeRaf = requestAnimationFrame(() => {
            if (this.data) renderRhoBar(this.contentContainer, this.data, this._order, this.isPosterior);
        });
    }
}

let _instance = null;

export function showRhoBarWidget() {
    if (!_instance) _instance = new RhoBarWidget();
    _instance.show();
}

export function hideRhoBarWidget() {
    if (_instance) _instance.hide();
}