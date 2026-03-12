/**
 * Metadata Error Display Module
 * Handles displaying the error screen when dataset metadata is missing or invalid
 */

import { showScreen } from './uiHelpers.js';

/**
 * Show the metadata error screen with details about missing fields
 * @param {Object} metadataResult - The result from window.loadDatasetMetadata()
 * @param {string} errorMessage - Error message to log
 */
export function showMetadataError(metadataResult, errorMessage) {
    showScreen('metadataErrorState');

    // Build details table showing which fields are present/missing
    const errorDetails = document.getElementById('metadataErrorDetails');
    if (errorDetails) {
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