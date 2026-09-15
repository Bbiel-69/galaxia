export type Ambience = {
  start: () => void;
  setMuted: (muted: boolean) => void;
  ping: () => void;
  dispose: () => void;
};

export function createAmbience(): Ambience {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let rumble: OscillatorNode | null = null;
  let rumble2: OscillatorNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 90;
    filter.Q.value = 0.7;
    filter.connect(master);

    rumble = ctx.createOscillator();
    rumble.type = "sine";
    rumble.frequency.value = 32;
    const g1 = ctx.createGain();
    g1.gain.value = 0.55;
    rumble.connect(g1);
    g1.connect(filter);

    rumble2 = ctx.createOscillator();
    rumble2.type = "triangle";
    rumble2.frequency.value = 47.3;
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    rumble2.connect(g2);
    g2.connect(filter);

    rumble.start();
    rumble2.start();
  }

  function fadeTo(value: number, seconds: number) {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(value, now + seconds);
  }

  return {
    start() {
      if (started) return;
      started = true;
      ensure();
      void ctx?.resume();
      if (!muted) fadeTo(0.09, 1.6);
    },
    setMuted(next: boolean) {
      muted = next;
      if (!started) return;
      void ctx?.resume();
      fadeTo(next ? 0 : 0.09, 0.35);
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
        void ctx?.close();
      } catch {
        /* ignore */
      }
      ctx = null;
      master = null;
      rumble = null;
      rumble2 = null;
      filter = null;
      started = false;
    },
  };
}
