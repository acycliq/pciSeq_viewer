import { showRhoBarWidget }     from './rhoBar/RhoBarWidget.js';
import { showStackedBarWidget } from './stackedBar/StackedBarWidget.js';
import { showPerPlaneWidget }   from './perPlane/PerPlaneWidget.js';

export function initMisreadsPanel() {
    document.getElementById('misreadRhoBtn')?.addEventListener('click', showRhoBarWidget);
    document.getElementById('misreadStackedBtn')?.addEventListener('click', showStackedBarWidget);
    document.getElementById('misreadPerPlaneBtn')?.addEventListener('click', showPerPlaneWidget);
}