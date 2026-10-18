// A short, playful "ta-da!" fanfare for timer-complete celebrations — synthesized
// with the Web Audio API so no audio asset is needed.

let sharedCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx || sharedCtx.state === "closed") sharedCtx = new Ctor();
  return sharedCtx;
}

function tone(ctx: AudioContext, when: number, freq: number, duration: number, gain: number, type: OscillatorType) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  amp.gain.setValueAtTime(0, when);
  amp.gain.linearRampToValueAtTime(gain, when + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.001, when + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.05);
}

/** Rising arpeggio + a bright final chord — a "ta-da!" for hitting a timer goal. */
export function playCelebrationSound() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const now = ctx.currentTime;

  // Quick ascending run.
  const run = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  run.forEach((freq, i) => tone(ctx, now + i * 0.09, freq, 0.35, 0.16, "triangle"));

  // Bright landing chord.
  const chord = [783.99, 987.77, 1174.66]; // G5 B5 D6
  chord.forEach((freq) => tone(ctx, now + run.length * 0.09, freq, 0.7, 0.12, "sine"));
}
