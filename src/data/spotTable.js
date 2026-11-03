/**
 * Spot Table
 *
 * Every spot of the run as flat typed arrays, one entry per row, plus the rows
 * of each gene, of each cell and of each grid cell of the image. This is what the app holds instead
 * of one JavaScript object per spot: 3M spots take about 0.3 GB here against
 * 2 GB as objects, and 20M spots fit at all.
 *
 * A spot object with the usual fields (spot_id, x, y, z, plane_id, gene,
 * neighbour, neighbour_array, prob, prob_array, score, intensity,
 * is_hard_misread) is built on request by spot(row). Callers that look at one
 * gene or one cell get a few thousand objects, never millions. Callers that
 * look at every spot loop over the columns directly.
 *
 * Wiring:
 *   - built from the shard columns that src/data/spotStreamLoader.js returns
 *     (readSpotColumns in arrow-loader/workers/arrow-worker.js lists them)
 *   - kept as state.spotTable (src/state/stateManager.js)
 *   - read by the gene drawer, the charts, the icon layers, the selection
 *     tool, the cell to spot lines and the chat handlers
 */

import { listRow } from '../../arrow-loader/lib/listColumn.js';

export class SpotTable {
    /**
     * @param {Object[]} shards - raw columns per shard, in manifest order
     * @param {Object} geneDict - gene id -> gene name
     */
    constructor(shards, geneDict) {
        this.length = shards.reduce((count, shard) => count + shard.x.length, 0);
        this.x = concatColumns(shards.map(shard => shard.x));
        this.y = concatColumns(shards.map(shard => shard.y));
        this.z = concatColumns(shards.map(shard => shard.z));
        this.planeId = concatColumns(shards.map(shard => shard.plane_id));
        this.geneId = concatColumns(shards.map(shard => shard.gene_id));
        this.spotId = concatColumns(shards.map(shard => shard.spot_id));
        this.score = concatColumns(shards.map(shard => shard.omp_score));
        this.intensity = concatColumns(shards.map(shard => shard.omp_intensity));
        this.isHardMisread = concatColumns(shards.map(shard => shard.is_hard_misread));
        this.neighbours = concatLists(shards.map(shard => shard.neighbour_array));
        this.probs = concatLists(shards.map(shard => shard.neighbour_prob));

        this.geneNames = geneDict;
        this.geneCount = Math.max(...Object.keys(geneDict).map(Number)) + 1;
        this.geneRows = rowsByKey(this.geneId, this.geneCount);
        this.cellRows = rowsByKey(primaryCellOfRows(this.neighbours), maxValue(this.neighbours.values) + 1);
        this.grid = gridIndex(this.x, this.y);

        // Names of the genes with at least one spot, in gene id order.
        this.genes = [];
        this.geneIds = new Map();
        for (let id = 0; id < this.geneCount; id++) {
            if (this.geneRows.start[id + 1] === this.geneRows.start[id]) continue;
            this.genes.push(geneDict[id]);
            this.geneIds.set(geneDict[id], id);
        }
    }

    geneName(geneId) {
        return this.geneNames[geneId];
    }

    idOfGene(name) {
        return this.geneIds.get(name);
    }

    countOfGene(name) {
        return this.rowsOfGene(name).length;
    }

    /** Rows of one gene, as a view; empty for an unknown gene. */
    rowsOfGene(name) {
        const id = this.geneIds.get(name);
        if (id === undefined) return EMPTY_ROWS;
        return rowsOfKey(this.geneRows, id);
    }

    /** Rows whose first candidate cell is this label; empty for label 0, the background. */
    rowsOfCell(label) {
        if (label < 1 || label >= this.cellRows.start.length - 1) return EMPTY_ROWS;
        return rowsOfKey(this.cellRows, label);
    }

    /**
     * The rows in the grid cells that cover this box, in image pixels: every row
     * inside the box and some just outside it, so callers still test x and y.
     * The icon layer asks for its viewport this way instead of scanning all rows.
     */
    rowsNearBox(x0, y0, x1, y1) {
        const { cellWidth, cellHeight, start, rows } = this.grid;
        const left = cellOf(x0, cellWidth);
        const right = cellOf(x1, cellWidth);
        const top = cellOf(y0, cellHeight);
        const bottom = cellOf(y1, cellHeight);
        // Cells of one grid row are consecutive keys, so their rows form one run.
        let count = 0;
        for (let gridRow = top; gridRow <= bottom; gridRow++) {
            count += start[gridRow * GRID_SIDE + right + 1] - start[gridRow * GRID_SIDE + left];
        }
        const near = new Uint32Array(count);
        let filled = 0;
        for (let gridRow = top; gridRow <= bottom; gridRow++) {
            const run = rows.subarray(start[gridRow * GRID_SIDE + left], start[gridRow * GRID_SIDE + right + 1]);
            near.set(run, filled);
            filled += run.length;
        }
        return near;
    }

    /** 1 for every gene id whose name is in the set, for loops over all rows. */
    geneMask(selectedGenes) {
        const mask = new Uint8Array(this.geneCount);
        for (const name of selectedGenes) {
            const id = this.geneIds.get(name);
            if (id !== undefined) mask[id] = 1;
        }
        return mask;
    }

    /** The spot at this row as an object with the fields the panels and charts read. */
    spot(row) {
        const neighbours = listRow(this.neighbours, row);
        const probs = listRow(this.probs, row);
        return {
            spot_id: this.spotId[row],
            x: this.x[row],
            y: this.y[row],
            z: this.z[row],
            plane_id: this.planeId[row],
            gene: this.geneNames[this.geneId[row]],
            neighbour: neighbours.length > 0 ? neighbours[0] : null,
            neighbour_array: neighbours,
            prob: probs.length > 0 ? probs[0] : null,
            prob_array: probs,
            score: this.score[row],
            intensity: this.intensity[row],
            is_hard_misread: this.isHardMisread[row]
        };
    }

    spotsOfGene(name) {
        return this.spotsAt(this.rowsOfGene(name));
    }

    spotsOfCell(label) {
        return this.spotsAt(this.rowsOfCell(label));
    }

    spotsAt(rows) {
        const spots = new Array(rows.length);
        for (let i = 0; i < rows.length; i++) spots[i] = this.spot(rows[i]);
        return spots;
    }
}

const EMPTY_ROWS = new Uint32Array(0);

// The image cut into GRID_SIDE x GRID_SIDE cells over the spots' own extent.
// 256 keeps a deep-zoom viewport to a few hundred cells and the index small.
const GRID_SIDE = 256;

// Rows grouped by grid cell, key = grid row * GRID_SIDE + grid column.
function gridIndex(x, y) {
    const cellWidth = (maxValue(x) + 1) / GRID_SIDE;
    const cellHeight = (maxValue(y) + 1) / GRID_SIDE;
    const keys = new Int32Array(x.length);
    for (let row = 0; row < x.length; row++) {
        keys[row] = cellOf(y[row], cellHeight) * GRID_SIDE + cellOf(x[row], cellWidth);
    }
    return { cellWidth, cellHeight, ...rowsByKey(keys, GRID_SIDE * GRID_SIDE) };
}

// The grid cell a coordinate falls in; coordinates outside the grid land on its edge.
function cellOf(coordinate, cellSize) {
    return Math.min(GRID_SIDE - 1, Math.max(0, Math.floor(coordinate / cellSize)));
}

function concatColumns(columns) {
    const total = columns.reduce((count, column) => count + column.length, 0);
    const out = new columns[0].constructor(total);
    let offset = 0;
    for (const column of columns) {
        out.set(column, offset);
        offset += column.length;
    }
    return out;
}

// Lists come as { values, offsets } per shard (see arrow-loader/lib/listColumn.js);
// the offsets of each shard are shifted to where its values land in the whole.
function concatLists(lists) {
    const rowCount = lists.reduce((count, list) => count + list.offsets.length - 1, 0);
    const valueCount = lists.reduce((count, list) => count + list.values.length, 0);
    const values = new lists[0].values.constructor(valueCount);
    const offsets = new Int32Array(rowCount + 1);
    let row = 0;
    let valueStart = 0;
    for (const list of lists) {
        values.set(list.values, valueStart);
        for (let i = 0; i < list.offsets.length; i++) {
            offsets[row + i] = list.offsets[i] + valueStart;
        }
        row += list.offsets.length - 1;
        valueStart += list.values.length;
    }
    return { values, offsets };
}

// The first candidate cell of every row, or -1 for a row with no candidates
// and for label 0, which is the background and not a cell.
function primaryCellOfRows(neighbours) {
    const rowCount = neighbours.offsets.length - 1;
    const cell = new Int32Array(rowCount);
    for (let row = 0; row < rowCount; row++) {
        const start = neighbours.offsets[row];
        const hasCandidates = neighbours.offsets[row + 1] > start;
        const label = hasCandidates ? neighbours.values[start] : 0;
        cell[row] = label > 0 ? label : -1;
    }
    return cell;
}

function maxValue(values) {
    let max = 0;
    for (let i = 0; i < values.length; i++) if (values[i] > max) max = values[i];
    return max;
}

// Rows grouped by an integer key: one row list sorted by key, and the start of
// each key's run, so the rows of key k are rows[start[k] .. start[k + 1]).
// A counting sort, linear in the number of rows. Negative keys are left out.
function rowsByKey(keys, keyCount) {
    const start = new Uint32Array(keyCount + 1);
    for (let row = 0; row < keys.length; row++) {
        if (keys[row] >= 0) start[keys[row] + 1]++;
    }
    for (let key = 0; key < keyCount; key++) {
        start[key + 1] += start[key];
    }
    const rows = new Uint32Array(start[keyCount]);
    const next = start.slice(0, keyCount);
    for (let row = 0; row < keys.length; row++) {
        if (keys[row] >= 0) rows[next[keys[row]]++] = row;
    }
    return { start, rows };
}

function rowsOfKey(index, key) {
    return index.rows.subarray(index.start[key], index.start[key + 1]);
}
