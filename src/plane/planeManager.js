/**
 * Plane Manager Module
 *
 * Handles plane navigation, polygon loading, caching, and preloading.
 * Provides optimized plane switching with immediate visual feedback.
 */

import { clamp } from '../../utils/coordinateTransform.js';
import { showLoading, hideLoading } from '../ui/uiHelpers.js';
import { loadPolygonData, assignColorsToCellClasses } from '../data/dataLoaders.js';

/**
 * Fast update for immediate visual feedback (tiles and genes only)
 * @param {number} newPlane - Target plane number
 * @param {Object} state - Application state
 * @param {Object} elements - DOM elements
 * @param {Function} updateAllLayers - Layer update callback
 */
export function updatePlaneImmediate(newPlane, state, elements, updateAllLayers) {
    const perfStart = performance.now();

    const totalPlanes = window.appState.totalPlanes;
    const clampedPlane = clamp(newPlane, 0, totalPlanes - 1);

    // Update UI immediately - no async operations
    state.currentPlane = clampedPlane;
    elements.slider.value = state.currentPlane;
    elements.label.textContent = `Plane: ${state.currentPlane}`;

    // Update layers immediately (tiles + genes always work, polygons use cached data if available)
    updateAllLayers();

    const perfTime = performance.now() - perfStart;
    const advancedConfig = window.advancedConfig();
    if (advancedConfig.performance.showPerformanceStats) {
        console.log(`Immediate plane update: ${perfTime.toFixed(1)}ms`);
    }
}

/**
 * Background polygon loading - doesn't block UI
 * @param {number} planeNum - Plane number to load
 * @param {Object} state - Application state
 * @param {Object} elements - DOM elements
 * @param {Function} updateAllLayers - Layer update callback
 */
export async function updatePlanePolygonsAsync(planeNum, state, elements, updateAllLayers) {
    const startTime = performance.now();

    // Skip if already cached - major performance boost
    if (state.polygonCache.has(planeNum)) {
        console.log(`Plane ${planeNum} polygons already cached - skipping load`);
        return;
    }

    let loadingTimeout;
    try {
        // Show loading only for longer operations
        loadingTimeout = setTimeout(() => {
            if (state.currentPlane === planeNum) { // Only show if still current
                showLoading(state, elements.loadingIndicator);
            }
        }, 50); // Show loading after 50ms delay

        console.log(`Background loading polygon data for plane ${planeNum}`);
        await loadPolygonData(planeNum, state.polygonCache, state.allCellClasses, state.cellDataMap);

        clearTimeout(loadingTimeout);
        hideLoading(state, elements.loadingIndicator);

        const loadTime = performance.now() - startTime;
        console.log(`Loaded plane ${planeNum} polygons in ${loadTime.toFixed(1)}ms`);

        // Only update UI if this is still the current plane (user might have moved on)
        if (state.currentPlane === planeNum) {
            // Assign colors to newly discovered cell classes
            assignColorsToCellClasses(state.allCellClasses, state.cellClassColors);

            // Refresh layers to show new polygon data (only if still current plane)
            updateAllLayers();
        }

        // Background preloading of adjacent planes
        requestIdleCallback(() => {
            preloadAdjacentPlanes(planeNum, state);
        }, { timeout: 1000 });

    } catch (error) {
        clearTimeout(loadingTimeout);
        hideLoading(state, elements.loadingIndicator);
        console.error(`Failed to load polygon data for plane ${planeNum}:`, error);
    }
}

/**
 * Memory management for polygon cache
 * Removes distant planes to keep memory usage in check
 * @param {Object} state - Application state
 */
export function cleanupPolygonCache(state) {
    const now = Date.now();
    const maxCacheSize = 50; // Keep max 50 planes in memory
    const cleanupInterval = 30000; // Clean every 30 seconds

    // Skip if cleaned recently
    if (now - state.lastCleanupTime < cleanupInterval) {
        return;
    }

    if (state.polygonCache.size > maxCacheSize) {
        console.log(`Polygon cache has ${state.polygonCache.size} entries, cleaning up...`);

        const totalPlanes = window.appState.totalPlanes;

        // Keep current plane and adjacent planes
        const keepPlanes = new Set([
            Math.max(0, state.currentPlane - 3),
            Math.max(0, state.currentPlane - 2),
            Math.max(0, state.currentPlane - 1),
            state.currentPlane,
            Math.min(totalPlanes - 1, state.currentPlane + 1),
            Math.min(totalPlanes - 1, state.currentPlane + 2),
            Math.min(totalPlanes - 1, state.currentPlane + 3)
        ]);

        // Remove distant planes
        let removedCount = 0;
        for (const [plane] of state.polygonCache.entries()) {
            if (!keepPlanes.has(plane)) {
                state.polygonCache.delete(plane);
                state.polygonLoadTimes.delete(plane);
                removedCount++;
            }
        }

        console.log(`Removed ${removedCount} planes from cache, ${state.polygonCache.size} remaining`);
        state.lastCleanupTime = now;
    }
}

/**
 * Smart preloading of adjacent planes (Arrow-only polygons)
 * @param {number} currentPlane - Current plane number
 * @param {Object} state - Application state
 */
export function preloadAdjacentPlanes(currentPlane, state) {
    const totalPlanes = window.appState.totalPlanes;
    const planesToPreload = [];

    // Preload previous plane
    if (currentPlane > 0 && !state.polygonCache.has(currentPlane - 1)) {
        planesToPreload.push(currentPlane - 1);
    }

    // Preload next plane
    if (currentPlane < totalPlanes - 1 && !state.polygonCache.has(currentPlane + 1)) {
        planesToPreload.push(currentPlane + 1);
    }

    // Clean up cache before preloading
    cleanupPolygonCache(state);

    // Load one at a time to avoid overwhelming the browser
    planesToPreload.forEach((plane, index) => {
        setTimeout(() => {
            if (!state.polygonCache.has(plane)) { // Double-check it's still needed
                console.log(`Preloading plane ${plane} in background`);
                loadPolygonData(plane, state.polygonCache, state.allCellClasses, state.cellDataMap).catch(() => {});
            }
        }, index * 200); // Stagger requests by 200ms
    });
}

/**
 * Main plane update function - now lightning fast
 * @param {number} newPlane - Target plane number
 * @param {Object} state - Application state
 * @param {Object} elements - DOM elements
 * @param {Function} updateAllLayers - Layer update callback
 */
export function updatePlane(newPlane, state, elements, updateAllLayers) {
    // Step 1: Immediate visual update (5-20ms)
    updatePlaneImmediate(newPlane, state, elements, updateAllLayers);

    // No TSV path; Arrow boundaries load on demand and via background processes
}