import { elements } from './domElements.js';

function updateScaleBarOffset() {
    const scaleBar = document.getElementById('scaleBar');
    const toggleBtn = document.getElementById('controlsToggleBtn');
    if (!scaleBar) return;
    // When drawer is visible on the left, push the scale bar to the right of it
    const isHidden = elements.controlsPanel.classList.contains('hidden');
    const drawerWidth = isHidden ? 0 : (elements.controlsPanel.offsetWidth || 300);
    const margin = 20; // visual gap from drawer
    scaleBar.style.left = `${drawerWidth + margin}px`;
    if (toggleBtn) {
        toggleBtn.style.left = `${drawerWidth + 15}px`;
    }
}

function showControlsPanel() {
    elements.controlsPanel.classList.remove('hidden');
    try { window.localStorage && window.localStorage.setItem('drawer-state', 'open'); } catch {}
    updateScaleBarOffset();
}

function hideControlsPanel() {
    elements.controlsPanel.classList.add('hidden');
    try { window.localStorage && window.localStorage.setItem('drawer-state', 'closed'); } catch {}
    updateScaleBarOffset();
}

function toggleControlsPanel() {
    if (elements.controlsPanel.classList.contains('hidden')) {
        showControlsPanel();
    } else {
        hideControlsPanel();
    }
}

// Recompute on resize
window.addEventListener('resize', updateScaleBarOffset);

export { showControlsPanel, hideControlsPanel, toggleControlsPanel, updateScaleBarOffset };
