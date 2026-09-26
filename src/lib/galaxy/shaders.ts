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

vec3 blackbody(float kelvin) {
  float t = clamp(kelvin / 1000.0, 1.0, 22.0);
  vec3 c;
  if (t <= 6.6) {
    c.r = 1.0;
    c.g = clamp(0.3901 * log(t) + 0.5431, 0.0, 1.0);
    c.b = t < 1.9 ? 0.0 : clamp(0.5432 * log(t - 0.85) - 0.12, 0.0, 1.0);
  } else {
    float x = t - 6.0;
    c.r = clamp(1.37 * pow(t, -0.32), 0.0, 1.0);
    c.g = clamp(1.28 * pow(t, -0.20), 0.0, 1.0);
    c.b = 1.0;
    c.r = mix(c.r, 0.65 + 0.12 * x, 0.15);
  }
  return c;
}

float spiralArm(vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float arm = 0.0;
  for (int i = 0; i < 3; i++) {
    float aa = a + float(i) * 2.094395;
    float logSp = aa - log(max(r, 0.08)) * 2.35;
    float d = abs(sin(logSp));
    arm += pow(1.0 - d, 10.0) * smoothstep(5.4, 0.35, r);
  }
  return clamp(arm, 0.0, 1.0);
}

vec3 starLayer(vec2 uv, float scale, float thresh, float time) {
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
        vec2 q = gv - off - jitter * 0.72;
        float d = length(q);
        float mag = (n - thresh) / max(1.0 - thresh, 1e-4);
        float tw = 0.72 + 0.28 * sin(time * (1.3 + n * 4.0) + n * 40.0);
        if (uReduced > 0.5) tw = 0.9;
        float core = exp(-d * d * mix(1800.0, 420.0, mag));
        float halo = exp(-d * d * mix(90.0, 22.0, mag));
        vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.86, 0.7), hash21(cid + 19.0));
        float flare = exp(-q.x * q.x * 2200.0 - q.y * q.y * 20.0) + exp(-q.y * q.y * 2200.0 - q.x * q.x * 20.0);
        acc += tint * (core * 1.5 + halo * 0.3 + flare * 0.08) * mag * tw;
      }
    }
  }
  return acc;
}

vec3 galaxyField(vec2 w) {
  float r = length(w);
  float arms = spiralArm(w);
  float drift = uReduced > 0.5 ? 0.0 : uTime * 0.0008;
  float nbg = noise2(w * 0.11 + vec2(drift, 0.5 - drift * 0.6));
  float nfg = noise2(w * 0.27 + vec2(0.2 + drift * 1.8, 0.7));
  float wisps = noise2(w * 0.53 + vec2(-drift, 0.17 + drift));
  float cloud = nbg * 0.56 + nfg * 0.3 + wisps * 0.14;
  float cloudShape = smoothstep(0.34, 0.76, cloud);

  vec3 dust = vec3(0.025, 0.033, 0.064);
  vec3 nebA = vec3(0.15, 0.075, 0.14);
  vec3 nebB = vec3(0.045, 0.10, 0.17);
  vec3 nebC = vec3(0.16, 0.105, 0.064);
  vec3 neb = mix(nebA, nebB, nbg);
  neb = mix(neb, nebC, smoothstep(0.54, 0.9, nfg));
  neb *= cloudShape * (0.24 + arms * 0.84) * (0.62 + nfg * 0.54);
  neb *= smoothstep(6.2, 0.5, r);

  vec3 col = dust + neb;

  float dens = 0.18 + arms * 0.82;
  col += starLayer(w, 18.0, 0.978 - dens * 0.02, uTime) * 1.05;
  col += starLayer(w * 0.72 + 8.0, 7.5, 0.988, uTime * 0.7) * 1.35;
  col += starLayer(w + 40.0, 42.0, 0.987, uTime * 1.4) * 0.7;

  float coreGlow = exp(-r * 1.15) * (0.55 + 0.45 * nfg);
  col += coreGlow * vec3(1.0, 0.48, 0.18) * 0.22;

  float feed = 0.0;
  if (r > 0.08 && r < 1.65) {
    float ang = atan(w.y, w.x);
    float sp = ang + log(r) * 3.4 - uTime * 0.85;
    feed = pow(clamp(sin(sp * 3.0) * 0.5 + 0.5, 0.0, 1.0), 7.0);
    feed *= exp(-r * 1.7) * smoothstep(0.06, 0.18, r);
  }
  col += feed * vec3(1.0, 0.55, 0.22) * 0.42;

  return col;
}

vec3 skyStars(vec3 rd) {
  vec3 nrd = normalize(rd);
  float a = atan(nrd.z, nrd.x);
  float b = asin(clamp(nrd.y, -1.0, 1.0));
  vec2 sph = vec2(a, b);
  vec3 acc = vec3(0.0);
  vec2 p = sph * vec2(14.0, 18.0);
  vec2 id = floor(p);
  vec2 gv = fract(p) - 0.5;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cid = id + vec2(float(x), float(y));
      float n = hash21(cid + 3.1);
      if (n > 0.92) {
        vec2 q = gv - vec2(float(x), float(y)) - (hash22(cid) - 0.5) * 0.6;
        float d = length(q);
        float mag = (n - 0.92) / 0.08;
        acc += vec3(0.85, 0.92, 1.0) * exp(-d * d * 140.0) * mag * 1.6;
      }
    }
  }
  float milky = pow(clamp(1.0 - abs(nrd.y) * 1.6, 0.0, 1.0), 2.2) * 0.12;
  acc += milky * vec3(0.35, 0.42, 0.7);
  return acc;
}

vec3 marchHole(vec2 uv) {
  float rock = 1.0 - uReduced;
  vec3 ro = vec3(
    0.32 * sin(uTime * 0.11) * rock,
    2.05 + 0.16 * sin(uTime * 0.17) * rock,
    -15.6
  );
  vec3 ta = vec3(0.0, 0.02, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  float fl = 15.4;
  vec3 rd = normalize(uv.x * uu + uv.y * vv + fl * ww);

  vec3 p = ro;
  vec3 vel = rd;
  vec3 col = vec3(0.0);
  float tr = 1.0;

  const float rIn = 2.32;
  const float rOut = 11.2;

  for (int i = 0; i < 72; i++) {
    if (i >= uSteps) break;
    float r = length(p);
    if (r < 1.045) {
      tr *= 0.0;
      break;
    }

    float dt = mix(0.028, 0.20, clamp((r - 1.1) / 12.0, 0.0, 1.0));
    vec3 acc = -1.5 * p / pow(max(r, 0.2), 5.0);
    vec3 drag = vec3(-p.z, 0.0, p.x) * (0.72 / (r * r * r));
    vel += (acc + drag) * dt;
    p += vel * dt;

    r = length(p);
    float rho = length(p.xz);
    float h = p.y;

    if (rho > rIn && rho < rOut) {
      float thick = 0.16 + 0.38 * smoothstep(rIn, rOut, rho);
      float dens = exp(-(h * h) / (thick * thick));
      dens *= smoothstep(rOut, rOut * 0.68, rho);
      dens *= smoothstep(rIn * 0.82, rIn + 0.55, rho);

      float ang = atan(p.z, p.x);
      float kep = uTime * (2.55 / pow(rho, 1.5));
      vec2 tc = vec2(log(rho) * 0.62, fract(ang / TAU));
      float n = noise2(tc * vec2(2.2, 5.0) + vec2(kep * 0.07, kep * 0.12));
      n = n * 0.62 + 0.38 * noise2(tc * 6.1 + vec2(0.4, -kep * 0.2));
      dens *= 0.38 + 1.05 * n;

      float temp = 11000.0 * pow(rho / rIn, -0.78);
      vec3 dc = blackbody(temp);

      vec3 tng = normalize(vec3(-p.z, 0.0, p.x));
      float beta = 0.46 / sqrt(max(rho, 1.0));
      float mu = dot(tng, normalize(vel));
      float dop = clamp(1.0 + beta * mu * 1.85, 0.32, 2.55);
      dc *= pow(dop, 3.2);
      vec3 cool = mix(vec3(0.58, 0.42, 0.88), vec3(1.0, 0.48, 0.68), smoothstep(rIn, rOut, rho));
      cool *= 0.7 + dc.r * 0.35;
      vec3 hot = vec3(0.76, 0.68, 1.35);
      dc = mix(cool, dc, smoothstep(0.62, 1.2, dop));
      dc += hot * max(dop - 1.18, 0.0) * 0.7;

      float hs = pow(clamp(0.5 + 0.5 * cos(ang - kep * 2.4), 0.0, 1.0), 8.0);
      dc += hs * vec3(1.45, 1.0, 0.72) * (1.2 + uPulse * 3.2);

      float qpo = 0.88 + 0.12 * sin(uTime * 2.7 + rho);
      float a = dens * dt * 3.55 * qpo;
      a = clamp(a, 0.0, 0.88);
      col += tr * a * dc * 1.72;
      tr *= 1.0 - a * 0.9;
    }

    if (r > 1.12 && r < 3.4) {
      float c = exp(-abs(r - 1.55) * 2.4) * (0.55 + 0.45 * noise2(p.xz * 0.35 + uTime * 0.06));
      col += tr * c * dt * vec3(1.0, 0.52, 0.22) * 5.5 * (0.7 + 0.6 * uPulse);
    }

    float ax = length(p.xz);
    if (abs(p.y) > 1.35 && ax < 0.38 + abs(p.y) * 0.016) {
      float j = exp(-ax * 8.0) * smoothstep(1.3, 3.2, abs(p.y));
      j *= 0.45 + 0.55 * noise2(vec2(p.y * 0.18, uTime * 0.45));
      col += tr * j * dt * vec3(0.4, 0.7, 1.15) * 2.6;
    }

    if (tr < 0.012) break;
    if (r > 46.0) break;
  }

  col += tr * skyStars(normalize(vel));

  float sil = length(uv);
  float ring = smoothstep(0.18, 0.0, abs(sil - 2.55)) * 0.22;
  col += ring * vec3(1.0, 0.72, 0.4) * (0.35 + 0.65 * (1.0 - tr));

  float glow = exp(-sil * 0.11) * (0.10 + 0.06 * uPulse);
  col += glow * vec3(0.86, 0.56, 0.82);

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col += col * smoothstep(0.55, 2.4, lum) * 0.38;

  return col;
}

vec3 beacons(vec2 w) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uN) break;
    vec2 bp = uBodies[i].xy;
    float sz = uBodies[i].z;
    float seed = uBodies[i].w;
    vec2 d = w - bp;
    float dist = length(d);
    float tw = 0.75 + 0.25 * sin(uTime * (1.6 + seed * 2.2) + seed * 12.0);
    if (uReduced > 0.5) tw = 0.9;
    float sel = (uSel == i) ? 1.35 : 1.0;
    float hov = (uHover == i) ? 1.25 : 1.0;
    float core = exp(-dist * dist * (90.0 / max(sz, 0.2))) * 1.55;
    float halo = exp(-dist * dist * (8.5 / max(sz, 0.2))) * 0.72;
    float ring = smoothstep(0.07 * sz, 0.0, abs(dist - 0.085 * sz)) * 0.45 * hov;
    vec3 c = uBodyCol[i];
    acc += c * (core + halo) * tw * sel * hov;
    acc += c * ring * sel;
  }
  return acc;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 center = 0.5 * uRes;
  vec2 world = (frag - center) / (uRes.y * uZoom) + uCam;

  vec2 d = world - uBh;
  float r2 = dot(d, d);
  vec2 warped = world + d * (0.012 / (r2 + 0.00055));

  vec3 col = galaxyField(warped);
  col += beacons(world);

  vec2 bhScreen = (uBh - uCam) * uZoom * uRes.y + center;
  float horiz = max(uHorizon, 1.0);
  vec2 uvRs = (frag - bhScreen) / horiz;
  float distRs = length(uvRs);

  if (distRs < 22.0) {
    vec3 hole = marchHole(uvRs);
    float m = 1.0 - smoothstep(7.5, 18.0, distRs);
    m = pow(clamp(m, 0.0, 1.0), 0.85);
    col = mix(col, hole, m);
    col += hole * m * 0.08;
  }

  vec2 q = frag / uRes - 0.5;
  q.x *= uRes.x / uRes.y;
  col *= 1.0 - dot(q, q) * 0.28;
  col = pow(max(col, 0.0), vec3(0.92));

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
  vec3 cool = vec3(1.0, 0.32, 0.08);
  vec3 hot = vec3(0.65, 0.85, 1.2);
  vCol = mix(cool, vec3(1.0, 0.72, 0.35), clamp((12.0 - dist) / 10.0, 0.0, 1.0));
  vCol = mix(vCol, hot, pow(dop, 2.0) * 0.65);

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
