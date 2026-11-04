/**
 * Spot Stream Loader
 *
 * Progressive loading of the spots. The GPU buffers of the point layer are
 * allocated from the manifest row count (src/data/spotBuffers.js), then each
 * shard is appended as the worker decodes it and the caller is asked to
 * redraw. deck.gl draws `cache.length` points, so the planes appear one by one
 * while the files are still being read.
 *
 * Shards are packed in arrival order. With parallel fetches that can differ
 * from manifest order; nothing indexes into the buffers by original row, so
 * this is safe.
 *
 * The worker also hands back the raw columns of every shard. They are
 * returned to the caller in manifest order for the spot table, so the files
 * are read once and the table comes out in the same order on every run.
 *
 * Wiring:
 *   - reads   ARROW_MANIFESTS (config/constants.js), window.config(), state.gl
 *   - writes  window.appState.arrowScatterCache / arrowGeneDict / hasIntensity
 *   - fills   state.selectedGenes so the point layer shows every gene
 *   - worker  arrow-loader/lib/arrow-loaders.js -> streamSpotsScatter
 *   - called from src/app.js init; the return value goes to initializeGeneData
 */

import { ARROW_MANIFESTS } from '../../config/constants.js';
import { getManifest } from '../../arrow-loader/lib/arrow-manifests.js';
import { initArrow, streamSpotsScatter } from '../../arrow-loader/lib/arrow-loaders.js';
import { allocateSpotBuffers, appendShard } from './spotBuffers.js';
import { warnGenesWithoutStyle, applyScoreRangeToUI, applyIntensityRangeToUI } from './dataLoaders.js';

// File reads in flight at once. Local disk in Electron, so a small pool is enough.
const SHARD_CONCURRENCY = 4;

/**
 * Stream all spot shards into the GPU buffers at window.appState.arrowScatterCache.
 * @param {Set<string>} selectedGenes - Seeded with every gene name so spots are visible
 * @param {Function} onShard - Called as onShard(loadedRows, totalRows) after each shard is appended
 * @returns {Promise<{ shards: Object[], geneDict: Object }>} raw columns per shard and gene id -> name
 */
export async function streamSpotsIntoScatterCache(selectedGenes, onShard) {
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
    const cache = allocateSpotBuffers(window.appState.gl, manifest.total_rows);
    window.appState.arrowScatterCache = cache;
    window.appState.hasScores = true;

    const cfg = window.config();
    const img = { width: cfg.imageWidth, height: cfg.imageHeight, tileSize: 256 };
    warnGenesWithoutStyle(geneDict);

    const stats = { scoreMin: Infinity, scoreMax: -Infinity, intensityMin: Infinity, intensityMax: -Infinity, intensityFiniteCount: 0 };
    const showStats = window?.advancedConfig?.().performance?.showPerformanceStats;
    const t0 = performance.now();
    const shards = [];

    await streamSpotsScatter(
        { manifestUrl, img, concurrency: SHARD_CONCURRENCY },
        (chunk) => {
            appendShard(cache, chunk);
            accumulateStats(stats, chunk);
            shards[chunk.shardIndex] = chunk.columns;
            if (showStats) {
                console.log(`Spot stream: shard ${chunk.shardsDone}/${chunk.shardsTotal} plane=${chunk.plane} rows=${chunk.n} total=${cache.length}`);
            }
            onShard(cache.length, manifest.total_rows);
        }
    );

    applyFilterRanges(stats);
    if (showStats) {
        console.log(`Spot stream complete: points=${cache.length} in ${(performance.now() - t0).toFixed(0)}ms`);
    }
    // Empty shards send nothing, so their slots in the array were never set.
    return { shards: shards.filter(columns => columns !== undefined), geneDict };
}

async function fetchGeneDict() {
    const url = new URL(ARROW_MANIFESTS.spotsGeneDict, window.location.href).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch gene dict ${url}: ${res.status}`);
    return res.json();
}

function accumulateStats(stats, chunk) {
    stats.scoreMin = Math.min(stats.scoreMin, chunk.scoreMin);
    stats.scoreMax = Math.max(stats.scoreMax, chunk.scoreMax);
    stats.intensityMin = Math.min(stats.intensityMin, chunk.intensityMin);
    stats.intensityMax = Math.max(stats.intensityMax, chunk.intensityMax);
    stats.intensityFiniteCount += chunk.intensityFiniteCount;
}

// Slider bounds need the dataset-wide min/max, so they are only set once the
// stream has drained.
function applyFilterRanges(stats) {
    applyScoreRangeToUI(stats.scoreMin, stats.scoreMax);
    const hasIntensity = stats.intensityFiniteCount > 0;
    window.appState.hasIntensity = hasIntensity;
    if (hasIntensity) applyIntensityRangeToUI(stats.intensityMin, stats.intensityMax);
}
