// MinecraftLayer - copied from original_code and adapted for vanilla JS
// Only minimal changes for import/export compatibility

// Import the shaders
const vs = `
#define SHADER_NAME minecraft-layer-vertex-shader

attribute vec3 positions;
attribute vec3 normals;
attribute vec2 texCoords;

attribute vec3 instancePositions;
attribute vec3 instancePositions64Low;
attribute float instanceBlockIds;
attribute vec4 instanceBlockData;
attribute float instanceGeneId;
attribute float instanceVisibilities;
attribute vec3 instancePickingColors;

uniform float sliceY;
uniform float ghostOpacity;
uniform float anisotropicScale;

uniform vec2 blockDefsTextureDim;
uniform vec2 atlasTextureDim;
uniform sampler2D blockDefsTexture;
uniform sampler2D biomeTexture;

varying float isVisible;
varying vec4 vColorScale;
varying vec2 vTextureCoords;
varying vec4 vInstanceBlockData;
varying float vInstanceGeneId;

mat3 getXYRotationMatrix(float radX, float radY) {
  float cx = cos(radX);
  float sx = sin(radX);
  float cy = cos(radY);
  float sy = sin(radY);

  return mat3(
    cy, 0.0, -sy,
    sx * sy, cx, sx * cy,
    cx * sy, -sx, cx * cy
  );
}

float round(float x) {
  return floor(x + 0.5);
}

vec4 getBlockDefAt(float faceIndex) {
  vec2 coords = vec2(instanceBlockData.x * 8.0 + faceIndex, instanceBlockIds); // 8 faces per block
  coords += vec2(0.5); // Pixel-perfect sampling offset
  coords /= blockDefsTextureDim;

  return texture2D(blockDefsTexture, coords);
}

float getFaceIndex(vec3 normal_modelspace) {
  vec3 index = normal_modelspace * vec3(-1.0, 0.5, 1.0) +
          abs(normal_modelspace) * vec3(4.0, 0.5, 3.0);
  return round(index.x + index.y + index.z);
}

vec4 getBiomeColor() {
  // Check if this is gene data using gene_id (>= 0, since -1 indicates grey cube)
  bool isGeneData = (instanceGeneId >= 0.0);
  
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

vec4 getTransform(vec4 t) {
  return vec4(
    round(t.x * 255.0) / 16.0 - 4.0,
    round(t.y * 255.0) / 6.0 * 3.14159,
    round(t.z * 255.0) / 16.0 - 1.0,
    round((1.0 - t.w) * 255.0) / 16.0
  );
}

void main(void) {
  geometry.pickingColor = instancePickingColors;

  vec4 transformX = getTransform(getBlockDefAt(6.0));
  vec4 transformY = getTransform(getBlockDefAt(7.0));

  // Apply anisotropic scaling: dynamic scaling in Y dimension to match voxel proportions
  vec3 anisotropicScaleVec = vec3(1.0, anisotropicScale, 1.0); // X=1.0, Y=dynamic, Z=1.0
  vec3 blockScale = vec3(transformX[0], transformY[0], 1.0) * anisotropicScaleVec;
  mat3 blockRotation = getXYRotationMatrix(transformX[1], transformY[1]);
  vec3 blockTranslation = vec3(transformX[2], transformY[2], 0.0);
  vec3 faceOffset = vec3(transformX[3], transformY[3], transformX[3]);

  vec3 position_modelspace =
    blockRotation * (positions / 2. * blockScale - normals * faceOffset + blockTranslation);

  vec3 normal_modelspace = blockRotation * normals;
  vec2 texCoords_modelspace = texCoords * mix(
    vec2(1.0),
    blockScale.xy,
    1.0 - abs(normals.xy)
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

  float isGhosted = float(instancePositions.y > sliceY);

  // Allow ghosted blocks to be pickable for tooltips
  // Only disable picking for very faint ghost blocks (stone background)
  if (picking_uActive && ghostOpacity <= 0.01) {
    isVisible *= 1.0 - isGhosted;
  }

  vColorScale = vec4(lightWeight, mix(1.0, ghostOpacity, isGhosted)) * biomeColor;
  vInstanceBlockData = instanceBlockData;
  vInstanceGeneId = instanceGeneId;

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
varying float vInstanceGeneId;

void main(void) {
  if (isVisible == 0.) {
    discard;
  }

  // Check if this is gene data using gene_id (>= 0, since -1 indicates grey cube)
  bool isGeneData = (vInstanceGeneId >= 0.0);
  
  vec4 color;
  if (isGeneData) {
    // Gene spots: use RGB data directly
    color = vec4(vInstanceBlockData.rgb / 255.0, 1.0);
  } else {
    // Grey cubes: use Minecraft stone texture, fallback to grey if texture fails
    vec4 textureColor = texture2D(atlasTexture, vTextureCoords);
    if (textureColor.a > 0.0) {
      color = textureColor;
    } else {
      // Fallback to grey color if texture fails
      color = vec4(0.5, 0.5, 0.5, 1.0);
    }
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
    .then(response => response.blob())
    .then(blob => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = URL.createObjectURL(blob);
      });
    })
    .then(data => {
      // Try different ways to access Texture2D
      const Texture2D = deck.Texture2D || window.luma?.Texture2D || (window.luma && window.luma.core && window.luma.core.Texture2D);
      
      console.log('Looking for Texture2D...', !!Texture2D);
      console.log('Available luma:', window.luma ? Object.keys(window.luma) : 'none');
      
      if (!Texture2D) {
        console.warn('Texture2D not found, using mock texture');
        // Return a mock texture for now
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
          [gl.TEXTURE_MIN_FILTER]: gl.NEAREST,
          [gl.TEXTURE_MAG_FILTER]: gl.NEAREST
        },
        mipmaps: false
      });
    });
}

const defaultProps = {
  sliceY: 256,
  anisotropicScale: 1.0, // Default to isotropic scaling (no distortion)
  getPosition: {type: 'accessor', value: d => d.position},
  getBlockId: {type: 'accessor', value: d => d.blockId},
  getBlockData: {type: 'accessor', value: d => d.blockData},
  getTemperature: {type: 'accessor', value: d => d.temperature},
  getHumidity: {type: 'accessor', value: d => d.humidity},
  getLighting: {type: 'accessor', value: d => d.lighting},
  getGeneId: {type: 'accessor', value: d => d.gene_id !== undefined ? d.gene_id : -1.0},
  getIsBlockOpaque: {type: 'accessor', value: (x, y, z) => false},
  material: {}
};

class MinecraftLayer extends deck.Layer {

  initializeState() {
    console.log('MinecraftLayer initializeState called with', this.props.data?.length, 'blocks');
    const {gl} = this.context;

    this.getAttributeManager().addInstanced({
      instancePositions: {size: 3, type: gl.DOUBLE, accessor: 'getPosition'},
      instanceBlockIds: {size: 1, accessor: 'getBlockId'},
      instanceBlockData: {size: 4, type: gl.UNSIGNED_BYTE, accessor: ['getBlockData', 'getTemperature', 'getHumidity', 'getLighting'], update: this.calculateInstanceBlockData},
      instanceGeneId: {size: 1, type: gl.FLOAT, accessor: 'getGeneId', update: this.calculateInstanceGeneId},
      instanceVisibilities: {size: 1, type: gl.UNSIGNED_BYTE, accessor: ['getPosition', 'getIsBlockOpaque'], update: this.calculateInstanceVisibilities},
      instancePickingColors: {
        size: 3,
        type: gl.UNSIGNED_BYTE,
        update: this.calculateInstancePickingColors
      },
    });

    const model = this.getModel(gl);
    console.log('Model created:', !!model);
    this.setState({model});

    this.loadAssets();
  }

  getShaders() {
    return {vs, fs, modules: [deck.project32, deck.picking, deck.gouraudLighting]};
  }

  getModel(gl) {
    // Access Model and CubeGeometry from the global context
    const Model = deck.Model || window.luma?.Model || (window.luma && window.luma.engine && window.luma.engine.Model);
    const CubeGeometry = deck.CubeGeometry || window.luma?.CubeGeometry || (window.luma && window.luma.engine && window.luma.engine.CubeGeometry);
    
    console.log('Looking for Model and CubeGeometry...', !!Model, !!CubeGeometry);
    console.log('Available luma engine:', window.luma && window.luma.engine ? Object.keys(window.luma.engine) : 'none');
    
    if (!Model || !CubeGeometry) {
      console.error('Model or CubeGeometry not available');
      return null;
    }
    
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

    Promise.all([
      loadTexture(gl, './data/blocks.png'),
      loadTexture(gl, './data/stone_atlas_2.png'),
      loadTexture(gl, './data/foliage.png')
    ]).then(([blockDefsTexture, atlasTexture, biomeTexture]) => {
      console.log('Textures loaded:', !!blockDefsTexture, !!atlasTexture, !!biomeTexture);
      
      model.setUniforms({
        blockDefsTexture,
        blockDefsTextureDim: [blockDefsTexture.width || 1, blockDefsTexture.height || 1],

        atlasTexture,
        atlasTextureDim: [atlasTexture.width || 1, atlasTexture.height || 1],

        biomeTexture
      });

      console.log('Setting texturesLoaded to true');
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

  calculateInstanceGeneId(attribute) {
    const {data, getGeneId} = this.props;
    const {value} = attribute;
    
    console.log('calculateInstanceGeneId called with', data.length, 'blocks');

    let i = 0;
    for (const object of data) {
      value[i++] = getGeneId(object);
    }
    console.log('Gene ID data calculated, first values:', value.slice(0, 16));
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

MinecraftLayer.layerName = 'MinecraftLayer';
MinecraftLayer.defaultProps = defaultProps;