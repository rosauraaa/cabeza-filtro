// Efectos de sonido sintetizados con Web Audio (sin archivos externos = sin problemas de licencia).
let ctx = null;

export function unlockAudio() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
}

function tone({ freq = 440, to = freq, type = "square", dur = 0.15, vol = 0.2, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ dur = 0.4, vol = 0.4, cutoff = 900 }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
}
export const sfx = {
  boing: () => {
    tone({ freq: 180, to: 520, type: "sine", dur: 0.25, vol: 0.3 });
    tone({ freq: 520, to: 260, type: "triangle", dur: 0.3, vol: 0.15, delay: 0.2 });
  },
  whoosh: () => {
    noise({ dur: 0.5, vol: 0.25, cutoff: 2500 });
    [660, 880, 1175].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.12, vol: 0.12, delay: 0.05 + i * 0.07 }));
  },
  ding: () => tone({ freq: 1568, to: 1760, type: "sine", dur: 0.35, vol: 0.18 }),
};
