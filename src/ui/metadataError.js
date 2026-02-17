/**
 * Metadata Error Display Module
 * Handles displaying the error screen when dataset metadata is missing or invalid
 */

/**
 * Show the metadata error screen with details about missing fields
 * @param {Object} metadataResult - The result from window.loadDatasetMetadata()
 * @param {string} errorMessage - Error message to log
 */
export function showMetadataError(metadataResult, errorMessage) {
    // Hide loading curtain
    const curtain = document.getElementById('appCurtain');
    if (curtain) {
        curtain.classList.add('hidden');
    }

    // Hide loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }

    // Show metadata error screen
    const errorScreen = document.getElementById('metadataErrorState');
    const errorDetails = document.getElementById('metadataErrorDetails');

    if (errorScreen) {
        errorScreen.classList.remove('hidden');

        // Build details table showing which fields are present/missing
        if (errorDetails) {
            const fields = [
                { name: 'width', label: 'Image Width', value: metadataResult?.imageWidth },
                { name: 'height', label: 'Image Height', value: metadataResult?.imageHeight },
                { name: 'plane_count', label: 'Plane Count', value: metadataResult?.planeCount },
                { name: 'voxel_size', label: 'Voxel Size', value: metadataResult?.voxelSize ? JSON.stringify(metadataResult.voxelSize) : null }
            ];

            let html = '';
            fields.forEach(field => {
                const isOk = field.value !== null && field.value !== undefined;
                const statusClass = isOk ? 'ok' : 'missing';
                const statusIcon = isOk ? 'OK' : 'X';
                const valueDisplay = isOk ? field.value : 'missing';

                html += `
                    <div class="error-field">
                        <span class="field-status ${statusClass}">${statusIcon}</span>
                        <span class="field-name">${field.label}</span>
                        <span class="field-value">${valueDisplay}</span>
                    </div>
                `;
            });

            errorDetails.innerHTML = html;
        }

        // Setup button handlers
        const openBtn = document.getElementById('metadataErrorOpenBtn');
        const closeBtn = document.getElementById('metadataErrorCloseBtn');

        if (openBtn) {
            openBtn.addEventListener('click', async () => {
                const result = await window.electronAPI.selectDataFolder();
                if (result.success) {
                    window.location.reload();
                }
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', async () => {
                // Close the dataset and reload to welcome screen
                window.location.reload();
            });
        }
    }

    console.error('Metadata error displayed:', errorMessage);
}
