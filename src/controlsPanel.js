import { elements } from './domElements.js';

function updateAriaExpanded() {
    const btn = document.getElementById('controlsToggleBtn');
    if (!btn) return;
    const expanded = !elements.controlsPanel.classList.contains('collapsed');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function updateScaleBarOffset() {
    const scaleBar = document.getElementById('scaleBar');
    if (!scaleBar) return;
    const isCollapsed = elements.controlsPanel.classList.contains('collapsed');
    const drawerWidth = elements.controlsPanel.offsetWidth || 300;
    const railWidth = 28; // keep in sync with CSS --rail-width
    const margin = 20; // visual gap from drawer/rail
    const left = (isCollapsed ? railWidth : drawerWidth) + margin;
    scaleBar.style.left = `${left}px`;
}

function updateRailTooltip() {
    const icon = document.getElementById('railToggleIcon');
    if (!icon) return;
    const isCollapsed = elements.controlsPanel.classList.contains('collapsed');
    icon.dataset.tooltip = isCollapsed ? 'Open controls' : 'Close controls';
}

function showControlsPanel() {
    elements.controlsPanel.classList.remove('collapsed');
    updateAriaExpanded();
    updateScaleBarOffset();
    updateRailTooltip();
}

function hideControlsPanel() {
    elements.controlsPanel.classList.add('collapsed');
    updateAriaExpanded();
    updateScaleBarOffset();
    updateRailTooltip();
}

function toggleControlsPanel() {
    if (elements.controlsPanel.classList.contains('collapsed')) {
        showControlsPanel();
    } else {
        hideControlsPanel();
    }
}

// Recompute on resize
window.addEventListener('resize', updateScaleBarOffset);

export { showControlsPanel, hideControlsPanel, toggleControlsPanel, updateScaleBarOffset };
