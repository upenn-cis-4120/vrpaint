#include "lib/Compatibility.frag"

#define FEATURE_TEXTURED
#define FEATURE_ALPHA_MASKED
#define FEATURE_VERTEX_COLORS
#define USE_WORLD_TO_VIEW
#define USE_POSITION_WORLD

#ifdef TEXTURED
#define USE_TEXTURE_COORDS
#endif
#ifdef VERTEX_COLORS
#define USE_COLOR
#endif

#define USE_MATERIAL_ID
#include "lib/Uniforms.glsl"
#include "lib/Inputs.frag"

#ifdef TEXTURED
#include "lib/Textures.frag"
#endif
#include "lib/Materials.frag"

struct Material {
    lowp vec4 color;
    mediump vec4 paintPoint;
#ifdef TEXTURED
    mediump uint flatTexture;
#endif
};

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

void main() {
#ifdef TEXTURED
    alphaMask(fragMaterialId, fragTextureCoords);
#endif

    Material mat = decodeMaterial(fragMaterialId);
    outColor =
        #ifdef VERTEX_COLORS
        fragColor*
        #endif
        #ifdef TEXTURED
        textureAtlas(mat.flatTexture, fragTextureCoords)*
        #endif
        mat.color;
    outColor = (fragPositionWorld[0] - mat.paintPoint[0]) * (fragPositionWorld[0] - mat.paintPoint[0]) +
               (fragPositionWorld[1] - mat.paintPoint[1]) * (fragPositionWorld[1] - mat.paintPoint[1]) +
               (fragPositionWorld[2] - mat.paintPoint[2]) * (fragPositionWorld[2] - mat.paintPoint[2]) < 0.2 
               ? vec4(1.0, 0.0, 0.0, 1.0) : mat.color;
}
