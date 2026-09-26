import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { BH_WORLD_RS, BODIES, TOUR_ORDER, type CelestialBody } from "./bodies";
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
function stars(count: number, seed: number, spread: number) {
  const geometry = new THREE.CircleGeometry(0.009, 4);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const r = Math.pow(rnd(), 0.62) * spread + 0.3;
    const a = rnd() * Math.PI * 2;
    const scale = 0.35 + rnd() * 1.9;
    m.makeTranslation(Math.cos(a) * r, Math.sin(a) * r * (0.34 + rnd() * 0.45), 0).scale(new THREE.Vector3(scale, scale, scale));
    mesh.setMatrixAt(i, m);
    c.setRGB(0.62 + rnd() * 0.38, 0.68 + rnd() * 0.32, 0.85 + rnd() * 0.15);
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function createNoiseTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let seed = 7193;
  for (let i = 0; i < size * size; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = seed >>> 24;
    const offset = i * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createGalaxyEngine(canvas: HTMLCanvasElement, hooks: EngineHooks): GalaxyEngine {
  const mobile = coarse();
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = motionPreference.matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x07060c);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  camera.position.z = 1;

  const bodies = Array.from({ length: 8 }, () => new THREE.Vector4());
  const colors = Array.from({ length: 8 }, () => new THREE.Vector3());
  LIGHTS.forEach((b, i) => {
    bodies[i]!.set(b.x, b.y, b.size, (i * 0.173 + 0.37) % 1);
    colors[i]!.set(b.color[0], b.color[1], b.color[2]);
  });
  const noiseTexture = createNoiseTexture();
  const uniforms = {
    uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uCam: { value: new THREE.Vector2() },
    uZoom: { value: 0.32 }, uBh: { value: new THREE.Vector2() }, uHorizon: { value: 1 },
    uSteps: { value: mobile ? 34 : 52 }, uReduced: { value: reduced ? 1 : 0 }, uPulse: { value: 0 },
    uN: { value: LIGHTS.length }, uHover: { value: -1 }, uSel: { value: -1 },
    uBodies: { value: bodies }, uBodyCol: { value: colors }, uNoise: { value: noiseTexture },
  };
  const shader = new THREE.ShaderMaterial({ vertexShader: SCENE_VS, fragmentShader: SCENE_FS, uniforms, depthWrite: false, depthTest: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shader);
  scene.add(plane);

  const root = new THREE.Group();
  scene.add(root);
  const total = mobile ? 1500 : 3200;
  const n = Math.floor(total / 3);
  const layers = [stars(n, 11, 12), stars(n, 31, 9), stars(total - n * 2, 71, 6.5)];
  layers.forEach((layer, i) => { layer.renderOrder = i + 2; root.add(layer); });
  hooks.onProgress?.(0, total);
  hooks.onProgress?.(Math.floor(total / 3), total);
  hooks.onProgress?.(Math.floor((total * 2) / 3), total);
  hooks.onProgress?.(total, total);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomStrength = mobile ? 0.5 : 0.65;
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), reduced ? 0 : bloomStrength, mobile ? 0.28 : 0.34, 0.88);
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
        uniforms.uSteps.value = Math.max(mobile ? 24 : 38, uniforms.uSteps.value - 8);
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
    destroy() { running = false; cancelAnimationFrame(raf); ro.disconnect(); motionPreference.removeEventListener("change", onMotionChange); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", cancel); canvas.removeEventListener("wheel", wheel); window.removeEventListener("keydown", key); layers.forEach((x) => { x.geometry.dispose(); (x.material as THREE.Material).dispose(); }); plane.geometry.dispose(); shader.dispose(); noiseTexture.dispose(); bloom.dispose(); composer.dispose(); renderer.dispose(); renderer.forceContextLoss(); },
          recenter,
          focus(id) { const b = BODIES.find((x) => x.id === id); if (b) chooseBody(b); },
          closeFocus() { stopTour(); clearSelection(true); },
          setHover,
          setMuted() {},
          select(id) { selected = id; },
          toggleTour, stopTour,
        };
      }
                                                                                                      
