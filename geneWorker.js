/**
 * Simple Gene Data Worker
 * Loads and parses geneData.tsv in background thread
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

// Process gene data into the format expected by the main app
function processGeneData(rawData) {
    const geneMap = new Map();
    
    rawData.forEach(row => {
        try {
            const gene = row.gene_name;
            const spot = {
                x: parseFloat(row.x),
                y: parseFloat(row.y),
                z: parseFloat(row.z),
                gene: gene,
                plane_id: parseInt(row.plane_id)
            };
            
            // Skip invalid data
            if (isNaN(spot.x) || isNaN(spot.y) || isNaN(spot.z)) {
                return;
            }
            
            if (!geneMap.has(gene)) {
                geneMap.set(gene, []);
            }
            
            geneMap.get(gene).push(spot);
            
        } catch (error) {
            console.warn('Error processing gene row:', error);
        }
    });
    
    // Convert Map to Array for transfer
    return Array.from(geneMap.entries()).map(([gene, spots]) => ({
        gene,
        spots
    }));
}

// Main message handler
self.addEventListener('message', async function(event) {
    const { type, url } = event.data;
    
    if (type === 'loadGeneData') {
        try {
            console.log('Gene Worker: Loading from', url);
            
            // Fetch the TSV file
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const text = await response.text();
            
            // Parse and process the data
            const rawData = parseTSV(text);
            const processedData = processGeneData(rawData);
            
            console.log(`Gene Worker: Processed ${processedData.length} genes`);
            
            // Send back to main thread
            self.postMessage({
                type: 'success',
                data: processedData
            });
            
        } catch (error) {
            console.error('Gene Worker: Error loading data:', error);
            self.postMessage({
                type: 'error',
                error: error.message
            });
        }
    }
});

console.log('Gene Worker: Ready');