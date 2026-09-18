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

function armPoint(arm: number, t: number, stretch = 0.72): { x: number; y: number } {
  const r = 1.15 + t * 3.55;
  const a = arm * 2.094 + t * 2.55;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * stretch };
}

const a0 = armPoint(0, 0.28);
const a1 = armPoint(0, 0.62);
const a2 = armPoint(0, 1.02);
const b0 = armPoint(1, 0.34);
const b1 = armPoint(1, 0.7);
const b2 = armPoint(1, 1.08);
const c0 = armPoint(2, 0.46);
const c1 = armPoint(2, 0.88);
const obs = armPoint(2, 1.18);

/** Named tour stops (excluding the black hole center). */
export const TOUR_ORDER = [
  "orion",
  "vega",
  "andromeda",
  "caranguejo",
  "pleiades",
  "betelgeuse",
  "helix",
  "antares",
  "observatorio",
] as const;

export const BODIES: CelestialBody[] = [
  {
    id: "inicio",
    name: "Início",
    subtitle: "Horizonte de eventos",
    kind: "black-hole",
    x: 0,
    y: 0,
    size: 1.35,
    color: [1.0, 0.62, 0.28],
    blurb:
      "As pessoas são imitações de macacos. Os deuses são imitações de pessoas.",
    href: "https://www.instagram.com/m.gabriel.l.m?stkn=MTM4M2xqbXh5aG9iYw==",
    toneHz: 28,
  },
  {
    id: "orion",
    name: "Órion",
    subtitle: "Berçário estelar",
    kind: "nebula",
    x: a0.x,
    y: a0.y,
    size: 0.9,
    color: [0.55, 0.78, 1.0],
    blurb:
      "Uma nuvem onde novas estrelas ainda nascem. A nebulosa de Órion é um dos berçários mais próximos da Terra — e o mais brilhante do céu noturno.",
    toneHz: 72,
  },
  {
    id: "vega",
    name: "Vega",
    subtitle: "Estrela branca de lira",
    kind: "star",
    x: a1.x,
    y: a1.y,
    size: 0.72,
    color: [0.85, 0.93, 1.0],
    blurb:
      "Já foi o norte do céu, e voltará a ser. Cerca de 25 anos-luz daqui, Vega gira tão rápido que seu equador incha — uma joia achatada no verão boreal.",
    toneHz: 96,
  },
  {
    id: "andromeda",
    name: "Andrômeda",
    subtitle: "Galáxia vizinha",
    kind: "galaxy",
    x: a2.x,
    y: a2.y,
    size: 1.05,
    color: [0.95, 0.72, 0.55],
    blurb:
      "Dois trilhões de sóis, a 2,5 milhões de anos-luz. Em quatro bilhões de anos ela e a Via Láctea se atravessam — não uma colisão, uma dança lenta.",
    toneHz: 52,
  },
  {
    id: "caranguejo",
    name: "Caranguejo",
    subtitle: "Remanescente de supernova",
    kind: "nebula",
    x: b0.x,
    y: b0.y,
    size: 0.78,
    color: [1.0, 0.55, 0.38],
    blurb:
      "O eco de uma estrela que explodiu em 1054. No centro, um pulsar gira 30 vezes por segundo e varre o gás com um farol de partículas.",
    toneHz: 64,
  },
  {
    id: "pleiades",
    name: "Plêiades",
    subtitle: "Aglomerado aberto",
    kind: "star",
    x: b1.x,
    y: b1.y,
    size: 0.8,
    color: [0.7, 0.86, 1.0],
    blurb:
      "Sete irmãs a olho nu, centenas de sóis azuis por trás. A névoa que as envolve não é delas — é poeira interestelar que o acaso atravessou.",
    toneHz: 88,
  },
  {
    id: "betelgeuse",
    name: "Betelgeuse",
    subtitle: "Supergigante vermelha",
    kind: "star",
    x: b2.x,
    y: b2.y,
    size: 0.88,
    color: [1.0, 0.45, 0.22],
    blurb:
      "Se ocupasse o lugar do Sol, engoliria a Terra. Vive seus últimos milhões de anos. Quando ruir, o céu noturno ganhará uma segunda lua por semanas.",
    toneHz: 48,
  },
  {
    id: "helix",
    name: "Hélix",
    subtitle: "Nebulosa planetária",
    kind: "nebula",
    x: c0.x,
    y: c0.y,
    size: 0.74,
    color: [0.45, 0.9, 0.82],
    blurb:
      "Um sol como o nosso, no fim, soprou suas camadas externas. O que resta é um olho de gás iluminado por uma anã branca — o futuro quieto do Sol.",
    toneHz: 76,
  },
  {
    id: "antares",
    name: "Antares",
    subtitle: "Coração de escorpião",
    kind: "star",
    x: c1.x,
    y: c1.y,
    size: 0.76,
    color: [1.0, 0.38, 0.28],
    blurb:
      "Rival de Marte no céu de inverno austral. Uma binária: a gigante vermelha e uma companheira quente, dançando numa envoltória de poeira.",
    toneHz: 44,
  },
  {
    id: "observatorio",
    name: "Observatório",
    subtitle: "Estação Horizonte",
    kind: "station",
    x: obs.x,
    y: obs.y,
    size: 0.7,
    color: [0.78, 0.86, 0.95],
    blurb:
      "Ponto de observação da galáxia. Daqui o disco se abre em espiral e o horizonte de eventos brilha no centro — o lugar de onde se parte e ao qual se retorna.",
    toneHz: 68,
  },
];

export const BH_WORLD_RS = 0.065;

export function bodyById(id: string): CelestialBody | undefined {
  return BODIES.find((b) => b.id === id);
}
