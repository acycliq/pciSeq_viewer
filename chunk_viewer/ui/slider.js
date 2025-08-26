// UI: Z-slice slider (plane control)

export function initSliceSlider({
  deckgl,
  createLayers,
  planeIdToSliceY,
  getTotalPlanes,
  getCurrentPlaneId,
  setCurrentPlaneId,
  setCurrentSliceY
}) {
  const slider = document.getElementById('sliceZ');
  const label = document.getElementById('sliderValue');
  if (!slider) return;

  function updateLabel() {
    if (!label) return;
    const maxPlaneId = parseInt(slider.max);
    const cur = parseInt(slider.value);
    label.textContent = `${cur}/${maxPlaneId}`;
  }

  // Configure slider range from total planes
  const totalPlanes = getTotalPlanes();
  const maxPlaneId = Math.max(0, (totalPlanes ?? 1) - 1);
  slider.min = '0';
  slider.max = String(maxPlaneId);

  // Start at max plane so all voxels are visible initially
  setCurrentPlaneId(maxPlaneId);
  setCurrentSliceY(planeIdToSliceY(maxPlaneId));
  slider.value = String(maxPlaneId);
  slider.step = '1';
  if (label) label.style.display = 'block';
  updateLabel();

  slider.addEventListener('input', (e) => {
    const planeId = parseInt(e.target.value);
    const maxId = parseInt(slider.max);
    const clamped = Math.min(planeId, maxId);
    setCurrentPlaneId(clamped);
    setCurrentSliceY(planeIdToSliceY(clamped));
    updateLabel();
    deckgl.setProps({ layers: createLayers() });
  });
}

