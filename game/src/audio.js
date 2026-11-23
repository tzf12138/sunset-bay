// Original sound, synthesized live with WebAudio: no audio files, no network requests.
// A sunset synthwave loop (pad chords, bass, hats, a sparse lead), an engine hum that
// follows the car's speed, a two-tone siren while the police are on you, and one-shot
// effects for gunshots, pickups, punches and mission jingles. Everything starts on the
// first user gesture, as browsers require, and M mutes it all.

const CHORDS = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [130.81, 164.81, 196.0], // C
  [196.0, 246.94, 293.66], // G
];
const BASS = [55.0, 43.65, 32.7, 49.0];
const LEAD = [440.0, 523.25, 659.25, 523.25, 587.33, 659.25, 783.99, 659.25];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function note(freq, time, dur, type, gain, dest) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  function noiseBurst(time, dur, gain, filterFreq) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(time);
  }

  /** One bar of the loop: pad chord, bass note, hats, and a lead note every other bar. */
  function scheduleBar() {
    if (!ctx || muted) return;
    const bar = 1.9; // seconds per bar
    const t0 = ctx.currentTime + 0.05;
    const chord = CHORDS[step % CHORDS.length];
    for (const f of chord) note(f, t0, bar * 0.95, 'triangle', 0.05, musicGain);
    note(BASS[step % BASS.length], t0, bar * 0.5, 'sine', 0.22, musicGain);
    note(BASS[step % BASS.length] * 2, t0 + bar / 2, bar * 0.4, 'sine', 0.1, musicGain);
    for (let h = 0; h < 8; h += 1) noiseBurst(t0 + (h * bar) / 8, 0.03, h % 2 === 0 ? 0.05 : 0.025, 8000);
    if (step % 2 === 0) {
      const f = LEAD[(step / 2) % LEAD.length | 0] * 2;
      note(f, t0 + bar / 4, bar / 2, 'square', 0.03, musicGain);
    }
    step += 1;
  }

  function start() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') void ctx.resume();
    if (musicTimer !== null) return;
    scheduleBar();
    musicTimer = window.setInterval(scheduleBar, 1900);
  }

  function blip(freq, dur, type, gain) {
    if (!ctx || muted) return;
    note(freq, ctx.currentTime, dur, type, gain, master);
  }

  return {
    start,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    engine(speed01) {
      if (!ctx || muted) return;
      engineGain.gain.setTargetAtTime(speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, ctx.currentTime, 0.1);
    },
    siren(on) {
      if (!ctx || muted) return;
      sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, ctx.currentTime, 0.2);
      if (on) sirenOsc.frequency.setTargetAtTime(620 + 260 * Math.abs(Math.sin(performance.now() / 380)), ctx.currentTime, 0.1);
    },
    shot() {
      if (!ctx || muted) return;
      noiseBurst(ctx.currentTime, 0.12, 0.5, 3200);
      blip(160, 0.08, 'square', 0.2);
    },
    punch() {
      if (!ctx || muted) return;
      noiseBurst(ctx.currentTime, 0.07, 0.35, 900);
    },
    pickup() {
      if (!ctx || muted) return;
      blip(660, 0.09, 'sine', 0.25);
      setTimeout(() => blip(990, 0.14, 'sine', 0.25), 90);
    },
    cash() {
      if (!ctx || muted) return;
      blip(880, 0.08, 'triangle', 0.25);
      setTimeout(() => blip(1174, 0.08, 'triangle', 0.25), 80);
      setTimeout(() => blip(1568, 0.16, 'triangle', 0.25), 160);
    },
    fail() {
      if (!ctx || muted) return;
      blip(220, 0.25, 'sawtooth', 0.2);
      setTimeout(() => blip(165, 0.4, 'sawtooth', 0.2), 200);
    },
    click() {
      blip(520, 0.05, 'square', 0.12);
    },
  };
}
