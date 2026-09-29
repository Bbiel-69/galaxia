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

/* Disco de acreção estilo Gargantua — retorna cor premultiplicada + cobertura em .a */
vec4 diskSample(float rd, float a, float Rs, float t) {
  float rIn = Rs * 2.15;
  float rOut = Rs * 11.0;

  /* rotação Kepleriana diferencial: interno gira mais rápido */
  float om = 0.55 / pow(max(rd / Rs, 0.4), 1.5);
  float aE = a + t * om;

  /* streaks de plasma em espaço polar (3 oitavas de ruído animado) */
  vec2 sp = vec2(rd * 0.9 / Rs, aE * 0.6366);
  float s1 = texture(uNoise, vec2(sp.x * 0.11 - t * 0.0045, sp.y)).r;
  float s2 = texture(uNoise, vec2(sp.x * 0.27 + t * 0.0032, sp.y * 2.7 + s1 * 0.4)).g;
  float s3 = texture(uNoise, vec2(sp.x * 0.55 - t * 0.008,  sp.y * 5.3 + s2 * 0.6)).r;
  float streak = s1 * 0.5 + s2 * 0.32 + s3 * 0.25;
  streak = pow(clamp(streak, 0.0, 1.0), 1.7);

  /* perfil radial: borda interna nítida, caída externa suave */
  float prof = smoothstep(rIn * 0.8, rIn * 1.18, rd)
             * (1.0 - smoothstep(rOut * 0.5, rOut, rd));

  /* gradiente de temperatura: núcleo branco-quente -> dourado -> rosé/lavanda */
  float temp = smoothstep(rOut, rIn * 1.1, rd);
  vec3 c = mix(vec3(0.66, 0.42, 0.66), vec3(1.02, 0.72, 0.42), smoothstep(0.02, 0.45, temp));
  c = mix(c, vec3(1.32, 1.24, 1.12), smoothstep(0.4, 0.95, temp));

  /* beaming Doppler: lado esquerdo se aproxima (mais brilhante e azulado) */
  float dop = clamp(1.0 / pow(1.0 + 0.40 * cos(aE), 3.0), 0.22, 3.4);
  float dopN = dop / 1.9;
  c = mix(c, c * vec3(0.92, 0.98, 1.12), clamp(dopN - 0.7, 0.0, 1.0) * 0.5);
  c = mix(c, c * vec3(1.08, 0.90, 0.80), clamp(0.55 - dopN, 0.0, 1.0) * 0.5);

  /* aro interno incandescente */
  float innerRim = exp(-pow((rd - rIn * 1.05) / (Rs * 0.3), 2.0)) * 1.5;

  float lum = (streak * 1.15 + innerRim + 0.12) * prof * mix(0.5, 1.35, clamp(dopN, 0.0, 1.4));
  float alpha = clamp(prof * (0.5 + streak * 0.65) * mix(0.6, 1.15, clamp(dopN, 0.0, 1.0)), 0.0, 1.0);
  return vec4(c * lum, alpha);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  vec2 world = (frag - 0.5 * uRes) / (uZoom * uRes.y) + uCam;

  float Rs = max(uHorizon / (uZoom * uRes.y), 1e-5);   /* raio da sombra em unidades de mundo */
  vec2 rel = world - uBh;
  float rW = length(rel);
  float t = uTime;
  float pulse = 1.0 + 0.055 * sin(t * TAU / 8.3) + uPulse * 0.35;

  /* ================= fundo galáctico ================= */
  vec3 col = vec3(0.0045, 0.0055, 0.012);

  vec2 skyUv = (world - uCam * 0.05) * 0.045 + 0.5;
  col += sampleTex(uSky, skyUv) * vec3(0.5, 0.56, 0.72) * 0.55;
  vec2 milkyUv = (world - uCam * 0.085) * 0.028 + 0.5;
  vec3 milky = sampleTex(uMilky, milkyUv);

  /* densidade em espiral logarítmica ao redor do centro */
  float angC = atan(rel.y, rel.x);
  float spiral = 0.5 + 0.5 * sin(angC * 2.0 - log(max(rW, 1e-4)) * 3.2 + t * 0.012);
  spiral = smoothstep(0.15, 0.95, spiral);
  float armMask = exp(-max(rW - Rs * 14.0, 0.0) * 0.16);

  /* nebulosas procedurais: rosa / azul / violeta / âmbar, baixa saturação, bordas irregulares */
  float breathe = 1.0 + 0.08 * sin(t * 0.21);
  vec2 nuv = world * 0.075 + vec2(t * 0.0016, -t * 0.0012);
  float f1 = fbm(nuv);
  float f2 = fbm(nuv * 2.4 + 7.31);
  float neb = smoothstep(0.46, 0.92, f1 * 0.7 + f2 * 0.45) * breathe;
  neb *= (0.35 + 0.65 * spiral) * (0.25 + 0.75 * armMask);
  vec3 nebCol = mix(vec3(0.13, 0.2, 0.42), vec3(0.34, 0.16, 0.4), smoothstep(0.3, 0.7, f2));
  nebCol = mix(nebCol, vec3(0.5, 0.26, 0.3), smoothstep(0.55, 0.9, f1) * 0.55);
  col += nebCol * neb * 0.34;
  col += milky * (0.22 + armMask * 0.75) * vec3(0.55, 0.56, 0.66);

  /* brilho do disco derramando na poeira próxima ao centro */
  col += vec3(0.5, 0.34, 0.3) * exp(-max(rW - Rs, 0.0) * 2.2) * 0.05 * pulse;

  /* camadas profundas de estrelas cintilantes (fases aleatórias) */
  col += starLayer(world - uCam * 0.03, 26.0, 0.992, t, 0.0) * 0.75;
  col += starLayer(world * 1.7 - uCam * 0.06, 44.0, 0.988, t, 0.0) * 0.5;

  /* ================= corpos celestes ================= */
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
      /* estrela: glow em camadas + cross-flare */
      float g1 = exp(-r * r / (sz * sz * 0.16));
      float g2 = exp(-r * r / (sz * sz * 1.4)) * 0.32;
      float spikes = (exp(-abs(d.x) * 34.0 / sz - d.y * d.y * 60.0 / (sz * sz))
                    + exp(-abs(d.y) * 34.0 / sz - d.x * d.x * 60.0 / (sz * sz))) * 0.55;
      col += bc * (g1 * 1.5 + g2 + spikes * g1) * twk * boost;
    } else if (shape < 1.5) {
      /* nebulosa: nuvem fbm suave, irregular */
      float n = fbm(d * (1.6 / sz) + ph * 19.7);
      float cloud = smoothstep(0.32, 0.85, n) * exp(-r / (sz * 1.5));
      float core = exp(-r * r / (sz * sz * 0.3)) * 0.4;
      col += bc * (cloud * 0.55 + core) * twk * boost;
    } else if (shape < 2.5) {
      /* galáxia: braços espirais + núcleo brilhante */
      float a2 = atan(d.y, d.x);
      float arms = pow(0.5 + 0.5 * sin(a2 * 2.0 + r * (9.0 / sz) + ph * 6.28), 2.4);
      float gn = fbm(vec2(r * (3.2 / sz) - t * 0.004, a2 * 0.636 + ph));
      float body = exp(-r * r / (sz * sz * 0.8));
      float core = exp(-r * r / (sz * sz * 0.09)) * 1.1;
      col += bc * ((arms * (0.45 + gn * 0.8) + core) * body) * twk * boost;
    } else if (shape < 3.5) {
      /* estação: ponto-farol + anel fino + luz pulsante */
      float dot1 = exp(-r * r / (sz * sz * 0.02)) * 1.6;
      float ring = exp(-pow((r - sz * 0.42) / (sz * 0.05), 2.0)) * 0.5;
      float blink = smoothstep(0.86, 1.0, sin(t * 2.2 + ph * 9.0))
                  * exp(-r * r / (sz * sz * 0.5));
      col += bc * (dot1 + ring + blink * 1.2) * boost;
    } else {
      /* hélix: nebulosa em anel ("olho") */
      float ring = exp(-pow((r - sz * 0.5) / (sz * 0.17), 2.0));
      float a3 = atan(d.y, d.x);
      float wisp = 0.6 + 0.4 * texture(uNoise, vec2(a3 * 0.636 + ph, r * 0.8 / sz + t * 0.006)).r;
      float pupil = exp(-r * r / (sz * sz * 0.05)) * 0.8;
      col += bc * (ring * wisp + pupil) * 0.8 * twk * boost;
    }
  }

  /* ================= buraco negro ================= */
  float TILT = 0.295;                              /* disco quase de perfil (~73°) */
  vec2 dp = vec2(rel.x, rel.y / TILT);
  float rd = length(dp);
  float aDisk = atan(dp.y, dp.x);

  vec4 disk = diskSample(rd, aDisk, Rs, t) * pulse;

  /* halo quente abraçando a sombra */
  float halo = exp(-pow(max(rW - Rs * 1.05, 0.0) / (Rs * 1.1), 2.0));
  col += vec3(1.0, 0.72, 0.45) * halo * 0.18 * pulse;

  /* disco sobre o fundo; lado distante fica atrás da sombra */
  col = col * (1.0 - disk.a) + disk.rgb;

  /* horizonte de eventos: esfera negra absoluta */
  float shadow = 1.0 - smoothstep(Rs * 0.985, Rs * 1.015, rW);
  col = mix(col, vec3(0.0), shadow);

  /* lensing gravitacional: lado distante do disco "levantado" acima/abaixo da sombra */
  float phi = atan(rel.y, rel.x);
  float rN = rW / Rs;
  float lensR = mix(Rs * 7.5, Rs * 2.3, clamp(rN, 0.0, 1.0));
  vec4 lensed = diskSample(lensR, phi, Rs, t) * pulse;
  float lensW = (1.0 - smoothstep(0.9, 1.0, rN))
              * smoothstep(0.3, 0.75, rN)
              * (0.45 + 0.55 * abs(sin(phi)));
  col += lensed.rgb * lensW * 0.85;

  /* anel de fótons: círculo fino branco-quente colado na sombra */
  float ring = exp(-pow((rW - Rs * 1.08) / (Rs * 0.045), 2.0));
  col += vec3(1.25, 1.15, 0.98) * ring * (0.75 + 0.25 * sin(t * 0.9)) * pulse;

  /* ================= grade e vinheta ================= */
  vec2 q = uv * 2.0 - 1.0;
  q.x *= uRes.x / uRes.y;
  col *= 1.0 - dot(q, q) * 0.13;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.07);
  vec3 shadowTint = vec3(0.94, 0.99, 1.06);
  vec3 highTint = vec3(1.06, 1.0, 0.93);
  col *= mix(shadowTint, highTint, smoothstep(0.04, 0.95, lum));

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
