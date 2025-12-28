/**
 * Spot Layer Cache Module
 *
 * Handles caching logic for the PointCloud/Scatterplot layer.
 * Extracts caching code from createArrowPointCloudLayer for better maintainability.
 */

import { GENE_SIZE_CONFIG } from '../config/constants.js';

/**
 * Get or compute cached radius factors for distance-based sizing
 * Caches the computed factors to avoid recomputing 20M+ operations per frame
 *
 * @param {Float32Array} planes - Plane IDs for each spot
 * @param {number} currentPlane - Current plane number
 * @param {number} length - Number of spots
 * @param {boolean} uniformMarkerSize - If true, skip distance computation
 * @returns {Float32Array|null} Cached radius factors or null if uniform sizing
 */
export function getOrComputeRadiusFactors(planes, currentPlane, length, uniformMarkerSize) {
    if (uniformMarkerSize) return null;

    try {
        const app = (typeof window !== 'undefined') ? window.appState || (window.appState = {}) : {};
        const cacheObj = app._scatterRadiiCache || (app._scatterRadiiCache = {});

        // Check if we need to recompute: plane changed, data changed, or first time
        const needsInit = !cacheObj.factors ||
                         cacheObj.length !== length ||
                         cacheObj.planesBuffer !== planes.buffer ||
                         cacheObj.plane !== (currentPlane || 0);

        if (needsInit) {
            const cur = (currentPlane || 0) | 0;
            const factors = new Float32Array(length);

            for (let i = 0; i < length; i++) {
                const dz = Math.abs(((planes[i] | 0) - cur));
                factors[i] = 1 / Math.sqrt(1 + dz); // Distance falloff factor only
            }

            // Cache the computed factors
            cacheObj.factors = factors;
            cacheObj.length = length;
            cacheObj.plane = cur;
            cacheObj.planesBuffer = planes.buffer;

            // Log cache creation
            logCacheEvent('Built radius factors', factors.byteLength, cur);
        }

        return cacheObj.factors;
    } catch {
        // Fallback: Compute without caching if cache fails
        const factors = new Float32Array(length);
        const cur = (currentPlane || 0) | 0;
        for (let i = 0; i < length; i++) {
            const dz = Math.abs(((planes[i] | 0) - cur));
            factors[i] = 1 / Math.sqrt(1 + dz);
        }
        return factors;
    }
}

/**
 * Get or compute cached masked color buffer for gene visibility
 * Caches the masked buffer to avoid GPU re-upload lag
 *
 * @param {Uint8Array} colors - Original color buffer (RGBA)
 * @param {Uint16Array} geneIds - Gene IDs for each spot
 * @param {Set} selectedGenes - Set of selected gene names
 * @param {number} length - Number of spots
 * @returns {Uint8Array} Masked color buffer with alpha based on selection
 */
export function getOrComputeMaskedColors(colors, geneIds, selectedGenes, length) {
    try {
        const app = (typeof window !== 'undefined') ? window.appState || (window.appState = {}) : {};
        const maskCache = app._geneMaskCache || (app._geneMaskCache = {});
        const geneDict = (app && app.arrowGeneDict) || {};
        const totalGenes = Object.keys(geneDict).length;

        // Build cache key from selected genes
        const selectedKey = selectedGenes ? Array.from(selectedGenes).sort().join('|') : '';
        const cacheKey = `${selectedKey}_${length}_${colors.buffer}`;

        // Check if we can reuse cached buffer
        const needsRebuild = !maskCache.buffer ||
                             maskCache.cacheKey !== cacheKey ||
                             maskCache.length !== length;

        if (needsRebuild) {
            const t0 = performance.now();
            let maskedColors;

            if (selectedGenes && selectedGenes.size > 0) {
                const allSelected = selectedGenes.size >= totalGenes;
                if (!allSelected) {
                    // Build new masked buffer
                    maskedColors = new Uint8Array(colors);
                    for (let i = 0; i < length; i++) {
                        const name = geneDict[geneIds[i]];
                        const visible = name ? selectedGenes.has(name) : false;
                        maskedColors[4*i + 3] = visible ? 255 : 0;
                    }
                } else {
                    // All selected - copy with full alpha
                    maskedColors = new Uint8Array(colors);
                    for (let i = 0; i < length; i++) maskedColors[4*i + 3] = 255;
                }
            } else if (selectedGenes && selectedGenes.size === 0) {
                // None selected - zero alpha
                maskedColors = new Uint8Array(colors);
                for (let i = 0; i < length; i++) maskedColors[4*i + 3] = 0;
            } else {
                // No selection filter - use original colors
                maskedColors = colors;
            }

            // Cache the result
            if (maskedColors && maskedColors !== colors) {
                maskCache.buffer = maskedColors;
                maskCache.cacheKey = cacheKey;
                maskCache.length = length;

                const elapsed = performance.now() - t0;
                logCacheMiss('gene mask buffer', maskedColors.byteLength, elapsed, selectedGenes?.size || 0, totalGenes);
            }

            return maskedColors || colors;
        } else {
            // Reuse cached buffer
            logCacheHit('gene mask buffer', maskCache.buffer.byteLength);
            return maskCache.buffer;
        }
    } catch (e) {
        console.warn('Gene mask caching failed, fallback to direct copy:', e);
        return colors;
    }
}

/**
 * Get the upper bound for intensity filter range
 * @returns {number} Intensity upper bound
 */
export function getIntensityUpperBound() {
    try {
        const app = (typeof window !== 'undefined') ? window.appState : null;
        if (app && Array.isArray(app.intensityRange)) {
            const hi = Number(app.intensityRange[1]);
            if (Number.isFinite(hi)) return hi;
        }
    } catch {}
    return 1.0;
}

/**
 * Get base scale for spot rendering
 * @returns {number} Base scale value
 */
export function getBaseScale() {
    return ((GENE_SIZE_CONFIG && GENE_SIZE_CONFIG.BASE_SIZE ? GENE_SIZE_CONFIG.BASE_SIZE : 12)) / 10;
}

// === Logging Helpers ===

function logCacheEvent(message, bytes, plane) {
    const adv = window.advancedConfig?.();
    if (adv?.performance?.showPerformanceStats) {
        const bufferSizeMB = (bytes / 1024 / 1024).toFixed(2);
        const memoryInfo = getMemoryInfo();
        console.log(`[CACHE] ${message}: ${bufferSizeMB} MB for plane ${plane}${memoryInfo}`);
    }
}

function logCacheMiss(name, bytes, elapsed, selected, total) {
    const adv = window.advancedConfig?.();
    if (adv?.performance?.showPerformanceStats) {
        const bufferSizeMB = (bytes / 1024 / 1024).toFixed(2);
        const memoryInfo = getMemoryInfo();
        console.log(`[CACHE MISS] Built new ${name}: ${bufferSizeMB} MB in ${elapsed.toFixed(2)}ms (${selected}/${total} genes)${memoryInfo}`);
    }
}

function logCacheHit(name, bytes) {
    const adv = window.advancedConfig?.();
    if (adv?.performance?.showPerformanceStats) {
        const bufferSizeMB = (bytes / 1024 / 1024).toFixed(2);
        const memoryInfo = getMemoryInfo();
        console.log(`[CACHE HIT] Reusing ${name}: ${bufferSizeMB} MB (avoids GPU upload!)${memoryInfo}`);
    }
}

function getMemoryInfo() {
    if (performance.memory) {
        const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1);
        const totalMB = (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1);
        return ` | Memory: ${usedMB}/${totalMB} MB`;
    }
    return '';
}