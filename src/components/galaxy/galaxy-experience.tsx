import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, LocateFixed, Route, Volume2, VolumeX, X } from "lucide-react";
import { createAmbience, type Ambience } from "@/lib/galaxy/audio";
import { BODIES, bodyById, type BodyKind, type CelestialBody } from "@/lib/galaxy/bodies";
import { createGalaxyEngine, type GalaxyEngine } from "@/lib/galaxy/three-engine";
import { createFallbackEngine } from "@/lib/galaxy/fallback";

const KIND_LABEL: Record<BodyKind, string> = { "black-hole": "Singularidade", star: "Estrela", nebula: "Nebulosa", galaxy: "Galáxia", station: "Estação" };
const MUTE_KEY = "horizonte-muted";

function canUseWebgl2(): boolean {
  const probeCanvas = document.createElement("canvas");
  try {
    const probeContext = probeCanvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    if (!probeContext) return false;

    // The probe must never become the app canvas. Release its context before
    // dropping the temporary node so the real canvas remains untouched.
    probeContext.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  } finally {
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    probeCanvas.remove();
  }
}

export function GalaxyExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GalaxyEngine | null>(null);
  const audioRef = useRef<Ambience | null>(null);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const cursorRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLSpanElement[]>([]);
  const [selected, setSelected] = useState<CelestialBody | null>(null);
  const [tourBody, setTourBody] = useState<CelestialBody | null>(null);
  const [tourActive, setTourActive] = useState(false);
  const [hint, setHint] = useState(true);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReduced(media.matches);
    media.addEventListener("change", onMotion);

    const cursor = cursorRef.current;
    const positions = Array.from({ length: 6 }, () => ({ x: 0, y: 0 }));
    let raf = 0, tx = 0, ty = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || reduced) return;
      tx = e.clientX; ty = e.clientY;
      if (cursor) cursor.style.opacity = "1";
    };
    const tick = () => {
      positions[0]!.x += (tx - positions[0]!.x) * 0.35;
      positions[0]!.y += (ty - positions[0]!.y) * 0.35;
      for (let i = 1; i < positions.length; i++) {
        positions[i]!.x += (positions[i - 1]!.x - positions[i]!.x) * (0.2 - i * 0.018);
        positions[i]!.y += (positions[i - 1]!.y - positions[i]!.y) * (0.2 - i * 0.018);
      }
      positions.forEach((p, i) => { const el = trailRef.current[i]; if (el) el.style.transform = `translate3d(${p.x}px,${p.y}px,0) translate(-50%,-50%) scale(${1 - i * 0.12})`; });
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { media.removeEventListener("change", onMotion); window.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, [reduced]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stored = window.localStorage.getItem(MUTE_KEY);
    const startMuted = stored === "1";
    setMuted(startMuted);
    const audio = createAmbience();
    audioRef.current = audio;
    audio.setMuted(startMuted);

    const hooks = {
      onHover: () => {},
      onProgress: (done: number, total: number) => setProgress(total ? Math.round((done / total) * 100) : 0),
      onTour: (id: string | null, active: boolean) => { setTourActive(active); setTourBody(id ? bodyById(id) ?? null : null); },
      onSelect: (id: string | null) => {
        const body = id ? bodyById(id) ?? null : null;
        setSelected(body?.kind === "black-hole" ? body : null);
        audio.setFocus(id);
        if (body) { setHint(false); audio.ping(); }
      },
      onFrame: (next: { id: string; x: number; y: number; visible: boolean }[]) => {
        for (const label of next) {
          const el = labelRefs.current.get(label.id); if (!el) continue;
          const body = bodyById(label.id); if (body?.kind === "black-hole") { el.style.opacity = "0"; continue; }
          el.style.transform = `translate3d(${label.x}px,${label.y - 14}px,0) translate(-50%,-100%)`;
          el.style.opacity = label.visible ? "1" : "0"; el.style.pointerEvents = label.visible ? "auto" : "none";
        }
      },
    };

    const unlock = () => audio.start();
    window.addEventListener("pointerdown", unlock, { once: true });

    let engine: GalaxyEngine | null = null;
    if (!canUseWebgl2()) {
      try {
        engine = createFallbackEngine(canvas, hooks);
        setWebgl(false);
      } catch {
        // Even 2D canvas is unavailable on this device/browser (e.g. GPU
        // process crashed or the browser's live-canvas-context budget was
        // exhausted). Fall through to the static, non-canvas experience
        // below instead of letting this bubble up and crash the route.
      }
    } else {
      try {
        engine = createGalaxyEngine(canvas, hooks);
        setWebgl(true);
      } catch {
        // WebGLRenderer may have claimed the real canvas before failing.
        // Canvas context types are immutable, so never try 2D on this node.
        try {
          const fallbackCanvas = canvas.cloneNode(true) as HTMLCanvasElement;
          canvas.replaceWith(fallbackCanvas);
          canvasRef.current = fallbackCanvas;
          engine = createFallbackEngine(fallbackCanvas, hooks);
          setWebgl(false);
        } catch {
          // Same last-resort as above: no canvas rendering path worked.
        }
      }
    }
    engineRef.current = engine;
    if (!engine) {
      // No renderer could be created at all (e.g. the device blocked every
      // canvas context, which happens on some Android phones in battery
      // saver mode). Show a friendly message instead of leaving the page
      // in a broken/crashed state.
      setWebgl(false);
      setUnavailable(true);
      setReady(true);
      setProgress(100);
      return () => { window.removeEventListener("pointerdown", unlock); audio.dispose(); audioRef.current = null; };
    }
    setProgress(100); setReady(true);
    return () => { window.removeEventListener("pointerdown", unlock); engine.destroy(); audio.dispose(); engineRef.current = null; audioRef.current = null; };
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => { const next = !prev; audioRef.current?.setMuted(next); window.localStorage.setItem(MUTE_KEY, next ? "1" : "0"); if (!next) audioRef.current?.start(); return next; });
  }, []);
  const closePanel = useCallback(() => { setSelected(null); engineRef.current?.select(null); audioRef.current?.setFocus(null); }, []);
  const goHome = useCallback(() => { engineRef.current?.recenter(); setHint(false); audioRef.current?.setFocus("inicio"); }, []);
  const toggleTour = useCallback(() => { if (reduced) return; engineRef.current?.toggleTour(); }, [reduced]);
  const stopTour = useCallback(() => { engineRef.current?.stopTour(); setTourActive(false); setTourBody(null); }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="Galáxia interativa" />

      <div ref={cursorRef} className="pointer-events-none fixed inset-0 z-[80] opacity-0" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} ref={(el) => { if (el) trailRef.current[i] = el; }} className="fixed left-0 top-0 block rounded-full bg-accent shadow-[0_0_14px_rgba(255,210,150,0.8)]" style={{ width: Math.max(3, 9 - i), height: Math.max(3, 9 - i), opacity: 1 - i * 0.13 }} />
        ))}
        <span className="fixed left-0 top-0 font-sans text-[16px] text-accent" style={{ transform: "translate(-50%,-58%)" }}>✦</span>
      </div>

      <div className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.9'/></svg>\")" }} aria-hidden />

      {BODIES.filter((b) => b.kind !== "black-hole").map((body) => (
        <button key={body.id} type="button" ref={(node) => { if (node) labelRefs.current.set(body.id, node); else labelRefs.current.delete(body.id); }} onClick={() => { engineRef.current?.focus(body.id); engineRef.current?.select(body.id); audioRef.current?.setFocus(body.id); setHint(false); }} title={body.name} className="absolute top-0 left-0 z-10 min-h-11 px-2 text-center will-change-transform" style={{ opacity: 0, pointerEvents: "none" }}>
          <span className="inline-flex items-center gap-1 font-sans text-[11px] font-medium tracking-[0.18em] text-accent uppercase">{body.name}{body.href ? <ExternalLink className="size-3 opacity-70" aria-hidden /> : null}</span>
        </button>
      ))}

      <header className="pointer-events-none absolute top-0 left-0 z-20 flex w-full items-start justify-between gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
        <div className="max-w-[16rem]"><p className="font-sans text-[11px] font-medium tracking-[0.28em] text-muted uppercase">Observatório</p><h1 className="font-display text-[2.15rem] leading-[0.95] tracking-[-0.03em] text-fg sm:text-4xl">Horizonte</h1></div>
        <div className="pointer-events-auto flex items-center gap-2">
          <IconBtn label={tourActive ? "Parar tour" : "Iniciar tour"} onClick={tourActive ? stopTour : toggleTour}><Route className={tourActive ? "size-4 animate-pulse" : "size-4"} /></IconBtn>
          <IconBtn label={muted ? "Ativar som" : "Silenciar"} onClick={toggleMute}>{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</IconBtn>
          <IconBtn label="Voltar ao centro" onClick={goHome}><LocateFixed className="size-4" /></IconBtn>
        </div>
      </header>

      {!ready ? <div className="absolute inset-0 z-40 grid place-items-center bg-bg/80 backdrop-blur-sm"><div className="w-[min(78vw,20rem)]"><div className="mb-3 flex justify-between font-sans text-xs tracking-[0.18em] text-muted uppercase"><span>Gerando galáxia</span><span>{progress}%</span></div><div className="h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-center font-sans text-[10px] tracking-[0.16em] text-muted uppercase">{progress < 100 ? "Preparando estrelas" : "Pronta"}</p></div></div> : null}

      {ready && unavailable ? <div className="absolute inset-0 z-40 grid place-items-center bg-bg px-6 text-center"><div className="max-w-xs"><p className="font-sans text-[10px] tracking-[0.26em] text-muted uppercase">Observatório</p><h2 className="mt-1 font-display text-2xl leading-tight text-fg">Não foi possível carregar a galáxia</h2><p className="mt-3 font-sans text-sm leading-relaxed text-muted">O navegador bloqueou a renderização (comum em modo de economia de bateria). Tente recarregar a página ou desativar a economia de bateria.</p></div></div> : null}

      {tourActive && tourBody ? <aside className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-30 w-[min(calc(100vw-2rem),30rem)] -translate-x-1/2 rounded-xl border border-border bg-surface/88 p-4 text-center shadow-[0_18px_50px_rgb(0_0_0/0.45)] backdrop-blur-md"><p className="font-sans text-[10px] tracking-[0.26em] text-muted uppercase">Tour · {KIND_LABEL[tourBody.kind]}</p><h2 className="mt-1 font-display text-3xl leading-none">{tourBody.name}</h2><p className="mt-1 font-sans text-sm text-muted">{tourBody.subtitle}</p><p className="mt-2 font-sans text-sm leading-relaxed text-fg/80">{tourBody.blurb}</p></aside> : null}

      {hint ? <p className="pointer-events-none absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-20 w-[min(92vw,28rem)] -translate-x-1/2 text-center font-sans text-xs tracking-[0.18em] text-muted uppercase">arraste para explorar · clique nos pontos de luz · tour percorre os objetos</p> : null}

      {selected?.kind === "black-hole" ? <aside className="absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 w-[min(calc(100vw-2rem),22.5rem)] rounded-xl border border-border bg-surface/90 p-5 shadow-[0_18px_50px_rgb(0_0_0/0.45)] backdrop-blur-md sm:right-6 sm:bottom-6" role="dialog" aria-labelledby="body-title"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="font-sans text-[10px] tracking-[0.26em] text-muted uppercase">{KIND_LABEL[selected.kind]}</p><h2 id="body-title" className="font-display text-3xl leading-none">{selected.name}</h2><p className="mt-1 font-sans text-sm text-muted">{selected.subtitle}</p></div><IconBtn label="Fechar" onClick={closePanel}><X className="size-4" /></IconBtn></div><p className="font-sans text-sm leading-relaxed text-fg/85">{selected.blurb}</p>{selected.href ? <a href={selected.href} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 font-sans text-xs font-medium tracking-[0.14em] text-accent uppercase underline-offset-4 hover:underline">Visitar <ExternalLink className="size-3.5" /></a> : null}</aside> : null}

      <span className="sr-only" aria-live="polite">{ready ? (webgl ? "Galáxia pronta." : "Galáxia em modo simplificado.") : `Gerando galáxia: ${progress}%.`}</span>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={label} className="inline-flex size-11 items-center justify-center rounded-md border border-border bg-surface/70 text-accent backdrop-blur-sm transition-[transform,background-color] duration-150 ease-out hover:bg-surface active:scale-[0.96]">{children}</button>;
}
