import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { BH_WORLD_RS, BODIES, TOUR_ORDER, bodyShape, type CelestialBody } from "./bodies";
import type { EngineHooks, GalaxyEngine } from "./engine";
import { SCENE_FS, SCENE_VS } from "./shaders";

export type { GalaxyEngine } from "./engine";

const LIGHTS = BODIES.filter((b) => b.kind !== "black-hole");
const TOUR_MS = 4800;
const FOCUS_MS = 1250;

function coarse() {
  return typeof window !== "undefined" && (matchMedia("(pointer: coarse)").matches || innerWidth < 720);
}
function lerp(current: number, target: number, speed: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}
function makeStarSprite() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const r2 = dx * dx + dy * dy;
      const core = Math.exp(-r2 * 120);
      const glow = Math.exp(-r2 * 8) * 0.55;
      const halo = Math.exp(-r2 * 2.1) * 0.2;
      const spx = Math.exp(-Math.abs(dx) * 30 - dy * dy * 95);
      const spy = Math.exp(-Math.abs(dy) * 30 - dx * dx * 95);
      const v = Math.min(1, core * 1.25 + glow + halo + (spx + spy) * 0.7);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(v * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function hashNoise(x: number, y: number) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, freq: number) {
  const fx = x * freq;
  const fy = y * freq;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hashNoise(ix, iy);
  const b = hashNoise(ix + 1, iy);
  const c = hashNoise(ix, iy + 1);
  const d = hashNoise(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function createNoiseTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const n =
        valueNoise(nx, ny, 4) * 0.5 +
        valueNoise(nx, ny, 8) * 0.25 +
        valueNoise(nx, ny, 16) * 0.15 +
        valueNoise(nx, ny, 32) * 0.1;
      const n2 = valueNoise(nx + 17.2, ny + 9.1, 6);
      const offset = (y * size + x) * 4;
      data[offset] = Math.max(0, Math.min(255, n * 255));
      data[offset + 1] = Math.max(0, Math.min(255, n2 * 255));
      data[offset + 2] = data[offset]!;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function makeFallbackTex() {
  const texture = new THREE.DataTexture(new Uint8Array([6, 8, 16, 255]), 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function loadSky(url: string, target: { value: THREE.Texture }) {
  const loader = new THREE.TextureLoader();
  loader.load(url, (texture) => {
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    target.value = texture;
  });
}

function stars(count: number, seed: number, spread: number, material: THREE.MeshBasicMaterial) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  let rng = seed >>> 0;
  const rnd = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const mag = Math.pow(rnd(), 2.85);
    const r = Math.pow(rnd(), 0.55) * spread + 0.35;
    const a = rnd() * Math.PI * 2;
    p.set(Math.cos(a) * r, Math.sin(a) * r * (0.4 + rnd() * 0.52), 0);
    const size = 0.018 + mag * 0.125;
    s.set(size, size, size);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    const t = rnd();
    if (t < 0.1) c.setRGB(1.0, 0.74, 0.48);
    else if (t < 0.42) c.setRGB(0.7, 0.82, 1.0);
    else c.setRGB(0.94, 0.96, 1.0);
    c.multiplyScalar(0.65 + mag * 1.85);
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export function createGalaxyEngine(canvas: HTMLCanvasElement, hooks: EngineHooks): GalaxyEngine {
  const mobile = coarse();
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = motionPreference.matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x03040a);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  camera.position.z = 1;

  const bodies = Array.from({ length: 12 }, () => new THREE.Vector4());
  const colors = Array.from({ length: 12 }, () => new THREE.Vector3());
  LIGHTS.forEach((b, i) => {
    bodies[i]!.set(b.x, b.y, b.size, bodyShape(b) + ((i * 0.173 + 0.37) % 1) * 0.001);
    colors[i]!.set(b.color[0], b.color[1], b.color[2]);
  });
  const noiseTexture = createNoiseTexture();
  const skyFallback = makeFallbackTex();
  const skyTex = { value: skyFallback };
  const milkyTex = { value: skyFallback };
  loadSky("/textures/starfield.jpg", skyTex);
  loadSky("/textures/milky-way.jpg", milkyTex);
  const uniforms = {
    uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uCam: { value: new THREE.Vector2() },
    uZoom: { value: 0.32 }, uBh: { value: new THREE.Vector2() }, uHorizon: { value: 1 },
    uSteps: { value: mobile ? 40 : 64 }, uReduced: { value: reduced ? 1 : 0 }, uPulse: { value: 0 },
    uN: { value: LIGHTS.length }, uHover: { value: -1 }, uSel: { value: -1 },
    uBodies: { value: bodies }, uBodyCol: { value: colors }, uNoise: { value: noiseTexture },
    uSky: skyTex, uMilky: milkyTex,
  };
  // GLSL ES 3.00 via Three.js: set glslVersion so Three prefixes #version 300 es
  // as the true first line (RawShaderMaterial still injects #define SHADER_*).
  // Strip any user #version from shared shader sources used by the pure WebGL path.
  const stripVersion = (src: string) => src.replace(/^\s*#version\s+300\s+es\s*\n/, "");
  const shader = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: stripVersion(SCENE_VS),
    fragmentShader: stripVersion(SCENE_FS),
    uniforms,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  // 3 vertices only - SCENE_VS builds a fullscreen triangle from gl_VertexID 0..2
  const fsGeo = new THREE.BufferGeometry();
  fsGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const plane = new THREE.Mesh(fsGeo, shader);
  scene.add(plane);

  const root = new THREE.Group();
  scene.add(root);
  const starSprite = makeStarSprite();
  const starMat = new THREE.MeshBasicMaterial({
    map: starSprite,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const total = mobile ? 1200 : 2600;
  const n = Math.floor(total / 3);
  const layers = [stars(n, 11, 12, starMat), stars(n, 31, 9, starMat), stars(total - n * 2, 71, 6.5, starMat)];
  layers.forEach((layer, i) => { layer.renderOrder = i + 2; root.add(layer); });
  hooks.onProgress?.(0, total);
  hooks.onProgress?.(Math.floor(total / 3), total);
  hooks.onProgress?.(Math.floor((total * 2) / 3), total);
  hooks.onProgress?.(total, total);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomStrength = mobile ? 0.54 : 0.72;
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), reduced ? 0 : bloomStrength, mobile ? 0.34 : 0.44, 0.55);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let camX = 0, camY = 0, zoom = 0.32, tx = 0, ty = 0, tz = 0.32;
  let transition: { id: string | null; fromX: number; fromY: number; fromZoom: number; toX: number; toY: number; toZoom: number; started: number } | null = null;
  let returnView: { x: number; y: number; zoom: number } | null = null;
  let focusId: string | null = null;
  let follow = true, hover: string | null = null, selected: string | null = null;
  let running = true, dragging = false, moved = false, pointerId: number | null = null;
  let lastX = 0, lastY = 0, lastMoveTime = 0, velocityX = 0, velocityY = 0;
  let last = performance.now(), raf = 0, pulse = 0, flare = 7;
  let tour = false, tourIndex = -1, tourElapsed = TOUR_MS;
  let slowFrames = 0;

  const size = () => ({ w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 });
  const homeZoom = () => { const { w, h } = size(); return Math.min(0.48, Math.max(0.16, Math.min(w, h) * 0.21 / (11 * BH_WORLD_RS * h))); };
  const worldToCss = (x: number, y: number) => { const { w, h } = size(); return { x: (x - camX) * h * zoom + w / 2, y: -(y - camY) * h * zoom + h / 2 }; };
  const screenToWorld = (x: number, y: number) => { const { w, h } = size(); return { x: (x - w / 2) / (h * zoom) + camX, y: -(y - h / 2) / (h * zoom) + camY }; };
  const hit = (x: number, y: number) => {
    let best: CelestialBody | null = null, bestD = Infinity;
    for (const b of BODIES) { const d = Math.hypot(x - b.x, y - b.y); const r = b.kind === "black-hole" ? 0.55 / Math.max(zoom, 0.4) : 0.16 * b.size + 0.22 / Math.max(zoom, 0.35); if (d < r && d < bestD) { best = b; bestD = d; } }
    return best;
  };
  const resize = () => {
    const { w, h } = size(), dpr = Math.min(devicePixelRatio || 1, mobile ? 1.15 : 1.55);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); composer.setSize(w, h);
    bloom.setSize(Math.max(1, w * (mobile ? 0.58 : 0.72)), Math.max(1, h * (mobile ? 0.58 : 0.72)));
    uniforms.uRes.value.set(w * dpr, h * dpr);
    if (!camera.userData.homed && w > 2 && h > 2) { zoom = tz = homeZoom(); camera.userData.homed = true; }
  };
  const animateCamera = (id: string | null, x: number, y: number, z: number, now = performance.now()) => {
    follow = true;
    tx = x; ty = y; tz = z;
    transition = { id, fromX: camX, fromY: camY, fromZoom: zoom, toX: x, toY: y, toZoom: z, started: now };
    if (reduced) {
      camX = x; camY = y; zoom = z; transition = null;
      if (id) hooks.onFocusComplete?.(id);
    }
  };
  const focusBody = (b: CelestialBody) => {
    if (focusId == null && !returnView) returnView = { x: camX, y: camY, zoom };
    focusId = b.id;
    animateCamera(b.id, b.x, b.y, b.kind === "black-hole" ? 1.85 : 1.35);
  };
  const chooseBody = (b: CelestialBody) => {
    selected = b.id;
    hooks.onSelect(b.id);
    focusBody(b);
  };
  const clearSelection = (returnToPrevious = false) => {
    selected = null;
    focusId = null;
    transition = null;
    hooks.onSelect(null);
    hooks.onFocusComplete?.(null);
    if (returnToPrevious && returnView) {
      const view = returnView;
      returnView = null;
      animateCamera(null, view.x, view.y, view.zoom);
    } else if (!returnToPrevious) {
      returnView = null;
    }
  };
  const setHover = (id: string | null) => { if (hover === id) return; hover = id; canvas.style.cursor = id ? "pointer" : dragging ? "grabbing" : "grab"; hooks.onHover(id); };
  const labels = () => {
    const { w, h } = size(), origin = worldToCss(0, 0), disk = 11 * BH_WORLD_RS * h * zoom;
    hooks.onFrame(BODIES.map((b) => {
      const p = worldToCss(b.x, b.y); if (b.kind === "black-hole") p.y += disk * 0.38 + 8;
      const d = Math.hypot(p.x - origin.x, p.y - origin.y);
      return { id: b.id, x: p.x, y: p.y, visible: b.kind === "black-hole" || (d > disk + 36 && p.x > 28 && p.x < w - 28 && p.y > 28 && p.y < h - 72) };
    }), zoom);
  };
  const stopTour = () => { if (!tour) return; tour = false; tourIndex = -1; tourElapsed = TOUR_MS; hooks.onTour?.(null, false); };
  const onMotionChange = () => {
    reduced = motionPreference.matches;
    uniforms.uReduced.value = reduced ? 1 : 0;
    bloom.strength = reduced ? 0 : bloomStrength;
    pulse = 0;
    if (reduced) {
      flare = 0;
      if (transition) {
        const completed = transition.id;
        camX = transition.toX; camY = transition.toY; zoom = transition.toZoom;
        transition = null;
        if (completed) hooks.onFocusComplete?.(completed);
      }
      stopTour();
    }
  };
  motionPreference.addEventListener("change", onMotionChange);
  const nextTour = () => {
    tourIndex = (tourIndex + 1) % TOUR_ORDER.length; tourElapsed = 0;
    const b = BODIES.find((x) => x.id === TOUR_ORDER[tourIndex]); if (!b) return;
    selected = b.id; hooks.onSelect(b.id); focusBody(b); hooks.onTour?.(b.id, true);
  };
  const loop = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!reduced) {
      flare -= dt; if (flare <= 0) { pulse = 1; flare = 6 + Math.random() * 4; } pulse = Math.max(0, pulse - dt * 0.5);
      if (tour) { tourElapsed += dt * 1000; if (tourElapsed >= TOUR_MS) nextTour(); }
    }
    if (transition) {
      const t = Math.min(1, (now - transition.started) / FOCUS_MS);
      const eased = t * t * (3 - 2 * t);
      camX = transition.fromX + (transition.toX - transition.fromX) * eased;
      camY = transition.fromY + (transition.toY - transition.fromY) * eased;
      zoom = transition.fromZoom + (transition.toZoom - transition.fromZoom) * eased;
      if (t === 1) {
        const completed = transition.id;
        transition = null;
        if (completed) hooks.onFocusComplete?.(completed);
      }
    } else if (follow) {
      camX = lerp(camX, tx, tour ? 1.8 : 3.2, dt); camY = lerp(camY, ty, tour ? 1.8 : 3.2, dt); zoom = lerp(zoom, tz, tour ? 1.7 : 2.6, dt);
    } else if (!dragging && (Math.abs(velocityX) + Math.abs(velocityY) > 0.0001)) {
      camX += velocityX * dt; camY += velocityY * dt;
      velocityX *= Math.exp(-4.8 * dt); velocityY *= Math.exp(-4.8 * dt);
    }
    const { w, h } = size();
    camera.left = -w / h / (2 * zoom) + camX; camera.right = w / h / (2 * zoom) + camX; camera.top = 1 / (2 * zoom) + camY; camera.bottom = -1 / (2 * zoom) + camY; camera.updateProjectionMatrix();
    uniforms.uTime.value = reduced ? 0 : now * 0.001; uniforms.uCam.value.set(camX, camY); uniforms.uZoom.value = zoom; uniforms.uHorizon.value = BH_WORLD_RS * zoom * h * renderer.getPixelRatio(); uniforms.uPulse.value = pulse;
    uniforms.uHover.value = hover ? LIGHTS.findIndex((b) => b.id === hover) : -1; uniforms.uSel.value = selected ? LIGHTS.findIndex((b) => b.id === selected) : -1;
    layers.forEach((layer, i) => { const p = reduced ? 0 : [0.08, 0.17, 0.29][i]!; layer.position.set(-camX * p, -camY * p, 0); });
    labels(); composer.render();
    const ms = dt * 1000; slowFrames = ms > 20 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 18 && !reduced) {
      const starsVisible = layers.reduce((sum, layer) => sum + layer.count, 0);
      const minimumStars = mobile ? 480 : 900;
      if (starsVisible > minimumStars) {
        layers.forEach((layer) => { layer.count = Math.max(80, Math.floor(layer.count * 0.78)); });
      } else {
        uniforms.uSteps.value = Math.max(mobile ? 28 : 44, uniforms.uSteps.value - 8);
      }
      slowFrames = 0;
    }
    raf = requestAnimationFrame(loop);
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stopTour(); pointerId = e.pointerId; dragging = true; moved = false; follow = false;
    transition = null; velocityX = 0; velocityY = 0;
    lastX = e.clientX; lastY = e.clientY; lastMoveTime = e.timeStamp;
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const { h } = size();
    if (dragging && e.pointerId === pointerId) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      const elapsed = Math.max(0.008, (e.timeStamp - lastMoveTime) / 1000);
      moved ||= Math.hypot(dx, dy) > 3;
      const moveX = -dx / (h * zoom), moveY = dy / (h * zoom);
      camX += moveX; camY += moveY; tx = camX; ty = camY;
      velocityX = velocityX * 0.35 + (moveX / elapsed) * 0.65;
      velocityY = velocityY * 0.35 + (moveY / elapsed) * 0.65;
      lastX = e.clientX; lastY = e.clientY; lastMoveTime = e.timeStamp; return;
    }
    const r = canvas.getBoundingClientRect(), p = screenToWorld(e.clientX - r.left, e.clientY - r.top); setHover(hit(p.x, p.y)?.id ?? null);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return; dragging = false; pointerId = null;
    if (!moved) {
      velocityX = 0; velocityY = 0;
      const r = canvas.getBoundingClientRect(), p = screenToWorld(e.clientX - r.left, e.clientY - r.top), b = hit(p.x, p.y);
      if (b) chooseBody(b); else clearSelection();
    }
  };
  const cancel = () => { dragging = false; pointerId = null; };
  const wheel = (e: WheelEvent) => {
    e.preventDefault(); stopTour(); transition = null; velocityX = 0; velocityY = 0;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const before = screenToWorld(x, y), { w, h } = size();
    tz = Math.min(3.6, Math.max(0.18, zoom * Math.exp(-e.deltaY * 0.0015)));
    tx = before.x - (x - w / 2) / (h * tz);
    ty = before.y + (y - h / 2) / (h * tz);
    follow = true;
  };
  const key = (e: KeyboardEvent) => { if (e.key === "Escape") { stopTour(); clearSelection(true); } else if (e.key === "Home" || e.key === "0") recenter(); };
  const recenter = () => {
    stopTour();
    if (focusId == null && !returnView) returnView = { x: camX, y: camY, zoom };
    focusId = "inicio"; selected = "inicio"; hooks.onSelect("inicio");
    animateCamera("inicio", 0, 0, homeZoom());
  };
  const toggleTour = () => { if (reduced) return; if (tour) stopTour(); else { tour = true; nextTour(); } };

  canvas.style.cursor = "grab"; canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", cancel); canvas.addEventListener("wheel", wheel, { passive: false }); window.addEventListener("keydown", key);
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize(); raf = requestAnimationFrame(loop);

  return {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      motionPreference.removeEventListener("change", onMotionChange);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
      layers.forEach((layer) => {
        layer.geometry.dispose();
      });
      starMat.dispose();
      starSprite.dispose();
      noiseTexture.dispose();
      skyFallback.dispose();
      if (skyTex.value !== skyFallback) skyTex.value.dispose();
      if (milkyTex.value !== skyFallback) milkyTex.value.dispose();
      shader.dispose();
      plane.geometry.dispose();
      composer.dispose();
      renderer.dispose();
    },
    recenter,
    closeFocus: () => clearSelection(true),
    setHover,
    focus(id: string) {
      const b = BODIES.find((x) => x.id === id);
      if (!b) return;
      chooseBody(b);
    },
    setMuted() {},
    select(id: string | null) {
      selected = id;
      if (id == null) clearSelection();
      else {
        const b = BODIES.find((x) => x.id === id);
        if (b) focusBody(b);
      }
    },
    toggleTour,
    stopTour,
  };
}
