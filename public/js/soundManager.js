/**
 * soundManager.js — Generates cinematic audio & synth SFX in real-time
 * using the Web Audio API. Zero external downloads, zero latency, 100% free.
 */

const soundManager = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  // 1. Deep Cinematic Death / Horror Hit ("DUNNNNN")
  function playDeathHit() {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;

    // Sub bass drop
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 1.2);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    // Low pass filter for dark rumble
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + 2.0);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);

    osc.start(now);
    osc.stop(now + 2.6);
  }

  // 2. Doctor Save / Miracle Chime (Celestial uplifting chord)
  function playMiracleChime() {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C Major arpeggio

    freqs.forEach((freq, idx) => {
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.setValueAtTime(0.25, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 1.8);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 2.0);
    });
  }

  // 3. Eerie Night Ambient Drone (Subtle low wind & tension)
  let nightOsc = null;
  let nightGain = null;

  function startNightAmbience() {
    const c = getCtx();
    if (!c || nightOsc) return;
    const now = c.currentTime;

    nightOsc = c.createOscillator();
    nightGain = c.createGain();

    nightOsc.type = 'triangle';
    nightOsc.frequency.setValueAtTime(55, now); // Low A

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);

    nightGain.gain.setValueAtTime(0.001, now);
    nightGain.gain.linearRampToValueAtTime(0.18, now + 2.0);

    nightOsc.connect(filter);
    filter.connect(nightGain);
    nightGain.connect(c.destination);

    nightOsc.start(now);
  }

  function stopNightAmbience() {
    if (!nightGain || !nightOsc) return;
    const c = getCtx();
    if (c) {
      const now = c.currentTime;
      nightGain.gain.linearRampToValueAtTime(0.001, now + 1.5);
      setTimeout(() => {
        if (nightOsc) {
          try { nightOsc.stop(); } catch (_) {}
          nightOsc = null;
          nightGain = null;
        }
      }, 1600);
    } else {
      nightOsc = null;
      nightGain = null;
    }
  }

  // 4. Heavy Gavel / Elimination Strike ("SLAM")
  function playGavelStrike() {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;

    // Impact punch
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);

    osc.start(now);
    osc.stop(now + 0.7);
  }

  // 5. Mafia Victory (Dark Minor Triumph)
  function playMafiaVictory() {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    const freqs = [146.83, 174.61, 220.00, 293.66]; // D minor chords

    freqs.forEach((freq) => {
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);

      osc.start(now);
      osc.stop(now + 3.2);
    });
  }

  // 6. Town Victory (Triumphant Major Fanfare)
  function playTownVictory() {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    const melody = [
      { f: 523.25, d: 0.2, t: 0 },
      { f: 659.25, d: 0.2, t: 0.2 },
      { f: 783.99, d: 0.2, t: 0.4 },
      { f: 1046.50, d: 1.5, t: 0.6 }
    ];

    melody.forEach((note) => {
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, now + note.t);

      gain.gain.setValueAtTime(0.3, now + note.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now + note.t);
      osc.stop(now + note.t + note.d + 0.1);
    });
  }

  return {
    init: getCtx,
    playDeathHit,
    playMiracleChime,
    startNightAmbience,
    stopNightAmbience,
    playGavelStrike,
    playMafiaVictory,
    playTownVictory
  };
})();
