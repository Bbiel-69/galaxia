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
  let hoverId: string | null = null;
  let selId: string | null = null;
  let running = true;
  let raf = 0;
  let last = performance.now();
  let diskAngle = 0;
  let pointerId: number | null = null;
  let dragging = false;
  let moved = false;
  let lastPx = 0;
  let lastPy = 0;

  const stars = Array.from({ length: 420 }, () => ({
    x: (Math.random() - 0.5) * 12,
    y: (Math.random() - 0.5) * 12,
    s: Math.random() * 1.4 + 0.3,
    a: 0.35 + Math.random() * 0.65,
  }));

  const dust = Array.from({ length: 220 }, () => ({
    a: Math.random() * Math.PI * 2,
    r: 2.4 + Math.random() * 9,
    s: 0.6 + Math.random() * 1.8,
    w: 0.4 + Math.random() * 1.4,
  }));

  function cssSize() {
    return { w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 };
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

  function focusBody(b: CelestialBody) {
    follow = true;
    tCamX = b.x;
    tCamY = b.y;
    tZoom = b.kind === "black-hole" ? 1.85 : 1.35;
  }

  function loop(now: number) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    diskAngle += dt * 0.35;
    if (follow) {
      camX = expLerp(camX, tCamX, 3.2, dt);
      camY = expLerp(camY, tCamY, 3.2, dt);
      zoom = expLerp(zoom, tZoom, 2.6, dt);
    }
    resize();
    const { width, height } = canvas;
    const { w, h } = cssSize();
    const dpr = width / w;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#07060c";
    ctx.fillRect(0, 0, w, h);

    const origin = worldToCss(0, 0);
    const rs = BH_WORLD_RS * h * zoom;

    for (const s of stars) {
      const p = worldToCss(s.x, s.y);
      ctx.fillStyle = `rgba(230,225,220,${s.a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s.s, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.scale(1, 0.34);
    ctx.rotate(diskAngle);
    const outer = rs * 11;
    const grd = ctx.createRadialGradient(0, 0, rs * 2.4, 0, 0, outer);
    grd.addColorStop(0, "rgba(255,210,160,0.0)");
    grd.addColorStop(0.08, "rgba(255,170,90,0.85)");
    grd.addColorStop(0.35, "rgba(255,90,30,0.45)");
    grd.addColorStop(1, "rgba(40,10,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, Math.PI * 2);
    ctx.fill();

    const beam = ctx.createLinearGradient(-outer, 0, outer, 0);
    beam.addColorStop(0, "rgba(180,40,10,0.0)");
    beam.addColorStop(0.28, "rgba(220,50,10,0.25)");
    beam.addColorStop(0.55, "rgba(255,230,200,0.55)");
    beam.addColorStop(0.78, "rgba(120,180,255,0.7)");
    beam.addColorStop(1, "rgba(80,140,255,0)");
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
      const a = d.a + diskAngle * d.w;
      const x = Math.cos(a) * d.r * rs;
      const y = Math.sin(a) * d.r * rs * 0.28;
      ctx.fillStyle = "rgba(255,160,80,0.35)";
      ctx.beginPath();
      ctx.arc(x, y, d.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(origin.x, origin.y, rs, origin.x, origin.y, rs * 8);
    glow.addColorStop(0, "rgba(255,120,40,0.28)");
    glow.addColorStop(0.4, "rgba(255,80,20,0.08)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, rs * 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,210,150,0.7)";
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
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18 * b.size);
      const c = b.color;
      g.addColorStop(0, `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},1)`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18 * b.size, 0, Math.PI * 2);
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
    lastPx = e.clientX;
    lastPy = e.clientY;
    canvas.setPointerCapture(e.pointerId);
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
    const id = hit?.id ?? null;
    if (id !== hoverId) {
      hoverId = id;
      hooks.onHover(id);
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    if (!moved) {
      const rect = canvas.getBoundingClientRect();
      const wpos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = hitTest(wpos.x, wpos.y);
      selId = hit?.id ?? null;
      hooks.onSelect(selId);
      if (hit) {
        focusBody(hit);
        if (hit.href) window.open(hit.href, "_blank", "noopener,noreferrer");
      }
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    follow = false;
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoom = Math.min(3.6, Math.max(0.26, zoom * factor));
    tZoom = zoom;
  }

  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    },
    recenter() {
      follow = true;
      tCamX = 0;
      tCamY = 0;
      tZoom = 0.32;
      selId = "inicio";
      hooks.onSelect("inicio");
    },
    focus(id: string) {
      const b = BODIES.find((x) => x.id === id);
      if (!b) return;
      selId = id;
      focusBody(b);
    },
    setMuted() {},
    select(id) {
      selId = id;
    },
  };
}
