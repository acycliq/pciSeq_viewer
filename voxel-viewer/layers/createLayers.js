// Build deck.gl layers from current state and data

export function createLayers({
  blockData,
  selectedGenes,
  currentSliceY,
  showBackground,
  showHoleVoxels,
  showBoundaryVoxels,
  showGhosting,
  stoneGhostOpacity,
  geneGhostOpacity,
  showSpotLines,
  lineGhostOpacity,
  createVoxelLayer,
  createLinesData,
  deck
}) {
  const layers = [];

  // Split solid vs transparent relative to current slice
  const solidStoneVoxels = blockData.stoneData.filter(b => b.position[1] <= currentSliceY);
  const transparentStoneVoxels = blockData.stoneData.filter(b => b.position[1] > currentSliceY);

  const solidCellVoxels = blockData.holeStoneData.filter(b => b.position[1] <= currentSliceY);
  const transparentCellVoxels = blockData.holeStoneData.filter(b => b.position[1] > currentSliceY);

  const solidBoundaryVoxels = blockData.boundaryData.filter(b => b.position[1] <= currentSliceY);
  const transparentBoundaryVoxels = blockData.boundaryData.filter(b => b.position[1] > currentSliceY);

  const solidGeneVoxels = blockData.geneData.filter(b => b.position[1] <= currentSliceY && selectedGenes.has(b.gene_name));
  const transparentGeneVoxels = blockData.geneData.filter(b => b.position[1] > currentSliceY && selectedGenes.has(b.gene_name));

  const layerConfigs = [
    ['stone-background-solid', solidStoneVoxels, { visible: showBackground, pickable: false, autoHighlight: false, parameters: { depthMask: true }, sliceY: currentSliceY }],
    ['hole-stone-solid',      solidCellVoxels,  { visible: showHoleVoxels, pickable: false, autoHighlight: false, parameters: { depthMask: true }, sliceY: currentSliceY }],
    ['boundary-solid',        solidBoundaryVoxels, { visible: showBoundaryVoxels, pickable: false, autoHighlight: false, parameters: { depthMask: true }, sliceY: currentSliceY }],
    ['gene-spots-solid',      solidGeneVoxels,  { pickable: true, autoHighlight: true, highlightColor: [255,255,255,200], parameters: { depthMask: true }, sliceY: currentSliceY }],

    ['stone-background-transparent', transparentStoneVoxels, { visible: showBackground && showGhosting, ghostOpacity: stoneGhostOpacity, pickable: false, autoHighlight: false, parameters: { depthMask: false, blend: true, blendFunc: [770,771], cull: false }, sliceY: currentSliceY }],
    ['hole-stone-transparent',      transparentCellVoxels,  { visible: showHoleVoxels && showGhosting, ghostOpacity: stoneGhostOpacity, pickable: false, autoHighlight: false, parameters: { depthMask: false, blend: true, blendFunc: [770,771], cull: false }, sliceY: currentSliceY }],
    ['boundary-transparent',        transparentBoundaryVoxels, { visible: showBoundaryVoxels && showGhosting, ghostOpacity: stoneGhostOpacity, pickable: false, autoHighlight: false, parameters: { depthMask: false, blend: true, blendFunc: [770,771], cull: false }, sliceY: currentSliceY }],
    ['gene-spots-transparent',      transparentGeneVoxels,  { visible: showGhosting, ghostOpacity: geneGhostOpacity, pickable: true, autoHighlight: false, parameters: { depthMask: false, blend: true, blendFunc: [770,771], cull: false }, sliceY: currentSliceY }]
  ];

  layerConfigs.forEach(([id, data, config]) => {
    const layer = createVoxelLayer(id, data, config);
    if (layer) layers.push(layer);
  });

  if (showSpotLines) {
    const solidLinesData = createLinesData(true);
    if (solidLinesData.length > 0) {
      layers.push(new deck.LineLayer({
        id: 'spot-to-parent-lines-solid',
        data: solidLinesData,
        getSourcePosition: d => d.sourcePosition,
        getTargetPosition: d => d.targetPosition,
        getColor: d => d.color,
        getWidth: 3,
        pickable: false,
        parameters: { depthTest: true, depthMask: true, blend: true, blendFunc: [770, 771] }
      }));
    }
    if (showGhosting) {
      const ghostLinesData = createLinesData(false);
      if (ghostLinesData.length > 0) {
        layers.push(new deck.LineLayer({
          id: 'spot-to-parent-lines-ghost',
          data: ghostLinesData,
          getSourcePosition: d => d.sourcePosition,
          getTargetPosition: d => d.targetPosition,
          getColor: d => [d.color[0], d.color[1], d.color[2]],
          opacity: lineGhostOpacity,
          getWidth: 3,
          pickable: false,
          parameters: { depthTest: true, depthMask: false, blend: true, blendFunc: [770, 771] }
        }));
      }
    }
  }

  return layers;
}
