/**
 * Arrow list columns as flat arrays.
 *
 * Arrow stores a list column as one flat values array plus an offsets array:
 * row i is values[offsets[i] .. offsets[i + 1]). Keeping that shape means a
 * column crosses the worker boundary as two typed arrays instead of millions
 * of small ones, and a row costs one subarray call wherever it is read.
 *
 * Used by:
 *   - arrow-loader/workers/arrow-worker.js  reads the columns from a table
 *   - src/data/dataLoaders.js               slices rows for the per-spot objects
 */

/**
 * Read a list column as { values, offsets }. Chunks are concatenated.
 * @param {import('apache-arrow').Table} table
 * @param {string} name - column name
 * @returns {{ values: TypedArray, offsets: Int32Array } | null} null when the column is absent
 */
export function readListColumn(table, name) {
  const col = table.getChild(name);
  if (!col) return null;
  // An empty shard has one chunk with no child values, so empty chunks are left out.
  const chunks = col.data.filter(chunk => chunk.length > 0);
  const ValuesArray = col.type.children[0].type.ArrayType;

  let rowCount = 0;
  let valueCount = 0;
  for (const chunk of chunks) {
    rowCount += chunk.length;
    valueCount += chunk.valueOffsets[chunk.length] - chunk.valueOffsets[0];
  }

  const values = new ValuesArray(valueCount);
  const offsets = new Int32Array(rowCount + 1);
  let row = 0;
  let valueStart = 0;
  for (const chunk of chunks) {
    const chunkOffsets = chunk.valueOffsets;
    const chunkValues = chunk.children[0].values;
    values.set(chunkValues.subarray(chunkOffsets[0], chunkOffsets[chunk.length]), valueStart);
    // The chunk's offsets point into its own values; shift them to the concatenated array.
    const shift = valueStart - chunkOffsets[0];
    for (let i = 0; i <= chunk.length; i++) {
      offsets[row + i] = chunkOffsets[i] + shift;
    }
    row += chunk.length;
    valueStart += chunkOffsets[chunk.length] - chunkOffsets[0];
  }
  return { values, offsets };
}

/**
 * One row of a list column read with readListColumn, as a view into its values.
 * @param {{ values: TypedArray, offsets: Int32Array }} list
 * @param {number} i - row index
 * @returns {TypedArray}
 */
export function listRow(list, i) {
  return list.values.subarray(list.offsets[i], list.offsets[i + 1]);
}
