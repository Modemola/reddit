// Adaptive score and synth, ported from Hooja: Heist Night (same author). D minor; calm, tense and chase moods.
const LAYER_OF = {
  pad: 'bed', bass: 'bass', pluck: 'pluck', bell: 'pluck', lead: 'lead', arp: 'pluck',
  trem: 'tension', hat: 'tension', stab: 'chase', kick: 'chase', snare: 'chase', tom: 'chase',
};




const D = 50; // D3
const chord = (root, third, fifth) => ({ root: root - 12, tones: [root, root + third, root + fifth] });
const Dm = chord(D, 3, 7);
const Bb = chord(D - 4, 4, 7);
const F = chord(D + 3, 4, 7);
const C = chord(D - 2, 4, 7);
const Gm = chord(D + 5, 3, 7);
const A = chord(D + 7, 4, 7);

/** i VI III VII, then i iv VI V: the last bar's A major pulls back home. */
const PROGRESSION = [Dm, Bb, F, C, Dm, Gm, Bb, A];

const TEMPO = {
  title: { calm: 76, tense: 76, chase: 76 },
  heist: { calm: 84, tense: 88, chase: 116 },
};

const BARS = PROGRESSION.length;

function chordAt(bar) {
  return PROGRESSION[((bar % BARS) + BARS) % BARS];
}

/**
 * The title tune, one bar per chord. [step, pitch, length]
 * A4 = 69, D5 = 74.
 */
const MELODY = [
  [[0, 69, 4], [4, 74, 4], [8, 72, 2], [10, 69, 2], [12, 65, 4]],
  [[0, 67, 6], [6, 65, 2], [8, 62, 8]],
  [[0, 69, 4], [4, 72, 4], [8, 77, 4], [12, 76, 4]],
  [[0, 74, 6], [6, 72, 2], [8, 67, 8]],
  [[0, 69, 4], [4, 74, 4], [8, 77, 4], [12, 76, 2], [14, 74, 2]],
  [[0, 72, 4], [4, 74, 2], [6, 72, 2], [8, 70, 8]],
  [[0, 69, 4], [4, 70, 4], [8, 67, 4], [12, 64, 4]],
  [[0, 76, 8], [8, 73, 4], [12, 69, 4]],
];

/** The creep: which chord tone (0..2, +3 an octave up) on which step. Two shapes, alternating bars. */
const CREEP = [
  [[0, 0], [3, 2], [6, 1], [8, 3], [11, 2], [14, 1]],
  [[0, 3], [2, 2], [6, 0], [8, 1], [10, 2], [13, 0]],
];

/** The title's harp: up and down the chord in eighths. */
const ARP = [0, 1, 2, 3, 4, 3, 2, 1];

function tone(c, i, octave) {
  return c.tones[i % 3] + 12 * (octave + Math.floor(i / 3));
}

/** Everything that plays in one bar of a track, for a mood. */
function barEvents(track, bar, mood) {
  const c = chordAt(bar);
  const out = [];
  const b = ((bar % BARS) + BARS) % BARS;

  if (track === 'title') {
    for (const t of c.tones) out.push({ voice: 'pad', midi: t, step: 0, len: 16, vel: 0.5 });
    out.push({ voice: 'bass', midi: c.root, step: 0, len: 12, vel: 0.7 });
    out.push({ voice: 'bass', midi: c.root, step: 12, len: 4, vel: 0.45 });
    ARP.forEach((i, k) => out.push({ voice: 'arp', midi: tone(c, i, 1), step: k * 2, len: 2, vel: k === 0 ? 0.6 : 0.42 }));
    // The tune rests every other time round the eight bars, so it breathes.
    if (Math.floor(bar / BARS) % 2 === 0) for (const [step, midi, len] of MELODY[b]) out.push({ voice: 'lead', midi, step, len, vel: 0.7 });
    return out;
  }

  // The heist.
  for (const t of c.tones) out.push({ voice: 'pad', midi: t, step: 0, len: 16, vel: mood === 'chase' ? 0.35 : 0.5 });
  if (mood === 'chase') {
    // Driving eighths, root and octave.
    for (let s = 0; s < 16; s += 2) out.push({ voice: 'bass', midi: c.root + (s % 4 === 2 ? 12 : 0), step: s, len: 2, vel: s % 8 === 0 ? 0.9 : 0.7 });
    for (const s of [0, 7, 8, 10]) out.push({ voice: 'kick', midi: 0, step: s, len: 1, vel: s === 0 || s === 8 ? 1 : 0.7 });
    for (const s of [4, 12]) out.push({ voice: 'snare', midi: 0, step: s, len: 1, vel: 0.9 });
    for (let s = 0; s < 16; s += 2) out.push({ voice: 'hat', midi: 0, step: s, len: 1, vel: s % 4 === 0 ? 0.5 : 0.35 });
    for (const [s, len] of [[0, 3], [6, 2]]) for (const t of c.tones) out.push({ voice: 'stab', midi: t + 12, step: s, len, vel: s === 0 ? 0.8 : 0.6 });
    // A tom fill into the top of the progression.
    if (b === BARS - 1) for (const [s, m] of [[12, 45], [13, 43], [14, 41], [15, 38]]) out.push({ voice: 'tom', midi: m, step: s, len: 1, vel: 0.8 });
  } else {
    out.push({ voice: 'bass', midi: c.root, step: 0, len: 6, vel: 0.75 });
    out.push({ voice: 'bass', midi: c.root, step: 8, len: 4, vel: 0.55 });
    if (mood === 'tense') out.push({ voice: 'bass', midi: c.root + 7, step: 14, len: 2, vel: 0.5 });
    for (const [s, i] of CREEP[b % 2]) out.push({ voice: 'pluck', midi: tone(c, i, 1), step: s, len: 2, vel: s === 0 ? 0.75 : 0.55 });
  }
  if (mood !== 'calm') {
    // Tremolo strings on the fifth and the octave above: bowed sixteenths.
    for (let s = 0; s < 16; s++) {
      out.push({ voice: 'trem', midi: c.tones[2] + 12, step: s, len: 1, vel: 0.35 + (s % 4 === 0 ? 0.1 : 0) });
      if (s % 2 === 0) out.push({ voice: 'trem', midi: c.tones[0] + 24, step: s, len: 1, vel: 0.25 });
    }
    if (mood === 'tense') for (let s = 2; s < 16; s += 4) out.push({ voice: 'hat', midi: 0, step: s, len: 1, vel: 0.3 });
  }
  return out;
}

/** How loud each layer sits in each mood (the player fades between them). */
const MIX = {
  title: {
    calm: { bed: 0.55, bass: 0.5, pluck: 0.5, lead: 0.75, tension: 0, chase: 0 },
    tense: { bed: 0.55, bass: 0.5, pluck: 0.5, lead: 0.75, tension: 0, chase: 0 },
    chase: { bed: 0.55, bass: 0.5, pluck: 0.5, lead: 0.75, tension: 0, chase: 0 },
  },
  heist: {
    calm: { bed: 0.5, bass: 0.5, pluck: 0.5, lead: 0, tension: 0, chase: 0 },
    tense: { bed: 0.45, bass: 0.55, pluck: 0.35, lead: 0, tension: 0.55, chase: 0 },
    chase: { bed: 0.3, bass: 0.8, pluck: 0, lead: 0, tension: 0.35, chase: 0.85 },
  },
};

/** Short phrases for the end of a heist. [time in beats, pitch, beats, voice] */
const STINGS = {
  // D major, rising: in, and out.
  cracked: [[0, 62, 0.5, 'arp'], [0.5, 66, 0.5, 'arp'], [1, 69, 0.5, 'arp'], [1.5, 74, 2.5, 'lead'], [1.5, 50, 3, 'bass'], [1.5, 62, 3, 'pad'], [1.5, 66, 3, 'pad'], [1.5, 69, 3, 'pad']],
  // The tune's opening, finished properly.
  cleared: [[0, 69, 1, 'lead'], [1, 74, 1, 'lead'], [2, 78, 1, 'lead'], [3, 81, 3, 'lead'], [0, 50, 6, 'bass'], [0, 62, 6, 'pad'], [0, 66, 6, 'pad'], [0, 69, 6, 'pad'], [3, 86, 3, 'bell']],
  // Down to the bottom of D minor, slowly.
  caught: [[0, 57, 1, 'pad'], [1, 53, 1, 'pad'], [2, 50, 3, 'pad'], [0, 38, 5, 'bass'], [2, 62, 3, 'bell']],
};

/** A MIDI pitch's frequency, in Hz. */
function midiHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** The score, played: a look-ahead scheduler, one bus per layer so a mood can fade whole layers, and a small synth per voice. No audio files. */

const LOOKAHEAD = 0.18;
const TICK_MS = 30;
const LAYERS = ['bed', 'bass', 'pluck', 'tension', 'chase', 'lead'];

class MusicPlayer {
  constructor(ctx, dest, noise) {
    this.ctx = ctx; this.noise = noise;
    this.track = null; this.mood = 'calm'; this.bar = 0; this.step = 0; this.nextTime = 0; this.timer = null; this.queued = [];
    this.barTempo = 84; // tempo for the bar under way: changes land on a bar line
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 18000;
    this.out.connect(this.muffle).connect(dest);
    this.buses = Object.fromEntries(LAYERS.map((l) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      return [l, g];
    }));
  }

  /** Start (or switch to) a track. Null fades the music out. */
  play(track) {
    if (track === this.track) return;
    const t = this.ctx.currentTime;
    if (!track) {
      this.track = null;
      this.out.gain.setTargetAtTime(0, t, 0.6);
      globalThis.setTimeout(() => {
        if (!this.track) this.stopTimer();
      }, 3000);
      return;
    }
    const fresh = !this.track;
    this.track = track;
    this.mood = 'calm';
    this.bar = 0;
    this.step = 0;
    this.barTempo = TEMPO[track].calm;
    this.queued = barEvents(track, 0, 'calm');
    // A new track starts on a clean downbeat just ahead.
    this.nextTime = t + (fresh ? 0.1 : 0.4);
    this.applyMix(fresh ? 0.01 : 0.3);
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(1, t + (fresh ? 0 : 0.3), fresh ? 0.8 : 0.4);
    this.startTimer();
  }

  setMood(mood) {
    if (mood === this.mood || !this.track) return;
    this.mood = mood;
    // Into a chase at once; back to calm slowly, as the pulse settles.
    this.applyMix(mood === 'chase' ? 0.12 : mood === 'tense' ? 0.5 : 2.2);
    // Re-voice the rest of this bar in the new mood (from the next beat).
    const beat = Math.ceil(this.step / 4) * 4;
    this.queued = this.queued.filter((e) => e.step < beat).concat(barEvents(this.track, this.bar, mood).filter((e) => e.step >= beat));
  }

  /** A short phrase over whatever is playing (which ducks for it). */
  sting(kind) {
    const t0 = this.ctx.currentTime + 0.05;
    const beat = 60 / 92;
    const dest = this.ctx.createGain();
    dest.gain.value = 0.9;
    dest.connect(this.muffle);
    let end = 0;
    for (const [at, midi, beats, voice] of STINGS[kind]) {
      this.voice(voice, midi, t0 + at * beat, beats * beat, 0.8, dest);
      end = Math.max(end, at + beats);
    }
    this.out.gain.setTargetAtTime(0.25, t0, 0.1);
    this.out.gain.setTargetAtTime(this.track ? 1 : 0, t0 + end * beat, 0.8);
  }

  dispose() {
    this.stopTimer();
    try {
      this.out.disconnect();
    } catch {
      // Already gone.
    }
  }

  /* ------------------------------ scheduling ------------------------------ */

  startTimer() {
    if (this.timer !== null) return;
    this.timer = globalThis.setInterval(() => this.schedule(), TICK_MS);
  }

  stopTimer() {
    if (this.timer !== null) globalThis.clearInterval(this.timer);
    this.timer = null;
  }

  applyMix(tc) {
    if (!this.track) return;
    const mix = MIX[this.track][this.mood];
    const t = this.ctx.currentTime;
    for (const l of LAYERS) this.buses[l].gain.setTargetAtTime(mix[l], t, tc);
  }

  schedule() {
    if (!this.track || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Back from the background (or a long stall): pick up from now, never
    // play the missed notes all at once.
    if (this.nextTime < now - 0.1) this.nextTime = now + 0.05;
    this.fill(now + LOOKAHEAD);
  }

  fill(until) {
    if (!this.track) return;
    while (this.nextTime < until) {
      const stepDur = 60 / this.barTempo / 4;
      for (const e of this.queued) {
        if (e.step !== this.step) continue;
        try {
          this.voice(e.voice, e.midi, this.nextTime, e.len * stepDur, e.vel, this.buses[LAYER_OF[e.voice]]);
        } catch {
          // Music is never worth a crash.
        }
      }
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar++;
        this.barTempo = TEMPO[this.track][this.mood];
        this.queued = barEvents(this.track, this.bar, this.mood);
      }
    }
  }

  /* ------------------------------- voices -------------------------------- */

  voice(kind, midi, t, dur, vel, dest) {
    const ctx = this.ctx;
    const hz = midiHz(midi);
    const env = (g, peak, attack, hold, release) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      if (hold > attack) g.gain.setValueAtTime(Math.max(0.0002, peak), t + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(hold, attack) + release);
      return t + Math.max(hold, attack) + release + 0.05;
    };
    const osc = (type, f, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      o.detune.value = detune;
      return o;
    };
    const noise = () => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      return s;
    };

    switch (kind) {
      case 'pad': {
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        g.connect(lp).connect(dest);
        const end = env(g, 0.05 * vel, Math.min(0.6, dur * 0.3), dur, 0.7);
        for (const d of [-7, 7]) {
          const o = osc('sawtooth', hz, d);
          o.connect(g);
          o.start(t);
          o.stop(end);
        }
        return;
      }
      case 'bass': {
        const g = ctx.createGain();
        g.connect(dest);
        const end = env(g, 0.3 * vel, 0.01, dur * 0.85, 0.12);
        const o = osc('sine', hz);
        const o2 = osc('triangle', hz * 2);
        const g2 = ctx.createGain();
        g2.gain.value = 0.25;
        o.connect(g);
        o2.connect(g2).connect(g);
        for (const x of [o, o2]) {
          x.start(t);
          x.stop(end);
        }
        return;
      }
      case 'pluck':
      case 'arp': {
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(kind === 'arp' ? 2600 : 3200, t);
        lp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
        g.connect(lp).connect(dest);
        const end = env(g, (kind === 'arp' ? 0.1 : 0.13) * vel, 0.004, 0.004, kind === 'arp' ? 0.9 : 0.32);
        const o = osc('triangle', hz);
        o.connect(g);
        o.start(t);
        o.stop(end);
        return;
      }
      case 'bell': {
        const g = ctx.createGain();
        g.connect(dest);
        const end = env(g, 0.08 * vel, 0.003, 0.003, 1.6);
        const o = osc('sine', hz * 2);
        const o2 = osc('sine', hz * 2 * 2.76);
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.35, t);
        g2.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
        o.connect(g);
        o2.connect(g2).connect(g);
        for (const x of [o, o2]) {
          x.start(t);
          x.stop(end);
        }
        return;
      }
      case 'lead': {
        // A wooden flute: triangle and sine, a breath of noise, vibrato that
        // arrives after the note starts.
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2400;
        g.connect(lp).connect(dest);
        const end = env(g, 0.11 * vel, 0.04, Math.max(0.05, dur * 0.92), 0.18);
        const o = osc('triangle', hz);
        const o2 = osc('sine', hz * 2);
        const g2 = ctx.createGain();
        g2.gain.value = 0.18;
        const vib = osc('sine', 5.2);
        const vg = ctx.createGain();
        vg.gain.setValueAtTime(0, t);
        vg.gain.linearRampToValueAtTime(hz * 0.006, t + Math.min(0.35, dur * 0.6));
        vib.connect(vg);
        vg.connect(o.frequency);
        vg.connect(o2.frequency);
        o.connect(g);
        o2.connect(g2).connect(g);
        const br = noise();
        const bf = ctx.createBiquadFilter();
        bf.type = 'bandpass';
        bf.frequency.value = hz * 2;
        bf.Q.value = 2;
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.03 * vel, t);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        br.connect(bf).connect(bg).connect(dest);
        for (const x of [o, o2, vib]) {
          x.start(t);
          x.stop(end);
        }
        br.start(t, Math.random());
        br.stop(t + 0.15);
        return;
      }
      case 'trem': {
        const g = ctx.createGain();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = Math.min(4000, hz * 2);
        bp.Q.value = 0.8;
        g.connect(bp).connect(dest);
        const end = env(g, 0.035 * vel, 0.012, dur * 0.6, 0.05);
        const o = osc('sawtooth', hz, (midi % 2 ? -1 : 1) * 6);
        o.connect(g);
        o.start(t);
        o.stop(end);
        return;
      }
      case 'stab': {
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2600, t);
        lp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
        lp.Q.value = 3;
        g.connect(lp).connect(dest);
        const end = env(g, 0.05 * vel, 0.01, dur * 0.5, 0.15);
        const o = osc('sawtooth', hz);
        o.connect(g);
        o.start(t);
        o.stop(end);
        return;
      }
      case 'kick': {
        const g = ctx.createGain();
        g.connect(dest);
        const end = env(g, 0.55 * vel, 0.003, 0.003, 0.22);
        const o = osc('sine', 130);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.15);
        o.connect(g);
        o.start(t);
        o.stop(end);
        return;
      }
      case 'tom': {
        const g = ctx.createGain();
        g.connect(dest);
        const end = env(g, 0.35 * vel, 0.003, 0.003, 0.25);
        const o = osc('sine', hz * 1.4);
        o.frequency.exponentialRampToValueAtTime(hz * 0.9, t + 0.2);
        o.connect(g);
        o.start(t);
        o.stop(end);
        return;
      }
      case 'snare':
      case 'hat': {
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        f.type = kind === 'hat' ? 'highpass' : 'bandpass';
        f.frequency.value = kind === 'hat' ? 7000 : 1800;
        f.Q.value = kind === 'hat' ? 0.7 : 0.9;
        g.connect(dest);
        const end = env(g, (kind === 'hat' ? 0.06 : 0.3) * vel, 0.002, 0.002, kind === 'hat' ? 0.05 : 0.16);
        const s = noise();
        s.connect(f).connect(g);
        s.start(t, Math.random());
        s.stop(end);
        if (kind === 'snare') {
          const o = osc('triangle', 190);
          o.frequency.exponentialRampToValueAtTime(130, t + 0.08);
          const og = ctx.createGain();
          og.gain.value = 0.5;
          o.connect(og).connect(g);
          o.start(t);
          o.stop(end);
        }
        return;
      }
    }
  }
}
