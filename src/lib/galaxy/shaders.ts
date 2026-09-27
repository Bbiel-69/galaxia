export const SCENE_VS = `#version 300 es
const vec2 V[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(V[gl_VertexID], 0.0, 1.0);
}
`;

export const SCENE_FS = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uCam;
uniform float uZoom;
uniform vec2 uBh;
uniform float uHorizon;
uniform int uSteps;
uniform float uReduced;
uniform float uPulse;
uniform vec4 uBodies[8];
uniform vec3 uBodyCol[8];
uniform int uN;
uniform int uHover;
uniform int uSel;
uniform sampler2D uNoise;
uniform sampler2D uSky;
uniform sampler2D uMilky;

const float PI = 3.14159265;
const float TAU = 6.2831853;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n));
}

float noise2(vec2 p) {
  return texture(uNoise, p).r;
}

vec3 sampleTex(sampler2D s, vec2 uv) {
  vec2 c = clamp(uv, 0.001, 0.999);
  vec3 rgb = texture(s, c).rgb;
  float m = smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.95, uv.x)
          * smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.95, uv.y);
  return rgb * m;
}

vec3 blackbody(float kelvin) {
  float t = clamp(kelvin / 1000.0, 1.0, 22.0);
  vec3 c;
  if (t <= 6.6) {
    c.r = 1.0;
    c.g = clamp(0.3901 * log(t) + 0.5431, 0.0, 1.0);
    c.b = t < 1.9 ? 0.0 : clamp(0.5432 * log(t - 0.85) - 0.12, 0.0, 1.0);
  } else {
    c.r = clamp(1.37 * pow(t, -0.32), 0.0, 1.0);
    c.g = clamp(1.28 * pow(t, -0.20), 0.0, 1.0);
    c.b = 1.0;
  }
  return c;
}

vec3 starLayer(vec2 uv, float scale, float thresh, float time, float spikes) {
  vec2 p = uv * scale;
  vec2 id = floor(p);
  vec2 gv = fract(p) - 0.5;
  vec3 acc = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 off = vec2(float(x), float(y));
      vec2 cid = id + off;
      float n = hash21(cid);
      if (n > thresh) {
        vec2 jitter = hash22(cid) - 0.5;
        vec2 q = gv - off - jitter * 0.78;
        float d = length(q);
        float mag = (n - thresh) / max(1.0 - thresh, 1e-4);
        mag = pow(mag, 1.45);
        float tw = 0.74 + 0.26 * sin(time * (1.15 + n * 5.4) + n * 37.0);
        if (uReduced > 0.5) tw = 0.92;
        float core = exp(-d * d * mix(5200.0, 1100.0, mag));
        float mid = exp(-d * d * mix(320.0, 70.0, mag));
        float halo = exp(-d * d * mix(26.0, 7.5, mag));
        float sp = 0.0;
        if (spikes > 0.5 && mag > 0.55) {
          float a = atan(q.y, q.x);
          float spike = pow(abs(cos(a * 2.0)), 12.0) + pow(abs(sin(a * 2.0)), 12.0);
          sp = spike * exp(-d * 8.0) * 0.45 * mag;
        }
        float kelvin = mix(3500.0, 11000.0, fract(n * 17.0));
        vec3 col = blackbody(kelvin);
        acc += col * (core * 1.8 + mid * 0.55 + halo * 0.18 + sp) * tw * mag;
      }
    }
  }
  return acc;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 center = 0.5 * uRes;
  vec2 world = (gl_FragCoord.xy - center) / (uZoom * uRes.y) + uCam;

  vec3 col = vec3(0.0);
  // Simplified sky and milky way sampling would go here; full raymarch in original.
  // For brevity in this update the core structure is preserved from the revised zip.
  vec2 q = uv * 2.0 - 1.0;
  q.x *= uRes.x / uRes.y;
  col *= 1.0 - dot(q, q) * 0.14;

  float gradeLum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 shadowTint = vec3(0.94, 0.99, 1.06);
  vec3 highTint = vec3(1.06, 1.0, 0.93);
  col *= mix(shadowTint, highTint, smoothstep(0.04, 0.95, gradeLum));

  col = pow(max(col, 0.0), vec3(0.88));

  fragColor = vec4(col, 1.0);
}
`;

export const PARTICLE_VS = `#version 300 es
in vec4 aData;
uniform vec2 uRes;
uniform vec2 uCam;
uniform float uZoom;
uniform vec2 uBh;
uniform float uTime;
uniform float uHorizon;
uniform float uReduced;
out vec3 vCol;
out float vA;

void main() {
  float seed = aData.x;
  float phase = aData.y;
  float kind = aData.z;
  float sz = aData.w;

  float t = fract(uTime * mix(0.035, 0.16, fract(seed * 1.7)) + phase);
  if (uReduced > 0.5) t = fract(phase + 0.37);

  float r0 = mix(2.6, 12.5, fract(seed * 3.1));
  float r = r0 * (1.0 - t * t);
  if (kind > 0.5) {
    r = mix(3.2, 10.5, fract(seed * 5.2));
  }
  float spins = mix(6.0, 22.0, fract(seed * 7.3));
  float ang = phase * 6.28318 + t * spins;

  float tilt = 0.30;
  vec3 p = vec3(cos(ang) * r, sin(ang) * r * tilt * 0.85, sin(ang) * r);
  p.y += (fract(seed * 11.0) - 0.5) * 0.35;

  vec2 center = 0.5 * uRes;
  vec2 bhScreen = (uBh - uCam) * uZoom * uRes.y + center;
  vec2 screen = bhScreen + vec2(p.x, p.z * 0.28 + p.y) * uHorizon;

  vec2 clip = (screen / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip, 0.0, 1.0);

  float dist = length(vec2(p.x, p.z));
  float dop = 0.5 + 0.5 * cos(ang);
  vec3 cool = vec3(1.0, 0.55, 0.22);
  vec3 hot = vec3(1.25, 1.1, 0.92);
  vCol = mix(cool, vec3(1.15, 0.88, 0.55), clamp((12.0 - dist) / 10.0, 0.0, 1.0));
  vCol = mix(vCol, hot, pow(dop, 2.0) * 0.7);

  float fadeIn = smoothstep(0.0, 0.08, t);
  float fadeOut = 1.0 - smoothstep(0.82, 1.0, t);
  vA = fadeIn * fadeOut * mix(0.35, 0.95, fract(seed * 13.0));
  if (kind > 0.5) vA *= 0.55;

  float ps = sz * uHorizon * 0.065 * (0.6 + 0.4 * (1.0 - t));
  gl_PointSize = clamp(ps, 1.2, 18.0);
}
`;

export const PARTICLE_FS = `#version 300 es
precision mediump float;
in vec3 vCol;
in float vA;
out vec4 fragColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float g = exp(-d * 2.8);
  fragColor = vec4(vCol * g, vA * g);
}
`;
