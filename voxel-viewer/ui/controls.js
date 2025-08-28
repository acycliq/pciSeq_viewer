// UI: Minimal top-right checkbox controls

export function initControls({
  deckgl,
  createLayers,
  setShowSpotLines,
  setShowBackground,
  setShowHoleVoxels,
  setShowBoundaryVoxels,
  setShowGhosting
}) {
  const bind = (id, setter, logLabel) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', (e) => {
      const v = e.target.checked;
      setter(v);
      if (logLabel) console.log(`${logLabel}:`, v);
      deckgl.setProps({ layers: createLayers() });
    });
  };

  bind('showLinesToggle', setShowSpotLines, 'Show spot lines');
  bind('showBackgroundToggle', setShowBackground, 'Show background');
  bind('showHoleVoxelsToggle', setShowHoleVoxels, 'Show hole voxels');
  bind('showBoundaryVoxelsToggle', setShowBoundaryVoxels, 'Show boundary voxels');
  bind('showGhostingToggle', setShowGhosting, 'Show ghosting');
}

