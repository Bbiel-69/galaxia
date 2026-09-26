import { BH_WORLD_RS, BODIES, type CelestialBody } from "./bodies";
import type { EngineHooks, GalaxyEngine, LabelPose } from "./engine";

function expLerp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function createFallbackEngine(
  canvas: HTMLCanvasElement,
  hooks: EngineHooks,
): GalaxyEngine {
  const maybe = canvas.getContext("2d");
  if (!maybe) throw new Error("Canvas 2D indisponível");
  const ctx: CanvasRenderingContext2D = maybe;

  let camX = 0;
  let camY = 0;
  let zoom = 0.32;
  let tCamX = 0;
  let tCamY = 0;
  let tZoom = 0.32;
  let follow = true;
  let transition: { id: string | null; fromX: number; fromY: number; fromZoom: number; toX: number; toY: number; toZoom: number; started: number } | null = null;
  let returnView: { x: number; y: number; zoom: number } | null = null;
  let focusId: string | null = null;
  let hoverId: string | null = null;
  let running = true;
  let raf = 0;
  let last = performance.now();
  let diskAngle = 0;
  let pointerId: number | null = null;
  let dragging = false;
  let moved = false;
  let lastPx = 0;
  let lastPy = 0;
  let lastMoveTime = 0;
  let velocityX = 0;
  let velocityY = 0;
  let homed = false;
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = motionPreference.matches;

  const stars = Array.from({ length: 420 }, (_, i) => {
    const t = Math.random();
    const spiral = i < 300;
    const arm = i % 3;
    const angle = arm * 2.094 + t * 2.55 + (Math.random() - 0.5) * (spiral ? 0.72 : 6.28);
    const radius = spiral ? 1.15 + t * 4.6 : 1.5 + Math.random() * 7;
    return {
      x: spiral ? Math.cos(angle) * radius : (Math.random() - 0.5) * 14,
      y: spiral ? Math.sin(angle) * radius * 0.72 : (Math.random() - 0.5) * 10,
      s: Math.random() * 1.5 + 0.35,
      a: 0.4 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      warm: Math.random() > 0.75,
      flare: Math.random() > 0.965,
    };
  });

  const nebulae = Array.from({ length: 18 }, (_, i) => {
    const arm = i % 3;
    const t = 0.12 + ((i * 0.618) % 1) * 0.9;
    const angle = arm * 2.094 + t * 2.55 + (i % 2 ? 0.36 : -0.36);
    const radius = 1.25 + t * 3.7;
    const palette = [[135, 113, 198], [101, 151, 198], [194, 127, 132], [198, 157, 111]];
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.72,
      size: 0.45 + (i % 4) * 0.19,
      alpha: 0.045 + (i % 3) * 0.012,
      color: palette[i % palette.length]!,
      rotation: angle,
    };
  });

  const dust = Array.from({ length: 220 }, () => ({
    a: Math.random() * Math.PI * 2,
    r: 2.4 + Math.random() * 9,
    s: 0.6 + Math.random() * 1.8,
    w: 0.4 + Math.random() * 1.4,
  }));

  function cssSize() {
    return { w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 };
  }

  function homeZoom() {
    const { w, h } = cssSize();
    return Math.min(0.48, Math.max(0.16, Math.min(w, h) * 0.21 / (11 * BH_WORLD_RS * h)));
  }

  function resize() {
    const { w, h } = cssSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const tw = Math.max(1, Math.round(w * dpr));
    const th = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }
    if (!homed && w > 2 && h > 2) {
      camX = tCamX = 0;
      camY = tCamY = 0;
      zoom = tZoom = homeZoom();
      homed = true;
    }
  }

  function screenToWorld(cx: number, cy: number) {
    const { w, h } = cssSize();
    return {
      x: (cx - w * 0.5) / (h * zoom) + camX,
      y: -(cy - h * 0.5) / (h * zoom) + camY,
    };
  }

  function worldToCss(x: number, y: number) {
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
      const d = Math.hypot(wx - b.x, wy - b.y);
      const rad = b.kind === "black-hole" ? 0.55 / Math.max(zoom, 0.4) : 0.16 * b.size + thresh;
      if (d < rad && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  function animateCamera(id: string | null, x: number, y: number, z: number, now = performance.now()) {
    follow = true;
    tCamX = x; tCamY = y; tZoom = z;
    transition = { id, fromX: camX, fromY: camY, fromZoom: zoom, toX: x, toY: y, toZoom: z, started: now };
    if (reduced) {
      camX = x; camY = y; zoom = z; transition = null;
      if (id) hooks.onFocusComplete?.(id);
    }
  }

  function focusBody(b: CelestialBody) {
    if (focusId == null && !returnView) returnView = { x: camX, y: camY, zoom };
    focusId = b.id;
    animateCamera(b.id, b.x, b.y, b.kind === "black-hole" ? 1.85 : 1.35);
  }

  function chooseBody(b: CelestialBody) {
    hooks.onSelect(b.id);
    focusBody(b);
  }

  function setHover(id: string | null) {
    if (hoverId === id) return;
    hoverId = id;
    canvas.style.cursor = id ? "pointer" : dragging ? "grabbing" : "grab";
    hooks.onHover(id);
  }

  function onMotionChange() {
    reduced = motionPreference.matches;
    if (reduced && transition) {
      const completed = transition.id;
      camX = transition.toX; camY = transition.toY; zoom = transition.toZoom;
      transition = null;
      if (completed) hooks.onFocusComplete?.(completed);
    }
  }

  function clearSelection(returnToPrevious = false) {
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
  }

  function loop(now: number) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduced) diskAngle += dt * 0.35;
    if (transition) {
      const t = Math.min(1, (now - transition.started) / 1250);
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
      camX = expLerp(camX, tCamX, 3.2, dt);
      camY = expLerp(camY, tCamY, 3.2, dt);
      zoom = expLerp(zoom, tZoom, 2.6, dt);
    } else if (!dragging && (Math.abs(velocityX) + Math.abs(velocityY) > 0.0001)) {
      camX += velocityX * dt; camY += velocityY * dt;
      velocityX *= Math.exp(-4.8 * dt); velocityY *= Math.exp(-4.8 * dt);
    }
    resize();
    const { width } = canvas;
    const { w, h } = cssSize();
    const dpr = width / w;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#07060c";
    ctx.fillRect(0, 0, w, h);

    const origin = worldToCss(0, 0);
    const rs = BH_WORLD_RS * h * zoom;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const nebula of nebulae) {
      const drift = reduced ? 0 : Math.sin(now * 0.00007 + nebula.rotation) * 0.035;
      const x = (nebula.x - camX * 0.12 + drift) * h * zoom + w / 2;
      const y = -(nebula.y - camY * 0.12) * h * zoom + h / 2;
      const radius = h * zoom * nebula.size;
      if (radius < 2 || x + radius < 0 || x - radius > w || y + radius < 0 || y - radius > h) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(nebula.rotation);
      ctx.scale(1, 0.68);
      const haze = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      haze.addColorStop(0, `rgba(${nebula.color.join(",")},${nebula.alpha})`);
      haze.addColorStop(0.48, `rgba(${nebula.color.join(",")},${nebula.alpha * 0.58})`);
      haze.addColorStop(1, `rgba(${nebula.color.join(",")},0)`);
      ctx.fillStyle = haze;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    for (const s of stars) {
      const p = worldToCss(s.x, s.y);
      if (p.x < -12 || p.x > w + 12 || p.y < -12 || p.y > h + 12) continue;
      const twinkle = reduced ? 0.9 : 0.78 + 0.22 * Math.sin(now * 0.0015 + s.phase);
      const tint = s.warm ? "255,222,184" : "197,216,255";
      if (s.s > 1.35) {
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s.s * 5);
        halo.addColorStop(0, `rgba(${tint},${0.22 * twinkle})`);
        halo.addColorStop(1, `rgba(${tint},0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s.s * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(${tint},${s.a * twinkle})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s.s * twinkle, 0, Math.PI * 2);
      ctx.fill();
      if (s.flare) {
        ctx.strokeStyle = `rgba(${tint},${0.3 * twinkle})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(p.x - s.s * 3, p.y);
        ctx.lineTo(p.x + s.s * 3, p.y);
        ctx.moveTo(p.x, p.y - s.s * 3);
        ctx.lineTo(p.x, p.y + s.s * 3);
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.scale(1, 0.34);
    ctx.rotate(diskAngle);
    const outer = rs * 11;
    const grd = ctx.createRadialGradient(0, 0, rs * 1.35, 0, 0, outer);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.09, "rgba(245,224,255,0.96)");
    grd.addColorStop(0.18, "rgba(221,172,255,0.78)");
    grd.addColorStop(0.39, "rgba(255,151,194,0.48)");
    grd.addColorStop(0.66, "rgba(255,211,163,0.24)");
    grd.addColorStop(1, "rgba(48,28,56,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, Math.PI * 2);
    ctx.fill();

    const beam = ctx.createLinearGradient(-outer, 0, outer, 0);
    beam.addColorStop(0, "rgba(184,128,255,0)");
    beam.addColorStop(0.28, "rgba(225,166,255,0.32)");
    beam.addColorStop(0.5, "rgba(255,245,237,0.82)");
    beam.addColorStop(0.72, "rgba(255,186,205,0.48)");
    beam.addColorStop(1, "rgba(255,203,133,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.ellipse(0, 0, outer, outer * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.globalCompositeOperation = "lighter";
    for (const d of dust) {
      const a = d.a + diskAngle * d.w / Math.pow(d.r, 1.5);
      const x = Math.cos(a) * d.r * rs;
      const y = Math.sin(a) * d.r * rs * 0.28;
      ctx.fillStyle = d.w > 1 ? "rgba(255,226,245,0.62)" : "rgba(196,163,255,0.38)";
      ctx.beginPath();
      ctx.arc(x, y, d.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(origin.x, origin.y, rs, origin.x, origin.y, rs * 8);
    glow.addColorStop(0, "rgba(255,220,246,0.24)");
    glow.addColorStop(0.4, "rgba(213,152,255,0.09)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, rs * 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,245,255,0.88)";
    ctx.lineWidth = Math.max(1.2, rs * 0.08);
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, rs * 2.55, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, rs * 1.55, 0, Math.PI * 2);
    ctx.fill();

    for (const b of BODIES) {
      if (b.kind === "black-hole") continue;
      const p = worldToCss(b.x, b.y);
      const hovered = hoverId === b.id;
      const radius = 18 * b.size * (hovered ? 1.7 : focusId === b.id ? 1.35 : 1);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      const c = b.color;
      g.addColorStop(0, `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${hovered ? 1 : 0.86})`);
      g.addColorStop(0.22, `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${hovered ? 0.62 : 0.42})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const labels: LabelPose[] = BODIES.map((b) => {
      const p = worldToCss(b.x, b.y);
      const pad = 28;
      return {
        id: b.id,
        x: p.x,
        y: p.y,
        visible: p.x > pad && p.x < w - pad && p.y > pad && p.y < h - 72,
      };
    });
    hooks.onFrame(labels, zoom);
    raf = requestAnimationFrame(loop);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerId = e.pointerId;
    dragging = true;
    moved = false;
    follow = false;
    transition = null;
    velocityX = 0;
    velocityY = 0;
    lastPx = e.clientX;
    lastPy = e.clientY;
    lastMoveTime = e.timeStamp;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  }

  function onPointerMove(e: PointerEvent) {
    const { h } = cssSize();
    if (dragging && e.pointerId === pointerId) {
      const dx = e.clientX - lastPx;
      const dy = e.clientY - lastPy;
      const elapsed = Math.max(0.008, (e.timeStamp - lastMoveTime) / 1000);
      if (Math.hypot(dx, dy) > 3) moved = true;
      const moveX = -dx / (h * zoom);
      const moveY = dy / (h * zoom);
      camX += moveX;
      camY += moveY;
      tCamX = camX;
      tCamY = camY;
      velocityX = velocityX * 0.35 + (moveX / elapsed) * 0.65;
      velocityY = velocityY * 0.35 + (moveY / elapsed) * 0.65;
      lastPx = e.clientX;
      lastPy = e.clientY;
      lastMoveTime = e.timeStamp;
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
      if (hit) chooseBody(hit);
      else clearSelection();
    } else {
      const speed = Math.hypot(velocityX, velocityY);
      if (speed > 1.5) { velocityX *= 1.5 / speed; velocityY *= 1.5 / speed; }
    }
  }

  function onPointerCancel() {
    dragging = false;
    pointerId = null;
    canvas.style.cursor = hoverId ? "pointer" : "grab";
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    transition = null;
    velocityX = 0;
    velocityY = 0;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const before = screenToWorld(x, y);
    const { w, h } = cssSize();
    tZoom = Math.min(3.6, Math.max(0.18, zoom * Math.exp(-e.deltaY * 0.0015)));
    tCamX = before.x - (x - w / 2) / (h * tZoom);
    tCamY = before.y + (y - h / 2) / (h * tZoom);
    follow = true;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") clearSelection(true);
    else if (e.key === "Home" || e.key === "0") recenter();
  }

  function recenter() {
    if (focusId == null && !returnView) returnView = { x: camX, y: camY, zoom };
    focusId = "inicio";
    hooks.onSelect("inicio");
    animateCamera("inicio", 0, 0, homeZoom());
  }

  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  motionPreference.addEventListener("change", onMotionChange);
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      motionPreference.removeEventListener("change", onMotionChange);
    },
    recenter,
    focus(id: string) {
      const b = BODIES.find((x) => x.id === id);
      if (!b) return;
      chooseBody(b);
    },
    closeFocus() { clearSelection(true); },
    setHover,
    setMuted() {},
    select() {},
    toggleTour() {},
    stopTour() {},
  };
}
