// Small helpers to decode Arrow IPC buffers and extract columns
// Note: tableFromIPC is imported inside the worker (ESM). This module provides pure helpers.

export function getTypedColumn(table, name) {
  const col = table.getChild(name);
  if (!col) return null;
  if (col.data.length === 1) return col.data[0].values; // zero-copy view
  const total = col.length;
  const sample = col.data[0].values;
  const Ctor = sample.constructor;
  const out = new Ctor(total);
  let off = 0;
  for (const chunk of col.data) {
    const v = chunk.values;
    out.set(v, off);
    off += v.length;
  }
  return out;
}

export function getListColumn(table, name) {
  // Returns an array of Arrow vectors (list elements). Consumer can toArray() per item if needed.
  const col = table.getChild(name);
  if (!col) return [];
  const out = [];
  for (let i = 0; i < col.length; i++) {
    out.push(col.get(i));
  }
  return out;
}

