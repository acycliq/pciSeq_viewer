/**
 * Spot Point Layer
 *
 * Draws every spot as one GPU point. deck.gl's ScatterplotLayer draws each
 * spot as a four-vertex square with a circle cut out, which at 20M spots is
 * 80M vertices per frame: 6 fps on a laptop's integrated GPU, against 25 fps
 * with one vertex per spot. The vertex count is what the point cloud view
 * pays for at that size.
 *
 * The size of a spot shrinks with its distance from the current plane,
 * 1 / sqrt(1 + distance), the same law as before. It is computed in the
 * vertex shader from the spot's plane and the current plane, so a plane
 * change updates one uniform and touches nothing per spot.
 *
 * Colour and visibility belong to the gene, so they live in a gene table: a
 * texture with one RGBA entry per gene id, alpha 0 for a hidden gene. The
 * vertex shader looks its spot's gene up there. Toggling a gene or importing
 * colours rewrites that table, a few hundred entries, and leaves the per-spot
 * buffers alone. Misreads are per spot: a flag per spot and two uniforms grey
 * them out or hide them.
 *
 * Wiring:
 *   - built by createArrowPointCloudLayer in src/layers/spotLayerCreator.js
 *     from the spot buffers on the GPU (src/data/spotBuffers.js): position,
 *     gene id, plane and misread flag per spot, plus the gene table, and the
 *     score/intensity filter through deck.gl's DataFilterExtension, which
 *     works on any layer
 *   - globals: deck (Layer, project32) and luma (Model, Geometry, Texture2D)
 *     from lib/vendor/deck.gl-8.8.27.min.js
 */

const { Layer, project32 } = deck;
const { Model, Geometry, Texture2D } = luma;

const GL_POINTS = 0x0000;
const GL_UNSIGNED_BYTE = 0x1401;
const GL_FLOAT = 0x1406;
const GL_DOUBLE = 0x140A;
const GL_RGBA = 0x1908;

const vertexShader = `\
#define SHADER_NAME spot-point-layer-vertex-shader
// positions is the geometry's single vertex, at the origin, as in deck.gl's
// PointCloudLayer. Where a spot lands comes from instancePositions.
attribute vec3 positions;
attribute vec3 instancePositions;
attribute vec3 instancePositions64Low;
attribute float instanceGeneIds;
attribute float instancePlanes;
attribute float instanceMisreads;

uniform sampler2D geneTable;
uniform float geneCount;
uniform float greyOutMisreads;
uniform float hideMisreads;
uniform float opacity;
uniform float radiusPixels;
uniform float minRadiusPixels;
uniform float currentPlane;
uniform float sizeByPlaneDistance;

varying vec4 vColor;

void main(void) {
  geometry.worldPosition = instancePositions;
  gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, positions, geometry.position);
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  // Spots on far planes draw smaller: 1 / sqrt(1 + distance), or all the same size.
  float distance = abs(instancePlanes - currentPlane);
  float factor = mix(1.0, inversesqrt(1.0 + distance), sizeByPlaneDistance);
  gl_PointSize = 2.0 * max(radiusPixels * factor, minRadiusPixels);

  // The gene table holds one texel per gene id; alpha 0 means the gene is hidden.
  vec4 gene = texture2D(geneTable, vec2((instanceGeneIds + 0.5) / geneCount, 0.5));
  vec3 rgb = gene.rgb;
  float alpha = gene.a;
  if (instanceMisreads > 0.5 && greyOutMisreads > 0.5) rgb = vec3(160.0 / 255.0);
  if (instanceMisreads > 0.5 && hideMisreads > 0.5) alpha = 0.0;
  vColor = vec4(rgb, alpha * opacity);
  DECKGL_FILTER_COLOR(vColor, geometry);
}
`;

const fragmentShader = `\
#define SHADER_NAME spot-point-layer-fragment-shader
precision highp float;

varying vec4 vColor;

void main(void) {
  // gl_PointCoord runs 0..1 across the point; keep the disc, drop the corners.
  vec2 unit = 2.0 * gl_PointCoord - 1.0;
  if (dot(unit, unit) > 1.0) discard;
  gl_FragColor = vColor;
  DECKGL_FILTER_COLOR(gl_FragColor, geometry);
}
`;

export class SpotPointLayer extends Layer {
    getShaders() {
        return super.getShaders({ vs: vertexShader, fs: fragmentShader, modules: [project32] });
    }

    initializeState() {
        // One instance per spot with a one-vertex geometry: the GPU runs the vertex
        // shader once per spot, and deck.gl's extensions, which add instanced
        // attributes, work unchanged.
        this.getAttributeManager().addInstanced({
            instancePositions: { size: 3, type: GL_DOUBLE, fp64: this.use64bitPositions(), accessor: 'getPosition' },
            instanceGeneIds: { size: 1, type: GL_FLOAT, accessor: 'getGeneId' },
            instancePlanes: { size: 1, type: GL_FLOAT, accessor: 'getPlane' },
            instanceMisreads: { size: 1, type: GL_UNSIGNED_BYTE, accessor: 'getMisread' }
        });
    }

    updateState(params) {
        super.updateState(params);
        const { props, oldProps, changeFlags } = params;
        if (changeFlags.extensionsChanged) {
            if (this.state.model) this.state.model.delete();
            this.state.model = new Model(this.context.gl, {
                ...this.getShaders(),
                id: this.props.id,
                geometry: new Geometry({
                    drawMode: GL_POINTS,
                    vertexCount: 1,
                    attributes: { positions: { size: 3, value: new Float32Array([0, 0, 0]) } }
                }),
                isInstanced: true
            });
            this.getAttributeManager().invalidateAll();
        }
        if (props.geneTable !== oldProps.geneTable) {
            if (this.state.geneTexture) this.state.geneTexture.delete();
            this.state.geneTexture = geneTableTexture(this.context.gl, props.geneTable);
        }
    }

    finalizeState(context) {
        super.finalizeState(context);
        if (this.state.geneTexture) this.state.geneTexture.delete();
    }

    draw({ uniforms }) {
        const { radiusPixels, minRadiusPixels, currentPlane, sizeByPlaneDistance, geneTable, greyOutMisreads, hideMisreads } = this.props;
        // No depth test: deck.gl keeps later layers in front with a polygon offset,
        // which applies to triangles only. Points get none and would lose the depth
        // test against the tiles. Layer order already puts the spots above them.
        this.state.model
            .setUniforms({
                ...uniforms,
                geneTable: this.state.geneTexture,
                geneCount: geneTable.length / 4,
                greyOutMisreads: greyOutMisreads ? 1 : 0,
                hideMisreads: hideMisreads ? 1 : 0,
                radiusPixels,
                minRadiusPixels,
                currentPlane,
                sizeByPlaneDistance: sizeByPlaneDistance ? 1 : 0
            })
            .draw({ parameters: { depthTest: false } });
    }
}

// One texel per gene id, read with nearest filtering so neighbouring genes never blend.
function geneTableTexture(gl, geneTable) {
    return new Texture2D(gl, {
        data: geneTable,
        width: geneTable.length / 4,
        height: 1,
        format: GL_RGBA,
        type: GL_UNSIGNED_BYTE,
        mipmaps: false,
        parameters: {
            [gl.TEXTURE_MIN_FILTER]: gl.NEAREST,
            [gl.TEXTURE_MAG_FILTER]: gl.NEAREST,
            [gl.TEXTURE_WRAP_S]: gl.CLAMP_TO_EDGE,
            [gl.TEXTURE_WRAP_T]: gl.CLAMP_TO_EDGE
        }
    });
}

SpotPointLayer.layerName = 'SpotPointLayer';
SpotPointLayer.defaultProps = {
    getPosition: { type: 'accessor', value: x => x.position },
    getGeneId: { type: 'accessor', value: 0 },
    getPlane: { type: 'accessor', value: 0 },
    getMisread: { type: 'accessor', value: 0 },
    geneTable: null,
    greyOutMisreads: false,
    hideMisreads: false,
    radiusPixels: { type: 'number', value: 1 },
    minRadiusPixels: { type: 'number', value: 0.5 },
    currentPlane: { type: 'number', value: 0 },
    sizeByPlaneDistance: true
};
