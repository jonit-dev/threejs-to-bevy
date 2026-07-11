// Altered from the sampling and ray-march algorithms in 0beqz/realism-effects.
// See the adjacent LICENSE.md. This shader is adapter-owned and composer-native.
export const ssgiSpatialFragmentShader = `
  uniform sampler2D tBeauty;
  uniform sampler2D tDepth;
  uniform mat4 projection;
  uniform mat4 projectionInverse;
  uniform vec2 resolution;
  uniform vec3 ambientRadiance;
  uniform float radius;
  uniform float frame;
  uniform int rayCount;
  uniform int stepCount;
  varying vec2 vUv;
  const int REFINE_STEPS = 4;

  float random(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233)) + frame * 0.754877666) * 43758.5453);
  }

  vec3 viewPosition(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = projectionInverse * clip;
    return view.xyz / max(view.w, 1e-6);
  }

  vec3 viewNormal(vec2 uv, vec3 center) {
    vec2 texel = 1.0 / resolution;
    vec3 px = viewPosition(uv + vec2(texel.x, 0.0), texture2D(tDepth, uv + vec2(texel.x, 0.0)).x);
    vec3 py = viewPosition(uv + vec2(0.0, texel.y), texture2D(tDepth, uv + vec2(0.0, texel.y)).x);
    vec3 normal = normalize(cross(px - center, py - center));
    return dot(normal, -center) < 0.0 ? -normal : normal;
  }

  vec3 cosineHemisphere(vec3 normal, vec2 samplePoint) {
    float phi = 6.28318530718 * samplePoint.x;
    float radial = sqrt(samplePoint.y);
    vec3 tangent = normalize(abs(normal.z) < 0.999 ? cross(normal, vec3(0.0, 0.0, 1.0)) : cross(normal, vec3(0.0, 1.0, 0.0)));
    vec3 bitangent = cross(normal, tangent);
    return normalize(tangent * cos(phi) * radial + bitangent * sin(phi) * radial + normal * sqrt(max(0.0, 1.0 - samplePoint.y)));
  }

  bool projectUv(vec3 view, out vec2 uv) {
    vec4 clip = projection * vec4(view, 1.0);
    if (clip.w <= 0.0) return false;
    uv = clip.xy / clip.w * 0.5 + 0.5;
    return all(greaterThanEqual(uv, vec2(0.001))) && all(lessThanEqual(uv, vec2(0.999)));
  }

  void main() {
    float depth = texture2D(tDepth, vUv).x;
    if (depth >= 0.999999) {
      gl_FragColor = vec4(ambientRadiance, 0.0);
      return;
    }

    vec3 origin = viewPosition(vUv, depth);
    vec3 normal = viewNormal(vUv, origin);
    vec3 gathered = vec3(0.0);
    float totalWeight = 0.0;
    float totalConfidence = 0.0;
    float baseNoise = random(gl_FragCoord.xy);

    for (int rayIndex = 0; rayIndex < 8; rayIndex++) {
      if (rayIndex >= rayCount) break;
      float raySeed = (float(rayIndex) + baseNoise) / max(float(rayCount), 1.0);
      vec2 samplePoint = vec2(fract(raySeed * 0.754877666), fract(raySeed * 0.569840296 + baseNoise));
      vec3 direction = cosineHemisphere(normal, samplePoint);
      float cosineWeight = max(dot(normal, direction), 0.0);
      vec3 radiance = ambientRadiance;
      float hitWeight = 0.25;
      float previousDistance = 0.0;

      for (int stepIndex = 1; stepIndex <= 16; stepIndex++) {
        if (stepIndex > stepCount) break;
        float distanceAlongRay = radius * float(stepIndex) / max(float(stepCount), 1.0);
        vec3 rayPosition = origin + direction * distanceAlongRay;
        vec2 rayUv;
        if (!projectUv(rayPosition, rayUv)) break;
        float sceneDepth = texture2D(tDepth, rayUv).x;
        if (sceneDepth >= 0.999999) continue;
        vec3 scenePosition = viewPosition(rayUv, sceneDepth);
        float crossing = scenePosition.z - rayPosition.z;
        float thickness = max(0.04, distanceAlongRay * 0.08);
        if (crossing >= 0.0 && crossing <= thickness) {
          float lowDistance = previousDistance;
          float highDistance = distanceAlongRay;
          vec2 refinedUv = rayUv;
          for (int refineIndex = 0; refineIndex < REFINE_STEPS; refineIndex++) {
            float midDistance = (lowDistance + highDistance) * 0.5;
            vec3 midPosition = origin + direction * midDistance;
            vec2 midUv;
            if (!projectUv(midPosition, midUv)) break;
            float midDepth = texture2D(tDepth, midUv).x;
            vec3 midScenePosition = viewPosition(midUv, midDepth);
            float midCrossing = midScenePosition.z - midPosition.z;
            if (midCrossing >= 0.0) {
              highDistance = midDistance;
              refinedUv = midUv;
            } else {
              lowDistance = midDistance;
            }
          }
          radiance = texture2D(tBeauty, refinedUv).rgb;
          hitWeight = 1.0 - highDistance / max(radius, 1e-4);
          break;
        }
        previousDistance = distanceAlongRay;
      }

      float weight = cosineWeight * max(hitWeight, 0.05);
      gathered += radiance * weight;
      totalWeight += weight;
      totalConfidence += hitWeight;
    }

    gl_FragColor = vec4(gathered / max(totalWeight, 1e-5), totalConfidence / max(float(rayCount), 1.0));
  }
`;

export const ssgiCompositeFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform sampler2D tIndirect;
  uniform sampler2D tDepth;
  uniform mat4 projectionInverse;
  uniform vec2 indirectTexelSize;
  uniform float intensity;
  varying vec2 vUv;

  float linearViewDepth(vec2 uv) {
    float depth = texture2D(tDepth, uv).x;
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = projectionInverse * clip;
    return abs(view.z / max(view.w, 1e-6));
  }

  void main() {
    float centerDepth = linearViewDepth(vUv);
    vec2 halfPixel = indirectTexelSize * 0.5;
    vec2 offsets[4];
    offsets[0] = vec2(-halfPixel.x, -halfPixel.y);
    offsets[1] = vec2( halfPixel.x, -halfPixel.y);
    offsets[2] = vec2(-halfPixel.x,  halfPixel.y);
    offsets[3] = vec2( halfPixel.x,  halfPixel.y);
    vec3 indirect = vec3(0.0);
    float totalWeight = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 uv = clamp(vUv + offsets[i], vec2(0.0), vec2(1.0));
      float relativeDepthDelta = abs(linearViewDepth(uv) - centerDepth) / max(centerDepth, 0.01);
      float weight = exp(-relativeDepthDelta * 24.0);
      indirect += texture2D(tIndirect, uv).rgb * weight;
      totalWeight += weight;
    }
    indirect /= max(totalWeight, 1e-5);
    vec4 source = texture2D(tDiffuse, vUv);
    gl_FragColor = vec4(source.rgb + indirect * intensity, source.a);
  }
`;

export const ssgiFullscreenVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
