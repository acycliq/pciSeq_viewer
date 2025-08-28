// Create a high-performance PathLayer with binary attributes for boundaries

export function createBoundaryBinaryLayer({ deck, id, plane, buffers, opacity = 0.5, color = [34, 211, 238] }) {
  const { PathLayer, COORDINATE_SYSTEM } = deck;
  const { positions, startIndices, length } = buffers || {};
  if (!positions || !startIndices || !Number.isFinite(length)) return null;

  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  const rgba = [color[0] || 160, color[1] || 160, color[2] || 160, alpha];

  return new PathLayer({
    id: id || `boundaries-plane-${plane}`,
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    data: { length, startIndices, attributes: { getPath: { value: positions, size: 2 } } },
    widthUnits: 'pixels',
    getWidth: 1,
    pickable: true,
    getColor: rgba
  });
}
