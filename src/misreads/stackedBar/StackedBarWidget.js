import { WidgetBase } from '../../ui/widgetBase.js';
import { prepareStackedData, sortData } from './stackedBarData.js';
import { renderStackedBar } from './stackedBarRenderer.js';

class StackedBarWidget extends WidgetBase {
    constructor() {
        super('stackedBarWidget', 'Assigned vs Misread Spots per Gene', {
            width: 600, height: 500, minWidth: 400, minHeight: 300, side: 'right',
        });
        this.resizeRaf  = null;
        this._rawData   = null;
        this._sortBy    = 'count';
        this._order     = 'desc';
        this._sortSel   = null;
        this._orderChk  = null;
    }

    create() {
        super.create();

        this._sortSel = document.createElement('select');
        this._sortSel.className = 'glass-select';
        this._sortSel.innerHTML = `
            <option value="count">Misread count</option>
            <option value="pct">Misread %</option>
            <option value="name">Name</option>
        `;
        this._sortSel.addEventListener('change', () => {
            this._sortBy = this._sortSel.value;
            this._render();
        });

        const chkLabel = document.createElement('label');
        chkLabel.style.cssText = 'display:flex;align-items:center;gap:4px;color:rgba(255,255,255,0.7);font-size:11px;cursor:pointer;';
        this._orderChk = document.createElement('input');
        this._orderChk.type = 'checkbox';
        this._orderChk.checked = true;
        this._orderChk.addEventListener('change', () => {
            this._order = this._orderChk.checked ? 'desc' : 'asc';
            this._render();
        });
        chkLabel.append(this._orderChk, 'Decreasing');

        this.addToolbarControl(this._sortSel);
        this.addToolbarControl(chkLabel);
    }

    async onShow() {
        this._sortBy = 'count';
        this._order  = 'desc';
        this._sortSel.value      = 'count';
        this._orderChk.checked   = true;

        this._rawData = prepareStackedData();
        this._render();
    }

    onResize() {
        if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
        this.resizeRaf = requestAnimationFrame(() => this._render());
    }

    _render() {
        if (!this._rawData) return;
        const sorted = sortData(this._rawData, this._sortBy, this._order);
        renderStackedBar(this.contentContainer, sorted);
    }
}

let _instance = null;

export function showStackedBarWidget() {
    if (!_instance) _instance = new StackedBarWidget();
    _instance.show();
}

export function hideStackedBarWidget() {
    if (_instance) _instance.hide();
}