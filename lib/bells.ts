// Meditation bells, synthesised rather than sampled.
//
// The obvious way to make a bell ring in a browser is to ship an mp3. This doesn't,
// for three reasons: a decent bowl sample is a few hundred KB on a page that has to
// stay fast, artifacts and the desktop WebView can't load cross-origin media anyway
// (see desktop/src-tauri/capabilities/main.json), and a sample plays the *same*
// strike every time — which, twice a sit, every day, starts to sound like a
// notification instead of a bell.
//
// So: additive synthesis of a struck Tibetan singing bowl, ~40 lines of Web Audio.
//
// What makes it sound like a bowl and not a beep:
//
//   - **Inharmonic partials.** A vibrating string gives whole-number multiples of
//     the fundamental and reads as a musical note. A bowl's modes are stretched and
//     irrational — 2.76×, 5.40×, 8.93× — which is the whole reason a bell sounds
//     like metal rather than a synth pad.
//   - **Partial-dependent decay.** High partials shed energy fastest. That's the
//     "ting… mmm" shape: bright at the strike, warm as it rings out. A flat decay
//     across all partials sounds electronic.
//   - **Beating.** Each partial is two oscillators a fraction of a hertz apart, so
//     they drift in and out of phase and the tone breathes instead of sitting still.
//     Real bowls do this because they aren't perfectly symmetrical.
//   - **A strike transient.** A few milliseconds of filtered noise for the sound of
//     the mallet touching the rim. Almost inaudible alone; without it the tone
//     appears from nowhere.

/** Stretched modal ratios of a struck bowl, with relative level and decay. */
const PARTIALS = [
  { ratio: 1.0, gain: 1.0, decay: 1.0 },
  { ratio: 2.76, gain: 0.42, decay: 0.62 },
  { ratio: 5.4, gain: 0.22, decay: 0.4 },
  { ratio: 8.93, gain: 0.12, decay: 0.26 },
  { ratio: 13.34, gain: 0.05, decay: 0.16 },
];

export type BowlOptions = {
  /** Hz. Lower is a bigger, darker bowl. */
  fundamental?: number;
  /** 0…1 master level for this strike. */
  gain?: number;
  /** Seconds for the fundamental to ring out. */
  decay?: number;
};

/**
 * Schedule one strike at `when` (an AudioContext timestamp). Returns the nodes it
 * created so a cancelled session can stop bells that haven't sounded yet — a sit
 * you abandon at minute three must not ring at minute ten.
 */
export function strikeBowl(ctx: AudioContext, when: number, opts: BowlOptions = {}): AudioScheduledSourceNode[] {
  const fundamental = opts.fundamental ?? 210;
  const level = opts.gain ?? 0.5;
  const decay = opts.decay ?? 9;

  const out = ctx.createGain();
  out.gain.value = level;
  // Takes the edge off the top partials so the strike is warm rather than glassy.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 5200;
  tone.Q.value = 0.4;
  tone.connect(out);
  out.connect(ctx.destination);

  const sources: AudioScheduledSourceNode[] = [];

  for (const p of PARTIALS) {
    const life = decay * p.decay;
    // Two oscillators per partial, detuned by a fraction of a hertz. The slow
    // interference between them is the shimmer.
    for (const cents of [-1.2, 1.2]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = fundamental * p.ratio;
      osc.detune.value = cents;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, when);
      // 6ms of attack: fast enough to read as a strike, slow enough not to click.
      env.gain.linearRampToValueAtTime(p.gain * 0.5, when + 0.006);
      // exponentialRamp can't reach zero, so ring down to silence-adjacent and stop.
      env.gain.exponentialRampToValueAtTime(0.0001, when + life);

      osc.connect(env);
      env.connect(tone);
      osc.start(when);
      osc.stop(when + life + 0.05);
      sources.push(osc);
    }
  }

  // The mallet. 25ms of noise through a narrow bandpass at the fundamental.
  const frames = Math.floor(ctx.sampleRate * 0.025);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = fundamental * 3;
  band.Q.value = 1.2;
  const hit = ctx.createGain();
  hit.gain.value = 0.18;
  noise.connect(band);
  band.connect(hit);
  hit.connect(tone);
  noise.start(when);
  sources.push(noise);

  return sources;
}

/**
 * Three strikes, spaced and fading — how a sit is closed. Spread over ~5s so the
 * last one lands in silence rather than on top of the one before.
 */
export function closingBell(ctx: AudioContext, when: number, opts: BowlOptions = {}): AudioScheduledSourceNode[] {
  return [0, 2.4, 4.8].flatMap((offset, i) =>
    strikeBowl(ctx, when + offset, {
      ...opts,
      gain: (opts.gain ?? 0.5) * [1, 0.82, 0.68][i],
    }),
  );
}

/**
 * A single AudioContext for the page, created lazily. Browsers refuse to start one
 * outside a user gesture, so this must be called from the click that starts the sit
 * — never on mount.
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const w = window as unknown as { __bellCtx?: AudioContext };
  if (!w.__bellCtx) w.__bellCtx = new Ctor();
  void w.__bellCtx.resume();
  return w.__bellCtx;
}
