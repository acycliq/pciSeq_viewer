/**
 * Biological Data 3D Viewer Application
 * Main application logic extracted from bio-demo.html
 */

// Gene color mapping function using glyph configuration
function getGeneColor(geneName) {
    // Use glyph configuration if available
    if (typeof glyphSettings === 'function') {
        const settings = glyphSettings();
        const geneSetting = settings.find(s => s.gene === geneName);
        
        if (geneSetting && geneSetting.color) {
            // Convert hex color to RGB array
            const hex = geneSetting.color.replace('#', '');
            return [
                parseInt(hex.substr(0, 2), 16),
                parseInt(hex.substr(2, 2), 16),
                parseInt(hex.substr(4, 2), 16)
            ];
        }
    }
    
    // Try to get from parent window's glyph configuration
    if (window.opener && typeof window.opener.glyphSettings === 'function') {
        const settings = window.opener.glyphSettings();
        const geneSetting = settings.find(s => s.gene === geneName);
        
        if (geneSetting && geneSetting.color) {
            const hex = geneSetting.color.replace('#', '');
            return [
                parseInt(hex.substr(0, 2), 16),
                parseInt(hex.substr(2, 2), 16),
                parseInt(hex.substr(4, 2), 16)
            ];
        }
    }
    
    // Default color for unknown genes (blue)
    return [0, 0, 255];
}

// Data source selection function
function getDataset() {
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source');
    
    if (source === 'selection' && window.opener?.lastSelectionResults) {
        console.log('📊 Using selection data from main viewer');
        console.log('Selection bounds:', window.opener.lastSelectionResults.bounds);
        console.log('Selection spots:', window.opener.lastSelectionResults.spots.count);
        console.log('Selection cells:', window.opener.lastSelectionResults.cells.count);
        return window.opener.lastSelectionResults;
    } else {
        console.log('🎮 Using demo test dataset');
        return generateTestDataset();
    }
}

// Tooltip functions - matching main viewer's tooltip implementation
function showChunkTooltip(info) {
    let tooltipElement = document.getElementById('chunk-tooltip');
    if (!tooltipElement) {
        // Create tooltip element with same styling as main viewer
        tooltipElement = document.createElement('div');
        tooltipElement.id = 'chunk-tooltip';
        tooltipElement.style.cssText = `
            position: absolute;
            pointer-events: none;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            display: none;
            white-space: nowrap;
            z-index: 1000;
            max-width: 300px;
            border: none;
            outline: none;
            box-shadow: none;
            margin: 0;
            font-family: inherit;
        `;
        document.body.appendChild(tooltipElement);
    }

    if (info.picked && info.object && info.object.gene_name) {
        // Build tooltip content matching main viewer format
        const obj = info.object;
        const coords = `(${obj.original_coords.x.toFixed(2)}, ${obj.original_coords.y.toFixed(2)}, ${obj.original_coords.z.toFixed(2)})`;
        
        // Build spot information
        let spotInfo = '';
        if (obj.spot_id !== undefined) {
            spotInfo = `<strong>Spot ID:</strong> ${obj.spot_id}<br>`;
        }
        
        // Build parent cell information
        let parentInfo = '';
        if (obj.parent_cell_id !== undefined && obj.parent_cell_id !== null) {
            const parentLabel = obj.parent_cell_id === 0 ? 'Background' : obj.parent_cell_id;
            parentInfo = `<strong>Parent Cell:</strong> ${parentLabel}<br>`;
            
            // Add parent coordinates if available
            if (obj.parent_cell_X !== undefined && obj.parent_cell_Y !== undefined && 
                obj.parent_cell_X !== null && obj.parent_cell_Y !== null) {
                parentInfo += `<strong>Parent Coords:</strong> (${obj.parent_cell_X.toFixed(2)}, ${obj.parent_cell_Y.toFixed(2)})<br>`;
            }
        }
        
        // Note: Score, intensity, and parent probability are not available in chunk viewer data
        // This matches the available data from the selection results
        
        const content = `${spotInfo}<strong>Gene:</strong> ${obj.gene_name}<br>
                        <strong>Coords:</strong> ${coords}<br>
                        <strong>Plane:</strong> ${obj.plane_id}<br>
                        ${parentInfo}`;
        
        tooltipElement.innerHTML = content;
        tooltipElement.style.display = 'block';
        tooltipElement.style.left = info.x + 20 + 'px';
        tooltipElement.style.top = info.y - 60 + 'px';
    } else {
        hideChunkTooltip();
    }
}

function hideChunkTooltip() {
    const tooltipElement = document.getElementById('chunk-tooltip');
    if (tooltipElement) {
        tooltipElement.style.display = 'none';
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    const {DeckGL, LightingEffect, AmbientLight, DirectionalLight, OrbitView} = deck;

    // Get dataset from selection or generate test data
    const dataset = getDataset();
    console.log('Generated dataset:', dataset);
    
    // Print original spot coordinates
    console.log('=== ORIGINAL SPOT COORDINATES ===');
    dataset.spots.data.forEach((spot, i) => {
        if (i < 10) { // Print first 10 spots
            console.log(`Spot ${i}: gene=${spot.gene}, x=${spot.x.toFixed(1)}, y=${spot.y.toFixed(1)}, z=${spot.z.toFixed(1)}, plane=${spot.plane_id}`);
        }
    });
    console.log(`... and ${dataset.spots.data.length - 10} more spots`);
    console.log('=== END ORIGINAL COORDINATES ===');

    // Transform biological data to minecraft-layer format
    function transformBioDataToBlocks(dataset) {
        const geneBlocks = [];
        const stoneBlocks = [];
        
        // Convert coordinate system: subtract origin and scale to reasonable block coordinates
        const originX = dataset.bounds.left;
        const originY = dataset.bounds.top;
        const scaleX = 50 / (dataset.bounds.right - dataset.bounds.left); // Scale to ~50 blocks wide (X → X)
        const scaleY = 30 / dataset.bounds.depth; // Scale original Z to ~30 blocks (Z → Y top-to-bottom)
        const scaleZ = 40 / (dataset.bounds.bottom - dataset.bounds.top); // Scale original Y to ~40 blocks (Y → Z depth)

        console.log('Coordinate transform (transposed Y↔Z):', {originX, originY, scaleX, scaleY, scaleZ});
        console.log('Mapping: original[X,Y,Z] → viewer[X,Z,Y] so original Z becomes top-to-bottom');

        const maxX = 50; // X dimension (width)
        const maxY = 30; // Y dimension (original Z depth → top-to-bottom slicing) 
        const maxZ = 40; // Z dimension (original Y height → front-to-back depth)

        // Helper function to check if a point is inside a polygon using ray casting algorithm
        function isPointInPolygon(x, y, polygon) {
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const [xi, yi] = polygon[i];
                const [xj, yj] = polygon[j];
                
                if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                }
            }
            return inside;
        }

        // Helper function to check if a block position should be excluded (inside any cell boundary)
        function isBlockInsideCell(blockX, blockY, blockZ) {
            // Convert block coordinates back to original coordinate system (reverse transpose)
            const originalX = (blockX / scaleX) + originX;      // viewer X → original X
            const originalY = (blockZ / scaleZ) + originY;      // viewer Z → original Y 
            const originalZ = blockY / scaleY;                  // viewer Y → original Z
            
            // Check each cell boundary
            for (const cell of dataset.cells.data) {
                // Get the proper Z coordinate for this cell's plane using isotropic conversion
                // plane_id (anisotropic) → Z coordinate (isotropic) using same conversion as cellLookup.js
                let cellPlaneZ;
                if (window.opener && window.opener.window.config) {
                    const config = window.opener.window.config();
                    const [xVoxel, yVoxel, zVoxel] = config.voxelSize;
                    cellPlaneZ = cell.plane * (zVoxel / xVoxel); // Convert plane to isotropic Z
                } else {
                    // Fallback: estimate from bounds depth and assume reasonable plane count
                    const estimatedPlanes = Math.max(6, Math.floor(dataset.bounds.depth / 2.5)); // Guess based on depth
                    cellPlaneZ = cell.plane * (dataset.bounds.depth / estimatedPlanes);
                }
                
                const zTolerance = dataset.bounds.depth / 50; // Smaller tolerance for accuracy
                
                if (Math.abs(originalZ - cellPlaneZ) <= zTolerance) {
                    // Check if point is inside this cell's clipped boundary
                    if (cell.clippedBoundary && isPointInPolygon(originalX, originalY, cell.clippedBoundary)) {
                        return true; // Block is inside a cell, should be excluded
                    }
                }
            }
            return false; // Block is not inside any cell
        }

        // Create background stone grid with holes for cell boundaries
        for (let x = 0; x < maxX; x++) {
            for (let y = 0; y < maxY; y++) {
                for (let z = 0; z < maxZ; z++) {
                    // Skip blocks that are inside cell boundaries
                    if (isBlockInsideCell(x, y, z)) {
                        continue; // Create hole by skipping this block
                    }
                    
                    stoneBlocks.push({
                        position: [x, y, z], // x=width, y=top-to-bottom(slicing), z=front-to-back
                        blockId: 1, // Stone
                        blockData: 0,
                        temperature: 0.5,
                        humidity: 0.5,
                        lighting: 15,
                        gene_id: -1, // -1 indicates stone block (not gene data)
                        index: stoneBlocks.length
                    });
                }
            }
        }

        // Transform gene spots to colored blocks (with coordinate transpose)
        dataset.spots.data.forEach((spot, index) => {
            const x = Math.floor((spot.x - originX) * scaleX);   // original X → viewer X (width)
            const y = Math.floor(spot.z * scaleY);              // original Z → viewer Y (top-to-bottom slicing)
            const z = Math.floor((spot.y - originY) * scaleZ);   // original Y → viewer Z (front-to-back depth)

            // Get gene color from main viewer's glyph configuration
            const rgb = getGeneColor(spot.gene);

            geneBlocks.push({
                position: [x, y, z], // x=width, y=top-to-bottom(slicing), z=front-to-back
                blockId: 1,
                blockData: 0,
                temperature: 0.5,
                humidity: 0.5,
                lighting: 15,
                gene_id: index,
                gene_name: spot.gene,
                spot_id: spot.spot_id,
                plane_id: spot.plane_id,
                rgb: rgb,
                parent_cell_id: spot.parent_cell_id,
                parent_cell_X: spot.parent_cell_X,
                parent_cell_Y: spot.parent_cell_Y,
                original_coords: {x: spot.x, y: spot.y, z: spot.z}
            });
        });

        console.log('Transformed', geneBlocks.length, 'gene spots and', stoneBlocks.length, 'stone blocks');
        console.log('Sample gene block:', geneBlocks[0]);
        console.log('Sample stone block:', stoneBlocks[0]);
        
        return {
            geneData: geneBlocks,
            stoneData: stoneBlocks,
            bounds: {
                minX: 0,
                maxX: maxX,
                minY: 0,
                maxY: maxY,
                minZ: 0,
                maxZ: maxZ
            }
        };
    }

    // Transform the dataset
    const blockData = transformBioDataToBlocks(dataset);
    
    // Update stats display
    document.getElementById('stats').innerHTML = `
        Spots: ${dataset.spots.count}<br>
        Cells: ${dataset.cells.count}<br>
        Planes: 6<br>
        Bounds: ${dataset.bounds.right}×${dataset.bounds.bottom}×${dataset.bounds.depth}px
    `;

    // Helper functions for the minecraft layer
    function getBlockTemperature(d) {
        return d.temperature || 0.5;
    }

    function getBlockHumidity(d) {
        return d.humidity || 0.5;
    }

    function isBlockOpaque(x, y, z) {
        return false; // All blocks are visible for this demo
    }

    const INITIAL_VIEW_STATE = {
        target: [25, 20, 15], // Center of our scaled coordinates [x, y, z]
        zoom: 3,
        orbitAxis: 'Y',
        rotationX: 45,
        rotationOrbit: 30,
        minZoom: 0,
        maxZoom: 20
    };

    const LIGHTING_EFFECT = new LightingEffect({
        ambient: new AmbientLight({
            color: [255, 255, 255],
            intensity: 0.6
        }),
        dir1: new DirectionalLight({
            color: [255, 255, 255],
            intensity: 1.0,
            direction: [-3, -6, -1]
        }),
        dir2: new DirectionalLight({
            color: [200, 220, 255],
            intensity: 0.4,
            direction: [3, -1, 0]
        })
    });

    const ghostOpacity = 0.005; // make sure this is greater than 0.001 which is set at Line 189 minecraft-layer.js
    let currentSliceY = blockData.bounds.maxY; // Start with all visible (Y-axis slicing)

    function createLayers() {
        const layers = [];
        
        // Background stone blocks - solid (below slice)
        const solidStoneBlocks = blockData.stoneData.filter(block => block.position[1] <= currentSliceY);
        if (solidStoneBlocks.length > 0) {
            layers.push(new MinecraftLayer({
                id: 'stone-background-solid',
                data: solidStoneBlocks,
                getTemperature: getBlockTemperature,
                getHumidity: getBlockHumidity,
                getGeneId: (d) => d.gene_id !== undefined ? d.gene_id : -1.0,
                getIsBlockOpaque: isBlockOpaque,
                sliceY: currentSliceY,
                pickable: false,
                autoHighlight: false,
                parameters: {
                    depthMask: true
                }
            }));
        }
        
        // Gene blocks - solid (below slice)
        const solidGeneBlocks = blockData.geneData.filter(block => block.position[1] <= currentSliceY);
        if (solidGeneBlocks.length > 0) {
            layers.push(new MinecraftLayer({
                id: 'gene-spots-solid',
                data: solidGeneBlocks,
                getTemperature: getBlockTemperature,
                getHumidity: getBlockHumidity,
                getGeneId: (d) => d.gene_id !== undefined ? d.gene_id : -1.0,
                getIsBlockOpaque: isBlockOpaque,
                sliceY: currentSliceY,
                pickable: true,
                autoHighlight: true,
                highlightColor: [255, 255, 255, 200],
                parameters: {
                    depthMask: true
                }
            }));
        }
        
        // Background stone blocks - transparent (above slice)
        const transparentStoneBlocks = blockData.stoneData.filter(block => block.position[1] > currentSliceY);
        if (transparentStoneBlocks.length > 0) {
            layers.push(new MinecraftLayer({
                id: 'stone-background-transparent',
                data: transparentStoneBlocks,
                getTemperature: getBlockTemperature,
                getHumidity: getBlockHumidity,
                getGeneId: (d) => d.gene_id !== undefined ? d.gene_id : -1.0,
                getIsBlockOpaque: isBlockOpaque,
                sliceY: currentSliceY,
                ghostOpacity: ghostOpacity, // Use variable opacity value
                pickable: false,
                autoHighlight: false,
                parameters: {
                    depthMask: false,
                    blend: true,
                    blendFunc: [770, 771], // GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA
                    cull: false
                }
            }));
        }
        
        // Gene blocks - transparent (above slice)
        const transparentGeneBlocks = blockData.geneData.filter(block => block.position[1] > currentSliceY);
        if (transparentGeneBlocks.length > 0) {
            layers.push(new MinecraftLayer({
                id: 'gene-spots-transparent',
                data: transparentGeneBlocks,
                getTemperature: getBlockTemperature,
                getHumidity: getBlockHumidity,
                getGeneId: (d) => d.gene_id !== undefined ? d.gene_id : -1.0,
                getIsBlockOpaque: isBlockOpaque,
                sliceY: currentSliceY,
                ghostOpacity: 0.1, // Use variable opacity value
                pickable: false,
                autoHighlight: false,
                parameters: {
                    depthMask: false,
                    blend: true,
                    blendFunc: [770, 771], // GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA
                    cull: false
                }
            }));
        }
        
        return layers;
    }

    // Create the deck.gl instance
    const deckgl = new DeckGL({
        container: 'container',
        views: new OrbitView({id: 'orbit'}),
        initialViewState: INITIAL_VIEW_STATE,
        controller: true,
        effects: [LIGHTING_EFFECT],
        onWebGLInitialized: (gl) => {
            console.log('WebGL initialized!');
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.disable(gl.CULL_FACE);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(true);
        },
        onHover: (info) => {
            if (info.object && info.object.gene_name) {
                console.log('Gene:', info.object.gene_name, 'Spot ID:', info.object.spot_id, 'Plane:', info.object.plane_id);
                showChunkTooltip(info);
            } else {
                hideChunkTooltip();
            }
        },
        onClick: (info) => {
            if (info.object) {
                console.log('Clicked:', {
                    gene: info.object.gene_name, 
                    position: info.object.position,
                    original_coords: info.object.original_coords,
                    parent_cell: info.object.parent_cell_id
                });
            }
        },
        layers: createLayers()
    });

    // Update slider value display
    function updateSliderDisplay() {
        const sliderValueElement = document.getElementById('sliderValue');
        sliderValueElement.textContent = `Plane: ${currentSliceY}/${blockData.bounds.maxY}`;
        
        // Also show how many blocks are visible
        const visibleStoneBlocks = blockData.stoneData.filter(block => block.position[1] <= currentSliceY).length;
        const visibleGeneBlocks = blockData.geneData.filter(block => block.position[1] <= currentSliceY).length;
        sliderValueElement.innerHTML = `
            Plane: ${currentSliceY}/${blockData.bounds.maxY}<br>
            <small>Stone: ${visibleStoneBlocks} | Genes: ${visibleGeneBlocks}</small>
        `;
    }

    // Handle Z slice control
    document.getElementById('sliceZ').addEventListener('input', (e) => {
        const sliceValue = parseFloat(e.target.value);
        currentSliceY = Math.floor(sliceValue * blockData.bounds.maxY); // Maps slider 0.01-1.0 to Y range 0-maxY
        
        updateSliderDisplay();
        
        deckgl.setProps({
            layers: createLayers()
        });
        
        console.log('Slice Y:', currentSliceY, '/', blockData.bounds.maxY);
    });

    // Initialize slider display
    updateSliderDisplay();

    console.log('Bio demo initialized with', blockData.geneData.length, 'gene spots and', blockData.stoneData.length, 'stone blocks');
});