/**
 * Metadata Error Display Module
 * Handles displaying the error screen when dataset metadata is missing or invalid
 */

import { showScreen } from './uiHelpers.js';

/**
 * Show the error screen.
 *
 * Two modes:
 *   - metadataResult given: a metadata-specific failure. Show the per-field
 *     present/missing table and the "how to fix" (voxel size) help.
 *   - metadataResult null: a generic init failure (worker crash, fetch/parse
 *     error). The field table would be misleading (everything "missing"), so
 *     show the actual error text instead.
 *
 * @param {Object|null} metadataResult - result from window.loadDatasetMetadata(), or null
 * @param {string} errorMessage - the underlying error, shown to the user in generic mode
 */
export function showMetadataError(metadataResult, errorMessage) {
    showScreen('metadataErrorState');

    const titleEl = document.getElementById('metadataErrorTitle');
    const subtitleEl = document.getElementById('metadataErrorSubtitle');
    const messageEl = document.getElementById('metadataErrorMessage');
    const errorDetails = document.getElementById('metadataErrorDetails');
    const helpEl = document.getElementById('metadataErrorHelp');
    const isMetadataFailure = !!metadataResult;

    if (titleEl) titleEl.textContent = isMetadataFailure ? 'Missing Dataset Metadata' : 'Could Not Load Dataset';
    if (subtitleEl) subtitleEl.textContent = isMetadataFailure
        ? 'The MBTiles file is missing required information'
        : 'The viewer hit an error while loading this dataset';
    if (helpEl) helpEl.style.display = isMetadataFailure ? '' : 'none';

    // Generic failures: show the real error (textContent, so it is never parsed as HTML)
    if (messageEl) {
        messageEl.textContent = isMetadataFailure ? '' : (errorMessage || 'Unknown error');
        messageEl.style.display = isMetadataFailure ? 'none' : '';
    }

    // Build details table showing which fields are present/missing (metadata mode only)
    if (errorDetails) {
        if (!isMetadataFailure) {
            errorDetails.innerHTML = '';
            errorDetails.style.display = 'none';
        } else {
            errorDetails.style.display = '';
            const fields = [
                { label: 'Image Width', value: metadataResult?.imageWidth },
                { label: 'Image Height', value: metadataResult?.imageHeight },
                { label: 'Plane Count', value: metadataResult?.planeCount },
                { label: 'Voxel Size', value: metadataResult?.voxelSize ? JSON.stringify(metadataResult.voxelSize) : null }
            ];

            errorDetails.innerHTML = fields.map(field => {
                const isOk = field.value !== null && field.value !== undefined;
                return `
                    <div class="error-field">
                        <span class="field-status ${isOk ? 'ok' : 'missing'}">${isOk ? 'OK' : 'X'}</span>
                        <span class="field-name">${field.label}</span>
                        <span class="field-value">${isOk ? field.value : 'missing'}</span>
                    </div>
                `;
            }).join('');
        }
    }

    // Setup button handlers
    const openBtn = document.getElementById('metadataErrorOpenBtn');
    const closeBtn = document.getElementById('metadataErrorCloseBtn');

    if (openBtn) {
        openBtn.onclick = async () => {
            const result = await window.electronAPI.selectDataFolder();
            if (result.success) window.location.reload();
        };
    }

    if (closeBtn) {
        closeBtn.onclick = () => window.location.reload();
    }

    console.error('Metadata error displayed:', errorMessage);
}