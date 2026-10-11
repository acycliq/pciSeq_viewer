/**
 * The class prior chart: a bar per class with its weight at the end of the run.
 *
 * Opened by the chat's open_chart tool (src/chatCharts.js). The numbers come from
 * the main process, electron/run.js classPrior, through window.electronAPI
 * (electron/preload.js getClassPrior). They are the same ones the class_prior
 * tool gives the agent, so the chart and the answer cannot disagree.
 */
import { WidgetBase } from '../ui/widgetBase.js';
import { renderClassPrior } from './classPriorRenderer.js';

class ClassPriorWidget extends WidgetBase {
    constructor() {
        super('classPriorWidget', 'Class weights', {
            width: 640, height: 480, minWidth: 420, minHeight: 300,
        });
        this.resizeRaf = null;
        this.classes   = null;
    }

    async onShow() {
        const prior = await window.electronAPI.getClassPrior();
        this.classes = prior.classes;
        renderClassPrior(this.contentContainer, this.classes);
    }

    onResize() {
        if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
        this.resizeRaf = requestAnimationFrame(() => {
            if (this.classes) renderClassPrior(this.contentContainer, this.classes);
        });
    }
}

let _instance = null;

export function showClassPriorWidget() {
    if (!_instance) _instance = new ClassPriorWidget();
    _instance.show();
}
