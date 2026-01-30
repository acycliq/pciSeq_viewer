// Diagnostics module - extracted from main.js
const { ipcMain, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Module state (same style as main.js)
let diagnosticsDb = null;
let diagnosticsMeta = null;
let diagnosticsSetupWindow = null;

// References from main.js (set via init)
let mainWindow = null;
let store = null;

function init(mw, st) {
  mainWindow = mw;
  store = st;
}

function softmaxJS(arr) {
  const max = Math.max(...arr);
  const exps = arr.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}

// Helper: Parse metadata value (JSON array, number, or string)
function parseMetadataValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    const num = Number(value);
    return isNaN(num) ? value : num;
  }
}

function openDiagnosticsDatabase(dbPath) {
  if (diagnosticsDb) {
    try { diagnosticsDb.close(); } catch {}
  }
  diagnosticsDb = new Database(dbPath, { readonly: true, fileMustExist: true });

  const metaRows = diagnosticsDb.prepare('SELECT key, value FROM metadata').all();
  diagnosticsMeta = {};
  for (const row of metaRows) {
    diagnosticsMeta[row.key] = parseMetadataValue(row.value);
  }

  console.log('Diagnostics DB loaded. nC=%d, nS=%d', diagnosticsMeta.nC, diagnosticsMeta.nS);
  return diagnosticsMeta;
}

function closeDiagnosticsDatabase() {
  if (diagnosticsDb) {
    try { diagnosticsDb.close(); } catch {}
    diagnosticsDb = null;
  }
  diagnosticsMeta = null;
}

function broadcastDiagnosticsState(enabled) {
  if (!mainWindow) return;

  if (enabled && diagnosticsMeta) {
    // Send state for check_cell
    mainWindow.webContents.send('check-cell-state', {
      enabled: true,
      classes: diagnosticsMeta.class_names || [],
      nC: diagnosticsMeta.nC,
      nG: diagnosticsMeta.nG,
      nK: diagnosticsMeta.nK
    });

    // Send state for check_spot
    mainWindow.webContents.send('check-spot-state', {
      enabled: true,
      nS: diagnosticsMeta.nS,
      nN: diagnosticsMeta.nN
    });
  } else {
    mainWindow.webContents.send('check-cell-state', { enabled: false });
    mainWindow.webContents.send('check-spot-state', { enabled: false });
  }
}

function openDiagnosticsSetup() {
  if (diagnosticsSetupWindow) {
    diagnosticsSetupWindow.focus();
    return;
  }

  diagnosticsSetupWindow = new BrowserWindow({
    width: 480,
    height: 280,
    parent: mainWindow,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'diagnostics-preload.js')
    },
    title: 'Diagnostics Setup',
    autoHideMenuBar: true
  });

  diagnosticsSetupWindow.loadFile(path.join(__dirname, 'diagnostics-setup.html'));
  diagnosticsSetupWindow.on('closed', () => { diagnosticsSetupWindow = null; });
}

// === IPC Handlers ===

ipcMain.handle('diagnostics-get-config', () => {
  return {
    path: store.get('diagnosticsPath', store.get('checkCellPath', '')),
    enabled: !!(diagnosticsDb && diagnosticsMeta)
  };
});

ipcMain.handle('diagnostics-save-config', (event, config) => {
  if (!config.path) return { success: false, error: 'Path is required' };
  const dbPath = path.join(config.path, 'diagnostics.db');
  if (!fs.existsSync(dbPath)) return { success: false, error: 'diagnostics.db not found' };

  try {
    openDiagnosticsDatabase(dbPath);
    store.set('diagnosticsPath', config.path);
    store.set('checkCellPath', config.path);
    store.set('checkSpotPath', config.path);
    broadcastDiagnosticsState(true);
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Failed to open database: ' + e.message };
  }
});

ipcMain.handle('diagnostics-set-enabled', (event, enabled) => {
  try {
    if (enabled) {
      const dir = store.get('diagnosticsPath', store.get('checkCellPath', ''));
      if (!dir) return { success: false, error: 'No diagnostics path configured' };
      const dbPath = path.join(dir, 'diagnostics.db');
      if (!fs.existsSync(dbPath)) return { success: false, error: 'diagnostics.db not found' };

      openDiagnosticsDatabase(dbPath);
      broadcastDiagnosticsState(true);
    } else {
      closeDiagnosticsDatabase();
      broadcastDiagnosticsState(false);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('diagnostics-browse-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select Diagnostics Folder' });
  return (!result.canceled && result.filePaths.length > 0) ? result.filePaths[0] : null;
});

ipcMain.handle('diagnostics-close-setup', () => {
  if (diagnosticsSetupWindow) diagnosticsSetupWindow.close();
});

ipcMain.handle('check-spot-binary-query', async (event, { spotId }) => {
  if (!diagnosticsMeta || !diagnosticsDb) {
    return { success: false, error: 'diagnostics data not loaded' };
  }
  try {
    const { gene_panel, label_map, misread_density, nN } = diagnosticsMeta;
    const row = diagnosticsDb.prepare('SELECT gene_idx, x, y, z, neighbor_cell_ids, mvn_loglik, attention, expr_fluct FROM spots WHERE spot_id = ?').get(spotId);
    if (!row) return { success: false, error: 'Spot not found in database: ' + spotId };

    // 1. Strict Gene Resolution
    if (!Array.isArray(gene_panel)) throw new Error('Incomplete database: gene_panel metadata missing');
    const geneIdx = row.gene_idx;
    if (geneIdx < 0 || geneIdx >= gene_panel.length) throw new Error(`Invalid gene index ${geneIdx} for spot ${spotId}`);
    const geneName = gene_panel[geneIdx];

    // 2. Strict Neighbor Data
    const neighIdsFull = JSON.parse(row.neighbor_cell_ids || '[]');
    if (!neighIdsFull.length) throw new Error(`No neighbors found for spot ${spotId}`);

    // Excludes the last entry (corresponds to the background).
    // Safe to remove the last element as the background is always at the end.
    const n = neighIdsFull.length - 1;
    if (n < 0) throw new Error(`Malformed neighbor data for spot ${spotId}`);
    const neighIds = neighIdsFull.slice(0, n);

    // 3. Strict Buffer Decoding
    if (!row.mvn_loglik || !row.attention || !row.expr_fluct) throw new Error(`Missing score buffers for spot ${spotId}`);
    const mvn = new Float32Array(row.mvn_loglik.buffer, row.mvn_loglik.byteOffset, n);
    const attn = new Float32Array(row.attention.buffer, row.attention.byteOffset, n);
    const expr = new Float32Array(row.expr_fluct.buffer, row.expr_fluct.byteOffset, n);

    // 4. Strict Label Mapping
    let neighborLabels = neighIds.map(id => id);
    if (label_map && Object.keys(label_map).length > 0) {
      const reverse = {};
      for (const [ext, inter] of Object.entries(label_map)) reverse[inter] = ext;

      neighborLabels = neighIds.map(id => {
          if (reverse[id] === undefined) throw new Error(`Data inconsistency: Internal cell ID ${id} not found in label_map`);
          return Number(reverse[id]);
      });
    }

    // 5. Strict Misread Density
    if (!misread_density || !(geneName in misread_density)) {
        throw new Error(`Statistical parameter missing: misread_density for gene '${geneName}' not found`);
    }
    const misreadVal = Math.log(misread_density[geneName]);

    // 6. Probability Calculation
    const scores = new Array(n + 1);
    for (let i = 0; i < n; i++) scores[i] = mvn[i] + attn[i] + expr[i];
    scores[n] = misreadVal;

    const probabilities = softmaxJS(scores);

    const labels = neighborLabels.map(cid => `Cell ${cid}`).concat(['Misread']);
    return {
      success: true,
      spotId,
      geneName,
      x: row.x, y: row.y, z: row.z,
      neighborLabels: labels,
      mvn: Array.from(mvn),
      attention: Array.from(attn),
      exprFluct: Array.from(expr),
      misread: misreadVal,
      scores,
      probabilities
    };
  } catch (e) {
    console.error('check_spot query failed:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('check-cell-binary-query', async (event, { cellId, userClass, topN = 10 }) => {
  if (!diagnosticsMeta || !diagnosticsDb) {
    return { success: false, error: 'diagnostics data not loaded' };
  }

  const { nC, nG, nK, rSpot, SpotReg, class_names, gene_panel, label_map, eta_bar, mean_gene_reads_per_class } = diagnosticsMeta;

  // Map external cell ID to internal index
  let c = cellId;
  if (label_map && Object.keys(label_map).length > 0) {
    const mapped = label_map[String(cellId)];
    if (mapped === undefined) {
      return { success: false, error: 'Cell ID not found: ' + cellId };
    }
    c = mapped;
  }

  if (c < 0 || c >= nC) {
    return { success: false, error: 'Cell index out of range: ' + c };
  }

  const userIdx = class_names.indexOf(userClass);
  if (userIdx === -1) {
    return { success: false, error: 'Unknown class: ' + userClass };
  }

  try {
    // Query SQLite for this cell's data
    const row = diagnosticsDb.prepare('SELECT scaled_means, theta_bar, gene_count, class_prob FROM cells WHERE cell_id = ?').get(c);
    if (!row) {
      return { success: false, error: 'Cell not found in database: ' + c };
    }

    // Convert BLOBs to Float32Arrays
    const scaledMeans = new Float32Array(row.scaled_means.buffer, row.scaled_means.byteOffset, nG * nK);
    const thetaBar = new Float32Array(row.theta_bar.buffer, row.theta_bar.byteOffset, nK);
    const geneCount = new Float32Array(row.gene_count.buffer, row.gene_count.byteOffset, nG);
    const classProb = new Float32Array(row.class_prob.buffer, row.class_prob.byteOffset, nK);

    // Find assigned class (argmax of classProb)
    let assignedIdx = 0;
    for (let k = 1; k < nK; k++) {
      if (classProb[k] > classProb[assignedIdx]) assignedIdx = k;
    }
    const assignedClass = class_names[assignedIdx];

    // Compute log-likelihood contributions
    const contr = new Float32Array(nG * nK);
    for (let g = 0; g < nG; g++) {
      for (let k = 0; k < nK; k++) {
        const idx = g * nK + k;
        const scaledExp = scaledMeans[idx] * eta_bar[g] * thetaBar[k] + SpotReg;
        const pNegBin = scaledExp / (rSpot + scaledExp);
        contr[idx] = geneCount[g] * Math.log(pNegBin) + rSpot * Math.log(1 - pNegBin);
      }
    }

    // Compute difference between assigned and user class
    const diff = new Float32Array(nG);
    for (let g = 0; g < nG; g++) {
      diff[g] = contr[g * nK + assignedIdx] - contr[g * nK + userIdx];
    }

    // Find top N and bottom N genes by difference
    const indices = Array.from({ length: nG }, (_, i) => i);
    indices.sort((a, b) => diff[b] - diff[a]);
    const topGenes = indices.slice(0, topN);
    const bottomGenes = indices.slice(-topN).reverse();

    // Calculate sums for display
    let topSum = 0, bottomSum = 0;
    topGenes.forEach(g => topSum += diff[g]);
    bottomGenes.forEach(g => bottomSum += diff[g]);

    // Build result data for the charts and tables
    const topData = topGenes.map(g => ({
      gene: gene_panel[g],
      diff: diff[g],
      geneCount: geneCount[g],
      meanAssigned: mean_gene_reads_per_class[g][assignedIdx],
      meanUser: mean_gene_reads_per_class[g][userIdx]
    }));

    const bottomData = bottomGenes.map(g => ({
      gene: gene_panel[g],
      diff: diff[g],
      geneCount: geneCount[g],
      meanAssigned: mean_gene_reads_per_class[g][assignedIdx],
      meanUser: mean_gene_reads_per_class[g][userIdx]
    }));

    // All genes sorted by diff (descending) for the full tables
    // Include individual log-likelihood contributions for each class
    const allData = indices.map(g => ({
      gene: gene_panel[g],
      diff: diff[g],
      geneCount: geneCount[g],
      meanAssigned: mean_gene_reads_per_class[g][assignedIdx],
      meanUser: mean_gene_reads_per_class[g][userIdx],
      contrAssigned: contr[g * nK + assignedIdx],
      contrUser: contr[g * nK + userIdx]
    }));

    return {
      success: true,
      cellId,
      assignedClass,
      userClass,
      topData,
      bottomData,
      allData,
      topSum,
      bottomSum,
      topN
    };
  } catch (err) {
    return { success: false, error: 'Query failed: ' + err.message };
  }
});

// Get current check_cell state (called by renderer on startup)
ipcMain.handle('check-cell-get-state', () => {
  if (diagnosticsDb && diagnosticsMeta) {
    return {
      enabled: true,
      classes: diagnosticsMeta.class_names || [],
      nC: diagnosticsMeta.nC,
      nG: diagnosticsMeta.nG,
      nK: diagnosticsMeta.nK
    };
  }
  return { enabled: false };
});

// Get current check_spot state (called by renderer on startup)
ipcMain.handle('check-spot-get-state', () => {
  if (diagnosticsDb && diagnosticsMeta) {
    return { enabled: true, nS: diagnosticsMeta.nS, nN: diagnosticsMeta.nN };
  }
  return { enabled: false };
});

module.exports = {
  init,
  openDiagnosticsDatabase,
  closeDiagnosticsDatabase,
  broadcastDiagnosticsState,
  openDiagnosticsSetup
};
