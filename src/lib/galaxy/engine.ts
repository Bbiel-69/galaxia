import { BH_WORLD_RS, BODIES, type CelestialBody } from "./bodies";
import { PARTICLE_FS, PARTICLE_VS, SCENE_FS, SCENE_VS } from "./shaders";

export type LabelPose = {
  id: string;
  x: number;
  y: number;
  visible: boolean;
};

export type EngineHooks = {
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onFrame: (labels: LabelPose[], zoom: number) => void;
};

export type GalaxyEngine = {
  destroy: () => void;
  recenter: () => void;
  focus: (id: string) => void;
  setMuted: (muted: boolean) => void;
  select: (id: string | null) => void;
};

const LIGHTS = BODIES.filter((b) => b.kind !== "black-hole");

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) ?? "unknown";
    gl.deleteProgram(p);
    throw new Error(log);
  }
  return p;
}

function makeNoise(gl: WebGL2RenderingContext, size = 256): WebGLTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = hash2(x * 0.37, y * 0.41);
      const n2 = hash2(x * 1.1 + 17, y * 0.9 + 9);
      data[i] = (n * 255) | 0;
      data[i + 1] = (n2 * 255) | 0;
      data[i + 2] = ((n * 0.6 + n2 * 0.4) * 255) | 0;
      data[i + 3] = 255;
    }
  }
  const tex = gl.createTexture();
  if (!tex) throw new Error("texture alloc failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return tex;
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function expLerp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function isCoarse(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720;
}

function prefersReduced(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createGalaxyEngine(
  canvas: HTMLCanvasElement,
  hooks: EngineHooks,
): GalaxyEngine {
  const maybeGl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!maybeGl) {
    throw new Error("WebGL2 indisponível");
  }
  const gl: WebGL2RenderingContext = maybeGl;

  const sceneProg = program(gl, SCENE_VS, SCENE_FS);
  const partProg = program(gl, PARTICLE_VS, PARTICLE_FS);

  const noise = makeNoise(gl);
  const sceneVao = gl.createVertexArray();
  gl.bindVertexArray(sceneVao);

  const particleCount = isCoarse() ? 700 : 1600;
  const pData = new Float32Array(particleCount * 4);
  for (let i = 0; i < particleCount; i++) {
    const o = i * 4;
    pData[o] = Math.random();
    pData[o + 1] = Math.random();
    pData[o + 2] = Math.random() > 0.72 ? 1 : 0;
    pData[o + 3] = 0.6 + Math.random() * 1.8;
  }
  const pBuffer = gl.createBuffer();
  const pVao = gl.createVertexArray();
  gl.bindVertexArray(pVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, pBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, pData, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(partProg, "aData");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const u = {
    res: gl.getUniformLocation(sceneProg, "uRes"),
    time: gl.getUniformLocation(sceneProg, "uTime"),
    cam: gl.getUniformLocation(sceneProg, "uCam"),
    zoom: gl.getUniformLocation(sceneProg, "uZoom"),
    bh: gl.getUniformLocation(sceneProg, "uBh"),
    horizon: gl.getUniformLocation(sceneProg, "uHorizon"),
    steps: gl.getUniformLocation(sceneProg, "uSteps"),
    reduced: gl.getUniformLocation(sceneProg, "uReduced"),
    pulse: gl.getUniformLocation(sceneProg, "uPulse"),
    n: gl.getUniformLocation(sceneProg, "uN"),
    hover: gl.getUniformLocation(sceneProg, "uHover"),
    sel: gl.getUniformLocation(sceneProg, "uSel"),
    noise: gl.getUniformLocation(sceneProg, "uNoise"),
    bodies: LIGHTS.map((_, i) => gl.getUniformLocation(sceneProg, `uBodies[${i}]`)),
    bodyCol: LIGHTS.map((_, i) => gl.getUniformLocation(sceneProg, `uBodyCol[${i}]`)),
  };

  const pu = {
    res: gl.getUniformLocation(partProg, "uRes"),
    cam: gl.getUniformLocation(partProg, "uCam"),
    zoom: gl.getUniformLocation(partProg, "uZoom"),
    bh: gl.getUniformLocation(partProg, "uBh"),
    time: gl.getUniformLocation(partProg, "uTime"),
    horizon: gl.getUniformLocation(partProg, "uHorizon"),
    reduced: gl.getUniformLocation(partProg, "uReduced"),
  };

  let camX = 0;
  let camY = 0;
  let zoom = 0.32;
  let tCamX = 0;
  let tCamY = 0;
  let tZoom = 0.32;
  let follow = true;
  let hoverId: string | null = null;
  let selId: string | null = null;
  let running = true;
  let raf = 0;
  let last = performance.now();
  let pulse = 0;
  let nextFlare = 2.4;
  let pointerId: number | null = null;
  let dragging = false;
  let moved = false;
  let lastPx = 0;
  let lastPy = 0;
  let lastPinch = 0;
  let homed = false;
  const reduced = prefersReduced();
  const mobile = isCoarse();

  const minZoom = 0.18;
  const maxZoom = 3.6;

  function homeZoom(): number {
    const { w, h } = cssSize();
    const target = Math.min(w, h) * 0.21;
    return Math.min(0.48, Math.max(0.16, target / (11 * BH_WORLD_RS * h)));
  }

  function cssSize(): { w: number; h: number } {
    return { w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 };
  }

  function resize() {
    const { w, h } = cssSize();
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.2 : 1.65);
    const tw = Math.max(1, Math.round(w * dpr));
    const th = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }
    gl.viewport(0, 0, tw, th);
    if (!homed && w > 2 && h > 2) {
      const z = homeZoom();
      zoom = z;
      tZoom = z;
      homed = true;
    }
  }

  function screenToWorld(cx: number, cy: number): { x: number; y: number } {
    const { w, h } = cssSize();
    return {
      x: (cx - w * 0.5) / (h * zoom) + camX,
      y: -(cy - h * 0.5) / (h * zoom) + camY,
    };
  }

  function worldToCss(x: number, y: number): { x: number; y: number } {
    const { w, h } = cssSize();
    return {
      x: (x - camX) * h * zoom + w * 0.5,
      y: -(y - camY) * h * zoom + h * 0.5,
    };
  }

  function hitTest(wx: number, wy: number): CelestialBody | null {
    let best: CelestialBody | null = null;
    let bestD = Infinity;
    const thresh = 0.22 / Math.max(zoom, 0.35);
    for (const b of BODIES) {
      const dx = wx - b.x;
      const dy = wy - b.y;
      const d = Math.hypot(dx, dy);
      const rad = b.kind === "black-hole" ? 0.55 / Math.max(zoom, 0.4) : 0.16 * b.size + thresh;
      if (d < rad && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  function setHover(id: string | null) {
    if (hoverId === id) return;
    hoverId = id;
    canvas.style.cursor = id ? "pointer" : dragging ? "grabbing" : "grab";
    hooks.onHover(id);
  }

  function emitLabels() {
    const { w, h } = cssSize();
    const origin = worldToCss(0, 0);
    const diskPx = 11 * BH_WORLD_RS * h * zoom;
    const labels: LabelPose[] = BODIES.map((b) => {
      const p = worldToCss(b.x, b.y);
      if (b.kind === "black-hole") p.y += diskPx * 0.38 + 8;
      const pad = 28;
      const dist = Math.hypot(p.x - origin.x, p.y - origin.y);
      const onDisk = b.kind !== "black-hole" && dist < diskPx + 36;
      const visible =
        !onDisk && p.x > pad && p.x < w - pad && p.y > pad && p.y < h - 72;
      return { id: b.id, x: p.x, y: p.y, visible };
    });
    hooks.onFrame(labels, zoom);
  }

  function loop(now: number) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    nextFlare -= dt;
    if (nextFlare <= 0) {
      pulse = 1;
      nextFlare = 2.8 + Math.random() * 4.5;
    }
    pulse = Math.max(0, pulse - dt * 1.15);

    if (follow) {
      camX = expLerp(camX, tCamX, 3.2, dt);
      camY = expLerp(camY, tCamY, 3.2, dt);
      zoom = expLerp(zoom, tZoom, 2.6, dt);
    }

    resize();
    const { width, height } = canvas;
    const horizon = BH_WORLD_RS * zoom * height;
    const steps = mobile ? (distToBhScreen() < 420 ? 40 : 28) : distToBhScreen() < 640 ? 64 : 44;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(sceneProg);
    gl.bindVertexArray(sceneVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, noise);
    gl.uniform1i(u.noise, 0);
    gl.uniform2f(u.res, width, height);
    gl.uniform1f(u.time, now * 0.001);
    gl.uniform2f(u.cam, camX, camY);
    gl.uniform1f(u.zoom, zoom);
    gl.uniform2f(u.bh, 0, 0);
    gl.uniform1f(u.horizon, horizon);
    gl.uniform1i(u.steps, steps);
    gl.uniform1f(u.reduced, reduced ? 1 : 0);
    gl.uniform1f(u.pulse, pulse);
    gl.uniform1i(u.n, LIGHTS.length);
    const hi = hoverId ? LIGHTS.findIndex((b) => b.id === hoverId) : -1;
    const si = selId ? LIGHTS.findIndex((b) => b.id === selId) : -1;
    gl.uniform1i(u.hover, hi);
    gl.uniform1i(u.sel, si);
    for (let i = 0; i < LIGHTS.length; i++) {
      const b = LIGHTS[i];
      gl.uniform4f(u.bodies[i], b.x, b.y, b.size, hash2(i + 1, 3.2));
      gl.uniform3f(u.bodyCol[i], b.color[0], b.color[1], b.color[2]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(partProg);
    gl.bindVertexArray(pVao);
    gl.uniform2f(pu.res, width, height);
    gl.uniform2f(pu.cam, camX, camY);
    gl.uniform1f(pu.zoom, zoom);
    gl.uniform2f(pu.bh, 0, 0);
    gl.uniform1f(pu.time, now * 0.001);
    gl.uniform1f(pu.horizon, horizon);
    gl.uniform1f(pu.reduced, reduced ? 1 : 0);
    gl.drawArrays(gl.POINTS, 0, particleCount);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);

    emitLabels();
    raf = requestAnimationFrame(loop);
  }

  function distToBhScreen(): number {
    const p = worldToCss(0, 0);
    const { w, h } = cssSize();
    return Math.hypot(p.x - w * 0.5, p.y - h * 0.5);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerId = e.pointerId;
    dragging = true;
    moved = false;
    follow = false;
    lastPx = e.clientX;
    lastPy = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  }

  function onPointerMove(e: PointerEvent) {
    const { h } = cssSize();
    if (dragging && e.pointerId === pointerId) {
      const dx = e.clientX - lastPx;
      const dy = e.clientY - lastPy;
      if (Math.hypot(dx, dy) > 3) moved = true;
      camX -= dx / (h * zoom);
      camY += dy / (h * zoom);
      tCamX = camX;
      tCamY = camY;
      lastPx = e.clientX;
      lastPy = e.clientY;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const wpos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(wpos.x, wpos.y);
    setHover(hit?.id ?? null);
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    canvas.style.cursor = hoverId ? "pointer" : "grab";
    if (!moved) {
      const rect = canvas.getBoundingClientRect();
      const wpos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = hitTest(wpos.x, wpos.y);
      if (hit) {
        selId = hit.id;
        hooks.onSelect(hit.id);
        focusBody(hit, false);
      } else {
        selId = null;
        hooks.onSelect(null);
      }
    }
  }

  function onPointerCancel() {
    dragging = false;
    pointerId = null;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    follow = false;
    const rect = canvas.getBoundingClientRect();
    const before = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoom = Math.min(maxZoom, Math.max(minZoom, zoom * factor));
    tZoom = zoom;
    const after = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    camX += before.x - after.x;
    camY += before.y - after.y;
    tCamX = camX;
    tCamY = camY;
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      lastPinch = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
    if (lastPinch > 0) {
      follow = false;
      const factor = dist / lastPinch;
      zoom = Math.min(maxZoom, Math.max(minZoom, zoom * factor));
      tZoom = zoom;
    }
    lastPinch = dist;
  }

  function focusBody(b: CelestialBody, snap: boolean) {
    follow = true;
    tCamX = b.x;
    tCamY = b.y;
    tZoom = b.kind === "black-hole" ? 1.85 : 1.35;
    if (snap) {
      camX = tCamX;
      camY = tCamY;
      zoom = tZoom;
    }
  }

  function onKey(e: KeyboardEvent) {
    const pan = 0.28 / zoom;
    if (e.key === "Escape") {
      selId = null;
      hooks.onSelect(null);
    } else if (e.key === "Home" || e.key === "0") {
      recenter();
    } else if (e.key === "+" || e.key === "=") {
      follow = false;
      tZoom = zoom = Math.min(maxZoom, zoom * 1.18);
    } else if (e.key === "-" || e.key === "_") {
      follow = false;
      tZoom = zoom = Math.max(minZoom, zoom / 1.18);
    } else if (e.key === "ArrowLeft") {
      follow = false;
      tCamX = camX -= pan;
    } else if (e.key === "ArrowRight") {
      follow = false;
      tCamX = camX += pan;
    } else if (e.key === "ArrowUp") {
      follow = false;
      tCamY = camY += pan;
    } else if (e.key === "ArrowDown") {
      follow = false;
      tCamY = camY -= pan;
    }
  }

  function recenter() {
    follow = true;
    tCamX = 0;
    tCamY = 0;
    tZoom = homeZoom();
    selId = "inicio";
    hooks.onSelect("inicio");
  }

  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("keydown", onKey);
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  resize();
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      gl.deleteProgram(sceneProg);
      gl.deleteProgram(partProg);
      gl.deleteTexture(noise);
      gl.deleteBuffer(pBuffer);
      gl.deleteVertexArray(pVao);
      gl.deleteVertexArray(sceneVao);
    },
    recenter,
    focus(id: string) {
      const b = BODIES.find((x) => x.id === id);
      if (!b) return;
      selId = id;
      focusBody(b, false);
    },
    setMuted() {},
    select(id: string | null) {
      selId = id;
    },
  };
}
