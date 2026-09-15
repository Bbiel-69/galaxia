import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, LocateFixed, Volume2, VolumeX, X } from "lucide-react";
import { createAmbience, type Ambience } from "@/lib/galaxy/audio";
import { BODIES, bodyById, type BodyKind, type CelestialBody } from "@/lib/galaxy/bodies";
import { createGalaxyEngine, type GalaxyEngine } from "@/lib/galaxy/engine";
import { createFallbackEngine } from "@/lib/galaxy/fallback";

const KIND_LABEL: Record<BodyKind, string> = {
  "black-hole": "Singularidade",
  star: "Estrela",
  nebula: "Nebulosa",
  galaxy: "Galáxia",
};

const MUTE_KEY = "horizonte-muted";

export function GalaxyExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GalaxyEngine | null>(null);
  const audioRef = useRef<Ambience | null>(null);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectedIdRef = useRef<string | null>(null);
  const [selected, setSelected] = useState<CelestialBody | null>(null);
  const [hint, setHint] = useState(true);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(true);

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
      onSelect: (id: string | null) => {
        selectedIdRef.current = id;
        const body = id ? (bodyById(id) ?? null) : null;
        setSelected(body);
        if (body) {
          setHint(false);
          audio.ping();
        }
      },
      onFrame: (
        next: { id: string; x: number; y: number; visible: boolean }[],
      ) => {
        const sel = selectedIdRef.current;
        for (const label of next) {
          const el = labelRefs.current.get(label.id);
          if (!el) continue;
          const body = bodyById(label.id);
          const isBh = body?.kind === "black-hole";
          const ox = label.x;
          const oy = isBh ? label.y : label.y - 14;
          el.style.transform = `translate3d(${ox}px, ${oy}px, 0) translate(-50%, ${isBh ? "0" : "-100%"})`;
          const show = label.visible && !(isBh && sel === "inicio");
          el.style.opacity = show ? "1" : "0";
          el.style.pointerEvents = show ? "auto" : "none";
        }
      },
    };

    let engine: GalaxyEngine;
    try {
      engine = createGalaxyEngine(canvas, hooks);
      setWebgl(true);
    } catch {
      engine = createFallbackEngine(canvas, hooks);
      setWebgl(false);
    }
    engineRef.current = engine;
    setReady(true);

    const unlock = () => audio.start();
    window.addEventListener("pointerdown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      engine.destroy();
      audio.dispose();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      audioRef.current?.setMuted(next);
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      if (!next) audioRef.current?.start();
      return next;
    });
  }, []);

  const closePanel = useCallback(() => {
    selectedIdRef.current = null;
    setSelected(null);
    engineRef.current?.select(null);
  }, []);

  const goHome = useCallback(() => {
    engineRef.current?.recenter();
    setHint(false);
  }, []);

  const onLabelClick = useCallback((id: string) => {
    engineRef.current?.focus(id);
    engineRef.current?.select(id);
    selectedIdRef.current = id;
    const body = bodyById(id) ?? null;
    setSelected(body);
    setHint(false);
    audioRef.current?.ping();
    if (body?.href) window.open(body.href, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Galáxia interativa. Arraste para explorar, clique nos pontos de luz."
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.9'/></svg>\")",
        }}
        aria-hidden
      />

      {BODIES.map((body) => {
        const isBh = body.kind === "black-hole";
        return (
          <button
            key={body.id}
            type="button"
            ref={(node) => {
              if (node) labelRefs.current.set(body.id, node);
              else labelRefs.current.delete(body.id);
            }}
            onClick={() => onLabelClick(body.id)}
            title={body.href ? `${body.name} — abre em nova aba` : body.name}
            className="absolute top-0 left-0 z-10 min-h-11 px-2 text-center will-change-transform"
            style={{ opacity: 0, pointerEvents: "none" }}
          >
            {isBh ? (
              <span className="inline-flex items-center gap-1.5 font-display text-lg tracking-[0.34em] text-fg/90 uppercase">
                Início
                {body.href ? <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden /> : null}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-sans text-[11px] font-medium tracking-[0.18em] text-accent uppercase">
                {body.name}
                {body.href ? <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden /> : null}
              </span>
            )}
          </button>
        );
      })}

      <header className="pointer-events-none absolute top-0 left-0 z-20 flex w-full items-start justify-between gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))] pr-4 sm:p-6">
        <div className="max-w-[16rem]">
          <p className="font-sans text-[11px] font-medium tracking-[0.28em] text-muted uppercase">
            Observatório
          </p>
          <h1 className="font-display text-[2.15rem] leading-[0.95] tracking-[-0.03em] text-balance text-fg sm:text-4xl">
            Horizonte
          </h1>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <IconBtn label={muted ? "Ativar som" : "Silenciar"} onClick={toggleMute}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </IconBtn>
          <IconBtn label="Voltar ao centro" onClick={goHome}>
            <LocateFixed className="size-4" />
          </IconBtn>
        </div>
      </header>

      {hint ? (
        <p className="pointer-events-none absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-20 w-[min(92vw,28rem)] -translate-x-1/2 text-center font-sans text-xs tracking-[0.18em] text-muted uppercase">
          arraste para explorar · clique nos pontos de luz
        </p>
      ) : null}

      {selected ? (
        <aside
          className="absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 w-[min(calc(100vw-2rem),22.5rem)] rounded-xl border border-border bg-surface/90 p-5 shadow-[0_18px_50px_rgb(0_0_0/0.45)] backdrop-blur-md sm:right-6 sm:bottom-6"
          role="dialog"
          aria-labelledby="body-title"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="font-sans text-[10px] font-medium tracking-[0.26em] text-muted uppercase">
                {KIND_LABEL[selected.kind]}
              </p>
              <h2
                id="body-title"
                className="font-display text-3xl leading-none tracking-[-0.02em] text-balance"
              >
                {selected.name}
              </h2>
              <p className="mt-1 font-sans text-sm text-muted">{selected.subtitle}</p>
            </div>
            <IconBtn label="Fechar" onClick={closePanel}>
              <X className="size-4" />
            </IconBtn>
          </div>
          <p className="font-sans text-sm leading-relaxed text-pretty text-fg/85">{selected.blurb}</p>
          {selected.href ? (
            <a
              href={selected.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 font-sans text-xs font-medium tracking-[0.14em] text-accent uppercase underline-offset-4 hover:underline"
            >
              Visitar
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </aside>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {ready ? (webgl ? "Galáxia pronta." : "Galáxia em modo simplificado.") : "Carregando galáxia."}
      </span>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex size-11 items-center justify-center rounded-md border border-border bg-surface/70 text-accent backdrop-blur-sm transition-[transform,background-color] duration-150 ease-out hover:bg-surface active:scale-[0.96]"
    >
      {children}
    </button>
  );
}
