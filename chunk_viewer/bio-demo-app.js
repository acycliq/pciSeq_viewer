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
        console.log('Using selection data from main viewer');
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
        
        // Add color information
        let colorInfo = '';
        if (obj.rgb) {
            const [r, g, b] = obj.rgb;
            const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
            colorInfo = `<strong>Color:</strong> ${hex}<br>`;
        }
        
        // Build parent cell information
        let parentInfo = '';
        if (obj.parent_cell_id !== undefined && obj.parent_cell_id !== null) {
            const parentLabel = obj.parent_cell_id === 0 ? 'Background' : obj.parent_cell_id;
            parentInfo = `<strong>Parent Cell:</strong> ${parentLabel}<br>`;
            
            // Add parent coordinates if available
            if (obj.parent_cell_X !== undefined && obj.parent_cell_Y !== undefined && 
                obj.parent_cell_X !== null && obj.parent_cell_Y !== null) {
                const parentZInfo = obj.parent_cell_Z !== undefined && obj.parent_cell_Z !== null 
                    ? `, ${obj.parent_cell_Z.toFixed(2)}` : '';
                parentInfo += `<strong>Parent Coords:</strong> (${obj.parent_cell_X.toFixed(2)}, ${obj.parent_cell_Y.toFixed(2)}${parentZInfo})<br>`;
            }
        }
        
        // Note: Score, intensity, and parent probability are not available in chunk viewer data
        // This matches the available data from the selection results
        
        const content = `${spotInfo}<strong>Gene:</strong> ${obj.gene_name}<br>
                        ${colorInfo}<strong>Coords:</strong> ${coords}<br>
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

    // Convert plane_id to anisotropic Y coordinate for rendering
    function planeIdToSliceY(planeId) {
        if (window.opener && window.opener.window.config) {
            const config = window.opener.window.config();
            const [xVoxel, yVoxel, zVoxel] = config.voxelSize;
            return planeId * (zVoxel / xVoxel); // Anisotropic scaling for proper Z positioning
        }
        return planeId; // Direct mapping fallback
    }

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

    // Helper function to check if a stone voxel position is inside a cell boundary
    function isInsideCellBoundary(blockX, blockZ, planeId, dataset, originX, originY, scaleX, scaleZ) {
        // Convert block coordinates back to original coordinate system
        const originalX = (blockX / scaleX) + originX;      // viewer X → original X
        const originalY = (blockZ / scaleZ) + originY;      // viewer Z → original Y
        
        // Find cells that exist on this specific plane
        const cellsOnPlane = dataset.cells.data.filter(cell => cell.plane === planeId);
        
        // Check each cell boundary on this plane
        for (const cell of cellsOnPlane) {
            // Check if point is inside this cell's clipped boundary
            if (cell.clippedBoundary && isPointInPolygon(originalX, originalY, cell.clippedBoundary)) {
                return true; // Block is inside a cell boundary, should be excluded
            }
        }
        return false; // Block is not inside any cell boundary
    }

    // Transform biological data to minecraft-layer format
    async function transformBioDataToBlocks(dataset) {
        const geneBlocks = [];
        const stoneBlocks = [];
        
        // Convert coordinate system: 1:1 pixel-to-block mapping with proper dimensions
        const originX = dataset.bounds.left;
        const originY = dataset.bounds.top;
        
        // Calculate actual selection dimensions in pixels
        const selectionWidth = dataset.bounds.right - dataset.bounds.left;   // X dimension (pixels)
        const selectionHeight = dataset.bounds.bottom - dataset.bounds.top;  // Y dimension (pixels)
        const selectionDepth = dataset.bounds.depth;                         // Z dimension (pixels)
        
        // 1:1 pixel-to-block mapping - round up to ensure no data loss
        const maxX = Math.ceil(selectionWidth);   // Direct 1:1 mapping
        const maxY = Math.ceil(selectionDepth);   // Direct 1:1 mapping (Z → Y top-to-bottom slicing)
        const maxZ = Math.ceil(selectionHeight);  // Direct 1:1 mapping (Y → Z front-to-back depth)
        
        // Scaling factors are now 1:1 (1 block per pixel)
        const scaleX = maxX / selectionWidth;   // Should be ~1.0
        const scaleY = maxY / selectionDepth;   // Should be ~1.0
        const scaleZ = maxZ / selectionHeight;  // Should be ~1.0

        console.log('Selection dimensions (pixels):', {width: selectionWidth, height: selectionHeight, depth: selectionDepth});
        console.log('Block dimensions (1:1 mapping):', {maxX, maxY, maxZ});
        console.log('Scale factors (should be ~1.0):', {scaleX, scaleY, scaleZ});
        console.log('Mapping: original[X,Y,Z] → viewer[X,Z,Y] so original Z becomes top-to-bottom');



        // Create background stone grid using plane-based positioning with cell boundary holes
        console.log('🏗️ Creating stone blocks at plane positions with cell boundary holes...');
        const stoneStartTime = performance.now();
        
        let totalBlocks = 0;
        let holesCreated = 0;
        
        // Get plane count from config
        let totalPlanes = Math.floor(maxY / 2.5); // fallback estimate
        if (window.opener && window.opener.window.config) {
            const config = window.opener.window.config();
            totalPlanes = config.totalPlanes;
        }
        
        for (let x = 0; x < maxX; x++) {
            for (let planeId = 0; planeId < totalPlanes; planeId++) {
                const y = planeIdToSliceY(planeId);  // Convert plane to Y coordinate
                for (let z = 0; z < maxZ; z++) {
                    totalBlocks++;
                    
                    // Check if this position is inside a cell boundary on this plane
                    if (isInsideCellBoundary(x, z, planeId, dataset, originX, originY, scaleX, scaleZ)) {
                        holesCreated++;
                        continue; // Skip creating stone block - create hole for cell
                    }
                    
                    // Generate stone blocks at plane positions (outside cell boundaries)
                    stoneBlocks.push({
                        position: [x, y, z], // x=width, y=plane-position, z=front-to-back
                        blockId: 1, // Stone
                        blockData: 0,
                        temperature: 0.5,
                        humidity: 0.5,
                        lighting: 15,
                        gene_id: -1, // -1 indicates stone block (not gene data)
                        index: stoneBlocks.length,
                        planeId: planeId // Store which plane this stone belongs to
                    });
                }
            }
        }
        
        const stoneEndTime = performance.now();
        console.log(`✅ Stone creation completed in ${(stoneEndTime - stoneStartTime).toFixed(1)}ms`);
        console.log(`📊 Performance: ${totalPlanes} planes, ${totalBlocks} blocks processed, ${stoneBlocks.length} stone blocks created`);
        console.log(`🕳️ Cell boundary holes: ${holesCreated} holes created (${((holesCreated/totalBlocks)*100).toFixed(1)}% of total blocks)`);
        
        // Debug: Show stone positions from different planes
        console.log('🏗️ Sample stone positions across different planes:');
        const planesToShow = [0, 1, 2, 3, 4, 5];
        planesToShow.forEach(targetPlane => {
            const stonesFromPlane = stoneBlocks.filter(stone => stone.planeId === targetPlane);
            if (stonesFromPlane.length > 0) {
                const stone = stonesFromPlane[0]; // Show first stone from this plane
                console.log(`  Plane ${targetPlane}: Y=${stone.position[1]}, sample stone pos=[${stone.position[0]}, ${stone.position[1]}, ${stone.position[2]}] (${stonesFromPlane.length} total stones)`);
            }
        });

        // Transform gene spots to colored blocks (with coordinate transpose)
        dataset.spots.data.forEach((spot, index) => {
            const x = Math.floor((spot.x - originX) * scaleX);   // original X → viewer X (width)
            const y = planeIdToSliceY(spot.plane_id);           // plane_id → viewer Y (aligned with stone voxels)
            const z = Math.floor((spot.y - originY) * scaleZ);   // original Y → viewer Z (front-to-back depth)
            
            // Debug: Log transformation for first few spots
            if (index < 5) {
                console.log(`🎯 Spot ${index}: plane_id=${spot.plane_id} → Y=${y}, original(${spot.x.toFixed(1)}, ${spot.y.toFixed(1)}, ${spot.z.toFixed(1)}) → viewer(${x}, ${y}, ${z})`);
            }

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
                parent_cell_Z: spot.parent_cell_Z,
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

    // Transform the dataset (async)
    transformBioDataToBlocks(dataset).then(blockData => {
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
        target: [blockData.bounds.maxX/2, blockData.bounds.maxY/2, blockData.bounds.maxZ/2], // Center of actual chunk dimensions
        zoom: 3,
        orbitAxis: 'Y',
        rotationX: 45,
        rotationOrbit: -30,
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

    const ghostOpacity = 0.005; // Stone ghost opacity (> 0.001 shader alpha threshold)
    let currentSliceY = blockData.bounds.maxY; // Start with all visible (Y-axis slicing)
    let currentPlaneId = 0; // Current plane_id for slider display
    
    // Calculate anisotropic scale from config or data
    let anisotropicScale = 1.0; // Default to isotropic (1:1) if no other info available
    if (window.opener && window.opener.window.config) {
        const config = window.opener.window.config();
        const [xVoxel, yVoxel, zVoxel] = config.voxelSize;
        anisotropicScale = zVoxel / xVoxel;
        console.log(`🧊 Anisotropic scale from config: zVoxel(${zVoxel}) / xVoxel(${xVoxel}) = ${anisotropicScale}`);
    } else {
        // Fallback: calculate from actual data Z-range vs plane count
        const zRange = Math.max(...dataset.spots.data.map(s => s.z)) - Math.min(...dataset.spots.data.map(s => s.z));
        const planeCount = Math.max(...dataset.spots.data.map(s => s.plane_id)) + 1;
        if (planeCount > 1 && zRange > 0) {
            anisotropicScale = zRange / planeCount; // Z units per plane
            console.log(`🧊 Anisotropic scale from data: zRange(${zRange.toFixed(1)}) / planeCount(${planeCount}) = ${anisotropicScale.toFixed(2)}`);
        } else {
            console.log(`⚠️ Using isotropic scale (1.0) - no config or data to calculate anisotropy`);
        }
    }

    // Helper to create a MinecraftLayer with common settings
    function createMinecraftLayer(id, data, config) {
        if (data.length === 0) return null;
        
        return new MinecraftLayer({
            id: id,
            data: data,
            getTemperature: getBlockTemperature,
            getHumidity: getBlockHumidity,
            getGeneId: (d) => d.gene_id !== undefined ? d.gene_id : -1.0,
            getIsBlockOpaque: isBlockOpaque,
            sliceY: currentSliceY,
            anisotropicScale: anisotropicScale,
            ...config // Spread layer-specific config
        });
    }

    // Create line data connecting spots to their parent cells
    function createLinesData(solidOnly = true) {
        const lines = [];
        const originX = dataset.bounds.left;
        const originY = dataset.bounds.top;
        const originZ = 0; // Z coordinate origin (depth dimension)
        const selectionWidth = dataset.bounds.right - dataset.bounds.left;
        const selectionHeight = dataset.bounds.bottom - dataset.bounds.top;
        const selectionDepth = dataset.bounds.depth;
        const scaleX = blockData.bounds.maxX / selectionWidth;
        const scaleY = blockData.bounds.maxY / selectionDepth;  // For Z → Y mapping
        const scaleZ = blockData.bounds.maxZ / selectionHeight;

        // Filter spots based on solid/ghost mode
        const filteredGeneBlocks = solidOnly 
            ? blockData.geneData.filter(block => block.position[1] <= currentSliceY)  // solid spots
            : blockData.geneData.filter(block => block.position[1] > currentSliceY);   // ghost spots
        
        filteredGeneBlocks.forEach(spotBlock => {
            // Check if this spot has valid parent cell coordinates (not null, undefined, or background cell)
            if (spotBlock.parent_cell_X !== null && spotBlock.parent_cell_X !== undefined &&
                spotBlock.parent_cell_Y !== null && spotBlock.parent_cell_Y !== undefined &&
                spotBlock.parent_cell_Z !== null && spotBlock.parent_cell_Z !== undefined &&
                spotBlock.parent_cell_id !== null && spotBlock.parent_cell_id !== undefined && 
                spotBlock.parent_cell_id !== 0) {
                
                // Source position: spot position (already in viewer coordinates)
                const sourcePosition = [
                    spotBlock.position[0], // viewer X
                    spotBlock.position[1], // viewer Y  
                    spotBlock.position[2]  // viewer Z
                ];
                
                // Target position: parent cell coordinates (need to transform to viewer coordinates)
                const parentViewerX = Math.floor((spotBlock.parent_cell_X - originX) * scaleX);
                const parentViewerY = Math.floor((spotBlock.parent_cell_Z - originZ) * scaleY); // Convert parent Z coordinate properly
                const parentViewerZ = Math.floor((spotBlock.parent_cell_Y - originY) * scaleZ);
                
                const targetPosition = [
                    parentViewerX,
                    parentViewerY,
                    parentViewerZ
                ];
                
                // Use the gene color for the line, but make it semi-transparent
                const geneColor = spotBlock.rgb || [255, 255, 255];
                const lineColor = [geneColor[0], geneColor[1], geneColor[2], 128]; // 50% transparency
                
                lines.push({
                    sourcePosition: sourcePosition,
                    targetPosition: targetPosition,
                    color: lineColor,
                    gene: spotBlock.gene_name,
                    spot_id: spotBlock.spot_id,
                    parent_cell_id: spotBlock.parent_cell_id
                });
            }
        });
        
        console.log(`Created ${lines.length} ${solidOnly ? 'solid' : 'ghost'} spot-to-parent lines from ${filteredGeneBlocks.length} spots`);
        
        return lines;
    }

    function createLayers() {
        const layers = [];
        
        // Filter data once
        const solidStoneBlocks = blockData.stoneData.filter(block => block.position[1] <= currentSliceY);
        const solidGeneBlocks = blockData.geneData.filter(block => block.position[1] <= currentSliceY);
        const transparentStoneBlocks = blockData.stoneData.filter(block => block.position[1] > currentSliceY);
        const transparentGeneBlocks = blockData.geneData.filter(block => block.position[1] > currentSliceY);
        
        // Create layers with specific configurations
        const layerConfigs = [
            ['stone-background-solid', solidStoneBlocks, { pickable: false, autoHighlight: false, parameters: { depthMask: true } }],
            ['gene-spots-solid', solidGeneBlocks, { pickable: true, autoHighlight: true, highlightColor: [255, 255, 255, 200], parameters: { depthMask: true } }],
            ['stone-background-transparent', transparentStoneBlocks, { ghostOpacity: ghostOpacity, pickable: false, autoHighlight: false, parameters: { depthMask: false, blend: true, blendFunc: [770, 771], cull: false } }],
            ['gene-spots-transparent', transparentGeneBlocks, { ghostOpacity: 0.1, pickable: true, autoHighlight: false, parameters: { depthMask: false, blend: true, blendFunc: [770, 771], cull: false } }]
        ];
        
        layerConfigs.forEach(([id, data, config]) => {
            const layer = createMinecraftLayer(id, data, config);
            if (layer) layers.push(layer);
        });
        
        // Add solid lines for visible spots
        const solidLinesData = createLinesData(true); // visible spots only
        if (solidLinesData.length > 0) {
            const solidLineLayer = new deck.LineLayer({
                id: 'spot-to-parent-lines-solid',
                data: solidLinesData,
                getSourcePosition: d => d.sourcePosition,
                getTargetPosition: d => d.targetPosition,
                getColor: d => d.color,
                getWidth: 5,
                pickable: false,
                parameters: {
                    depthTest: true,
                    depthMask: true,
                    blend: true,
                    blendFunc: [770, 771]
                }
            });
            layers.push(solidLineLayer);
        }
        
        // Add ghosted lines for spots above the slice
        const ghostLinesData = createLinesData(false); // transparent spots only
        if (ghostLinesData.length > 0) {
            const ghostLineLayer = new deck.LineLayer({
                id: 'spot-to-parent-lines-ghost',
                data: ghostLinesData,
                getSourcePosition: d => d.sourcePosition,
                getTargetPosition: d => d.targetPosition,
                getColor: d => [d.color[0], d.color[1], d.color[2], 25], // Very transparent (10% of original alpha)
                getWidth: 5,
                pickable: false,
                parameters: {
                    depthTest: true,
                    depthMask: false,
                    blend: true,
                    blendFunc: [770, 771]
                }
            });
            layers.push(ghostLineLayer);
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
        const maxPlaneId = parseInt(document.getElementById('sliceZ').max);
        const currentDisplayPlaneId = parseInt(document.getElementById('sliceZ').value);
        sliderValueElement.textContent = `Plane: ${currentDisplayPlaneId}/${maxPlaneId}`;
        
        // Also show how many blocks are visible
        const visibleStoneBlocks = blockData.stoneData.filter(block => block.position[1] <= currentSliceY).length;
        const visibleGeneBlocks = blockData.geneData.filter(block => block.position[1] <= currentSliceY).length;
        sliderValueElement.innerHTML = `
            Plane ID: ${currentDisplayPlaneId}/${maxPlaneId}<br>
            <small>Stone: ${visibleStoneBlocks} | Genes: ${visibleGeneBlocks} | SliceY: ${currentSliceY}</small>
        `;
    }

    // Handle Z slice control
    document.getElementById('sliceZ').addEventListener('input', (e) => {
        const planeId = parseInt(e.target.value);
        const maxPlaneId = parseInt(e.target.max);
        currentPlaneId = Math.min(planeId, maxPlaneId); // Use plane_id directly, clamped to max plane_id
        
        // Convert plane_id to anisotropic Y coordinate for rendering
        currentSliceY = planeIdToSliceY(currentPlaneId);
        
        updateSliderDisplay();
        
        deckgl.setProps({
            layers: createLayers()
        });
        
        console.log('Plane ID:', currentPlaneId, '/', maxPlaneId, '| Slice Y:', currentSliceY);
    });

    // Configure slider range based on plane_id values from config
    const sliceSlider = document.getElementById('sliceZ');
    let maxPlaneId = blockData.bounds.maxY; // fallback
    currentPlaneId = maxPlaneId; // start at max plane (all visible)
    
    // Use config values to get actual totalPlanes
    if (window.opener && window.opener.window.config) {
        const config = window.opener.window.config();
        maxPlaneId = config.totalPlanes - 1; // plane_id ranges from 0 to totalPlanes-1
        currentPlaneId = maxPlaneId; // start showing all planes
        console.log(`🎛️ Slider range set from config: plane_id 0 to ${maxPlaneId} (totalPlanes: ${config.totalPlanes})`);
    } else {
        console.log(`⚠️ Config not available, using bounds maxY: ${maxPlaneId}`);
    }
    
    sliceSlider.min = "0";
    sliceSlider.max = maxPlaneId.toString();
    sliceSlider.value = maxPlaneId.toString();
    sliceSlider.step = "1";
    
    // Set initial slice position
    currentSliceY = planeIdToSliceY(currentPlaneId);
    
    // Initialize slider display
    updateSliderDisplay();

    console.log('Bio demo initialized with', blockData.geneData.length, 'gene spots and', blockData.stoneData.length, 'stone blocks');
    
    }).catch(error => {
        console.error('❌ Failed to initialize chunk viewer:', error);
        document.getElementById('stats').innerHTML = '<span style="color: red;">Error loading chunk viewer</span>';
    });
});