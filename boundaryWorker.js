/**
 * Simple Boundary Data Worker
 * Loads and parses plane_XX.tsv files in background thread
 */

// Parse TSV data
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

// Parse coordinate string into array of [x, y] points
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

// Generate polygon alias for grouping (same logic as original)
function generatePolygonAlias(label) {
    if (!label) return 'unknown';
    const labelStr = label.toString().toLowerCase();
    const numericPart = parseInt(labelStr.match(/\d+/)?.[0] || '0');
    
    // Using same thresholds as original
    if (numericPart < 2000) {
        return 'group_A';
    } else if (numericPart < 4000) {
        return 'group_B';
    } else if (numericPart < 6000) {
        return 'group_C';
    } else {
        return 'group_D';
    }
}

// Process boundary data into raw format (no coordinate transformation)
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
                    alias: generatePolygonAlias(label)
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

// Main message handler
self.addEventListener('message', async function(event) {
    const { type, url, planeId } = event.data;
    
    if (type === 'loadBoundaryData') {
        try {
            console.log(`Boundary Worker: Loading plane ${planeId} from`, url);
            
            // Fetch the TSV file
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const text = await response.text();
            
            // Parse and process the data
            const rawData = parseTSV(text);
            const geojson = processBoundaryData(rawData, planeId);
            
            console.log(`Boundary Worker: Processed plane ${planeId} with ${geojson.features.length} polygons`);
            
            // Send back to main thread
            self.postMessage({
                type: 'success',
                planeId: planeId,
                data: geojson
            });
            
        } catch (error) {
            console.error(`Boundary Worker: Error loading plane ${planeId}:`, error);
            self.postMessage({
                type: 'error',
                planeId: planeId,
                error: error.message
            });
        }
    }
});

console.log('Boundary Worker: Ready');