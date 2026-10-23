export const SCENE_VS = `#version 300 es
/* Fullscreen triangle via gl_VertexID - no array ctor (some drivers reject const array init).
   Vertices: (-1,-1), (3,-1), (-1,3). Used with drawArrays(TRIANGLES, 0, 3). */
void main() {
  float x = float((gl_VertexID & 1) << 2) - 1.0;
  float y = float((gl_VertexID & 2) << 1) - 1.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
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
uniform vec4 uBodies[12];
uniform vec3 uBodyCol[12];
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

float fbm(vec2 p) {
  float amp = 0.55;
  float sum = 0.0;
  vec2 q = p;
  int oct = 2 + clamp(uSteps / 16, 0, 3);
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    sum += amp * texture(uNoise, q).r;
    q = q * 2.03 + vec2(11.31, 7.77);
    amp *= 0.52;
  }
  return sum;
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

/* ===== Buraco negro: núcleo + horizonte de eventos (referência: vídeo de anéis com falha digital) =====
   Anéis finos e nítidos, quebrados em arcos, com separação cromática por canal e rasgos horizontais.
   Nada de brilho suave: só linha, falha e vazio. */

float wrapPi(float a) { return a - TAU * floor((a + PI) / TAU); }

/* intensidade de um canal do horizonte. p em unidades de Rs, ch: 0=R 1=G 2=B */
float horizonChannel(vec2 p, float ch, float t, float aa, float spread) {
  float sgn = ch - 1.0;
  /* aberração: o canal vermelho desliza para um lado, o azul para o outro */
  p -= vec2(sgn * 0.075 * spread, -sgn * 0.018 * spread);
  float r = length(p);
  float a = atan(p.y, p.x);
  float acc = 0.0;

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float R0 = 1.04 + 1.5 * fi + 0.38 * fi * fi;
    float dir = (i == 1 || i == 3) ? -1.0 : 1.0;
    float rot = t * dir * 0.16 / (1.0 + fi * 0.6);

    /* excentricidade: anéis externos deslizam para fora do centro, como no vídeo */
    float R = R0 + (0.05 + 0.11 * fi) * R0 * 0.5 * cos(a - 2.35 - fi * 0.7) * min(fi, 1.0)
                 + 0.012 * R0 * sin(a * 5.0 + fi * 2.0 - t * 0.7);
    R *= 1.0 + sgn * 0.010; /* aberração radial */

    float w = max(0.014 + 0.004 * fi, aa * 1.2);
    w *= 0.65 + 0.7 * (0.5 + 0.5 * sin(a * 3.0 + fi * 1.9 + rot * 2.0));

    float d = abs(r - R);
    float line = 1.0 - smoothstep(w, w + aa * 1.4, d);
    /* lado interno do anel guarda um resíduo fraco, o externo não */
    float inner = (r < R) ? exp(-d / (0.10 + 0.03 * fi)) * 0.22 : 0.0;

    float ph = fi * 2.17 + 0.6;
    float v = 0.5 * sin(a * 2.0 + ph + rot * 2.0) + 0.5 * sin(a * 3.0 - ph * 1.7 - rot * 1.2);
    float bias = (i == 0) ? 0.55 : 0.18;
    float gap = (i == 0) ? pow(max(cos(a - 0.12 - rot), 0.0), 22.0) : 0.0;
    float m = smoothstep(-0.05, 0.08, v + bias - gap * 1.7);

    /* eco: o anel reaparece levemente deslocado onde o arco principal falha */
    float Re = R * 1.052;
    float echo = (1.0 - smoothstep(w * 0.8, w * 0.8 + aa * 1.4, abs(r - Re)))
               * (1.0 - m) * smoothstep(0.1, 0.4, v + 0.5) * 0.7;

    float lvl = 0.55 + 0.45 * sin(a * 2.0 + fi * 1.3 - rot * 3.0);
    float fade = 1.0 - smoothstep(6.8, 9.5, r);
    acc += ((line + inner) * m * (0.45 + 0.75 * lvl) + echo * 0.8) * fade;
  }
  return acc;
}

/* detritos digitais: traços e blocos curtos, aparecem e somem em passos de tempo */
vec3 horizonDebris(vec2 p, float t, float rN) {
  float gt = floor(t * 9.0);
  vec3 outc = vec3(0.0);

  vec2 c1 = vec2(p.x / 0.62, p.y / 0.045);
  vec2 id1 = floor(c1);
  float h1 = hash21(id1 + vec2(gt * 1.7, gt * 3.1));
  float on1 = step(0.972, h1);
  float lenF = hash21(id1 * 1.31 + 7.0);
  float inX = step(fract(c1.x), 0.15 + lenF * 0.8) * step(0.12, fract(c1.x));
  float inY = step(abs(fract(c1.y) - 0.5), 0.2);
  float pick = hash21(id1 + 3.3);
  vec3 tint = pick < 0.35 ? vec3(0.95, 0.9, 0.35) : (pick < 0.62 ? vec3(0.9, 0.95, 0.9) : (pick < 0.82 ? vec3(0.35, 0.55, 1.0) : vec3(1.0, 0.3, 0.25)));
  outc += tint * on1 * inX * inY * (0.18 + 0.42 * lenF);

  vec2 c2 = vec2(p.x / 0.07, p.y / 0.55);
  vec2 id2 = floor(c2);
  float h2 = hash21(id2 + vec2(gt * 2.3, gt * 0.9) + 40.0);
  float on2 = step(0.985, h2);
  float inX2 = step(abs(fract(c2.x) - 0.5), 0.22);
  float inY2 = step(fract(c2.y), 0.25 + 0.6 * hash21(id2 + 9.0));
  outc += vec3(0.55, 0.95, 0.7) * on2 * inX2 * inY2 * 0.3;

  float env = smoothstep(1.15, 1.5, rN) * (1.0 - smoothstep(7.5, 10.5, rN));
  return outc * env;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  vec2 world = (frag - 0.5 * uRes) / (uZoom * uRes.y) + uCam;

  float Rs = max(uHorizon / (uZoom * uRes.y), 1e-5);
  vec2 rel = world - uBh;
  float rW = length(rel);
  float rN = rW / Rs;
  float t = uTime;
  float live = uReduced > 0.5 ? 0.0 : 1.0;
  float px = 1.0 / (uZoom * uRes.y * Rs); /* tamanho de 1 pixel em unidades de Rs */

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  for (int i = 0; i < 12; i++) {
    if (i >= uN) break;
    vec4 b = uBodies[i];
    float sz = max(b.z, 1e-4);
    vec2 d = world - b.xy;
    float r = length(d);
    float shape = floor(b.w + 0.5);
    float ph = fract(b.w) * 1000.0;
    vec3 bc = uBodyCol[i];
    float boost = (i == uHover || i == uSel) ? 1.8 : 1.0;
    float twk = 0.82 + 0.18 * sin(t * (1.1 + ph * 4.0) + ph * 41.0);
    if (uReduced > 0.5) twk = 0.95;

    if (shape < 0.5) {
      float g1 = exp(-r * r / (sz * sz * 0.16));
      float g2 = exp(-r * r / (sz * sz * 1.4)) * 0.32;
      float spikes = (exp(-abs(d.x) * 34.0 / sz - d.y * d.y * 60.0 / (sz * sz))
                    + exp(-abs(d.y) * 34.0 / sz - d.x * d.x * 60.0 / (sz * sz))) * 0.55;
      vec3 add = bc * (g1 * 1.5 + g2 + spikes * g1) * twk * boost;
      col += add;
      alpha = max(alpha, clamp(length(add) * 0.8, 0.0, 1.0));
    } else if (shape < 1.5) {
      float n = fbm(d * (1.6 / sz) + ph * 19.7);
      float cloud = smoothstep(0.32, 0.85, n) * exp(-r / (sz * 1.5));
      float core = exp(-r * r / (sz * sz * 0.3)) * 0.4;
      vec3 add = bc * (cloud * 0.55 + core) * twk * boost;
      col += add;
      alpha = max(alpha, clamp(length(add) * 0.9, 0.0, 1.0));
    } else if (shape < 2.5) {
      float a2 = atan(d.y, d.x);
      float arms = pow(0.5 + 0.5 * sin(a2 * 2.0 + r * (9.0 / sz) + ph * 6.28), 2.4);
      float gn = fbm(vec2(r * (3.2 / sz) - t * 0.004, a2 * 0.636 + ph));
      float body = exp(-r * r / (sz * sz * 0.8));
      float core = exp(-r * r / (sz * sz * 0.09)) * 1.1;
      vec3 add = bc * ((arms * (0.45 + gn * 0.8) + core) * body) * twk * boost;
      col += add;
      alpha = max(alpha, clamp(length(add) * 0.85, 0.0, 1.0));
    } else if (shape < 3.5) {
      float dot1 = exp(-r * r / (sz * sz * 0.02)) * 1.6;
      float ring = exp(-pow((r - sz * 0.42) / (sz * 0.05), 2.0)) * 0.5;
      float blink = smoothstep(0.86, 1.0, sin(t * 2.2 + ph * 9.0))
                  * exp(-r * r / (sz * sz * 0.5));
      vec3 add = bc * (dot1 + ring + blink * 1.2) * boost;
      col += add;
      alpha = max(alpha, clamp(length(add), 0.0, 1.0));
    } else {
      float ring = exp(-pow((r - sz * 0.5) / (sz * 0.17), 2.0));
      float a3 = atan(d.y, d.x);
      float wisp = 0.6 + 0.4 * texture(uNoise, vec2(a3 * 0.636 + ph, r * 0.8 / sz + t * 0.006)).r;
      float pupil = exp(-r * r / (sz * sz * 0.05)) * 0.8;
      vec3 add = bc * (ring * wisp + pupil) * 0.8 * twk * boost;
      col += add;
      alpha = max(alpha, clamp(length(add) * 0.9, 0.0, 1.0));
    }
  }

  /* ---- Horizonte de eventos: sobrepõe o núcleo ---- */
  vec2 p = rel / Rs;

  /* rasgos horizontais: faixas de linhas deslocadas em x, em passos de ~10 fps */
  float gt = floor(t * 10.0) * live;
  float rowId = floor(frag.y / (uRes.y * 0.016));
  float nRow = hash21(vec2(rowId, gt));
  float tear = step(0.935, nRow) * live;
  float shift = (hash21(vec2(rowId + 11.0, gt)) - 0.5) * 1.1 * tear;
  float bigId = floor(frag.y / (uRes.y * 0.09));
  float bigTear = step(0.975, hash21(vec2(bigId + 5.0, gt))) * live;
  shift += (hash21(vec2(bigId, gt + 3.0)) - 0.5) * 2.2 * bigTear;
  vec2 pg = vec2(p.x + shift, p.y);
  float spread = 1.0 + 3.2 * (tear + bigTear);

  /* tremor discreto da própria geometria */
  pg += live * (vec2(hash21(vec2(gt, 1.0)), hash21(vec2(gt, 2.0))) - 0.5) * 0.02;

  float aa = px * 1.5;
  vec3 ring = vec3(
    horizonChannel(pg, 0.0, t, aa, spread),
    horizonChannel(pg, 1.0, t, aa, spread),
    horizonChannel(pg, 2.0, t, aa, spread)
  );
  /* cores do vídeo: o canal verde puxa para o amarelo-limão, o vermelho e o azul ficam nas bordas */
  ring *= vec3(1.15, 0.92, 1.25) * (1.0 + uPulse * 0.6);

  ring += horizonDebris(pg, t, rN) * live;
  if (uReduced > 0.5) ring += horizonDebris(pg, 1.0, rN) * 0.5;

  float a = clamp(max(ring.r, max(ring.g, ring.b)), 0.0, 1.0);

  /* núcleo: preto absoluto, opaco */
  float core = 1.0 - smoothstep(1.0 - px * 1.5, 1.0, rN);

  col = col * (1.0 - a) + ring;
  alpha = max(alpha, a);
  col *= (1.0 - core * (1.0 - a)); /* o que estiver sob o núcleo some; o anel por cima permanece */
  alpha = max(alpha, core);

  fragColor = vec4(col / max(alpha, 1e-4), alpha);
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
precision highp float;
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
