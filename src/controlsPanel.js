import { elements } from './domElements.js';

function showControlsPanel() {
    elements.controlsPanel.classList.remove('hidden');
}

function hideControlsPanel() {
    elements.controlsPanel.classList.add('hidden');
}

function toggleControlsPanel() {
    if (elements.controlsPanel.classList.contains('hidden')) {
        showControlsPanel();
    } else {
        hideControlsPanel();
    }
}

export { showControlsPanel, hideControlsPanel, toggleControlsPanel };
