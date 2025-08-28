// VoxelLayer - adapted for vanilla JS
// Only minimal changes for import/export compatibility

// Import the shaders
const vs = `
#define SHADER_NAME minecraft-layer-vertex-shader

attribute vec3 positions;
attribute vec3 normals;
attribute vec2 texCoords;

attribute vec3 instancePositions;
attribute vec3 instancePositions64Low;
attribute vec4 instanceBlockData;
attribute float instanceVoxelType;
attribute float instanceVoxelId;
attribute float instanceVisibilities;
attribute vec3 instancePickingColors;

uniform float sliceY;
uniform float ghostOpacity;
uniform float anisotropicScale;

uniform vec2 atlasTextureDim;
uniform sampler2D biomeTexture;

varying float isVisible;
varying vec4 vColorScale;
varying vec2 vTextureCoords;
varying vec4 vInstanceBlockData;
varying float vInstanceVoxelType;
varying float vInstanceVoxelId;

// Removed: getXYRotationMatrix() - no longer needed for simple cube geometry

float round(float x) {
  return floor(x + 0.5);
}

// Removed: getBlockDefAt() - no longer needed for simple cube geometry

float getFaceIndex(vec3 normal_modelspace) {
  vec3 index = normal_modelspace * vec3(-1.0, 0.5, 1.0) +
          abs(normal_modelspace) * vec3(4.0, 0.5, 3.0);
  return round(index.x + index.y + index.z);
}

vec4 getBiomeColor() {
  // Check if this is gene data using voxelType (1 = gene data)
  bool isGeneData = (instanceVoxelType == 1.0);
  
  if (isGeneData) {
    // Gene data: use original biome calculation
    vec2 coords = instanceBlockData.yz / 255.; // Convert byte to normalized coords
    coords.x = 1.0 - coords.x;
    return mix(
      texture2D(biomeTexture, coords),
      vec4(1.5),
      step(95., instancePositions.y)
    );
  } else {
    // Grey cubes: use neutral white color to preserve stone texture
    return vec4(1.0, 1.0, 1.0, 1.0);
  }
}

bool getVisibility(float faceIndex) {
  float b = pow(2., 5. - faceIndex);
  return mod(instanceVisibilities, b * 2.) >= b;
}

// Removed: getTransform() - no longer needed for simple cube geometry

void main(void) {
  geometry.pickingColor = instancePickingColors;

  // SIMPLIFIED GEOMETRY SYSTEM (replaced complex Minecraft transformation system)
  // 
  // Key fixes from debugging ghosting/texture issues between commits e9bdcdf2 -> d20e7ea2:
  // 1. POSITION SCALING: Must divide positions by 2.0 (original Minecraft block size)
  //    - Missing this made voxels 2x larger -> heavy ghosting from overlapping surfaces
  // 2. TEXTURE SCALING: Must use anisotropicScale.xy for texture coordinates  
  //    - Missing this broke yellow line consistency in stone_atlas_2.png texture
  // 3. ANISOTROPIC Y-SCALING: Biological Z-stack data has elongated Y dimension (~2.5x)
  //    - Both geometry and texture must scale together for visual consistency

  // Simple cube geometry with anisotropic Y scaling only
  vec3 scaleVec = vec3(1.0, anisotropicScale, 1.0); // X=1.0, Y=dynamic (~2.5 for bio data), Z=1.0
  
  // CRITICAL: Divide by 2.0 to match original Minecraft block size (unit cube -> half-size cube)
  // Missing this division caused "heavy ghosting" due to 2x larger voxels overlapping
  vec3 position_modelspace = (positions / 2.0) * scaleVec;

  // No rotation needed for simple cubes (removed complex Minecraft transformation system)
  vec3 normal_modelspace = normals; // NOTE: with non-uniform scaling (scaleVec), correct normals via inverse-transpose:
                                    // vec3 normal_corr = normalize(normals / scaleVec);
                                    // Use normal_corr for lighting to avoid flat/incorrect shading on stretched axes.
  
  // CRITICAL: Texture coordinates must match geometry scaling for consistent appearance
  // anisotropicScale.xy = (1.0, ~2.5) stretches Y-axis texture to match elongated voxels
  // This ensures yellow lines in stone_atlas_2.png appear consistently every 16 pixels
  vec2 texCoords_modelspace = texCoords * mix(
    vec2(1.0),                    // Base texture scale
    scaleVec.xy,                  // Apply same anisotropic scaling as geometry (1.0, ~2.5)
    1.0 - abs(normals.xy)         // Only scale X/Y faces, not Z faces
  );

  float faceIndex = getFaceIndex(normals);
  float faceIndex_modelspace = getFaceIndex(normal_modelspace);

  // Use stone texture from the custom 16x256px vertical atlas
  vec4 textureSettings = vec4(1.0, 0.0, 0.0, 1.0); // Use stone texture
  
  // Stone texture coordinates (top of vertical strip: 16x16 pixels)
  vec4 textureFrame = vec4(0.0, 0.0, 16.0, 16.0);
  vTextureCoords = (textureFrame.xy + texCoords_modelspace * textureFrame.zw) / atlasTextureDim;

  // Force all blocks to be visible for debugging
  isVisible = 1.0;

  gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, position_modelspace);
  
  // Debug: Log first few positions (this will spam console but useful for debugging)
  if (instancePositions.x == -8.0 && instancePositions.y == 0.0 && instancePositions.z == -8.0) {
    // First block position for debugging
  }

  vec4 biomeColor = mix(vec4(1.), getBiomeColor(), textureSettings.z);
  vec3 lightWeight = lighting_getLightColor(vec3(1.0), project_uCameraPosition, gl_Position.xyz, normal_modelspace);
  lightWeight += instanceBlockData.w / 15.0;

  // Add tolerance to ghosting comparison for floating point precision
  const float GHOST_TOLERANCE = 0.01;
  // Top -> down: ghost anything above the current sliceY
  float isGhosted = float((instancePositions.y - sliceY) > GHOST_TOLERANCE);

  // Allow ghosted blocks to be pickable for tooltips
  // Only disable picking for very faint ghost blocks (stone background)
  if (picking_uActive && ghostOpacity <= 0.01) {
    isVisible *= 1.0 - isGhosted;
  }

  // Separate RGB and alpha calculation to ensure ghostOpacity works correctly
  vec3 finalRGB = lightWeight * biomeColor.rgb;
  // Force ghostOpacity to be used for all ghosted voxels (ignore biome alpha when ghosted)
  float finalAlpha = mix(biomeColor.a, ghostOpacity, isGhosted);
  vColorScale = vec4(finalRGB, finalAlpha);
  vInstanceBlockData = instanceBlockData;
  vInstanceVoxelType = instanceVoxelType;
  vInstanceVoxelId = instanceVoxelId;

  DECKGL_FILTER_COLOR(vColorScale, geometry);
}
`;

const fs = `
#define SHADER_NAME minecraft-layer-fragment-shader

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D atlasTexture;

varying float isVisible;
varying vec4 vColorScale;
varying vec2 vTextureCoords;
varying vec4 vInstanceBlockData;
varying float vInstanceVoxelType;
varying float vInstanceVoxelId;

const float TOLERANCE = 0.1;

void main(void) {
  if (isVisible == 0.) {
    discard;
  }

  // Clean voxel type checking using tolerance for floating point precision
  const float VOXEL_TOLERANCE = 0.01;
  bool isGeneData = abs(vInstanceVoxelType - 1.0) < VOXEL_TOLERANCE;      // 1 = gene voxel
  bool isCellVoxel = abs(vInstanceVoxelType - 2.0) < VOXEL_TOLERANCE;     // 2 = cell voxel  
  bool isBoundaryVoxel = abs(vInstanceVoxelType - 3.0) < VOXEL_TOLERANCE; // 3 = boundary voxel
  bool isStoneVoxel = abs(vInstanceVoxelType - 0.0) < VOXEL_TOLERANCE;    // 0 = stone voxel
  
  vec4 color;
  if (isGeneData) {
    // Gene spots: use RGB data directly (alpha will be controlled by vColorScale.a for ghosting)
    color = vec4(vInstanceBlockData.rgb / 255.0, 1.0);
  } else if (isCellVoxel) {
    // Cell voxels: use RGB data from cell voxel definition
    vec4 cell_rgb = vec4(vInstanceBlockData.rgb / 255.0, 1.0);
    vec4 textureColor = texture2D(atlasTexture, vTextureCoords);
    color = mix(textureColor, cell_rgb, 0.5);
  } else if (isBoundaryVoxel) {
    // Boundary voxels: use RGB data from boundary voxel definition
    vec4 boundary_rgb = vec4(vInstanceBlockData.rgb / 255.0, 1.0);
    
    vec4 textureColor = texture2D(atlasTexture, vTextureCoords);
    color = mix(textureColor, boundary_rgb, 0.6);
  } else if (isStoneVoxel) {
    // Stone voxels: use Minecraft stone texture, fallback to grey if texture fails
    vec4 textureColor = texture2D(atlasTexture, vTextureCoords);
    if (textureColor.a > 0.0) {
      color = textureColor;
      } else {
      // Fallback to grey color if texture fails
      color = vec4(0.5, 0.5, 0.5, 1.0);
    }
  } else {
    // Unknown voxel type: use red for debugging
    color = vec4(1.0, 0.0, 0.0, 1.0);
  }
  
  geometry.uv = vTextureCoords;
  // Apply color scale with proper alpha for ghosting effect
  gl_FragColor = vec4((color * vColorScale).rgb, vColorScale.a);
  
  // Alpha test: discard fragments below threshold (0.001 = minimum visible alpha)
  if (gl_FragColor.a < 0.001) {
    discard;
  }
  
  DECKGL_FILTER_COLOR(gl_FragColor, geometry);
}
`;

function loadTexture(gl, url) {
  return fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load texture ${url}: ${response.status}`);
      return response.blob();
    })
    .then(blob => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = URL.createObjectURL(blob);
      });
    })
    .then(data => {
      const Texture2D = deck.Texture2D || window.luma?.Texture2D || (window.luma && window.luma.core && window.luma.core.Texture2D);
      if (!Texture2D) {
        return {
          width: data.width || 1,
          height: data.height || 1
        };
      }
      
      return new Texture2D(gl, {
        data,
        parameters: {
          [gl.TEXTURE_WRAP_S]: gl.CLAMP_TO_EDGE,
          [gl.TEXTURE_WRAP_T]: gl.CLAMP_TO_EDGE,
          [gl.TEXTURE_MIN_FILTER]: gl.LINEAR,
          [gl.TEXTURE_MAG_FILTER]: gl.LINEAR
        }
      });
    });
}

const defaultProps = {
  sliceY: 256,
  anisotropicScale: 1.0, // Default to isotropic scaling (no distortion)
  getPosition: {type: 'accessor', value: d => d.position},
  getBlockData: {type: 'accessor', value: d => d.blockData},
  getTemperature: {type: 'accessor', value: d => d.temperature},
  getHumidity: {type: 'accessor', value: d => d.humidity},
  getLighting: {type: 'accessor', value: d => d.lighting},
  getVoxelType: {type: 'accessor', value: d => d.voxelType !== undefined ? d.voxelType : 0},
  getVoxelId: {type: 'accessor', value: d => d.voxelId !== undefined ? d.voxelId : 0},
  getIsBlockOpaque: {type: 'accessor', value: (x, y, z) => false},
  material: {},
  assetBase: './data/'
};

class VoxelLayer extends deck.Layer {

  initializeState() {
    const {gl} = this.context;

    this.getAttributeManager().addInstanced({
      instancePositions: {size: 3, type: gl.DOUBLE, accessor: 'getPosition'},
      instanceBlockData: {size: 4, type: gl.UNSIGNED_BYTE, accessor: ['getBlockData', 'getTemperature', 'getHumidity', 'getLighting'], update: this.calculateInstanceBlockData},
      instanceVoxelType: {size: 1, type: gl.FLOAT, accessor: 'getVoxelType', update: this.calculateInstanceVoxelType},
      instanceVoxelId: {size: 1, type: gl.FLOAT, accessor: 'getVoxelId', update: this.calculateInstanceVoxelId},
      instanceVisibilities: {size: 1, type: gl.UNSIGNED_BYTE, accessor: ['getPosition', 'getIsBlockOpaque'], update: this.calculateInstanceVisibilities},
      instancePickingColors: {
        size: 3,
        type: gl.UNSIGNED_BYTE,
        update: this.calculateInstancePickingColors
      },
    });

    const model = this.getModel(gl);
    this.setState({model});

    this.loadAssets();
  }

  getShaders() {
    return {vs, fs, modules: [deck.project32, deck.picking, deck.gouraudLighting]};
  }

  getModel(gl) {
    const Model = deck.Model || window.luma?.Model || (window.luma && window.luma.engine && window.luma.engine.Model);
    const CubeGeometry = deck.CubeGeometry || window.luma?.CubeGeometry || (window.luma && window.luma.engine && window.luma.engine.CubeGeometry);
    if (!Model || !CubeGeometry) { throw new Error('Model/CubeGeometry not available'); }
    
    return new Model(gl, {
      ...this.getShaders(),
      id: this.props.id,
      geometry: new CubeGeometry(),
      isInstanced: true
    });
  }
  
  draw({uniforms}) {
    if (this.state.model) {
      const {sliceY, ghostOpacity = 0.1, anisotropicScale = 1.0} = this.props;
      this.state.model.setUniforms({
        ...uniforms,
        sliceY,
        ghostOpacity,
        anisotropicScale
      }).draw();
    }
  }

  loadAssets() {
    console.log('Loading assets...');
    const {gl} = this.context;
    const {model} = this.state;

    if (!model) {
      console.error('No model available for loading textures');
      return;
    }

    const base = this.props.assetBase || './data/';
    Promise.all([
      loadTexture(gl, base + 'stone_atlas_1.png'),
      loadTexture(gl, base + 'foliage.png')
    ]).then(([atlasTexture, biomeTexture]) => {
      model.setUniforms({
        atlasTexture,
        atlasTextureDim: [atlasTexture.width || 1, atlasTexture.height || 1],

        biomeTexture
      });
      this.setState({texturesLoaded: true})
    }).catch(error => {
      console.error('Error loading textures:', error);
      // Set textures loaded anyway to try to render something
      this.setState({texturesLoaded: true});
    });
  }

  calculateInstanceBlockData(attribute) {
    const {data, getBlockData, getTemperature, getHumidity, getLighting} = this.props;
    const {value} = attribute;
    
    console.log('calculateInstanceBlockData called with', data.length, 'blocks');
    console.log('First block sample:', data[0]);

    let i = 0;
    for (const object of data) {
      if (object.rgb) {
        // Gene data: store RGB values
        value[i++] = object.rgb[0];
        value[i++] = object.rgb[1]; 
        value[i++] = object.rgb[2];
      } else {
        // Grey cube: store block data
        value[i++] = getBlockData(object);
        value[i++] = getTemperature(object) / 2 * 255;
        value[i++] = getHumidity(object) * 255;
      }
      value[i++] = getLighting(object); // Always store lighting in w component
    }
    console.log('Block data calculated, first values:', value.slice(0, 16));
  }

  calculateInstanceVoxelType(attribute) {
    const {data, getVoxelType} = this.props;
    const {value} = attribute;
    
    console.log('calculateInstanceVoxelType called with', data.length, 'blocks');

    let i = 0;
    for (const object of data) {
      value[i++] = getVoxelType(object);
    }
    console.log('Voxel type data calculated, first values:', value.slice(0, 16));
  }

  calculateInstanceVoxelId(attribute) {
    const {data, getVoxelId} = this.props;
    const {value} = attribute;
    
    console.log('calculateInstanceVoxelId called with', data.length, 'blocks');

    let i = 0;
    for (const object of data) {
      value[i++] = getVoxelId(object);
    }
    console.log('Voxel ID data calculated, first values:', value.slice(0, 16));
  }

  calculateInstancePickingColors(attribute) {
    const {data} = this.props;
    const {value} = attribute;
    
    console.log('calculateInstancePickingColors called with', data.length, 'blocks');

    let i = 0;
    for (let objectIndex = 0; objectIndex < data.length; objectIndex++) {
      // Use deck.gl's built-in picking color encoding
      // Start from index 1 (0 means no pick in deck.gl)
      const pickingIndex = objectIndex + 1;
      const r = (pickingIndex & 0x0000FF);
      const g = (pickingIndex & 0x00FF00) >> 8;
      const b = (pickingIndex & 0xFF0000) >> 16;
      
      value[i++] = r;
      value[i++] = g;
      value[i++] = b;
    }
    console.log('Picking colors calculated, first values:', value.slice(0, 12));
  }

  calculateInstanceVisibilities(attribute) {
    const {data, getPosition, getIsBlockOpaque} = this.props;
    const {value} = attribute;

    let i = 0;
    for (const object of data) {
      const [x, y, z] = getPosition(object);
      if (getIsBlockOpaque(x, y, z)) {
        const neighbors = [
          getIsBlockOpaque(x, y - 1, z), // bottom
          getIsBlockOpaque(x, y + 1, z), // top
          getIsBlockOpaque(x, y, z - 1), // N
          getIsBlockOpaque(x + 1, y, z), // E
          getIsBlockOpaque(x, y, z + 1), // S
          getIsBlockOpaque(x - 1, y, z)  // W
        ];
        value[i++] = neighbors.reduce((acc, n) => (acc << 1) + !n, 0);
      } else {
        value[i++] = 0b111111;
      }
    }
  }

  getPickingInfo(params) {
    const {info} = params;
    const {data} = this.props;
    
    // Direct index mapping (no offset needed since deck.gl returns 0-based indices)
    const dataIndex = info.index;
    
    if (dataIndex >= 0 && dataIndex < data.length) {
      info.object = data[dataIndex];
    }
    
    return info;
  }

  updateState({props, oldProps, changeFlags}) {
    super.updateState({props, oldProps, changeFlags});
  }
}

VoxelLayer.layerName = 'VoxelLayer';
VoxelLayer.defaultProps = defaultProps;
