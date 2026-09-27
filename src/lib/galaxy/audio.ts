import { bodyById } from "./bodies";

export type Ambience = {
  start: () => void;
  setMuted: (muted: boolean) => void;
  setFocus: (id: string | null) => void;
  ping: () => void;
  dispose: () => void;
};

export function createAmbience(): Ambience {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let droneBus: GainNode | null = null;
  let ambientBus: GainNode | null = null;
  let chimeBus: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let rumble: OscillatorNode | null = null;
  let rumble2: OscillatorNode | null = null;
  let rumble3: OscillatorNode | null = null;
  let ambientOsc: OscillatorNode[] = [];
  let ambientGains: GainNode[] = [];
  let started = false;
  let muted = false;
  let chimeTimer: ReturnType<typeof setTimeout> | null = null;

  const ensure = () => {
    if (ctx) return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0.0001 : 0.22;
    master.connect(ctx.destination);

    droneBus = ctx.createGain();
    droneBus.gain.value = 0.55;
    droneBus.connect(master);

    ambientBus = ctx.createGain();
    ambientBus.gain.value = 0.35;
    ambientBus.connect(master);

    chimeBus = ctx.createGain();
    chimeBus.gain.value = 0.7;
    chimeBus.connect(master);

    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    filter.connect(droneBus);

    const makeRumble = (freq: number, gain: number) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(filter!);
      o.start();
      return { o, g };
    };

    const r1 = makeRumble(38, 0.18);
    const r2 = makeRumble(55, 0.12);
    const r3 = makeRumble(27, 0.08);
    rumble = r1.o;
    rumble2 = r2.o;
    rumble3 = r3.o;

    const tones = [110, 165, 220, 330, 440];
    for (const f of tones) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(ambientBus);
      o.start();
      ambientOsc.push(o);
      ambientGains.push(g);
    }
  };

  return {
    start() {
      ensure();
      if (started) return;
      started = true;
      void ctx?.resume();
    },
    setMuted(m: boolean) {
      muted = m;
      if (master) {
        master.gain.cancelScheduledValues(ctx!.currentTime);
        master.gain.exponentialRampToValueAtTime(m ? 0.0001 : 0.22, ctx!.currentTime + 0.25);
      }
    },
    setFocus(id: string | null) {
      ensure();
      const body = id ? bodyById(id) : null;
      const target = body?.toneHz ?? 48;
      if (filter) {
        filter.frequency.cancelScheduledValues(ctx!.currentTime);
        filter.frequency.exponentialRampToValueAtTime(Math.max(80, target * 4.2), ctx!.currentTime + 1.4);
      }
      ambientGains.forEach((g, i) => {
        const base = 0.012 + (i % 3) * 0.006;
        g.gain.cancelScheduledValues(ctx!.currentTime);
        g.gain.exponentialRampToValueAtTime(id ? base * 1.6 : base, ctx!.currentTime + 0.9);
      });
    },
    ping() {
      ensure();
      void ctx?.resume();
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      const f = ctx!.createBiquadFilter();
      o.type = "sine";
      o.frequency.value = 420;
      f.type = "highpass";
      f.frequency.value = 280;
      g.gain.value = 0.0001;
      o.connect(f);
      f.connect(g);
      g.connect(master!);
      const now = ctx!.currentTime;
      o.frequency.exponentialRampToValueAtTime(180, now + 0.7);
      g.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      o.start(now);
      o.stop(now + 1);
    },
    dispose() {
      if (chimeTimer) clearTimeout(chimeTimer);
      chimeTimer = null;
      try {
        rumble?.stop();
        rumble2?.stop();
        rumble3?.stop();
        for (const o of ambientOsc) o.stop();
        void ctx?.close();
      } catch {
        /* ignore */
      }
      ctx = null;
      master = null;
      droneBus = null;
      ambientBus = null;
      chimeBus = null;
      filter = null;
      rumble = null;
      rumble2 = null;
      rumble3 = null;
      ambientOsc = [];
      ambientGains = [];
      started = false;
    },
  };
}
