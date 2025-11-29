// Import UI element constants
import { UI_ELEMENTS } from '../config/constants.js';

// DOM elements
const elements = {
    slider: document.getElementById(UI_ELEMENTS.planeSlider),
    label: document.getElementById(UI_ELEMENTS.planeLabel),
    prevBtn: document.getElementById(UI_ELEMENTS.prevBtn),
    nextBtn: document.getElementById(UI_ELEMENTS.nextBtn),
    loadingIndicator: document.getElementById(UI_ELEMENTS.loadingIndicator),

    // Layer controls
    showTiles: document.getElementById(UI_ELEMENTS.showTiles),
    showPolygons: document.getElementById(UI_ELEMENTS.showPolygons),

    // Polygon controls
    polygonOpacitySlider: document.getElementById(UI_ELEMENTS.polygonOpacitySlider),
    polygonOpacityValue: document.getElementById(UI_ELEMENTS.polygonOpacityValue),

    // Gene controls
    geneSizeSlider: document.getElementById(UI_ELEMENTS.geneSizeSlider),
    geneSizeValue: document.getElementById(UI_ELEMENTS.geneSizeValue),
    // genePanelBtn removed

    // Score filtering controls
    scoreFilterSlider: document.getElementById('scoreFilterSlider'),
    scoreFilterValue: document.getElementById('scoreFilterValue'),
    // Intensity filtering controls
    intensityFilterSlider: document.getElementById('intensityFilterSlider'),
    intensityFilterValue: document.getElementById('intensityFilterValue'),
    // Uniform size toggle
    uniformSizeToggle: document.getElementById('uniformSizeToggle'),

    // Gene widget removed (replaced by Genes drawer)

    // Cell class widget (cellClassPanelBtn removed - now using always-visible drawer section)
    cellClassViewerBtn: document.getElementById('cellClassViewerBtn'),
    cellClassWidget: document.getElementById('cellClassWidget'),
    cellClassWidgetBackdrop: document.getElementById('cellClassWidgetBackdrop'),
    cellClassWidgetClose: document.getElementById('cellClassWidgetClose'),
    cellClassWidgetUndock: document.getElementById('cellClassWidgetUndock'),
    cellClassSearch: document.getElementById('cellClassSearch'),
    cellClassList: document.getElementById('cellClassList'),
    toggleAllCellClasses: document.getElementById('toggleAllCellClasses'),

    // UI
    layerControls: document.getElementById(UI_ELEMENTS.layerControls),
    tooltip: document.getElementById(UI_ELEMENTS.tooltip),

    // Controls Panel (drawer)
    controlsToggleBtn: document.getElementById('controlsToggleBtn'),
    controlsPanel: document.getElementById('controlsPanel'),
    controlsCloseBtn: document.getElementById('controlsCloseBtn'),

    // Regions
    importRegionsBtn: document.getElementById('importRegionsBtn'),
    regionFileInput: document.getElementById('regionFileInput'),
    regionsList: document.getElementById('regionsList')
};

export { elements };
