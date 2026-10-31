/* Lightweight procedural audio — no external assets. */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ambient = null;
    this.lastCast = 0;
    this.noiseBuffer = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, t, 0.06);
    }
  }

  startAmbient() {
    const ctx = this.ensure();
    if (!ctx || this.ambient) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    out.gain.setTargetAtTime(0.85, ctx.currentTime, 1.6);

    const drone = (freq, gain, detune) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      g.gain.value = gain;
      osc.connect(g).connect(out);
      osc.start();
      return { osc, g };
    };
    const d1 = drone(55, 0.028, 0);
    const d2 = drone(82.5, 0.016, 4);
    const d3 = drone(110, 0.009, -6);
    const d4 = drone(165, 0.005, 5);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.008;
    lfo.connect(lfoGain);
    lfoGain.connect(d1.g.gain);
    lfo.start();

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.018;
    noise.connect(filter).connect(ng).connect(out);
    noise.start();

    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    wind.playbackRate.value = 0.6;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 780;
    wf.Q.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 0.006;
    const wlfo = ctx.createOscillator();
    const wlg = ctx.createGain();
    wlfo.frequency.value = 0.13;
    wlg.gain.value = 0.004;
    wlfo.connect(wlg).connect(wg.gain);
    wlfo.start();
    wind.connect(wf).connect(wg).connect(out);
    wind.start();

    this.ambient = { out, nodes: [d1.osc, d2.osc, d3.osc, d4.osc, lfo, noise, wind, wlfo] };
  }

  tone(freq, duration, type = 'sine', gain = 0.15, slideTo = null, delay = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  noise(duration, filterFreq = 900, gain = 0.12, type = 'lowpass', delay = 0, q = 0.8, sweepTo = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t);
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  ui() {
    this.tone(620, 0.08, 'triangle', 0.05, 880);
  }

  cast(id) {
    const now = performance.now();
    if (now - this.lastCast < 35) return;
    this.lastCast = now;
    if (id === 'fire') {
      this.noise(0.22, 1500, 0.1, 'bandpass', 0, 0.7, 500);
      this.tone(150, 0.18, 'sawtooth', 0.06, 70);
    } else if (id === 'water') {
      this.tone(700, 0.18, 'sine', 0.06, 1200);
      this.tone(1050, 0.12, 'sine', 0.025, 1500, 0.02);
    } else if (id === 'earth') {
      this.noise(0.28, 260, 0.16, 'lowpass', 0, 0.9);
      this.tone(85, 0.24, 'square', 0.05, 45);
    } else {
      this.noise(0.16, 2400, 0.06, 'highpass', 0, 0.8, 4000);
      this.tone(880, 0.12, 'sine', 0.035, 1400);
    }
  }

  impact(id, power = 1) {
    const g = Math.min(0.16, 0.05 * power);
    if (id === 'fire') {
      this.noise(0.26, 700, g, 'lowpass', 0, 0.8, 180);
      this.tone(110, 0.16, 'sawtooth', 0.03, 55);
    } else if (id === 'water') {
      this.noise(0.2, 1800, 0.05, 'bandpass', 0, 1.2, 600);
      this.tone(520, 0.12, 'sine', 0.035, 260);
    } else if (id === 'earth') {
      this.noise(0.32, 240, 0.14, 'lowpass', 0, 0.9, 90);
      this.tone(60, 0.24, 'square', 0.05, 32);
    } else {
      this.noise(0.18, 3200, 0.05, 'highpass', 0, 1, 1200);
      this.tone(1200, 0.1, 'triangle', 0.025, 600);
    }
  }

  hurt() {
    this.tone(180, 0.14, 'sawtooth', 0.05, 90);
    this.noise(0.16, 500, 0.05, 'lowpass');
  }

  explosion() {
    this.noise(0.9, 400, 0.22, 'lowpass', 0, 0.9, 70);
    this.noise(0.5, 1800, 0.08, 'bandpass', 0.1, 0.9, 200);
    this.tone(58, 0.7, 'sine', 0.12, 28);
  }

  towerDown() {
    this.explosion();
    this.tone(220, 1.2, 'sine', 0.05, 40, 0.1);
    this.tone(330, 1.0, 'triangle', 0.03, 60, 0.2);
    this.noise(1.4, 900, 0.08, 'bandpass', 0.15, 0.7, 120);
  }

  ult(id) {
    this.ensure();
    if (id === 'fire') {
      this.tone(60, 1.2, 'sawtooth', 0.11, 32);
      this.noise(1.2, 600, 0.12, 'lowpass', 0, 0.8, 90);
      this.tone(140, 0.8, 'square', 0.04, 60, 0.2);
    } else if (id === 'water') {
      this.tone(220, 1.4, 'sine', 0.06, 660);
      this.tone(330, 1.2, 'sine', 0.04, 880, 0.1);
      this.noise(1.5, 1000, 0.06, 'bandpass', 0, 0.7, 3000);
    } else if (id === 'earth') {
      this.tone(48, 1.6, 'square', 0.09, 26);
      this.noise(1.6, 180, 0.18, 'lowpass', 0, 0.9, 60);
    } else {
      this.noise(1.6, 800, 0.1, 'bandpass', 0, 0.6, 4000);
      this.tone(500, 1.2, 'sine', 0.04, 1400);
      this.tone(750, 1.0, 'triangle', 0.03, 1800, 0.15);
    }
  }

  respawn() {
    this.tone(220, 0.5, 'sine', 0.06, 660);
    this.tone(440, 0.6, 'triangle', 0.035, 880, 0.1);
    this.noise(0.4, 1200, 0.04, 'bandpass', 0, 1, 2200);
  }

  victory() {
    const notes = [262, 330, 392, 523, 659, 784];
    notes.forEach((f, i) => this.tone(f, 0.9 - i * 0.05, 'triangle', 0.06, f * 1.01, i * 0.11));
    this.tone(131, 1.6, 'sine', 0.05, 131, 0.15);
  }

  defeat() {
    const notes = [330, 294, 247, 196, 147];
    notes.forEach((f, i) => this.tone(f, 1.1, 'sine', 0.06, f * 0.98, i * 0.16));
    this.noise(1.8, 300, 0.07, 'lowpass', 0, 0.8, 80);
  }
}
