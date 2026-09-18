import { bodyById } from "./bodies";

export type Ambience = {
  start: () => void;
  setMuted: (muted: boolean) => void;
  ping: () => void;
  /** Update reactive tone from nearest body id (null = ambient lunar mode). */
  setFocus: (id: string | null) => void;
  dispose: () => void;
};

/**
 * Reactive space drone + original ambient "lunar" bed.
 * Note: the commercial recording "La Luna Enamorada" cannot be redistributed;
 * we synthesize an original romantic ambient loop in a similar mood.
 */
export function createAmbience(): Ambience {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let droneBus: GainNode | null = null;
  let ambientBus: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let rumble: OscillatorNode | null = null;
  let rumble2: OscillatorNode | null = null;
  let rumble3: OscillatorNode | null = null;
  let ambientOsc: OscillatorNode[] = [];
  let ambientGains: GainNode[] = [];
  let muted = false;
  let started = false;
  let focusId: string | null = null;
  let targetDrone = 0.09;
  let targetAmbient = 0.07;

  function ensure() {
    if (ctx) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    droneBus = ctx.createGain();
    droneBus.gain.value = 1;
    droneBus.connect(master);

    ambientBus = ctx.createGain();
    ambientBus.gain.value = 0;
    ambientBus.connect(master);

    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 110;
    filter.Q.value = 0.7;
    filter.connect(droneBus);

    rumble = ctx.createOscillator();
    rumble.type = "sine";
    rumble.frequency.value = 36;
    const g1 = ctx.createGain();
    g1.gain.value = 0.55;
    rumble.connect(g1);
    g1.connect(filter);

    rumble2 = ctx.createOscillator();
    rumble2.type = "triangle";
    rumble2.frequency.value = 54;
    const g2 = ctx.createGain();
    g2.gain.value = 0.16;
    rumble2.connect(g2);
    g2.connect(filter);

    rumble3 = ctx.createOscillator();
    rumble3.type = "sine";
    rumble3.frequency.value = 72;
    const g3 = ctx.createGain();
    g3.gain.value = 0.08;
    rumble3.connect(g3);
    g3.connect(filter);

    rumble.start();
    rumble2.start();
    rumble3.start();

    const freqs = [146.83, 174.61, 220.0, 261.63, 293.66];
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 === 0 ? "sine" : "triangle";
      o.frequency.value = freqs[i]!;
      const g = ctx.createGain();
      g.gain.value = 0.04 + (i === 0 ? 0.03 : 0);
      const lf = ctx.createBiquadFilter();
      lf.type = "lowpass";
      lf.frequency.value = 900;
      o.connect(lf);
      lf.connect(g);
      g.connect(ambientBus);
      o.start();
      ambientOsc.push(o);
      ambientGains.push(g);
    }

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.015;
    lfo.connect(lfoG);
    if (ambientGains[0]) lfoG.connect(ambientGains[0].gain);
    lfo.start();
  }

  function fadeGain(node: GainNode | null, value: number, seconds: number) {
    if (!ctx || !node) return;
    const now = ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(value, now + seconds);
  }

  function applyMix() {
    if (!ctx || !droneBus || !ambientBus || !filter || !rumble) return;
    const focused = focusId != null;
    targetDrone = focused ? 0.11 : 0.045;
    targetAmbient = focused ? 0.02 : 0.08;
    fadeGain(droneBus, muted ? 0 : targetDrone, 1.4);
    fadeGain(ambientBus, muted ? 0 : targetAmbient, 1.8);

    if (focused) {
      const body = bodyById(focusId!);
      const hz = body?.toneHz ?? 48;
      const now = ctx.currentTime;
      rumble.frequency.cancelScheduledValues(now);
      rumble.frequency.setTargetAtTime(hz * 0.55, now, 0.8);
      rumble2?.frequency.setTargetAtTime(hz * 0.85, now, 0.8);
      rumble3?.frequency.setTargetAtTime(hz * 1.25, now, 0.9);
      filter.frequency.setTargetAtTime(80 + hz * 1.2, now, 0.6);
    } else {
      const now = ctx.currentTime;
      rumble.frequency.setTargetAtTime(36, now, 1.2);
      rumble2?.frequency.setTargetAtTime(54, now, 1.2);
      rumble3?.frequency.setTargetAtTime(72, now, 1.2);
      filter.frequency.setTargetAtTime(110, now, 1.0);
    }
  }

  return {
    start() {
      if (started) return;
      started = true;
      ensure();
      void ctx?.resume();
      if (!muted) {
        fadeGain(master, 1, 1.6);
        applyMix();
      }
    },
    setMuted(next: boolean) {
      muted = next;
      if (!started) return;
      void ctx?.resume();
      fadeGain(master, next ? 0 : 1, 0.35);
      if (!next) applyMix();
    },
    setFocus(id: string | null) {
      if (focusId === id) return;
      focusId = id;
      if (!started) return;
      applyMix();
    },
    ping() {
      if (!ctx || !master || muted) return;
      void ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = "sine";
      o.frequency.value = 420;
      f.type = "highpass";
      f.frequency.value = 280;
      g.gain.value = 0.0001;
      o.connect(f);
      f.connect(g);
      g.connect(master);
      const now = ctx.currentTime;
      o.frequency.exponentialRampToValueAtTime(180, now + 0.7);
      g.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      o.start(now);
      o.stop(now + 1);
    },
    dispose() {
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
