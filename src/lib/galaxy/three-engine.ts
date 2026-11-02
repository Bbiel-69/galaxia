import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { bodyById, bodies, type CelestialBody } from "./bodies";

export type GalaxyEngine = {
  destroy: () => void;
  recenter: () => void;
  closeFocus: () => void;
  toggleTour: () => void;
  stopTour: () => void;
  zoomBy: (factor: number) => void;
};

export type EngineHooks = {
  onHover: (id: string | null) => void;
  onProgress: (done: number, total: number) => void;
  onTour: (id: string | null, active: boolean) => void;
  onSelect: (id: string | null) => void;
  onFocusComplete: (id: string | null) => void;
  onFrame: (labels: { id: string; x: number; y: number; visible: boolean }[]) => void;
};

const STAR_COUNT = 12000;
const DUST_COUNT = 8000;
const GALAXY_RADIUS = 42;

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function createStarField(rng: () => number) {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = Math.pow(rng(), 0.55) * GALAXY_RADIUS * 1.8;
    const theta = rng() * Math.PI * 2;
    const phi = (rng() - 0.5) * 0.35;
    positions[i * 3] = r * Math.cos(theta) * Math.cos(phi);
    positions[i * 3 + 1] = r * Math.sin(phi) * 0.4;
    positions[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi);
    const temp = rng();
    if (temp < 0.15) {
      colors[i * 3] = 0.6 + rng() * 0.4;
      colors[i * 3 + 1] = 0.7 + rng() * 0.3;
      colors[i * 3 + 2] = 1;
    } else if (temp < 0.4) {
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 0.9 + rng() * 0.1;
      colors[i * 3 + 2] = 0.7 + rng() * 0.3;
    } else {
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 0.95 + rng() * 0.05;
      colors[i * 3 + 2] = 0.9 + rng() * 0.1;
    }
    sizes[i] = 0.5 + rng() * 2.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

function createDust(rng: () => number) {
  const positions = new Float32Array(DUST_COUNT * 3);
  const colors = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    const arm = Math.floor(rng() * 4);
    const armAngle = (arm / 4) * Math.PI * 2;
    const t = rng();
    const r = 2 + t * GALAXY_RADIUS;
    const spiral = armAngle + t * 3.5 + (rng() - 0.5) * 0.4;
    const spread = (rng() - 0.5) * (0.8 + t * 1.2);
    positions[i * 3] = r * Math.cos(spiral) + spread;
    positions[i * 3 + 1] = (rng() - 0.5) * (0.3 + t * 0.6);
    positions[i * 3 + 2] = r * Math.sin(spiral) + spread * 0.6;
    const warmth = 0.4 + rng() * 0.6;
    colors[i * 3] = 0.7 + warmth * 0.3;
    colors[i * 3 + 1] = 0.5 + warmth * 0.3;
    colors[i * 3 + 2] = 0.3 + warmth * 0.2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.4,
    vertexColors: true,
    transparent: true,
    opacity: 0.35,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

export function createGalaxyEngine(canvas: HTMLCanvasElement, hooks: EngineHooks): GalaxyEngine {
  const rng = seededRandom(42);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05050a, 0.012);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 12, 28);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.85);
  composer.addPass(bloomPass);

  const stars = createStarField(rng);
  scene.add(stars);
  const dust = createDust(rng);
  scene.add(dust);

  // Central glow
  const coreGeo = new THREE.SphereGeometry(1.2, 32, 32);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.9 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  scene.add(core);
  const coreLight = new THREE.PointLight(0xffaa66, 2.5, 40);
  scene.add(coreLight);

  const bodyMeshes = new Map<string, THREE.Object3D>();
  const bodyData = bodies;

  for (const body of bodyData) {
    let mesh: THREE.Object3D;
    if (body.kind === "black-hole") {
      const geo = new THREE.SphereGeometry(body.size || 1.5, 32, 32);
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      mesh = new THREE.Mesh(geo, mat);
      const ringGeo = new THREE.RingGeometry((body.size || 1.5) * 1.3, (body.size || 1.5) * 2.2, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff8844,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2.2;
      mesh.add(ring);
    } else if (body.kind === "star") {
      const geo = new THREE.SphereGeometry(body.size || 0.8, 24, 24);
      const mat = new THREE.MeshBasicMaterial({ color: body.color || 0xffeeaa });
      mesh = new THREE.Mesh(geo, mat);
      const light = new THREE.PointLight(body.color || 0xffeeaa, 1.2, 15);
      mesh.add(light);
    } else {
      const geo = new THREE.SphereGeometry(body.size || 0.5, 20, 20);
      const mat = new THREE.MeshStandardMaterial({
        color: body.color || 0x8888aa,
        roughness: 0.7,
        metalness: 0.1,
      });
      mesh = new THREE.Mesh(geo, mat);
    }
    mesh.position.set(body.x || 0, body.y || 0, body.z || 0);
    mesh.userData = { id: body.id };
    scene.add(mesh);
    bodyMeshes.set(body.id, mesh);
  }

  let width = canvas.clientWidth;
  let height = canvas.clientHeight;
  const resize = () => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    camera.aspect = width / height || 1;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloomPass.resolution.set(width, height);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let target = new THREE.Vector3(0, 0, 0);
  let focusId: string | null = null;
  let tourActive = false;
  let tourIndex = 0;
  let tourTimer = 0;
  const tourOrder = bodyData.filter((b) => b.kind !== "black-hole").map((b) => b.id);
  let hovering: string | null = null;
  let pointerDown = false;
  let lastX = 0;
  let lastY = 0;
  let spherical = { theta: 0.3, phi: 1.1, radius: 32 };
  let targetSpherical = { ...spherical };
  let animatingFocus = false;
  let focusProgress = 0;
  let focusFrom = new THREE.Vector3();
  let focusTo = new THREE.Vector3();
  let focusCamFrom = { ...spherical };
  let focusCamTo = { ...spherical };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const onPointerMove = (e: PointerEvent) => {
    if (pointerDown) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      targetSpherical.theta -= dx * 0.005;
      targetSpherical.phi = Math.max(0.2, Math.min(Math.PI - 0.2, targetSpherical.phi + dy * 0.005));
      lastX = e.clientX;
      lastY = e.clientY;
    } else {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const meshes = Array.from(bodyMeshes.values());
      const hits = raycaster.intersectObjects(meshes, true);
      let id: string | null = null;
      if (hits.length) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData.id) obj = obj.parent;
        id = obj?.userData.id ?? null;
      }
      if (id !== hovering) {
        hovering = id;
        hooks.onHover(id);
      }
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    pointerDown = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!pointerDown) return;
    pointerDown = false;
    canvas.releasePointerCapture(e.pointerId);
    const dx = Math.abs(e.clientX - lastX);
    const dy = Math.abs(e.clientY - lastY);
    if (dx < 4 && dy < 4 && hovering) {
      focusOn(hovering);
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    targetSpherical.radius = Math.max(8, Math.min(60, targetSpherical.radius + e.deltaY * 0.02));
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const focusOn = (id: string) => {
    const body = bodyById(id);
    if (!body) return;
    focusId = id;
    animatingFocus = true;
    focusProgress = 0;
    focusFrom.copy(target);
    focusTo.set(body.x || 0, body.y || 0, body.z || 0);
    focusCamFrom = { ...spherical };
    focusCamTo = {
      theta: Math.atan2(body.z || 0, body.x || 0) + 0.4,
      phi: 1.0,
      radius: 12 + (body.size || 0.5) * 4,
    };
    hooks.onSelect(id);
  };

  const closeFocus = () => {
    focusId = null;
    animatingFocus = true;
    focusProgress = 0;
    focusFrom.copy(target);
    focusTo.set(0, 0, 0);
    focusCamFrom = { ...spherical };
    focusCamTo = { theta: 0.3, phi: 1.1, radius: 32 };
    hooks.onSelect(null);
  };

  const recenter = () => {
    tourActive = false;
    hooks.onTour(null, false);
    closeFocus();
  };

  const toggleTour = () => {
    if (tourActive) {
      stopTour();
      return;
    }
    tourActive = true;
    tourIndex = 0;
    tourTimer = 0;
    hooks.onTour(tourOrder[0] ?? null, true);
    if (tourOrder[0]) focusOn(tourOrder[0]);
  };

  const stopTour = () => {
    tourActive = false;
    hooks.onTour(null, false);
  };

  const zoomBy = (factor: number) => {
    targetSpherical.radius = Math.max(8, Math.min(60, targetSpherical.radius / factor));
  };

  let raf = 0;
  let last = performance.now();
  const animate = (now: number) => {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (animatingFocus) {
      focusProgress = Math.min(1, focusProgress + dt * 1.2);
      const t = 1 - Math.pow(1 - focusProgress, 3);
      target.lerpVectors(focusFrom, focusTo, t);
      spherical.theta = focusCamFrom.theta + (focusCamTo.theta - focusCamFrom.theta) * t;
      spherical.phi = focusCamFrom.phi + (focusCamTo.phi - focusCamFrom.phi) * t;
      spherical.radius = focusCamFrom.radius + (focusCamTo.radius - focusCamFrom.radius) * t;
      if (focusProgress >= 1) {
        animatingFocus = false;
        hooks.onFocusComplete(focusId);
      }
    } else {
      spherical.theta += (targetSpherical.theta - spherical.theta) * 0.08;
      spherical.phi += (targetSpherical.phi - spherical.phi) * 0.08;
      spherical.radius += (targetSpherical.radius - spherical.radius) * 0.08;
    }

    const x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    const y = target.y + spherical.radius * Math.cos(spherical.phi);
    const z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    camera.position.set(x, y, z);
    camera.lookAt(target);

    core.rotation.y += dt * 0.15;
    stars.rotation.y += dt * 0.01;
    dust.rotation.y += dt * 0.008;

    if (tourActive) {
      tourTimer += dt;
      if (tourTimer > 6) {
        tourTimer = 0;
        tourIndex = (tourIndex + 1) % tourOrder.length;
        const nextId = tourOrder[tourIndex];
        hooks.onTour(nextId, true);
        if (nextId) focusOn(nextId);
      }
    }

    const labels: { id: string; x: number; y: number; visible: boolean }[] = [];
    for (const [id, mesh] of bodyMeshes) {
      const pos = new THREE.Vector3();
      mesh.getWorldPosition(pos);
      pos.project(camera);
      const sx = (pos.x * 0.5 + 0.5) * width;
      const sy = (-pos.y * 0.5 + 0.5) * height;
      const visible = pos.z < 1 && sx > -50 && sx < width + 50 && sy > -50 && sy < height + 50;
      labels.push({ id, x: sx, y: sy, visible });
    }
    hooks.onFrame(labels);

    composer.render();
  };
  raf = requestAnimationFrame(animate);
  hooks.onProgress(1, 1);

  return {
    destroy: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      renderer.dispose();
      composer.dispose();
    },
    recenter,
    closeFocus,
    toggleTour,
    stopTour,
    zoomBy,
  };
}
