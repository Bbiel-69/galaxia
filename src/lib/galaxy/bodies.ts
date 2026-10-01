export type BodyKind = "black-hole" | "star" | "nebula" | "galaxy" | "station";

export type CelestialBody = {
  id: string;
  name: string;
  subtitle: string;
  kind: BodyKind;
  x: number;
  y: number;
  size: number;
  color: [number, number, number];
  blurb: string;
  /** Optional external URL — when set, panel shows a "Visitar" button. */
  href?: string;
  /** Pitch bias for reactive ambient drone (Hz offset from base). */
  toneHz?: number;
};

/** Named tour stops (excluding the black hole center). Empty until bodies are re-added. */
export const TOUR_ORDER = [] as const;

export const BODIES: CelestialBody[] = [
  {
    id: "inicio",
    name: "Início",
    subtitle: "Horizonte de eventos",
    kind: "black-hole",
    x: 0,
    y: 0,
    size: 2.8,
    color: [1.0, 0.62, 0.28],
    blurb:
      "As pessoas são imitações de macacos. Os deuses são imitações de pessoas.",
    href: "https://www.instagram.com/m.gabriel.l.m?stkn=MTM4M2xqbXh5aG9iYw==",
    toneHz: 28,
  },
];

/** Schwarzschild radius in world units — significantly larger for presence. */
export const BH_WORLD_RS = 0.22;

/** Soft bound of the explorable world (half-extent). Pan is clamped inside this. */
export const WORLD_BOUND = 2.8;

export function bodyById(id: string): CelestialBody | undefined {
  return BODIES.find((b) => b.id === id);
}

/**
 * Forma desenhada pelo shader para cada corpo:
 * 0 estrela · 1 nebulosa · 2 galáxia · 3 estação · 4 nebulosa em anel (Hélix)
 */
export function bodyShape(b: CelestialBody): number {
  if (b.id === "helix") return 4;
  switch (b.kind) {
    case "nebula":
      return 1;
    case "galaxy":
      return 2;
    case "station":
      return 3;
    default:
      return 0;
  }
}
