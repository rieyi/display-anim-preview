#version 330

#moj_import <minecraft:fog.glsl>
#moj_import <minecraft:dynamictransforms.glsl>

uniform sampler2D Sampler0;

#ifdef DISSOLVE
uniform sampler2D DissolveMaskSampler;
#endif

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
#ifdef PER_FACE_LIGHTING
in vec4 vertexPerFaceColorBack;
in vec4 vertexPerFaceColorFront;
#else
in vec4 vertexColor;
#endif

#ifndef EMISSIVE
in vec4 lightMapColor;
#endif

#ifndef NO_OVERLAY
in vec4 overlayColor;
#endif

in vec2 texCoord0;
in vec2 modelTexCoord;
in vec3 modelPosition;

out vec4 fragColor;

const float SKIN_SIZE = 64.0;
const float HEAD_FACE_SIZE = 8.0;
const float RIGHT_HAND_TAG_SCALE = 0.99;
const vec3 HAND_MODEL_SCALE = vec3(0.471, 0.515, 1.515);
const vec3 modelScaleF = 0.5 * HAND_MODEL_SCALE;
const vec3 modelScaleS = modelScaleF + (0.25 / 8.0) * HAND_MODEL_SCALE;
const vec3 hRefF = vec3(length(modelScaleF.xz), length(modelScaleF.yz), length(modelScaleF.xy));
const vec3 hRefS = vec3(length(modelScaleS.xz), length(modelScaleS.yz), length(modelScaleS.xy));

const ivec4 armUV[] = ivec4[](
    ivec4(40, 52, 36, 64),
    ivec4(44, 64, 48, 52),
    ivec4(36, 64, 32, 52),
    ivec4(44, 52, 40, 48),
    ivec4(40, 52, 44, 64),
    ivec4(36, 52, 40, 48)
);

const ivec4 slimArmUV[] = ivec4[](
    ivec4(39, 52, 36, 64),
    ivec4(43, 64, 46, 52),
    ivec4(36, 64, 32, 52),
    ivec4(42, 52, 39, 48),
    ivec4(39, 52, 43, 64),
    ivec4(36, 52, 39, 48)
);

const bool armRotateUV[] = bool[](
    false, false, true, false, true, false
);

bool testDim(float h, float hRef) {
    return abs(h - hRef) < 0.001;
}

bool testDims(float h, vec3 hRef) {
    return testDim(h, hRef.x) || testDim(h, hRef.y) || testDim(h, hRef.z);
}

bool isSlimSkin() {
    vec4 samp1 = texture(Sampler0, vec2(54.0 / SKIN_SIZE, 20.0 / SKIN_SIZE));
    vec4 samp2 = texture(Sampler0, vec2(55.0 / SKIN_SIZE, 20.0 / SKIN_SIZE));
    return samp1.a == 0.0 || (((samp1.r + samp1.g + samp1.b) == 0.0)
        && ((samp2.r + samp2.g + samp2.b) == 0.0)
        && samp1.a == 1.0 && samp2.a == 1.0);
}

float faceDiagonal() {
    vec3 dpdx = dFdx(modelPosition);
    vec3 dpdy = dFdy(modelPosition);
    vec2 duvdx = dFdx(modelTexCoord);
    vec2 duvdy = dFdy(modelTexCoord);
    float determinant = duvdx.x * duvdy.y - duvdx.y * duvdy.x;
    if (abs(determinant) < 1e-10) {
        return 0.0;
    }

    vec3 dpdu = (dpdx * duvdy.y - dpdy * duvdx.y) / determinant;
    vec3 dpdv = (dpdy * duvdx.x - dpdx * duvdy.x) / determinant;
    return length((dpdv - dpdu) * (HEAD_FACE_SIZE / SKIN_SIZE));
}

bool decodeHeadUV(vec2 sourceCoord, out int face, out bool overlay, out vec2 faceCoord) {
    vec2 pixel = sourceCoord * SKIN_SIZE;
    overlay = pixel.x >= 32.0;
    if (overlay) {
        pixel.x -= 32.0;
    }

    vec2 faceOrigin;
    if (pixel.y >= 0.0 && pixel.y <= 8.0 && pixel.x >= 8.0 && pixel.x <= 24.0) {
        if (pixel.x < 16.0) {
            face = 0;
            faceOrigin = vec2(8.0, 0.0);
        } else {
            face = 1;
            faceOrigin = vec2(16.0, 0.0);
        }
    } else if (pixel.y >= 8.0 && pixel.y <= 16.0 && pixel.x >= 0.0 && pixel.x <= 32.0) {
        if (pixel.x < 8.0) {
            face = 2;
            faceOrigin = vec2(0.0, 8.0);
        } else if (pixel.x < 16.0) {
            face = 3;
            faceOrigin = vec2(8.0, 8.0);
        } else if (pixel.x < 24.0) {
            face = 4;
            faceOrigin = vec2(16.0, 8.0);
        } else {
            face = 5;
            faceOrigin = vec2(24.0, 8.0);
        }
    } else {
        return false;
    }

    faceCoord = clamp((pixel - faceOrigin) / HEAD_FACE_SIZE, vec2(0.0), vec2(1.0));
    return true;
}

vec2 armTexCoord(int face, bool overlay, bool rightHand, bool slim, vec2 sourceFaceCoord) {
    ivec4 uvData = slim ? slimArmUV[face] : armUV[face];
    if (rightHand) {
        uvData += ivec4(8, -32, 8, -32);
        if (overlay) {
            uvData.yw += 16;
        }
    } else if (overlay) {
        uvData.xz += 16;
    }

    vec2 result;
    if (armRotateUV[face]) {
        result.x = mix(float(uvData.x), float(uvData.z), sourceFaceCoord.y);
        result.y = mix(float(uvData.w), float(uvData.y), sourceFaceCoord.x);
    } else {
        result.x = mix(float(uvData.z), float(uvData.x), sourceFaceCoord.x);
        result.y = mix(float(uvData.y), float(uvData.w), sourceFaceCoord.y);
    }
    return result / SKIN_SIZE;
}

void main() {
    vec2 texCoord = texCoord0;

    if (textureSize(Sampler0, 0) == ivec2(64, 64)) {
        float h = faceDiagonal();
        bool leftHand = testDims(h, hRefF) || testDims(h, hRefS);
        bool rightHand = testDims(h, hRefF * RIGHT_HAND_TAG_SCALE)
            || testDims(h, hRefS * RIGHT_HAND_TAG_SCALE);

        int face;
        bool overlay;
        vec2 sourceFaceCoord;
        if ((leftHand || rightHand) && decodeHeadUV(modelTexCoord, face, overlay, sourceFaceCoord)) {
            // The player-head bottom face is 180 degrees opposite to the arm UV orientation.
            if (face == 1) {
                sourceFaceCoord = vec2(1.0) - sourceFaceCoord;
            }
            texCoord = armTexCoord(face, overlay, rightHand, isSlimSkin(), sourceFaceCoord);
        }
    }

    vec4 color = texture(Sampler0, texCoord);
#ifdef ALPHA_CUTOUT
    if (color.a < ALPHA_CUTOUT) {
        discard;
    }
#endif

#ifdef PER_FACE_LIGHTING
    vec4 faceVertexColor = gl_FrontFacing ? vertexPerFaceColorFront : vertexPerFaceColorBack;
#else
    vec4 faceVertexColor = vertexColor;
#endif

#ifdef DISSOLVE
    if (faceVertexColor.a < texture(DissolveMaskSampler, texCoord).a) {
        discard;
    }
    faceVertexColor.a = 1.0;
#endif

    color *= faceVertexColor * ColorModulator;
#ifndef NO_OVERLAY
    color.rgb = mix(overlayColor.rgb, color.rgb, overlayColor.a);
#endif
#ifndef EMISSIVE
    color *= lightMapColor;
#endif

    fragColor = apply_fog(color, sphericalVertexDistance, cylindricalVertexDistance, FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
}
