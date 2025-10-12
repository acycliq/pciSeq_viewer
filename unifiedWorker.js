/**
 * Unified Data Worker
 * Handles loading and parsing of all TSV data types (genes, cells, boundaries) in background thread
 */

// === SHARED TSV PARSING ===
function parseTSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split('\t');
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('\t');
        const row = {};

        for (let j = 0; j < headers.length; j++) {
            const header = headers[j].trim();
            const value = values[j] ? values[j].trim() : '';
            row[header] = value;
        }

        data.push(row);
    }

    return data;
}

// === GENE DATA PROCESSING ===
function processGeneData(rawData) {
    const geneMap = new Map();
    let processedCount = 0;
    let skippedCount = 0;
    let hasValidScores = false;

    rawData.forEach((row, rowIndex) => {
        try {
            const gene = row.gene_name;
            const spot = {
                x: parseFloat(row.x),
                y: parseFloat(row.y),
                z: parseFloat(row.z),
                gene: gene,
                plane_id: parseInt(row.plane_id),
                // Add spot_id as row position in geneData.tsv
                spot_id: rowIndex,
                // Parse neighbour and probability fields properly
                neighbour_array: row.neighbour_array ? JSON.parse(row.neighbour_array) : null,
                prob_array: row.neighbour_prob ? JSON.parse(row.neighbour_prob) : null,
                // Add score and intensity fields
                score: row.omp_score ? parseFloat(row.omp_score) : null,
                intensity: row.omp_intensity ? parseFloat(row.omp_intensity) : null
            };

            // Check if this spot has a valid score for hasScores flag
            if (spot.score !== null && !isNaN(spot.score)) {
                hasValidScores = true;
            }

            // Add derived fields for most likely parent (position 0)
            if (spot.neighbour_array && spot.neighbour_array.length > 0) {
                spot.neighbour = spot.neighbour_array[0]; // Most likely parent cell
            }
            if (spot.prob_array && spot.prob_array.length > 0) {
                spot.prob = spot.prob_array[0]; // Probability for most likely parent
            }

            // Skip invalid data
            if (isNaN(spot.x) || isNaN(spot.y) || isNaN(spot.z)) {
                skippedCount++;
                return;
            }

            if (!geneMap.has(gene)) {
                geneMap.set(gene, []);
            }

            geneMap.get(gene).push(spot);
            processedCount++;

        } catch (error) {
            console.warn('Error processing gene row:', error);
            skippedCount++;
        }
    });

    // Convert map to array format
    const geneData = Array.from(geneMap.entries()).map(([gene, spots]) => ({
        gene,
        spots
    }));

    console.log(`Gene Worker: Processed ${processedCount} spots for ${geneData.length} genes (skipped ${skippedCount})`);
    console.log(`Gene Worker: Dataset has valid scores: ${hasValidScores}`);

    return {
        geneData: geneData,
        hasScores: hasValidScores
    };
}

// === CELL DATA PROCESSING ===
function parseArrayString(str) {
    try {
        if (!str || str === '') return [];

        // Handle Python-style arrays with single quotes
        const cleaned = str.replace(/'/g, '"').replace(/\[|\]/g, '');

        if (cleaned.trim() === '') return [];

        // Split by comma and clean up
        return cleaned.split(',').map(item => {
            const trimmed = item.trim().replace(/"/g, '');

            // CRITICAL FIX: Don't convert cell class names to numbers!
            // Cell class names like "016 CA1-ProS Glut" should stay as strings.
            // Only parse pure numbers (no spaces/letters) to avoid truncation.
            // parseFloat("016 CA1-ProS Glut") = 16 (WRONG!)
            if (/^\d+(\.\d+)?$/.test(trimmed)) {
                // Pure number - safe to parse
                const num = parseFloat(trimmed);
                return isNaN(num) ? trimmed : num;
            } else {
                // Contains letters/spaces - keep as string
                return trimmed;
            }
        });

    } catch (error) {
        console.warn('Error parsing array string:', str, error);
        return [];
    }
}

function processCellData(rawData) {
    const cells = [];
    let processedCount = 0;
    let skippedCount = 0;

    rawData.forEach(row => {
        try {
            const cellNum = parseInt(row.Cell_Num);

            if (isNaN(cellNum)) {
                skippedCount++;
                return;
            }

            const cell = {
                cellNum: cellNum,

                // Position data
                position: {
                    x: parseFloat(row.X),
                    y: parseFloat(row.Y),
                    z: parseFloat(row.Z)
                },

                // Gene expression data
                geneExpression: {
                    geneNames: parseArrayString(row.Genenames),
                    geneCounts: parseArrayString(row.CellGeneCount)
                },

                // Classification data
                classification: {
                    className: parseArrayString(row.ClassName),
                    probability: parseArrayString(row.Prob)
                }
            };

            // Validate position data
            if (isNaN(cell.position.x) || isNaN(cell.position.y) || isNaN(cell.position.z)) {
                console.warn(`Invalid position for cell ${cellNum}`);
                skippedCount++;
                return;
            }

            // Add convenience properties
            cell.totalGeneCount = cell.geneExpression.geneCounts.reduce((sum, count) => sum + count, 0);
            cell.uniqueGenes = cell.geneExpression.geneNames.length;
            cell.primaryClass = cell.classification.className.length > 0 ? cell.classification.className[0] : 'Unknown';
            cell.primaryProb = cell.classification.probability.length > 0 ? cell.classification.probability[0] : 0;

            cells.push(cell);
            processedCount++;

        } catch (error) {
            console.warn('Error processing cell row:', error);
            skippedCount++;
        }
    });

    console.log(`Cell Worker: Processed ${processedCount} cells (skipped ${skippedCount})`);
    return cells;
}

// === BOUNDARY DATA PROCESSING ===
function parseCoordinates(coordString) {
    try {
        // Handle coordinate format: "[[x1, y1], [x2, y2], ...]"
        const cleaned = coordString.replace(/^\[\[|\]\]$/g, '');
        const pairs = cleaned.split('], [');

        const coordinates = pairs.map(pair => {
            const [x, y] = pair.replace(/[\[\]]/g, '').split(', ').map(coord => parseFloat(coord.trim()));

            if (isNaN(x) || isNaN(y)) {
                throw new Error(`Invalid coordinate pair: ${pair}`);
            }

            return [x, y];
        });

        // Ensure polygon is closed (first point equals last point)
        if (coordinates.length > 0) {
            const first = coordinates[0];
            const last = coordinates[coordinates.length - 1];

            if (first[0] !== last[0] || first[1] !== last[1]) {
                coordinates.push([first[0], first[1]]);
            }
        }

        return coordinates;

    } catch (error) {
        console.warn('Error parsing coordinates:', coordString, error);
        return [];
    }
}

// Cell class assignment will be done in main thread where cellData is available

function processBoundaryData(rawData, planeId) {
    const features = [];
    let processedCount = 0;
    let skippedCount = 0;

    rawData.forEach(row => {
        try {
            const label = row.label ? parseInt(row.label) : null;
            const coords = parseCoordinates(row.coords);

            if (coords.length < 3) {
                // Need at least 3 points for a valid polygon
                skippedCount++;
                return;
            }

            const feature = {
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [coords] // Raw coordinates - will be transformed in main thread
                },
                properties: {
                    label: label,
                    plane_id: planeId,
                    cellClass: null // Will be assigned in main thread
                }
            };

            features.push(feature);
            processedCount++;

        } catch (error) {
            console.warn('Error processing boundary row:', error);
            skippedCount++;
        }
    });

    console.log(`Boundary Worker: Processed ${processedCount} polygons for plane ${planeId} (skipped ${skippedCount})`);

    const geojson = {
        type: 'FeatureCollection',
        features: features
    };

    return geojson;
}

// === MAIN MESSAGE HANDLER ===
self.addEventListener('message', async function(event) {
    const { type, url, planeId } = event.data;

    try {
        console.log(`Unified Worker: Processing ${type} from`, url);

        // Fetch the TSV file
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();
        const rawData = parseTSV(text);

        let processedData;
        let resultType;

        // Process based on data type
        switch (type) {
            case 'loadGeneData':
                processedData = processGeneData(rawData);
                resultType = 'geneData';
                break;

            case 'loadCellData':
                processedData = processCellData(rawData);
                resultType = 'cellData';
                break;

            case 'loadBoundaryData':
                processedData = processBoundaryData(rawData, planeId);
                resultType = 'boundaryData';
                break;

            default:
                throw new Error(`Unknown data type: ${type}`);
        }

        console.log(`Unified Worker: Successfully processed ${type}`);

        // Send back to main thread
        self.postMessage({
            type: 'success',
            dataType: resultType,
            data: processedData,
            planeId: planeId // Include for boundary data
        });

    } catch (error) {
        console.error(`Unified Worker: Error processing ${type}:`, error);
        self.postMessage({
            type: 'error',
            dataType: type,
            error: error.message,
            planeId: planeId
        });
    }
});

console.log('Unified Worker: Ready to process genes, cells, and boundaries');