/**
 * Spot Stream Loader
 *
 * Progressive loading of the binary spot scatter cache. Instead of waiting for
 * every shard to decode before the first spot appears, this module preallocates
 * the full cache from the manifest row count, then appends each shard as the
 * worker decodes it and asks the caller to redraw. deck.gl only draws
 * `cache.length` points, so bumping `length` after each append is all the
 * rendering side needs.
 *
 * Shards arrive nearest-plane-first (the worker orders them centre-out from
 * the current plane), so they are packed in arrival order, not manifest order.
 * Nothing indexes into the cache by original row, so this is safe.
 *
 * Wiring:
 *   - reads   ARROW_MANIFESTS (config/constants.js), window.config()
 *   - writes  window.appState.arrowScatterCache / arrowGeneDict / hasIntensity
 *   - fills   state.selectedGenes so the scatter layer shows every gene
 *   - worker  arrow-loader/lib/arrow-loaders.js -> streamSpotsScatter
 *   - called from src/app.js init, before the per-gene object pass
 */

import { ARROW_MANIFESTS } from '../../config/constants.js';
import { getManifest } from '../../arrow-loader/lib/arrow-manifests.js';
import { initArrow, streamSpotsScatter } from '../../arrow-loader/lib/arrow-loaders.js';
import { buildGeneIdColors, applyScoreRangeToUI, applyIntensityRangeToUI } from './dataLoaders.js';

// File reads in flight at once. Local disk in Electron, so a small pool is enough.
const SHARD_CONCURRENCY = 4;

/**
 * Stream all spot shards into window.appState.arrowScatterCache.
 * @param {number} currentPlane - Shards nearest this plane are loaded first
 * @param {Set<string>} selectedGenes - Seeded with every gene name so spots are visible
 * @param {Function} onShard - Called as onShard(loadedRows, totalRows) after each shard is appended
 * @returns {Promise<void>} Resolves once every shard has been appended
 */
export async function streamSpotsIntoScatterCache(currentPlane, selectedGenes, onShard) {
    initArrow({
        spotsManifest: ARROW_MANIFESTS.spotsManifest,
        cellsManifest: ARROW_MANIFESTS.cellsManifest,
        boundariesManifest: ARROW_MANIFESTS.boundariesManifest,
        spotsGeneDict: ARROW_MANIFESTS.spotsGeneDict
    });

    const geneDict = await fetchGeneDict();
    window.appState.arrowGeneDict = geneDict;
    selectedGenes.clear();
    Object.values(geneDict).forEach(name => selectedGenes.add(name));

    const manifestUrl = new URL(ARROW_MANIFESTS.spotsManifest, window.location.href).href;
    const manifest = await getManifest(manifestUrl);
    const cache = allocateScatterCache(manifest.total_rows);
    window.appState.arrowScatterCache = cache;
    window.appState.hasScores = true;

    const cfg = window.config();
    const img = { width: cfg.imageWidth, height: cfg.imageHeight, tileSize: 256 };
    const geneIdColors = buildGeneIdColors(geneDict);

    const stats = { scoreMin: Infinity, scoreMax: -Infinity, intensityMin: Infinity, intensityMax: -Infinity, intensityFiniteCount: 0 };
    const showStats = window?.advancedConfig?.().performance?.showPerformanceStats;
    const t0 = performance.now();

    await streamSpotsScatter(
        { manifestUrl, img, geneIdColors, currentPlane, concurrency: SHARD_CONCURRENCY },
        (chunk) => {
            appendChunk(cache, chunk);
            accumulateStats(stats, chunk);
            if (showStats) {
                console.log(`Spot stream: shard ${chunk.shardsDone}/${chunk.shardsTotal} plane=${chunk.plane} rows=${chunk.n} total=${cache.length}`);
            }
            onShard(cache.length, manifest.total_rows);
        }
    );

    finalizeFilterRanges(cache, stats);
    if (showStats) {
        console.log(`Spot stream complete: points=${cache.length} in ${(performance.now() - t0).toFixed(0)}ms`);
    }
}

async function fetchGeneDict() {
    const url = new URL(ARROW_MANIFESTS.spotsGeneDict, window.location.href).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch gene dict ${url}: ${res.status}`);
    return res.json();
}

function allocateScatterCache(totalRows) {
    return {
        positions: new Float32Array(totalRows * 3),
        colors: new Uint8Array(totalRows * 4),
        planes: new Int32Array(totalRows),
        geneIds: new Int32Array(totalRows),
        scores: new Float32Array(totalRows),
        intensities: new Float32Array(totalRows),
        misreadFlags: new Uint8Array(totalRows),
        // Built at the end, only when the dataset carries intensities
        filterPairs: null,
        length: 0
    };
}

function appendChunk(cache, chunk) {
    const offset = cache.length;
    cache.positions.set(chunk.positions, offset * 3);
    cache.colors.set(chunk.colors, offset * 4);
    cache.planes.set(chunk.planes, offset);
    cache.geneIds.set(chunk.geneIds, offset);
    cache.scores.set(chunk.scores, offset);
    cache.intensities.set(chunk.intensities, offset);
    cache.misreadFlags.set(chunk.misreadFlags, offset);
    cache.length = offset + chunk.n;
}

function accumulateStats(stats, chunk) {
    stats.scoreMin = Math.min(stats.scoreMin, chunk.scoreMin);
    stats.scoreMax = Math.max(stats.scoreMax, chunk.scoreMax);
    stats.intensityMin = Math.min(stats.intensityMin, chunk.intensityMin);
    stats.intensityMax = Math.max(stats.intensityMax, chunk.intensityMax);
    stats.intensityFiniteCount += chunk.intensityFiniteCount;
}

// Slider bounds need the dataset-wide min/max, so they are only set once the
// stream has drained. The 2D score/intensity filter pairs are built here too.
function finalizeFilterRanges(cache, stats) {
    applyScoreRangeToUI(stats.scoreMin, stats.scoreMax);
    const hasIntensity = stats.intensityFiniteCount > 0;
    window.appState.hasIntensity = hasIntensity;
    if (!hasIntensity) return;
    applyIntensityRangeToUI(stats.intensityMin, stats.intensityMax);
    const n = cache.length;
    const filterPairs = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
        filterPairs[2 * i] = cache.scores[i];
        filterPairs[2 * i + 1] = cache.intensities[i];
    }
    cache.filterPairs = filterPairs;
}
