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

/* Disco de acreção 3D estilo Gargantua - retorna cor premultiplicada + cobertura em .a */
vec4 diskSample(float rd, float a, float Rs, float t) {
  float rIn = Rs * 2.05;
  float rOut = Rs * 11.5;

  /* rotação Kepleriana diferencial: interno gira mais rápido */
  float om = 0.58 / pow(max(rd / Rs, 0.35), 1.55);
  float aE = a + t * om;

  /* streaks de plasma em espaço polar (3 oitavas de ruído animado) */
  vec2 sp = vec2(rd * 0.92 / Rs, aE * 0.6366);
  float s1 = texture(uNoise, vec2(sp.x * 0.11 - t * 0.0048, sp.y)).r;
  float s2 = texture(uNoise, vec2(sp.x * 0.28 + t * 0.0035, sp.y * 2.7 + s1 * 0.4)).g;
  float s3 = texture(uNoise, vec2(sp.x * 0.58 - t * 0.009,  sp.y * 5.4 + s2 * 0.55)).r;
  float streak = s1 * 0.48 + s2 * 0.34 + s3 * 0.28;
  streak = pow(clamp(streak, 0.0, 1.0), 1.65);

  /* perfil radial: borda interna nítida, queda externa suave + leve volume */
  float prof = smoothstep(rIn * 0.78, rIn * 1.15, rd)
             * (1.0 - smoothstep(rOut * 0.48, rOut, rd));
  /* leve variação de espessura (3D) — sem distorcer o perfil */
  float thickness = 1.0 - 0.12 * abs(sin(aE * 2.0 + t * 0.25));

  /* gradiente de temperatura: núcleo branco-quente -> dourado -> rosé/lavanda */
  float temp = smoothstep(rOut, rIn * 1.05, rd);
  vec3 c = mix(vec3(0.62, 0.38, 0.68), vec3(1.05, 0.70, 0.38), smoothstep(0.02, 0.42, temp));
  c = mix(c, vec3(1.38, 1.28, 1.10), smoothstep(0.38, 0.96, temp));

  /* beaming Doppler: lado que se aproxima mais brilhante e azulado */
  float dop = clamp(1.0 / pow(1.0 + 0.42 * cos(aE), 3.1), 0.20, 3.6);
  float dopN = dop / 1.95;
  c = mix(c, c * vec3(0.90, 0.97, 1.15), clamp(dopN - 0.68, 0.0, 1.0) * 0.55);
  c = mix(c, c * vec3(1.10, 0.88, 0.78), clamp(0.52 - dopN, 0.0, 1.0) * 0.55);

  /* aro interno incandescente (ISCO) */
  float innerRim = exp(-pow((rd - rIn * 1.02) / (Rs * 0.28), 2.0)) * 1.65;

  float lum = (streak * 1.22 + innerRim + 0.10) * prof * thickness * mix(0.48, 1.42, clamp(dopN, 0.0, 1.5));
  float alpha = clamp(prof * thickness * (0.52 + streak * 0.68) * mix(0.58, 1.18, clamp(dopN, 0.0, 1.0)), 0.0, 1.0);
  return vec4(c * lum, alpha);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  vec2 world = (frag - 0.5 * uRes) / (uZoom * uRes.y) + uCam;

  float Rs = max(uHorizon / (uZoom * uRes.y), 1e-5);
  vec2 rel = world - uBh;
  float rW = length(rel);
  float t = uTime;
  float pulse = 1.0 + 0.055 * sin(t * TAU / 8.3) + uPulse * 0.35;

  /* Transparent base so the video background shows through. */
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  /* Optional very subtle residual glow near the hole (no stars / nebulae / bodies). */
  col += vec3(0.45, 0.28, 0.22) * exp(-max(rW - Rs, 0.0) * 1.6) * 0.04 * pulse;
  alpha = max(alpha, exp(-max(rW - Rs * 2.5, 0.0) * 0.9) * 0.15);

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

  /* ===== 3D Black Hole — pure black nucleus FULLY UNDER multi-ring event horizon ===== */
  /* Disco elíptico (tilt) — sem warping de perspectiva (evita horizonte torto) */
  float TILT = 0.295;
  vec2 dp = vec2(rel.x, rel.y / TILT);
  float rd = length(dp);
  float aDisk = atan(dp.y, dp.x);

  vec4 disk = diskSample(rd, aDisk, Rs, t) * pulse;

  /* Halo suave ao redor da silhueta */
  float halo = exp(-pow(max(rW - Rs * 1.04, 0.0) / (Rs * 1.4), 2.0));
  col += vec3(1.0, 0.70, 0.42) * halo * 0.20 * pulse;
  alpha = max(alpha, halo * 0.32);

  /* Disco de acreção por cima do fundo */
  col = col * (1.0 - disk.a) + disk.rgb;
  alpha = max(alpha, disk.a);

  float phi = atan(rel.y, rel.x);
  float rN = rW / Rs;

  /* Photon ring / lente — anel que envolve a silhueta */
  float lensR = mix(Rs * 7.8, Rs * 2.2, clamp(rN, 0.0, 1.0));
  vec4 lensed = diskSample(lensR, phi, Rs, t) * pulse;
  float lensW = (1.0 - smoothstep(0.90, 1.02, rN))
              * smoothstep(0.32, 0.78, rN)
              * (0.42 + 0.58 * abs(sin(phi)));
  col += lensed.rgb * lensW * 0.88;
  alpha = max(alpha, lensed.a * lensW * 0.55);

  /* ============================================================ */
  /*  HORIZONTE DE EVENTOS — multi-aneis GROSSOS estilo vídeo      */
  /*  O núcleo preto fica TOTALMENTE sob / dentro do anel interno   */
  /* ============================================================ */

  /* Núcleo 100% preto — raio um pouco menor que o anel interno */
  float coreR = Rs * 0.88;
  float core = 1.0 - smoothstep(coreR * 0.94, coreR, rW);
  col = mix(col, vec3(0.0), core);
  alpha = max(alpha, core);

  /* ---- Multi-aneis concêntricos GROSSOS com aberração cromática (ref. vídeo) ---- */
  /* Larguras bem maiores para ficarem visíveis como no vídeo de referência */
  float ring0 = exp(-pow((rW - Rs * 1.02) / (Rs * 0.085), 2.0));
  float ring1 = exp(-pow((rW - Rs * 1.32) / (Rs * 0.11), 2.0));
  float ring2 = exp(-pow((rW - Rs * 1.70) / (Rs * 0.14), 2.0));
  float ring3 = exp(-pow((rW - Rs * 2.20) / (Rs * 0.18), 2.0));
  float ring4 = exp(-pow((rW - Rs * 2.85) / (Rs * 0.24), 2.0));

  float ringSum = ring0 * 1.55 + ring1 * 1.15 + ring2 * 0.80 + ring3 * 0.48 + ring4 * 0.22;

  /* Aberração cromática FORTE nos anéis (RGB split radial) — como no vídeo */
  float aberrAmt = Rs * 0.12 * (0.75 + 0.35 * sin(t * 1.4 + phi * 2.5));
  float rR = rW + aberrAmt;
  float rG = rW;
  float rB = rW - aberrAmt * 1.2;

  float ringR0 = exp(-pow((rR - Rs * 1.02) / (Rs * 0.085), 2.0));
  float ringG0 = exp(-pow((rG - Rs * 1.02) / (Rs * 0.085), 2.0));
  float ringB0 = exp(-pow((rB - Rs * 1.02) / (Rs * 0.085), 2.0));

  float ringR1 = exp(-pow((rR - Rs * 1.32) / (Rs * 0.11), 2.0));
  float ringG1 = exp(-pow((rG - Rs * 1.32) / (Rs * 0.11), 2.0));
  float ringB1 = exp(-pow((rB - Rs * 1.32) / (Rs * 0.11), 2.0));

  float ringR2 = exp(-pow((rR - Rs * 1.70) / (Rs * 0.14), 2.0));
  float ringG2 = exp(-pow((rG - Rs * 1.70) / (Rs * 0.14), 2.0));
  float ringB2 = exp(-pow((rB - Rs * 1.70) / (Rs * 0.14), 2.0));

  float ringR3 = exp(-pow((rR - Rs * 2.20) / (Rs * 0.18), 2.0));
  float ringG3 = exp(-pow((rG - Rs * 2.20) / (Rs * 0.18), 2.0));
  float ringB3 = exp(-pow((rB - Rs * 2.20) / (Rs * 0.18), 2.0));

  float ringR4 = exp(-pow((rR - Rs * 2.85) / (Rs * 0.24), 2.0));
  float ringG4 = exp(-pow((rG - Rs * 2.85) / (Rs * 0.24), 2.0));
  float ringB4 = exp(-pow((rB - Rs * 2.85) / (Rs * 0.24), 2.0));

  vec3 chromRing;
  chromRing.r = (ringR0 * 1.70 + ringR1 * 1.25 + ringR2 * 0.85 + ringR3 * 0.50 + ringR4 * 0.25) * 1.35;
  chromRing.g = (ringG0 * 1.55 + ringG1 * 1.15 + ringG2 * 0.78 + ringG3 * 0.45 + ringG4 * 0.22) * 1.10;
  chromRing.b = (ringB0 * 1.45 + ringB1 * 1.10 + ringB2 * 0.75 + ringB3 * 0.42 + ringB4 * 0.20) * 1.45;

  /* Tint: interno quente (branco-dourado) → externos lavanda/ciano */
  vec3 innerTint = vec3(1.40, 1.22, 0.95);
  vec3 outerTint = vec3(0.78, 0.88, 1.35);
  float innerWeight = clamp(ring0 * 2.2 + ring1 * 0.6, 0.0, 1.0);
  chromRing = mix(chromRing * outerTint, chromRing * innerTint, innerWeight);

  /* Pulso + variação temporal */
  float ringPulse = 0.85 + 0.20 * sin(t * 1.05) + uPulse * 0.30;
  col += chromRing * ringPulse * pulse * 1.15;
  alpha = max(alpha, clamp(ringSum * 0.92, 0.0, 1.0));

  /* ---- Glitch / digital noise na faixa dos anéis (estilo vídeo) ---- */
  float glitchBand = smoothstep(Rs * 0.92, Rs * 1.08, rW) * (1.0 - smoothstep(Rs * 2.4, Rs * 3.4, rW));
  if (glitchBand > 0.01 && uReduced < 0.5) {
    float gTime = floor(t * 12.0);
    float n1 = hash21(vec2(floor(frag.x * 0.08), gTime));
    float n2 = hash21(vec2(floor(frag.y * 0.12) + 23.0, gTime * 1.7));
    float n3 = hash21(vec2(floor(rN * 38.0), floor(phi * 11.0) + gTime));

    /* Scanline / tear */
    float scan = step(0.965, fract(frag.y * 0.16 + t * 3.8 + n1 * 5.5));
    float tear = scan * glitchBand * (0.45 + 0.55 * n2);

    /* RGB offset extra no glitch */
    float extraAberr = (0.7 + 0.5 * n3) * glitchBand * Rs * 0.10;
    vec3 gCol = chromRing;
    gCol.r += extraAberr * 0.22;
    gCol.b -= extraAberr * 0.18;

    float gMix = glitchBand * (0.32 + 0.42 * n3 + tear * 0.65);
    col = mix(col, gCol * vec3(1.22, 0.98, 1.28) + vec3(tear * 0.40), gMix);

    /* Flash raro */
    float flash = step(0.982, n1) * step(0.65, n2) * glitchBand;
    col += vec3(1.40, 1.32, 1.50) * flash * 0.65;
    alpha = max(alpha, gMix * 0.45 + flash * 0.40);
  }

  /* Vignette suave */
  vec2 q = uv * 2.0 - 1.0;
  q.x *= uRes.x / uRes.y;
  col *= 1.0 - dot(q, q) * 0.07;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.06);
  col *= mix(vec3(0.94, 0.99, 1.05), vec3(1.06, 1.0, 0.93), smoothstep(0.04, 0.92, lum));
  col = pow(max(col, 0.0), vec3(0.88));

  /* Fora da influência do buraco: transparente (vídeo de fundo) */
  float presence = smoothstep(Rs * 18.0, Rs * 4.0, rW);
  alpha = clamp(max(alpha, presence * 0.02), 0.0, 1.0);

  /* Override final: núcleo 100% preto, sem nenhum brilho residual */
  col = mix(col, vec3(0.0), core);
  alpha = max(alpha, core);

  fragColor = vec4(col, alpha);
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
