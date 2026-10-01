// export_table: the rows of a data tool written to a CSV the user saves.
//
// The tool is run again here and its rows go straight to the file, so the model
// never copies a number: a long list it typed out could be cut short or misquoted.
// Nothing is written without the user picking the place in a Save dialog.

// what can be exported, where each tool keeps its rows, and what to ask for so a
// list the chat would cut short comes back whole
const EXPORTABLE = {
  spots_of_cell: { rows: 'spots' },
  spots_in_cell: { rows: 'per_gene' },
  cell_counts: { rows: 'per_gene' },
  class_counts: { rows: 'classes' },
  find_cells: { rows: 'cells', all: { n: Infinity } },
  spots_of_class: { rows: 'spots', all: { limit: Infinity } },
};

// numbers to 7 significant digits: the values come from float32 files, so the digits
// beyond that are noise (0.997 is stored as 0.996999979...)
const cell = v => {
  if (v == null) return '';
  if (typeof v === 'number' && !Number.isInteger(v)) return String(Number(v.toPrecision(7)));
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

// the columns are the keys in the order they first appear
function toCsv(rows) {
  const columns = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
  const lines = [columns.join(',')].concat(rows.map(r => columns.map(c => cell(r[c])).join(',')));
  return { csv: lines.join('\n') + '\n', columns };
}

// a file name from the model's suggestion, letters, digits, - and _ only
const fileName = s => (String(s || 'pciseq_table').replace(/\.csv$/i, '').replace(/[^\w-]+/g, '_') || 'pciseq_table') + '.csv';

// deps: call (the tool dispatcher), saveDialog (name -> path or null), writeFile
async function exportTable({ tool, args, suggested_name }, { call, saveDialog, writeFile }) {
  const spec = EXPORTABLE[tool];
  if (!spec) {
    return { error: `${tool} cannot be exported; these can: ${Object.keys(EXPORTABLE).join(', ')}` };
  }
  const res = await call(tool, { ...(args || {}), ...(spec.all || {}) });
  if (res && res.error) return { error: res.error };
  const rows = res && res[spec.rows];
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'nothing to export, the tool returned no rows' };

  const file = await saveDialog(fileName(suggested_name));
  if (!file) return { done: false, note: 'the user cancelled the save, nothing was written' };
  const { csv, columns } = toCsv(rows);
  writeFile(file, csv);
  const about = Object.entries(res).filter(([k]) => /_are$|_is$/.test(k)).map(([, v]) => v);
  return { done: true, file, rows: rows.length, columns, rows_are: about.join('; ') || null };
}

module.exports = { exportTable, toCsv, EXPORTABLE };
