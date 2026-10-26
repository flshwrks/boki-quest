// 矩形波で鳴らすレトロな効果音。音源ファイルは使わない。

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "square", vol = 0.06) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur);
}

const SOUNDS = {
  select: () => tone(880, 0, 0.05),
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.12)),
  wrong: () => {
    tone(196, 0, 0.15, "sawtooth", 0.05);
    tone(147, 0.12, 0.2, "sawtooth", 0.05);
  },
  card: () => tone(1320, 0, 0.04, "triangle", 0.08),
  fanfare: () =>
    [523, 523, 523, 698, 880, 784, 880, 1047].forEach((f, i) => tone(f, [0, 0.12, 0.24, 0.36, 0.6, 0.78, 0.9, 1.05][i], 0.16)),
} as const;

export function play(name: keyof typeof SOUNDS) {
  if (!enabled || typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    SOUNDS[name]();
  } catch {
    // 音が鳴らせない環境ではゲームを止めない
  }
}
