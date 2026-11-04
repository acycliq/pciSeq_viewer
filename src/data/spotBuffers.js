/**
 * Spot Buffers
 *
 * The spot columns the point layer draws, kept on the graphics card from the
 * start. They are allocated once, at the row count of the manifest, and each
 * shard is appended as the worker decodes it, a few megabytes at a time. A
 * redraw during the load therefore sends nothing again, and the main thread
 * keeps no copy of these columns: the SpotTable holds the spots for the panels.
 *
 * deck.gl takes luma.gl Buffers as attributes by their attribute name and draws
 * them as they are (see createArrowPointCloudLayer in src/layers/spotLayerCreator.js).
 *
 * Wiring:
 *   - allocated and filled by src/data/spotStreamLoader.js, from the chunks
 *     the worker sends (buildScatterChunk in arrow-loader/workers/arrow-worker.js)
 *   - kept as window.appState.arrowScatterCache
 *   - read by src/layers/spotLayerCreator.js and tests/app/fingerprints.mjs
 *   - globals: luma (Buffer) from lib/vendor/deck.gl-8.8.27.min.js
 */

const { Buffer } = luma;

const GL_UNSIGNED_BYTE = 0x1401;
const GL_FLOAT = 0x1406;
const BYTES_PER_FLOAT = 4;

/**
 * Empty buffers for totalRows spots.
 * @param {WebGL2RenderingContext} gl - deck.gl's context, state.gl
 * @param {number} totalRows - spots in the run, from the manifest
 */
export function allocateSpotBuffers(gl, totalRows) {
    const floats = (size) => new Buffer(gl, { byteLength: totalRows * size * BYTES_PER_FLOAT, accessor: { type: GL_FLOAT, size } });
    return {
        positions: floats(3),
        geneIds: floats(1),
        planes: floats(1),
        filterPairs: floats(2), // score and intensity side by side, the filter reads both
        misreadFlags: new Buffer(gl, { byteLength: totalRows, accessor: { type: GL_UNSIGNED_BYTE, size: 1 } }),
        length: 0 // rows filled so far; deck.gl draws this many
    };
}

/** Append one decoded shard after the rows already there. */
export function appendShard(buffers, chunk) {
    const row = buffers.length;
    buffers.positions.subData({ data: chunk.positions, offset: row * 3 * BYTES_PER_FLOAT });
    buffers.geneIds.subData({ data: chunk.geneIds, offset: row * BYTES_PER_FLOAT });
    buffers.planes.subData({ data: chunk.planes, offset: row * BYTES_PER_FLOAT });
    buffers.filterPairs.subData({ data: chunk.filterPairs, offset: row * 2 * BYTES_PER_FLOAT });
    buffers.misreadFlags.subData({ data: chunk.misreadFlags, offset: row });
    buffers.length = row + chunk.n;
}
